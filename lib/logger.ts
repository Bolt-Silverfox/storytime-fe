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
 * Everything is redacted before it reaches the console or Sentry. No Node-only
 * imports, so it is safe in the browser, server and edge runtimes. Sentry is
 * only initialised client-side (instrumentation-client.ts); on the server, or
 * if Sentry is missing/throws, the Sentry step is silently skipped.
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
const SENSITIVE_WORDS = new Set(['otp', 'pwd', 'ssn', 'iban']);
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
    .toLowerCase()
    .split(/[\s_.\-[\]]+/);

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
// "Authorization: <scheme> <token>" with any scheme (or none).
const AUTH_HEADER =
  /(authorization["']?\s*[:=]\s*)(?:"[^"]{0,2000}"|'[^']{0,2000}'|(?:[A-Za-z][\w.-]{0,30}\s+)?[^\s,;"'&]+)/gi;
// Header lines (Cookie: a=1; b=2, Authorization: Digest a="1", b="2") carry
// several pairs whose names are not secret-looking: mask to the end of the line.
const AUTH_HEADER_LINE =
  /(authorization["']?\s*:\s*)(?:"[^"\r\n]{0,8000}"|'[^'\r\n]{0,8000}'|[^\s"'`][^\r\n]*)/gi;
const COOKIE_HEADER =
  /(\b(?:set-)?cookie["']?\s*:\s*)(?:"[^"\r\n]{0,8000}"|'[^'\r\n]{0,8000}'|[^\s"'`][^\r\n"'`]*)/gi;
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
  percentEncoded: boolean;
}

/**
 * The separator that follows a key at `from`, or null.
 *
 * Linear by construction and never gives up early: `memo` maps every token
 * boundary already walked to where its walk ended, so a later key found inside
 * a subscript chain stops at the first boundary an earlier walk reached
 * instead of re-parsing the chain. Each boundary is tokenised at most once per
 * string; there is no work budget that could run out and skip masking.
 */
function parseSep(
  input: string,
  from: number,
  memo: Map<number, number>
): Separator | null {
  SEP_OPENER.lastIndex = from;
  const opened = SEP_OPENER.test(input);
  let i = from;
  const visited: number[] = [];
  for (;;) {
    const known = memo.get(i);
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
    memo.set(v, i);
  }
  SEP_CHAR.lastIndex = i;
  const c = SEP_CHAR.exec(input);
  if (!c) {
    return null;
  }
  i += c[0].length;
  TRAIL_SPACE.lastIndex = i;
  return {
    end: i + (TRAIL_SPACE.exec(input)?.[0].length ?? 0),
    explicit: opened || c[1] !== undefined || c[2] !== undefined,
    percentEncoded: c[0].startsWith('%'),
  };
}
const FILE_NAME = /\.(?:m?[jt]sx?|map|css|html?)$/i;
// Unquoted values run to the next delimiter, with NO length cap, so a long
// token is never cut in the middle and left half-visible. Queries split on a
// literal "&" before decoding, so "%26" ends a value only after an encoded separator.
const VALUE_RUN = /[^\s&#;,"'`()[\]{}<>]+/y;
const ENCODED_VALUE_RUN = /(?:(?!%26)[^\s&#;,"'`()[\]{}<>])+/y;
const VALUE_GROUP =
  /\[[^\]\n]{0,2000}\]|\([^)\n]{0,2000}\)|\{[^}\n]{0,2000}\}|<[^>\n]{0,2000}>/y;
const VALUE_UNCLOSED = /[[({<][^\s&#;,"'`]*/y;
const VALUE_OPEN_QUOTE = /(\\*)(["'`])/y;

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

/** [start, end) of the value after `from`, or null. Linear: scans each char once. */
function valueSpan(
  input: string,
  from: number,
  run: RegExp
): { start: number; end: number } | null {
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
  let end = from;
  for (;;) {
    run.lastIndex = end;
    end += run.exec(input)?.[0].length ?? 0;
    VALUE_GROUP.lastIndex = end;
    const group = VALUE_GROUP.exec(input);
    if (!group) {
      break;
    }
    end += group[0].length;
  }
  if (end === from) {
    VALUE_UNCLOSED.lastIndex = from;
    end += VALUE_UNCLOSED.exec(input)?.[0].length ?? 0;
  }
  return end > from ? { start: from, end } : null;
}

function redactKeyNames(input: string): string {
  KEY_SCAN.lastIndex = 0;
  const chainMemo = new Map<number, number>();
  let out = '';
  let pos = 0;
  for (let m = KEY_SCAN.exec(input); m; m = KEY_SCAN.exec(input)) {
    const [, before, key] = m;
    const keyEnd = m.index + before.length + key.length;
    const cls = classifyKey(key);
    const sep = cls ? parseSep(input, keyEnd, chainMemo) : null;
    const span =
      cls && sep && shouldMask(cls, key, sep, input)
        ? valueSpan(
            input,
            sep.end,
            sep.percentEncoded ? ENCODED_VALUE_RUN : VALUE_RUN
          )
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
      .replace(JWT, REDACTED)
      .replace(AUTH_HEADER_LINE, `$1${REDACTED}`)
      .replace(AUTH_HEADER, `$1${REDACTED}`)
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
  seen: WeakSet<object>;
  errors: WeakSet<object>;
  http: WeakMap<object, HttpFields>;
}

const newWalk = (): Walk => ({
  scan: MAX_CALL_SCAN,
  out: MAX_OUTPUT,
  seen: new WeakSet(),
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

const cleanString = (walk: Walk, value: string) =>
  emit(walk, redactString(value, walk));

function put(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function clean(value: unknown, depth: number, walk: Walk): unknown {
  if (walk.out <= 0) {
    return emit(walk, TRUNCATED);
  }
  try {
    return cleanNode(value, depth, walk);
  } catch {
    return emit(walk, UNSERIALIZABLE);
  }
}

function cleanProp(
  owner: object,
  key: string | number,
  depth: number,
  walk: Walk
): unknown {
  const value = safeRead(
    () => (owner as Record<string | number, unknown>)[key],
    THREW
  );
  return value === THREW ? emit(walk, UNREADABLE) : clean(value, depth, walk);
}

function cleanNode(value: unknown, depth: number, walk: Walk): unknown {
  switch (typeof value) {
    case 'string':
      return cleanString(walk, value);
    case 'function':
      return emit(walk, '[Function]');
    case 'symbol':
    case 'bigint':
      return cleanString(walk, String(value));
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
  if (walk.seen.has(value)) {
    return emit(walk, '[Circular]');
  }
  if (depth >= MAX_DEPTH) {
    return emit(walk, '[Truncated]');
  }
  walk.seen.add(value);
  const isError = value instanceof Error;
  const isHttp = isAxiosLike(value);
  if (isError || isHttp) {
    return cleanError(value, isError, isHttp, depth, walk);
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      if (walk.out <= 0 || i >= MAX_ENTRIES) {
        items.push(emit(walk, TRUNCATED));
        break;
      }
      items.push(cleanProp(value, i, depth + 1, walk));
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
        : cleanProp(value, key, depth + 1, walk)
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
]);

const PARSE_FAILURE = 'Input could not be parsed';

const withoutHeader = (stack: string, message: unknown) => {
  if (!stack.startsWith('SyntaxError')) {
    return stack;
  }
  const header = `SyntaxError: ${message}`;
  return `SyntaxError: ${PARSE_FAILURE}${
    typeof message === 'string' && stack.startsWith(header)
      ? stack.slice(header.length)
      : ''
  }`;
};

/**
 * Errors and Axios-like values keep what grouping and debugging need: name,
 * message, stack, cause, AggregateError members, primitive own props and a
 * whitelisted HTTP summary. Request/response/config are never copied.
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
  // JSON.parse and response.json() quote the input they rejected.
  const parseFailure = name === 'SyntaxError';
  const rawMessage = safeRead(() => source.message, THREW);
  const message = parseFailure ? PARSE_FAILURE : rawMessage;
  record.name =
    typeof name === 'string'
      ? cleanString(walk, name)
      : isError
        ? 'Error'
        : 'AxiosError';
  record.message =
    typeof message === 'string'
      ? cleanString(walk, message)
      : message === undefined
        ? ''
        : emit(walk, UNREADABLE);
  if (isError) {
    const stack = safeRead(() => source.stack, undefined);
    const shownStack =
      parseFailure && typeof stack === 'string'
        ? withoutHeader(stack, rawMessage)
        : stack;
    record.stack =
      typeof shownStack === 'string' && shownStack
        ? cleanString(walk, shownStack)
        : undefined;
    for (const key of ['cause', 'errors']) {
      const nested = safeRead(() => source[key], THREW);
      if (nested !== undefined) {
        record[key] =
          nested === THREW
            ? emit(walk, UNREADABLE)
            : clean(nested, depth + 1, walk);
      }
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
      } else if (typeof prop === 'string') {
        put(record, cleanString(walk, key), cleanString(walk, prop));
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
  if (typeof code === 'string') {
    fields.code = cleanString(walk, code);
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
    data: data.map((item) => clean(item, 0, walk)),
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
  const cleaned = error === undefined ? undefined : clean(error, 0, walk);
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
    record && walk.errors.has(record) ? toException(record, walk) : undefined;
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
      FETCH_FAILURE.test(String((e as { message?: unknown }).message))) ||
    (isAxiosLike(e) && !e.response)
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
  /(?:^|\/)(?:auth\/(?:login|logout|register|refresh|refresh-token|apple|google|send-verification|verify-email|request-password-reset|reset-password|validate-reset-token|change-password)|login|logout|oauth)(?:\/|$)/i;
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
