import * as Sentry from '@sentry/nextjs';

/**
 * App logger. Mirrors storytime-mobile `utils/logger.ts`:
 *
 *   debug / info  dev console only; silent in production
 *   warn          console + Sentry breadcrumb (never an issue)
 *   error         console + Sentry issue (captureException / captureMessage)
 *
 * `error(..., { expected: true })` downgrades to warn, so conditions we expect
 * in normal operation (401 session expiry, 429, guest quota 403, aborted
 * requests, offline) leave a breadcrumb instead of paging Sentry.
 *
 * Thrown values are reduced to their structure (class, known library message,
 * stack frames, code, HTTP status/method/path) and never forward their own
 * text; caller strings are redacted. No Node-only imports, so it is safe in
 * the browser, server and edge runtimes. Sentry is only initialised
 * client-side (instrumentation-client.ts); on the server, or if Sentry is
 * missing/throws, the Sentry step is silently skipped.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogOptions {
  /** Expected, recoverable failure: logged at warn (breadcrumb), not error. */
  expected?: boolean;
  /** Sentry tags (low-cardinality, searchable). */
  tags?: Record<string, string>;
  /** Extra structured context (redacted). */
  context?: Record<string, unknown>;
}

type Environment = 'development' | 'production' | 'test';

interface LoggerConfig {
  environment?: Environment;
}

const config: LoggerConfig = {};

/** Override the detected environment. Intended for tests. */
export function configureLogger(next: LoggerConfig): void {
  config.environment = next.environment;
  lastOutageEvent.clear();
}

function currentEnvironment(): Environment {
  if (config.environment) {
    return config.environment;
  }
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test' ? env : 'production';
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACTED = '[REDACTED]';
const TRUNCATED = '[truncated]';
const MAX_DEPTH = 6;
const MAX_STRING = 8_000;

// Keys are compared lower-cased with separators (_ - . space) removed, so
// api_key, API-Key and apiKey all normalise to "apikey".
//
// Stems match as substrings (safe: they rarely occur in innocent names).
const SENSITIVE_STEMS = [
  'token',
  'authoriz',
  'cookie',
  'passw',
  'secret',
  'apikey',
  'accesskey',
  'privatekey',
  'sessionid',
  'credential',
  'signature',
  'email',
  'jwt',
  'bearer',
  'cvv',
  'cardnumber',
  'passphrase',
  'csrf',
  'xsrf',
  'otpcode',
  'verificationcode',
  'pincode',
  'sessid',
];
// Unambiguous short credential words: matched as a whole key OR as one word
// (segment) of a longer key (db_pwd, user_otp), never as a substring
// ("classname" must not match "ssn").
const SENSITIVE_WORDS = new Set(['otp', 'pwd', 'pw', 'ssn', 'iban', 'cvc']);
// A sensitive word only counts when it ends the key ("db_pwd", "user_otp") or
// is followed only by these ("iban_number"); "otp_sent", "pwd_changed_at" and
// "ssn_last4_hint" describe the credential rather than hold it.
const TAIL_WORDS = new Set([
  'code',
  'token',
  'value',
  'number',
  'no',
  'hash',
  'salt',
  'pin',
]);
// Short words match only as the whole key (substring would hit "keyboard",
// "shipping", "statusCode", ...).
const SENSITIVE_EXACT = new Set([
  'otp',
  'pass',
  'pwd',
  'pin',
  'code',
  'card',
  'session',
  'sid',
  'auth',
  'key',
  'sig',
  'sign',
]);
// Whole-key words that are too common in prose ("status code: 500") to treat as
// secrets in free text unless written key=value or as a quoted JSON key.
const AMBIGUOUS_IN_TEXT = new Set([
  'code',
  'key',
  'sig',
  'sign',
  'pin',
  'card',
  'session',
  'auth',
  'pass',
]);

const normaliseKey = (key: string) => key.toLowerCase().replace(/[\s_.-]/g, '');

const keyWords = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .split(/[\s_.\-[\]]+/)
    .filter((word) => word !== '' && !/^\d+$/.test(word));

function hasCredentialWord(words: string[]): boolean {
  for (let i = words.length - 1; i >= 0; i--) {
    if (SENSITIVE_WORDS.has(words[i])) {
      return true;
    }
    if (!TAIL_WORDS.has(words[i])) {
      return false;
    }
  }
  return false;
}

const hasStem = (key: string) => {
  const k = normaliseKey(key);
  return SENSITIVE_STEMS.some((stem) => k.includes(stem));
};

/** Object keys: any sensitive stem, a sensitive word, or a whole-key sensitive word. */
function isSensitiveKey(key: string): boolean {
  if (hasStem(key) || SENSITIVE_EXACT.has(normaliseKey(key))) {
    return true;
  }
  const words = keyWords(key);
  return hasCredentialWord(words) || words.at(-1) === 'sid';
}

// Header and payload are length-bounded so a run of "eyJ" cannot make the
// match quadratic.
const JWT = /eyJ[\w-]{3,200}\.[\w-]{1,20000}\.[\w-]{0,2000}/g;
// Header lines (Cookie: a=1; b=2, Authorization: Digest a="1", b="2") carry
// several pairs whose names are not secret-looking: mask to the end of the line.
const AUTH_HEADER_LINE =
  /(authorization["']?\s*:\s*)(?:"(?:[^"\\\r\n]|\\.){0,8000}"|'(?:[^'\\\r\n]|\\.){0,8000}'|[^\s"'`][^\r\n]*)/gi;
const COOKIE_HEADER =
  /(\b(?:set-)?cookie["']?\s*:\s*)(?:"(?:[^"\\\r\n]|\\.){0,8000}"|'(?:[^'\\\r\n]|\\.){0,8000}'|\[\s*"(?:[^"\\\r\n]|\\.){0,8000}"(?:\s*,\s*"(?:[^"\\\r\n]|\\.){0,8000}"){0,50}\s*\]|(?:\\+["'`]|[^\s"'`\\[{])(?:=\\*(["'`])(?:(?!\2)[^\r\n])*\2?|[^\r\n"'`\\]|\\[^\r\nnr"'`]|['`](?=[^\s,;"'`\\]))*)/gi;
const UNICODE_SEPARATOR = /\\u00(22|27|60|3[ad])/gi;
// Scheme-prefixed credentials. The value must look like a credential, so
// "a token of friendship" and "Basic information" stay readable. A
// capitalised "Bearer" is the scheme name and is masked whatever follows.
const BEARER = /\bBearer\s+[\w.~+/=-]+/g;
const SCHEME_LONG = /\b(?:bearer|token|digest|basic)\s+[\w.~+/=-]{16,}/gi;
// Base64 credentials mix cases/digits; a plain word like "Information" does not.
const SCHEME_BASIC =
  /\bBasic\s+(?=[A-Za-z0-9+/][a-z]*[A-Z0-9+/])[A-Za-z0-9+/]{8,}={0,2}/g;
// Bounded quantifiers keep this linear; the TLD must be letters, so
// "pkg@1.2.3" is left alone.
const EMAIL =
  /[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,5}\.[A-Za-z]{2,24}/g;
const FRAGMENT_TOKEN = /([#&])t=[^\s&#"'<>]+/g;
const ENCODED_FRAGMENT_TOKEN =
  /(%2[36])t(%3D)(?:[\w-]|%(?!2[36])[\dA-F]{2})+/gi;

// Independent final pass: find sensitive key NAMES anywhere (after a label, a
// URL "?", "&", "#", a quote, ...), then mask the value that follows. It does
// not depend on parsing labels, so "Failed: token: x", "url=https://a?token=x"
// and "password    ＝ x" are all handled the same way.
//   group 1: the char before the key (so a key never starts mid-word)
//   group 2: the key name (any length)
// The separator is parsed by parseSep() only for keys that are sensitive, so
// ordinary words cost O(word) and nothing is rescanned.
const KEY_SCAN =
  /(^|[^\w.-]|%(?:5[Bb]|26|3[Ff]|23|20|2[CcFf]))([A-Za-z][\w.-]*)/g;
// Subscripts after a key: [..] / %5B..%5D with any content but no nested
// brackets, so each one is consumed once.
const SUBSCRIPT = /\[[^[\]]*\]|%5[Bb](?:(?!%5[BbDd])[\s\S])*%5[Dd]/y;
// Closing/escaped quotes ("password":, \"password\":, `password`:), stray
// closing brackets and spaces between the key and its separator.
// Fillers are single characters (or one quote run) so every walk lands on the
// same token boundaries and can share the memo below. A lone "[" is a filler
// too, so "password[[a]]=x" and "password[%5D=x" still reach their "=".
const SEP_FILLER = /\\*["'`]|[\][]|%5[Dd]|\s/y;
const SEP_OPENER = /[^\S\r\n]*(?:[\\"'`\][]|%5[BbDd])/y;
const SEP_CHAR = /([=＝])|(%3[Dd])|%3[Aa]|[:：]/y;
const TRAIL_SPACE = /\s*/y;

interface Separator {
  end: number;
  explicit: boolean;
  assigns: boolean;
  percentEncoded: boolean;
}

interface SepChar {
  end: number;
  assigns: boolean;
  percentEncoded: boolean;
}

interface SepMemo {
  chain: Map<number, number>;
  sepChar: Map<number, SepChar | null>;
}

/**
 * The separator that follows a key at `from`, or null.
 *
 * Linear by construction and never gives up early: `memo.chain` maps every
 * token boundary already walked to where its walk ended, so a later key found
 * inside a subscript chain stops at the first boundary an earlier walk reached
 * instead of re-parsing the chain, and `memo.sepChar` keeps the separator and
 * the whitespace after it for that end. Each boundary is tokenised at most once
 * per string; there is no work budget that could run out and skip masking.
 */
function parseSep(
  input: string,
  from: number,
  memo: SepMemo
): Separator | null {
  SEP_OPENER.lastIndex = from;
  const opened = SEP_OPENER.test(input);
  let i = from;
  const visited: number[] = [];
  for (;;) {
    const known = memo.chain.get(i);
    if (known !== undefined) {
      i = known;
      break;
    }
    visited.push(i);
    SUBSCRIPT.lastIndex = i;
    let m = SUBSCRIPT.exec(input);
    if (!m) {
      SEP_FILLER.lastIndex = i;
      m = SEP_FILLER.exec(input);
    }
    if (!m) {
      break;
    }
    i += m[0].length;
  }
  for (const v of visited) {
    memo.chain.set(v, i);
  }
  let sep = memo.sepChar.get(i);
  if (sep === undefined) {
    sep = sepCharAt(input, i);
    memo.sepChar.set(i, sep);
  }
  return (
    sep && {
      end: sep.end,
      explicit: opened || sep.assigns,
      assigns: sep.assigns,
      percentEncoded: sep.percentEncoded,
    }
  );
}

function sepCharAt(input: string, at: number): SepChar | null {
  SEP_CHAR.lastIndex = at;
  const c = SEP_CHAR.exec(input);
  if (!c) {
    return null;
  }
  const afterSep = at + c[0].length;
  TRAIL_SPACE.lastIndex = afterSep;
  return {
    end: afterSep + (TRAIL_SPACE.exec(input)?.[0].length ?? 0),
    assigns: c[1] !== undefined || c[2] !== undefined,
    percentEncoded: c[0].startsWith('%'),
  };
}
const FILE_NAME = /\.(?:m?[jt]sx?|map|css|html?)$/i;
const VALUE_OPEN_QUOTE = /(\\*)(["'`])/y;

type Grammar = 'query' | 'encoded' | 'assign' | 'param';
const HARD_END: Record<Grammar, RegExp> = {
  query: /[\s&#"`<>]/,
  encoded: /[\s&#"`<>]/,
  assign: /[\s&#;]/,
  param: /[\s&,]/,
};
const ENCODED_END = /%2[36]/iy;
const QUOTES = '"\'`';
const OPENERS = '([{<';
const CLOSERS = ')]}>';
const CLOSING_RUN = /[\\"'`)\]}>]*/y;
const AFTER_QUOTED_RUN = /[,:;&]/;
const AFTER_COMMA = /["'`\\]/;

const isUrlGrammar = (grammar: Grammar) =>
  grammar === 'query' || grammar === 'encoded';

function endsValueAt(input: string, at: number, grammar: Grammar): boolean {
  if (at >= input.length || /\s/.test(input[at])) {
    return true;
  }
  if (HARD_END[grammar].test(input[at])) {
    return true;
  }
  ENCODED_END.lastIndex = at;
  return grammar === 'encoded' && ENCODED_END.test(input);
}

function quotedEnd(input: string, at: number, limit = input.length): number {
  const q = input[at];
  let i = at + 1;
  while (i < limit && input[i] !== q && input[i] !== '\n') {
    i += input[i] === '\\' ? 2 : 1;
  }
  return Math.min(i + 1, limit);
}

function closingRunEnds(
  input: string,
  at: number,
  runEnd: number,
  grammar: Grammar
): boolean {
  if (endsValueAt(input, runEnd, grammar)) {
    return true;
  }
  if (isUrlGrammar(grammar)) {
    return false;
  }
  const run = input.slice(at, runEnd);
  return /["'`]/.test(run) && AFTER_QUOTED_RUN.test(input[runEnd]);
}

const MAX_GROUP = 2_000;
const GROUP_UNCLOSED = -1;
const GROUP_DELIMITED = -2;
const GROUP_UNBOUNDED = -3;

function groupEnd(input: string, at: number, grammar: Grammar): number {
  const limit = Math.min(input.length, at + MAX_GROUP);
  const unclosed = new Set<string>();
  let depth = 0;
  for (let i = at; i < limit; i++) {
    const c = input[i];
    if (c === '\n' || c === '\r') {
      return GROUP_UNCLOSED;
    }
    if (i > at && isUrlGrammar(grammar) && endsValueAt(input, i, grammar)) {
      return GROUP_DELIMITED;
    }
    if (OPENERS.includes(c)) {
      depth++;
    } else if (CLOSERS.includes(c)) {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    } else if (QUOTES.includes(c) && !unclosed.has(c)) {
      const end = quotedEnd(input, i, limit);
      if (input[end - 1] === c && end - 1 > i) {
        i = end - 1;
      } else {
        unclosed.add(c);
      }
    }
  }
  return limit < input.length ? GROUP_UNBOUNDED : GROUP_UNCLOSED;
}

function unquotedEnd(input: string, from: number, grammar: Grammar): number {
  let groups = true;
  let i = from;
  while (i < input.length && !endsValueAt(input, i, grammar)) {
    const c = input[i];
    if (OPENERS.includes(c) && groups) {
      const end = groupEnd(input, i, grammar);
      if (end >= 0) {
        i = end;
        continue;
      }
      if (end === GROUP_UNBOUNDED) {
        return lineEnd(input, i);
      }
      groups = false;
    } else if (c === ',' && i > from) {
      const next = input[i + 1] ?? '';
      if (
        endsValueAt(input, i + 1, grammar) ||
        (!isUrlGrammar(grammar) && AFTER_COMMA.test(next))
      ) {
        break;
      }
    } else if (i > from && (QUOTES + CLOSERS).includes(c)) {
      CLOSING_RUN.lastIndex = i;
      CLOSING_RUN.test(input);
      const runEnd = CLOSING_RUN.lastIndex;
      if (closingRunEnds(input, i, runEnd, grammar)) {
        break;
      }
      i = runEnd;
      continue;
    } else if (c === '\\' && i > from) {
      CLOSING_RUN.lastIndex = i;
      CLOSING_RUN.test(input);
      const runEnd = CLOSING_RUN.lastIndex;
      if (
        /["'`]/.test(input.slice(i, runEnd)) &&
        closingRunEnds(input, i, runEnd, grammar)
      ) {
        break;
      }
      i = runEnd;
      continue;
    }
    i++;
  }
  return i;
}

const AUTH_SCHEME = /[A-Za-z][\w.-]{0,30}[^\S\r\n]+/y;
const PARAM_NAME = /[\w-]+[^\S\r\n]*=[^\S\r\n]*/y;
const PARAM_GAP = /[^\S\r\n]*,[^\S\r\n]*/y;

function paramEnd(input: string, at: number): number {
  PARAM_NAME.lastIndex = at;
  const start = PARAM_NAME.test(input) ? PARAM_NAME.lastIndex : at;
  return QUOTES.includes(input[start] ?? '')
    ? quotedEnd(input, start)
    : unquotedEnd(input, start, 'param');
}

function paramFollows(input: string, at: number): boolean {
  PARAM_GAP.lastIndex = at;
  if (!PARAM_GAP.test(input)) {
    return false;
  }
  PARAM_NAME.lastIndex = PARAM_GAP.lastIndex;
  return PARAM_NAME.test(input);
}

const AUTH_SCHEMES = new Set([
  'basic',
  'bearer',
  'digest',
  'aws4-hmac-sha256',
  'negotiate',
  'ntlm',
  'token',
  'apikey',
  'hoba',
  'mutual',
  'vapid',
  'dpop',
  'hawk',
  'oauth',
  'scram-sha-1',
  'scram-sha-256',
]);

function authSchemeEnd(input: string, from: number, grammar: Grammar): number {
  AUTH_SCHEME.lastIndex = from;
  let end: number;
  if (AUTH_SCHEME.test(input)) {
    const paramStart = AUTH_SCHEME.lastIndex;
    const word = input.slice(from, paramStart).trimEnd();
    end = paramEnd(input, paramStart);
    if (!AUTH_SCHEMES.has(word.toLowerCase())) {
      PARAM_NAME.lastIndex = paramStart;
      const nextIsField = PARAM_NAME.test(input) && !paramFollows(input, end);
      if (end === paramStart || nextIsField) {
        return from + word.length;
      }
    }
  } else {
    end = unquotedEnd(input, from, grammar);
    if (input.slice(from, end) !== REDACTED || !paramFollows(input, end)) {
      return end;
    }
  }
  for (;;) {
    PARAM_GAP.lastIndex = end;
    if (!PARAM_GAP.test(input)) {
      return end;
    }
    end = paramEnd(input, PARAM_GAP.lastIndex);
  }
}

function atLineStart(input: string, at: number): boolean {
  let i = at;
  while (input[i - 1] === ' ' || input[i - 1] === '\t') {
    i--;
  }
  return i === 0 || input[i - 1] === '\n' || input[i - 1] === '\r';
}

function lineEnd(input: string, from: number): number {
  let i = from;
  while (i < input.length && input[i] !== '\n' && input[i] !== '\r') {
    i++;
  }
  return i;
}

// Only the story-ish capitalised word "Token:" is treated as prose unless the
// value looks like a credential. Real credential keys (password, secret,
// apiKey, ...) are always masked: 'Password: hunter' must not leak.
const looksLikeCredential = (v: string) =>
  /\d/.test(v) || v.length >= 12 || /^[A-Z0-9_-]{4,}$/.test(v);

interface KeyClass {
  credential: boolean;
  bareOrAmbiguous: boolean;
}

/** Whether `key` names a secret at all (cheap; no separator needed). */
function classifyKey(key: string): KeyClass | null {
  if (FILE_NAME.test(key)) {
    return null;
  }
  const k = normaliseKey(key);
  const words = keyWords(key);
  // "connect.sid" / "user_sid" are cookies; a bare "sid" is a common word.
  const compoundSid = words.length > 1 && words.at(-1) === 'sid';
  const credential = hasStem(key) || hasCredentialWord(words) || compoundSid;
  const bareSid = k === 'sid';
  if (!(credential || bareSid || SENSITIVE_EXACT.has(k))) {
    return null;
  }
  return {
    credential,
    bareOrAmbiguous: bareSid || AMBIGUOUS_IN_TEXT.has(k),
  };
}

function shouldMask(
  cls: KeyClass,
  key: string,
  sep: Separator,
  input: string
): boolean {
  if (!cls.credential && cls.bareOrAmbiguous) {
    return sep.explicit; // "code: be kind" / "sid: main" are prose; "code=abc" is a parameter
  }
  if (sep.explicit || key !== 'Token') {
    return true;
  }
  const next = input.slice(sep.end, sep.end + 200);
  return looksLikeCredential(
    next.replace(/^\\*["'`]/, '').split(/[\s&#;,"'`]/)[0]
  );
}

function backslashesBefore(input: string, i: number): number {
  let k = 0;
  while (input[i - k - 1] === '\\') {
    k++;
  }
  return k;
}

interface ValueContext {
  grammar: Grammar;
  authScheme: boolean;
  headerLine: boolean;
}

function valueSpan(
  input: string,
  from: number,
  ctx: ValueContext
): { start: number; end: number } | null {
  if (ctx.headerLine) {
    const end = lineEnd(input, from);
    return end > from ? { start: from, end } : null;
  }
  VALUE_OPEN_QUOTE.lastIndex = from;
  const open = VALUE_OPEN_QUOTE.exec(input);
  if (open) {
    const q = open[2];
    const level = open[1].length;
    const start = from + open[0].length;
    // Each serialisation maps k backslashes before a quote to 2k + 1, so at the
    // opener's escape level the closer has `level` of them modulo 2(level + 1).
    const period = 2 * (level + 1);
    let i = input.indexOf(q, start);
    while (i !== -1 && backslashesBefore(input, i) % period !== level) {
      i = input.indexOf(q, i + 1);
    }
    const end = i === -1 ? input.length : i - level;
    return end > start ? { start, end } : null;
  }
  const end = ctx.authScheme
    ? authSchemeEnd(input, from, ctx.grammar)
    : unquotedEnd(input, from, ctx.grammar);
  return end > from ? { start: from, end } : null;
}

const QUERY_BEFORE = /^(?:[?&#]|%(?:26|3[Ff]|23))$/;

const SUBSCRIPT_GAP = /^(?:\]|%5[Dd])*(?:\[|%5[Bb])$/;

interface Param {
  start: number;
  before: string;
}

function valueContext(
  input: string,
  key: string,
  param: Param,
  cls: KeyClass,
  sep: Separator
): ValueContext {
  const grammar: Grammar = sep.percentEncoded
    ? 'encoded'
    : QUERY_BEFORE.test(param.before)
      ? 'query'
      : 'assign';
  return {
    grammar,
    authScheme: normaliseKey(key).includes('authoriz'),
    headerLine:
      cls.credential &&
      !sep.assigns &&
      grammar === 'assign' &&
      atLineStart(input, param.start),
  };
}

function redactKeyNames(input: string): string {
  KEY_SCAN.lastIndex = 0;
  const sepMemo: SepMemo = { chain: new Map(), sepChar: new Map() };
  let out = '';
  let pos = 0;
  let param: Param = { start: 0, before: '' };
  let prevKeyEnd = -1;
  for (let m = KEY_SCAN.exec(input); m; m = KEY_SCAN.exec(input)) {
    const [, before, key] = m;
    const keyStart = m.index + before.length;
    const keyEnd = keyStart + key.length;
    if (
      prevKeyEnd < 0 ||
      !SUBSCRIPT_GAP.test(input.slice(prevKeyEnd, keyStart))
    ) {
      param = { start: keyStart, before };
    }
    prevKeyEnd = keyEnd;
    const cls = classifyKey(key);
    const sep = cls ? parseSep(input, keyEnd, sepMemo) : null;
    const span =
      cls && sep && shouldMask(cls, key, sep, input)
        ? valueSpan(input, sep.end, valueContext(input, key, param, cls, sep))
        : null;
    if (!span || input.slice(span.start, span.end) === REDACTED) {
      // Not a secret: resume right after the key (not after its value) so a
      // nested key ("Failed: token: x") is still seen, without re-scanning
      // the value for every key.
      KEY_SCAN.lastIndex = keyEnd;
      continue;
    }
    out += `${input.slice(pos, span.start)}${REDACTED}`;
    pos = span.end;
    KEY_SCAN.lastIndex = pos;
  }
  return out + input.slice(pos);
}

// Per-string cap, applied BEFORE scanning so a megabyte string cannot stall
// the logger; the result is cut again to MAX_STRING AFTER redaction, so a
// secret is never half-cut before it is masked.
const MAX_SCAN = 64_000;
const SMALL_STRING = 512;

function redactString(input: string, budget: Walk): string {
  // Short strings (ids, names, short messages) are always scanned: they are
  // cheap, and must never degrade to "[truncated]" because a huge blob was
  // logged beside them.
  const small = input.length <= SMALL_STRING;
  const allowed = small
    ? input.length
    : Math.min(input.length, MAX_SCAN, budget.scan);
  if (allowed <= 0 && !small) {
    return '[truncated]';
  }
  budget.scan = Math.max(0, budget.scan - allowed);
  let value = input;
  const cutInput = input.length > allowed;
  if (cutInput) {
    value = value.slice(0, allowed);
    // Don't leave a half-cut token at the boundary.
    const cut = value.search(/[\s,&;"'][^\s,&;"']*$/);
    if (cut > allowed - 1024) {
      value = value.slice(0, cut);
    }
  }
  value = redactKeyNames(
    value
      .replace(UNICODE_SEPARATOR, (_, hex: string) => {
        const char = String.fromCharCode(Number.parseInt(hex, 16));
        return /["'`]/.test(char) ? `\\${char}` : char;
      })
      .replace(JWT, REDACTED)
      .replace(AUTH_HEADER_LINE, `$1${REDACTED}`)
      .replace(COOKIE_HEADER, `$1${REDACTED}`)
      .replace(BEARER, `Bearer ${REDACTED}`)
      .replace(SCHEME_LONG, REDACTED)
      .replace(SCHEME_BASIC, `Basic ${REDACTED}`)
      .replace(FRAGMENT_TOKEN, `$1t=${REDACTED}`)
      .replace(ENCODED_FRAGMENT_TOKEN, `$1t$2${REDACTED}`)
  ).replace(EMAIL, REDACTED);
  return value.length > MAX_STRING || cutInput
    ? `${value.slice(0, MAX_STRING)}…[truncated]`
    : value;
}

function isAxiosLike(value: object): boolean {
  return safeRead(
    () =>
      (value as { isAxiosError?: unknown }).isAxiosError === true ||
      ('config' in value && 'response' in value),
    false
  );
}

const ROUTE_WORDS = new Set(
  (
    'access api apple audio auth available avatar avatars batch categories ' +
    'change-password completed continue-reading daily-challenge devices ' +
    'feedback google guest help-support history invite kid kids library link ' +
    'linked-accounts login logout mark-all-read me notification-preferences ' +
    'notifications oauth parent-favorites passwordless preferred progress ' +
    'quota recommended refresh refresh-token register request ' +
    'request-password-reset reset-password search send-verification session ' +
    'share stories story system unlink upload-avatar user users v1 ' +
    'validate-reset-token verify verify-email voice'
  ).split(' ')
);
const MAX_SEGMENTS = 20;

/** Path only (no origin/query/fragment); every segment that is not a known route word becomes ":id". */
function normalisePath(url: unknown): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }
  const path = url
    .split(/[?#]/)[0]
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .split('/', MAX_SEGMENTS)
    .map((seg) => (seg === '' || ROUTE_WORDS.has(seg) ? seg : ':id'))
    .join('/');
  return path.startsWith('/') ? path : `/${path}`;
}

const HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

interface HttpFields {
  code?: string;
  status?: number;
  method?: string;
  path?: string;
}

interface HttpSummary extends HttpFields {
  name: string;
  message: string;
}

const isHttpStatus = (s: unknown): s is number =>
  Number.isInteger(s) && (s as number) >= 100 && (s as number) <= 599;

const MAX_OUTPUT = 64_000;
const MAX_CALL_SCAN = 128_000;
const MAX_ENTRIES = 100;
const MAX_TAGS = 20;
const UNREADABLE = '[unreadable]';
const UNSERIALIZABLE = '[Unserializable]';
const THREW = Symbol('threw');

interface Walk {
  scan: number;
  out: number;
  active: WeakSet<object>;
  errors: WeakSet<object>;
  http: WeakMap<object, HttpFields>;
}

const newWalk = (): Walk => ({
  scan: MAX_CALL_SCAN,
  out: MAX_OUTPUT,
  active: new WeakSet(),
  errors: new WeakSet(),
  http: new WeakMap(),
});

/** Run a property read that may throw (hostile getters, revoked proxies). */
function safeRead<T, F>(read: () => T, fallback: F): T | F {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function emit(walk: Walk, marker: string): string {
  walk.out -= marker.length;
  return marker;
}

function cleanString(walk: Walk, value: string): string {
  walk.out -= 2;
  return emit(walk, redactString(value, walk));
}

function put(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

const OMITTED = '[omitted]';

const LIBRARY_MESSAGES = [
  /^Request failed with status code [1-5]\d\d$/,
  /^timeout of \d{1,9}ms exceeded$/,
  /^(?:Network Error|canceled|Failed to fetch|Load failed|No response from server|Unexpected error)$/,
  /^NetworkError when attempting to fetch resource\.$/,
  /^(?:The user aborted a request|The operation was aborted|signal is aborted without reason)\.?$/,
];
const ERROR_NAME = /^(?:Error|[A-Z][A-Za-z0-9]{0,47}(?:Error|Exception))$/;
const ERROR_CODE =
  /^(?:[A-Z][A-Z0-9_]{1,47}|[a-z][a-z0-9-]{0,31}\/[a-z0-9-]{1,63})$/;
const QUERY_KEYS = new Set([
  'page',
  'limit',
  'offset',
  'sort',
  'order',
  'category',
  'type',
  'status',
  'lang',
]);
const WHOLE_URL =
  /^(?:([a-z][a-z\d+.-]{0,20}:\/\/)(?:[^\s/?#@]{0,300}@)?([^\s/?#@]{1,300}))?(\/[^\s?#]{0,4000})?(?:\?([^\s#]{0,8000}))?(?:#\S{0,8000})?$/i;

function libraryMessage(text: string): string {
  return text.length <= 120 && LIBRARY_MESSAGES.some((re) => re.test(text))
    ? text
    : OMITTED;
}

function structuralUrl(text: string): string | undefined {
  const m = text.length <= 16_000 ? WHOLE_URL.exec(text) : null;
  if (!(m && ((m[1] && m[2]) || text.startsWith('/')))) {
    return undefined;
  }
  const [, scheme = '', host = '', path = '', query] = m;
  const keys = (query ?? '')
    .split('&')
    .map((pair) => pair.split('=')[0])
    .filter((key) => QUERY_KEYS.has(key));
  const kept = [...new Set(keys)];
  return `${scheme}${host}${path ? normalisePath(path) : ''}${
    kept.length ? `?${kept.join('&')}` : ''
  }`;
}

const MAX_FRAMES = 50;
const MAX_FRAME_LINE = 1_000;
const FRAME_LOCATION = /^(\S{1,800}?):(\d{1,7}):(\d{1,7})$/;
const V8_FRAME =
  /^\s*at (?:((?:async |new )?[\w$.<>[\]]{1,120}) \((\S{1,820}|<anonymous>|native)\)|(\S{1,820}))$/;
const GECKO_FRAME = /^([\w$.<>/[\]*]{0,120})@(\S{0,820})$/;

function frameLocation(location: string): string | undefined {
  if (location === '<anonymous>' || location === 'native' || location === '') {
    return location;
  }
  const m = FRAME_LOCATION.exec(location);
  if (!m || /^data:/i.test(m[1])) {
    return undefined;
  }
  const file = m[1]
    .replace(/[?#].*$/, '')
    .replace(/^([a-z][a-z\d+.-]*:\/\/)[^/@]*@/i, '$1');
  return `${file}:${m[2]}:${m[3]}`;
}

function stackFrame(line: string): string | undefined {
  if (line.length > MAX_FRAME_LINE) {
    return undefined;
  }
  const v8 = V8_FRAME.exec(line);
  if (v8) {
    const [, fn, wrapped, bare] = v8;
    const location = frameLocation(wrapped ?? bare);
    if (location === undefined) {
      return undefined;
    }
    return fn ? `    at ${fn} (${location})` : `    at ${location}`;
  }
  const gecko = GECKO_FRAME.exec(line);
  if (gecko) {
    const location = frameLocation(gecko[2]);
    return location === undefined ? undefined : `${gecko[1]}@${location}`;
  }
  return undefined;
}

const MAX_STACK = 64_000;

function stackFrames(stack: string, message: unknown, header: string): string {
  const text = typeof message === 'string' ? message : '';
  const at = text ? stack.indexOf(text) : -1;
  const body = at !== -1 && at <= 200 ? stack.slice(at + text.length) : stack;
  const lines = body.slice(0, MAX_STACK).split(/\r?\n/);
  const frames: string[] = [];
  let started = false;
  for (const line of lines) {
    const frame = stackFrame(line);
    if (frame === undefined) {
      if (started) {
        break;
      }
      continue;
    }
    started = true;
    frames.push(frame);
    if (frames.length >= MAX_FRAMES) {
      break;
    }
  }
  const firstLine = stack.slice(0, MAX_FRAME_LINE + 1).split(/\r?\n/, 1)[0];
  const headed = stackFrame(firstLine) === undefined;
  return [...(headed ? [header] : []), ...frames].join('\n');
}

function clean(
  value: unknown,
  depth: number,
  walk: Walk,
  untrusted = false
): unknown {
  if (walk.out <= 0) {
    return emit(walk, TRUNCATED);
  }
  if (value !== null && typeof value === 'object') {
    if (walk.active.has(value)) {
      return emit(walk, '[Circular]');
    }
    walk.active.add(value);
  }
  try {
    return cleanNode(value, depth, walk, untrusted);
  } catch {
    return emit(walk, UNSERIALIZABLE);
  } finally {
    if (value !== null && typeof value === 'object') {
      walk.active.delete(value);
    }
  }
}

function cleanProp(
  owner: object,
  key: string | number,
  depth: number,
  walk: Walk,
  untrusted: boolean
): unknown {
  const value = safeRead(
    () => (owner as Record<string | number, unknown>)[key],
    THREW
  );
  return value === THREW
    ? emit(walk, UNREADABLE)
    : clean(value, depth, walk, untrusted);
}

function cleanText(walk: Walk, value: string, untrusted: boolean): string {
  if (!untrusted) {
    return cleanString(walk, value);
  }
  walk.out -= 2;
  const known = libraryMessage(value);
  return emit(
    walk,
    known === OMITTED ? (structuralUrl(value) ?? OMITTED) : known
  );
}

function cleanNode(
  value: unknown,
  depth: number,
  walk: Walk,
  untrusted: boolean
): unknown {
  switch (typeof value) {
    case 'string':
      return cleanText(walk, value, untrusted);
    case 'function':
      return emit(walk, '[Function]');
    case 'symbol':
    case 'bigint':
      return untrusted ? emit(walk, OMITTED) : cleanString(walk, String(value));
    case 'object':
      break;
    default:
      walk.out -= 8;
      return value;
  }
  if (value === null) {
    walk.out -= 8;
    return null;
  }
  if (depth >= MAX_DEPTH) {
    return emit(walk, '[Truncated]');
  }
  const isError = value instanceof Error;
  const isHttp = isAxiosLike(value);
  if (isError || isHttp) {
    return cleanError(value, isError, isHttp, depth, walk);
  }
  walk.out -= 2;
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      if (walk.out <= 0 || i >= MAX_ENTRIES) {
        items.push(emit(walk, TRUNCATED));
        break;
      }
      items.push(cleanProp(value, i, depth + 1, walk, untrusted));
    }
    return items;
  }
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    if (walk.out <= 0 || i >= MAX_ENTRIES) {
      put(out, TRUNCATED, emit(walk, TRUNCATED));
      break;
    }
    const key = keys[i];
    put(
      out,
      cleanString(walk, key),
      isSensitiveKey(key)
        ? emit(walk, REDACTED)
        : cleanProp(value, key, depth + 1, walk, untrusted)
    );
  }
  return out;
}

const ERROR_SKIP = new Set([
  'message',
  'name',
  'stack',
  'cause',
  'errors',
  'config',
  'request',
  'response',
  'code',
]);

/**
 * Errors are third-party text, so only their structure is kept: class name,
 * library message, stack frames, code, numeric/boolean props, cause and
 * AggregateError members (recursively the same way) and an HTTP summary.
 */
function cleanError(
  value: object,
  isError: boolean,
  isHttp: boolean,
  depth: number,
  walk: Walk
): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  const record: Record<string, unknown> = {};
  const name = safeRead(() => source.name, THREW);
  const rawMessage = safeRead(() => source.message, THREW);
  record.name = emit(
    walk,
    typeof name === 'string' && ERROR_NAME.test(name)
      ? name
      : isError
        ? 'Error'
        : 'AxiosError'
  );
  record.message =
    typeof rawMessage === 'string'
      ? emit(walk, libraryMessage(rawMessage))
      : rawMessage === undefined
        ? ''
        : emit(walk, UNREADABLE);
  if (isError) {
    const stack = safeRead(() => source.stack, undefined);
    const frames =
      typeof stack === 'string' && stack
        ? stackFrames(stack, rawMessage, `${record.name}: ${record.message}`)
        : '';
    record.stack = frames ? cleanString(walk, frames) : undefined;
    for (const key of ['cause', 'errors']) {
      const nested = safeRead(() => source[key], THREW);
      if (nested !== undefined) {
        record[key] =
          nested === THREW
            ? emit(walk, UNREADABLE)
            : clean(nested, depth + 1, walk, true);
      }
    }
    const code = safeRead(() => source.code, undefined);
    if (typeof code === 'number' && Number.isFinite(code)) {
      walk.out -= 8;
      record.code = code;
    } else if (!isHttp && typeof code === 'string' && ERROR_CODE.test(code)) {
      record.code = emit(walk, code);
    }
    const keys = safeRead(() => Object.keys(source), [] as string[]);
    for (const key of keys.slice(0, MAX_ENTRIES)) {
      if (walk.out <= 0) {
        break;
      }
      if (ERROR_SKIP.has(key) || isSensitiveKey(key)) {
        continue;
      }
      const prop = safeRead(() => source[key], undefined);
      if (typeof prop === 'number' || typeof prop === 'boolean') {
        walk.out -= 8;
        put(record, cleanString(walk, key), prop);
      }
    }
    walk.errors.add(record);
  }
  if (isHttp) {
    const http = httpFields(source, walk);
    Object.assign(record, http);
    walk.http.set(record, http);
  }
  return record;
}

function httpFields(source: Record<string, unknown>, walk: Walk): HttpFields {
  const response = safeRead(() => source.response, undefined) as
    | { status?: unknown }
    | undefined;
  const config = safeRead(() => source.config, undefined) as
    | { url?: unknown; method?: unknown }
    | undefined;
  const status = [
    safeRead(() => response?.status, undefined),
    safeRead(() => source.status, undefined),
  ].find(isHttpStatus);
  const method = safeRead(() => config?.method, undefined);
  const upper = typeof method === 'string' ? method.toUpperCase() : '';
  const code = safeRead(() => source.code, undefined);
  const path = normalisePath(safeRead(() => config?.url, undefined));
  const fields: HttpFields = {};
  if (typeof code === 'string' && ERROR_CODE.test(code)) {
    fields.code = emit(walk, code);
  }
  if (status !== undefined) {
    fields.status = status;
  }
  if (HTTP_METHODS.has(upper)) {
    fields.method = upper;
  }
  if (path) {
    fields.path = emit(walk, path);
  }
  return fields;
}

/** Deep-copy `value` with secrets (tokens, auth headers, cookies, emails, passwords, session ids) masked, in keys and values. */
export function redact(value: unknown): unknown {
  return clean(value, 0, newWalk());
}

function cleanMessage(message: unknown, walk: Walk): string {
  const text =
    typeof message === 'string'
      ? message
      : safeRead(() => String(message), UNREADABLE);
  return cleanString(walk, text);
}

function cleanTags(tags: unknown, walk: Walk): Record<string, string> {
  const out: Record<string, string> = {};
  const source = safeRead(() => asRecord(tags), {} as Record<string, unknown>);
  const keys = safeRead(() => Object.keys(source), [] as string[]);
  for (const key of keys.slice(0, MAX_TAGS)) {
    const value = safeRead(() => source[key], undefined);
    if (typeof value === 'string' && !isSensitiveKey(key)) {
      put(out, cleanString(walk, key), cleanString(walk, value));
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toException(record: Record<string, unknown>, walk: Walk): Error {
  const revive = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(revive)
      : v && typeof v === 'object' && walk.errors.has(v)
        ? toException(v as Record<string, unknown>, walk)
        : v;
  const error = new Error(String(record.message));
  for (const [key, value] of Object.entries(record)) {
    put(
      error,
      key,
      key === 'cause' || key === 'errors' ? revive(value) : value
    );
  }
  return error;
}

interface Entry {
  message: string;
  data: unknown[];
}

interface ErrorEntry extends Entry {
  exception?: Error;
  details?: unknown;
  context?: unknown;
  tags: Record<string, string>;
  http?: HttpSummary;
}

function sanitiseData(message: unknown, data: unknown[]): Entry {
  const walk = newWalk();
  return {
    message: cleanMessage(message, walk),
    data: [
      ...data.slice(0, MAX_ENTRIES).map((item) => clean(item, 0, walk)),
      ...(data.length > MAX_ENTRIES ? [emit(walk, TRUNCATED)] : []),
    ],
  };
}

// The error is cleaned first, within half the output, so the exception keeps
// priority on the scan budget and still leaves room for the context.
function sanitiseError(
  message: unknown,
  error: unknown,
  options: LogOptions
): ErrorEntry {
  const walk = newWalk();
  walk.out = MAX_OUTPUT / 2;
  const cleaned = error === undefined ? undefined : clean(error, 0, walk, true);
  walk.out += MAX_OUTPUT / 2;
  const record =
    cleaned && typeof cleaned === 'object'
      ? (cleaned as Record<string, unknown>)
      : undefined;
  const safeMessage = cleanMessage(message, walk);
  const rawContext = safeRead(() => options.context, undefined);
  const context =
    rawContext === undefined ? undefined : clean(rawContext, 0, walk);
  const fields = record && walk.http.get(record);
  const exception =
    record && walk.errors.has(record)
      ? toException(
          record.message === OMITTED
            ? { ...record, message: safeMessage }
            : record,
          walk
        )
      : undefined;
  return {
    message: safeMessage,
    data: [
      ...(cleaned === undefined ? [] : [cleaned]),
      ...(context === undefined ? [] : [context]),
    ],
    exception,
    details: exception ? undefined : cleaned,
    context,
    tags: cleanTags(
      safeRead(() => options.tags, undefined),
      walk
    ),
    http:
      record && fields
        ? {
            name: String(record.name),
            message: String(record.message),
            ...fields,
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Expected-failure classification
// ---------------------------------------------------------------------------

interface ErrorShape {
  name?: string;
  code?: string;
  status?: number;
  response?: { status?: number };
}

/**
 * True for failures that are normal operation rather than bugs: 401 session
 * expiry, 429 rate limit, aborted/cancelled requests and network/offline
 * errors. Pass `statuses` for call-site specific ones (e.g. 403 guest quota).
 */
export function isExpectedFailure(
  error: unknown,
  options: { statuses?: number[] } = {}
): boolean {
  return safeRead(() => classifyFailure(error, options.statuses), false);
}

const OFFLINE_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);
const FETCH_FAILURE = /failed to fetch|networkerror|load failed|network error/i;

function classifyFailure(error: unknown, statuses?: number[]): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const e = error as ErrorShape;
  if (e.name === 'AbortError' || e.name === 'CanceledError') {
    return true;
  }
  if (e.code === 'ERR_CANCELED' || e.code === 'ERR_NETWORK') {
    return true;
  }
  const status = e.response?.status ?? e.status;
  if (
    typeof status === 'number' &&
    (status === 401 || status === 429 || !!statuses?.includes(status))
  ) {
    return true;
  }
  if (!(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }
  return (
    (typeof e.code === 'string' && OFFLINE_CODES.has(e.code)) ||
    (e.name === 'TypeError' &&
      FETCH_FAILURE.test(String((e as { message?: unknown }).message)))
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const COLOURS: Record<LogLevel, { css: string; ansi: string }> = {
  debug: { css: 'color:#888', ansi: '\u001b[90m' },
  info: { css: 'color:#2b7de9', ansi: '\u001b[94m' },
  warn: { css: 'color:#d98e00', ansi: '\u001b[93m' },
  error: { css: 'color:#e03131', ansi: '\u001b[91m' },
};
const ANSI_RESET = '\u001b[0m';

let emittingToConsole = false;

/**
 * True while the logger itself is writing to the console. Sentry's console
 * integration would turn that write into a second breadcrumb duplicating the
 * logger's own; instrumentation-client.ts drops those via `beforeBreadcrumb`.
 */
export function isLoggerConsoleEmit(): boolean {
  return emittingToConsole;
}

function writeConsole(
  level: LogLevel,
  scope: string | undefined,
  message: string,
  data: unknown[]
): void {
  const env = currentEnvironment();
  if (env === 'test') {
    return;
  }
  if (env === 'production' && (level === 'debug' || level === 'info')) {
    return;
  }
  const out = console[level];
  const label = `[${level.toUpperCase()}]${scope ? ` [${scope}]` : ''}`;
  emittingToConsole = true;
  try {
    if (env === 'production') {
      out(`${label} ${message}`, ...data);
      return;
    }
    const time = new Date().toISOString().slice(11, 23);
    if (typeof window !== 'undefined') {
      out(`%c${time} ${label}%c ${message}`, COLOURS[level].css, '', ...data);
    } else {
      out(
        `${COLOURS[level].ansi}${time} ${label}${ANSI_RESET} ${message}`,
        ...data
      );
    }
  } finally {
    emittingToConsole = false;
  }
}

function sentryClientAvailable(): boolean {
  try {
    return !!Sentry.getClient?.();
  } catch {
    return false;
  }
}

function sendBreadcrumb(
  level: 'warning' | 'error',
  scope: string | undefined,
  message: string,
  data: unknown[]
): void {
  if (!sentryClientAvailable()) {
    return;
  }
  try {
    Sentry.addBreadcrumb({
      category: scope ? `log.${scope}` : 'log',
      level,
      message,
      data: data.length ? { details: data } : undefined,
    });
  } catch {
    // Logging must never throw.
  }
}

function report(scope: string | undefined, entry: ErrorEntry): void {
  if (!sentryClientAvailable()) {
    return;
  }
  const { http } = entry;
  const tags: Record<string, string> = {
    ...entry.tags,
    ...(scope ? { scope } : {}),
    ...(http?.status === undefined
      ? {}
      : { 'http.status': String(http.status) }),
    ...(http?.method ? { 'http.method': http.method } : {}),
    ...(http?.path ? { 'http.path': http.path } : {}),
  };
  const extra: Record<string, unknown> = {
    ...asRecord(entry.context),
    logMessage: entry.message,
    ...(entry.details === undefined ? {} : { details: entry.details }),
  };
  // Without a fingerprint every endpoint's 500 would merge into one issue.
  const grouping = http
    ? {
        contexts: { http_error: { ...http } },
        fingerprint: [
          http.name,
          http.message,
          http.method ?? '',
          http.path ?? '',
          String(http.status ?? ''),
        ],
      }
    : {};
  if (entry.exception) {
    Sentry.captureException(entry.exception, { tags, extra, ...grouping });
  } else {
    Sentry.captureMessage(entry.message, {
      level: 'error',
      tags,
      extra,
      ...grouping,
    });
  }
}

// Expected failures are warn-only, which would hide a real outage (every call
// failing with ERR_NETWORK / CORS) or a misrouted bearer (401 on a normal
// endpoint). Send one warning-level event per endpoint per minute for those.
const OUTAGE_EVENT_INTERVAL_MS = 60_000;
// Auth *actions* (a 401 here is a normal wrong-credentials / expired-refresh
// outcome). Other /auth/* endpoints (auth/kids, auth/linked-accounts, ...) are
// ordinary authenticated calls: a 401 there is worth one event per minute.
const AUTH_PATH =
  /^\/(?:api\/v1\/)?auth\/(?:login|logout|register|refresh|refresh-token|apple|google|send-verification|verify-email|request-password-reset|reset-password|validate-reset-token|change-password)(?:\/|$)/i;
const MAX_OUTAGE_KEYS = 200;
const lastOutageEvent = new Map<string, number>();

function maybeReportExpectedOutage(
  scope: string | undefined,
  entry: ErrorEntry
): void {
  const { http } = entry;
  if (!(http && sentryClientAvailable())) {
    return;
  }
  const network = http.code === 'ERR_NETWORK';
  const unauthorised = http.status === 401 && !AUTH_PATH.test(http.path ?? '');
  if (!(network || unauthorised)) {
    return;
  }
  if (
    network &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    return; // The user is offline: not an outage.
  }
  const key = `${http.method ?? ''} ${http.path ?? ''} ${network ? 'net' : '401'}`;
  const now = Date.now();
  const last = lastOutageEvent.get(key);
  if (last !== undefined && now - last < OUTAGE_EVENT_INTERVAL_MS) {
    return;
  }
  Sentry.captureMessage(
    `Expected failure: ${network ? 'network error' : 'unauthorised'} ${http.method ?? ''} ${http.path ?? ''}`.trim(),
    {
      level: 'warning',
      tags: {
        ...(scope ? { scope } : {}),
        ...(http.method ? { 'http.method': http.method } : {}),
        ...(http.path ? { 'http.path': http.path } : {}),
        'http.status': String(http.status ?? ''),
        expected: 'true',
      },
      fingerprint: [
        'expected-failure',
        network ? 'network' : '401',
        http.method ?? '',
        http.path ?? '',
      ],
      extra: { logMessage: entry.message },
    }
  );
  lastOutageEvent.delete(key);
  lastOutageEvent.set(key, now);
  if (lastOutageEvent.size > MAX_OUTAGE_KEYS) {
    const oldest = lastOutageEvent.keys().next().value;
    if (oldest !== undefined) {
      lastOutageEvent.delete(oldest);
    }
  }
}

export interface Logger {
  debug: (message: string, ...data: unknown[]) => void;
  info: (message: string, ...data: unknown[]) => void;
  warn: (message: string, ...data: unknown[]) => void;
  /**
   * `error` is the thrown value (or any detail). With `{ expected: true }` this
   * logs at warn level and does not create a Sentry issue (except a
   * rate-limited warning event for network errors / 401 on non-auth endpoints).
   * Never throws.
   */
  error: (message: string, error?: unknown, options?: LogOptions) => void;
}

const safely = (fn: () => void) => {
  try {
    fn();
  } catch {
    // Logging must never throw.
  }
};

export function createLogger(name?: string): Logger {
  const scope = name === undefined ? undefined : cleanMessage(name, newWalk());
  const plain =
    (level: 'debug' | 'info') =>
    (message: string, ...data: unknown[]) =>
      safely(() => {
        if (currentEnvironment() !== 'development') {
          return;
        }
        const entry = sanitiseData(message, data);
        writeConsole(level, scope, entry.message, entry.data);
      });
  const emitWarn = (entry: Entry) => {
    safely(() => writeConsole('warn', scope, entry.message, entry.data));
    sendBreadcrumb('warning', scope, entry.message, entry.data);
  };
  return {
    debug: plain('debug'),
    info: plain('info'),
    warn: (message, ...data) =>
      safely(() => emitWarn(sanitiseData(message, data))),
    error: (message, error, options = {}) =>
      safely(() => {
        const entry = sanitiseError(message, error, options);
        if (safeRead(() => options.expected, false)) {
          emitWarn(entry);
          safely(() => maybeReportExpectedOutage(scope, entry));
          return;
        }
        // Each step is isolated: a throwing console must not stop reporting.
        safely(() => writeConsole('error', scope, entry.message, entry.data));
        safely(() => sendBreadcrumb('error', scope, entry.message, []));
        safely(() => report(scope, entry));
      }),
  };
}

export const logger = createLogger();
export default logger;
