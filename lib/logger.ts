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
  return env === 'production' || env === 'test' ? env : 'development';
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACTED = '[REDACTED]';
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
];
// Unambiguous short credential words: matched as a whole key OR as one word
// (segment) of a longer key (db_pwd, user_otp), never as a substring
// ("classname" must not match "ssn").
const SENSITIVE_WORDS = new Set(['otp', 'pwd', 'ssn', 'iban']);
// A sensitive word only counts when it ends the key ("db_pwd", "user_otp") or
// is followed only by these ("iban_number"); "otp_sent", "pwd_changed_at" and
// "ssn_last4_hint" describe the credential rather than hold it.
const TAIL_WORDS = new Set(['code', 'token', 'value', 'number', 'no']);
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

const hasCredentialWord = (words: string[]) =>
  words.some(
    (w, i) =>
      SENSITIVE_WORDS.has(w) &&
      words.slice(i + 1).every((t) => TAIL_WORDS.has(t))
  );

const hasStem = (key: string) => {
  const k = normaliseKey(key);
  return SENSITIVE_STEMS.some((stem) => k.includes(stem));
};

/** Object keys: any sensitive stem, a sensitive word, or a whole-key sensitive word. */
function isSensitiveKey(key: string): boolean {
  return (
    hasStem(key) ||
    SENSITIVE_EXACT.has(normaliseKey(key)) ||
    hasCredentialWord(keyWords(key)) ||
    keyWords(key).at(-1) === 'sid'
  );
}

// Every logger call shares one scan budget across message + error + context,
// so the total work is bounded however many large strings are passed.
const MAX_CALL_SCAN = 128_000;
let activeBudget: { left: number } | null = null;

function withBudget<T>(fn: () => T): T {
  if (activeBudget) {
    return fn();
  }
  activeBudget = { left: MAX_CALL_SCAN };
  try {
    return fn();
  } finally {
    activeBudget = null;
  }
}

// Header and payload are length-bounded so a run of "eyJ" cannot make the
// match quadratic.
const JWT = /eyJ[\w-]{3,200}\.[\w-]{1,20000}\.[\w-]{0,2000}/g;
// "Authorization: <scheme> <token>" with any scheme (or none).
const AUTH_HEADER =
  /(authorization["']?\s*[:=]\s*)(?:"[^"]{0,2000}"|'[^']{0,2000}'|(?:[A-Za-z]{1,20}\s+)?[^\s,;"'&]+)/gi;
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
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,5}\.[A-Za-z]{2,24}/g;

// Independent final pass: find sensitive key NAMES anywhere (after a label, a
// URL "?", "&", "#", a quote, ...), then mask the value that follows. It does
// not depend on parsing labels, so "Failed: token: x", "url=https://a?token=x"
// and "password    ＝ x" are all handled the same way.
//   group 1: the char before the key (so a key never starts mid-word)
//   group 2: the key name
//   group 3: separator: closing/escaped quotes or brackets ("password":,
//            \"password\":, data[password]=, password[]=), spaces, = : (or
//            full-width / percent-encoded forms), spaces
const KEY_SCAN =
  /(^|[^\w.-])([A-Za-z][\w.-]*)((?:\\*["'`]|\]|\[[\w.-]{0,20}\]){0,4}\s{0,16}(?:[=:：＝]|%3[DdAa])\s{0,16})/g;
const FILE_NAME = /\.(?:m?[jt]sx?|map|css|html?)$/i;
// Unquoted values run to the next delimiter, with NO length cap, so a long
// token is never cut in the middle and left half-visible.
const VALUE_RUN = /(?:(?!%26)[^\s&#;,"'`()[\]{}<>])+/y;
const VALUE_OPEN_QUOTE = /(\\*)(["'`])/y;

// Only the story-ish capitalised word "Token:" is treated as prose unless the
// value looks like a credential. Real credential keys (password, secret,
// apiKey, ...) are always masked: 'Password: hunter' must not leak.
const looksLikeCredential = (v: string) =>
  /\d/.test(v) || v.length >= 12 || /^[A-Z0-9_-]{4,}$/.test(v);

function shouldMask(key: string, sep: string, peek: () => string): boolean {
  if (FILE_NAME.test(key)) {
    return false;
  }
  const k = normaliseKey(key);
  const words = keyWords(key);
  const credential = hasStem(key) || hasCredentialWord(words);
  const sid = words.at(-1) === 'sid';
  if (!(credential || sid || SENSITIVE_EXACT.has(k))) {
    return false;
  }
  const explicit = /[=＝]|%3[Dd]/.test(sep) || /^[\\"'`\]]/.test(sep);
  if (!credential && (sid || AMBIGUOUS_IN_TEXT.has(k))) {
    return explicit; // "code: be kind" / "sid: main" are prose; "code=abc" is a parameter
  }
  if (explicit) {
    return true;
  }
  return key === 'Token' ? looksLikeCredential(peek()) : true;
}

/** [start, end) of the value after `from`, or null. Linear: scans each char once. */
function valueSpan(
  input: string,
  from: number
): { start: number; end: number; quote: string } | null {
  VALUE_OPEN_QUOTE.lastIndex = from;
  const open = VALUE_OPEN_QUOTE.exec(input);
  if (open) {
    const q = open[2];
    const escaped = open[1].length > 0;
    const start = from + open[0].length;
    let i = input.indexOf(q, start);
    // Skip quotes escaped inside a plain string; for an escaped-JSON opener
    // (\") the closer is the next backslash-escaped quote.
    while (i !== -1 && (input[i - 1] === '\\') !== escaped) {
      i = input.indexOf(q, i + 1);
    }
    let end = i === -1 ? input.length : i;
    while (escaped && i !== -1 && end > start && input[end - 1] === '\\') {
      end--;
    }
    return end > start ? { start, end, quote: q } : null;
  }
  VALUE_RUN.lastIndex = from;
  const run = VALUE_RUN.exec(input);
  return run ? { start: from, end: from + run[0].length, quote: '' } : null;
}

function redactKeyNames(input: string): string {
  KEY_SCAN.lastIndex = 0;
  let out = '';
  let pos = 0;
  for (let m = KEY_SCAN.exec(input); m; m = KEY_SCAN.exec(input)) {
    const [, before, key, sep] = m;
    const keyEnd = m.index + before.length + key.length;
    const valueStart = m.index + m[0].length;
    const peek = () => {
      const o = input.slice(valueStart, valueStart + 200);
      return o.replace(/^\\*["'`]/, '').split(/[\s&#;,"'`]/)[0];
    };
    const span = shouldMask(key, sep, peek)
      ? valueSpan(input, valueStart)
      : null;
    if (!span || input.startsWith(REDACTED, span.start)) {
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

function redactString(input: string): string {
  const budget = activeBudget ?? { left: MAX_CALL_SCAN };
  // Short strings (ids, names, short messages) are always scanned: they are
  // cheap, and must never degrade to "[truncated]" because a huge blob was
  // logged beside them.
  const small = input.length <= SMALL_STRING;
  const allowed = small
    ? input.length
    : Math.min(input.length, MAX_SCAN, budget.left);
  if (allowed <= 0 && !small) {
    return '[truncated]';
  }
  budget.left = Math.max(0, budget.left - allowed);
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
      .replace(AUTH_HEADER, `$1${REDACTED}`)
      .replace(BEARER, `Bearer ${REDACTED}`)
      .replace(SCHEME_LONG, REDACTED)
      .replace(SCHEME_BASIC, `Basic ${REDACTED}`)
  ).replace(EMAIL, REDACTED);
  return value.length > MAX_STRING || cutInput
    ? `${value.slice(0, MAX_STRING)}…[truncated]`
    : value;
}

function isAxiosLike(value: object): boolean {
  return (
    (value as { isAxiosError?: unknown }).isAxiosError === true ||
    ('config' in value && 'response' in value)
  );
}

const ID_SEGMENT =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|c[a-z0-9]{20,})$/i;
// Parents whose next segment is an entity (slug / code / id), not a route word.
const DYNAMIC_PARENTS = new Set([
  'verify',
  'invite',
  'reset-password',
  'stories',
  'story',
  'users',
  'user',
  'kids',
  'share',
]);
// Route words that legitimately follow those parents.
const STATIC_WORDS = new Set([
  'me',
  'categories',
  'user',
  'library',
  'completed',
  'continue-reading',
  'progress',
  'quota',
  'daily-challenge',
  'kid',
  'recommended',
  'search',
  'audio',
  'avatar',
  'upload-avatar',
]);

function normaliseSegment(seg: string, parent: string): string {
  if (seg === '' || STATIC_WORDS.has(seg)) {
    return seg;
  }
  if (
    ID_SEGMENT.test(seg) ||
    (seg.length >= 20 && /\d/.test(seg)) ||
    (seg.length >= 6 && /\d/.test(seg) && /[a-z]/i.test(seg))
  ) {
    return ':id';
  }
  return DYNAMIC_PARENTS.has(parent) ? ':slug' : seg;
}

/** Path only (no origin/query/fragment), with ids/slugs replaced by ":id"/":slug". */
function normalisePath(url: unknown): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }
  let path = url.split(/[?#]/)[0];
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const segments = path.split('/');
  let parent = '';
  const out = segments.map((seg) => {
    const next = normaliseSegment(seg, parent);
    if (seg !== '') {
      parent = seg;
    }
    return next;
  });
  const joined = out.join('/');
  return redactString(joined.startsWith('/') ? joined : `/${joined}`);
}

interface HttpErrorSummary {
  name: string;
  message: string;
  code?: unknown;
  status?: number;
  method?: string;
  path?: string;
}

/** Axios errors carry request headers/body; keep only a safe summary. */
function summariseAxios(err: Record<string, unknown>): HttpErrorSummary {
  const response = err.response as { status?: number } | undefined;
  const config = err.config as { url?: string; method?: string } | undefined;
  return {
    name: typeof err.name === 'string' ? err.name : 'AxiosError',
    message: redactString(String(err.message ?? '')),
    code: err.code,
    status:
      response?.status ??
      (typeof err.status === 'number' ? err.status : undefined),
    method: config?.method?.toUpperCase(),
    path: normalisePath(config?.url),
  };
}

// Total serialised size allowed for one redacted value.
const MAX_TOTAL = 64_000;

interface Budget {
  left: number;
}

function redactInner(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  budget: Budget
): unknown {
  if (budget.left <= 0) {
    return '[truncated]';
  }
  if (typeof value === 'string') {
    const out = redactString(value);
    budget.left -= out.length;
    return out;
  }
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? '[Function]' : value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }
  seen.add(value);

  if (isAxiosLike(value)) {
    return summariseAxios(value as Record<string, unknown>);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
      cause:
        value.cause === undefined
          ? undefined
          : redactInner(value.cause, depth + 1, seen, budget),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactInner(item, depth + 1, seen, budget));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    budget.left -= key.length + 4;
    out[key] = isSensitiveKey(key)
      ? REDACTED
      : redactInner(inner, depth + 1, seen, budget);
  }
  return out;
}

/** Deep-copy `value` with secrets (tokens, auth headers, cookies, emails, passwords, session ids) masked. */
export function redact(value: unknown): unknown {
  try {
    return withBudget(() =>
      redactInner(value, 0, new WeakSet(), { left: MAX_TOTAL })
    );
  } catch {
    return '[Unserializable]';
  }
}

/**
 * A copy of `error` that is safe to send to Sentry yet keeps what grouping and
 * debugging need: name, redacted message, redacted stack, `cause`,
 * AggregateError members and primitive own props such as `status` / `code`.
 * Request/response/config (headers, bodies) are never copied.
 */
function safeErrorCopy(
  error: Error,
  depth = 0,
  seen = new WeakSet<object>()
): Error {
  seen.add(error);
  const copy = new Error(redactString(error.message));
  copy.name = error.name;
  copy.stack = error.stack ? redactString(error.stack) : undefined;
  if (depth < MAX_DEPTH) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && !seen.has(cause)) {
      copy.cause = safeErrorCopy(cause, depth + 1, seen);
    } else if (cause !== undefined && !(cause instanceof Error)) {
      copy.cause = redact(cause);
    }
    const members = (error as { errors?: unknown }).errors;
    if (Array.isArray(members)) {
      (copy as unknown as { errors: unknown[] }).errors = members.map((m) =>
        m instanceof Error && !seen.has(m)
          ? safeErrorCopy(m, depth + 1, seen)
          : redact(m)
      );
    }
  }
  for (const [key, val] of Object.entries(error)) {
    if (
      isSensitiveKey(key) ||
      key === 'config' ||
      key === 'request' ||
      key === 'response'
    ) {
      continue;
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
      (copy as unknown as Record<string, unknown>)[key] = val;
    } else if (typeof val === 'string') {
      (copy as unknown as Record<string, unknown>)[key] = redactString(val);
    }
  }
  return copy;
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
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
  if (typeof status !== 'number') {
    return false;
  }
  return (
    status === 401 || status === 429 || !!options.statuses?.includes(status)
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

function httpSummary(error: unknown): HttpErrorSummary | undefined {
  if (error && typeof error === 'object' && isAxiosLike(error)) {
    return summariseAxios(error as Record<string, unknown>);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Sends the already-redacted pieces to Sentry. Nothing is redacted here: the
 * caller redacts the exception, message and context once and shares the
 * result with the console, so the scan budget is spent once per call.
 */
function report(
  scope: string | undefined,
  safeMessage: string,
  copy: Error | undefined,
  details: unknown,
  safeContext: unknown,
  rawError: unknown,
  options: LogOptions
): void {
  if (!sentryClientAvailable()) {
    return;
  }
  const http = httpSummary(rawError);
  const tags: Record<string, string> = {
    ...options.tags,
    ...(scope ? { scope } : {}),
    ...(http?.status === undefined
      ? {}
      : { 'http.status': String(http.status) }),
    ...(http?.method ? { 'http.method': http.method } : {}),
    ...(http?.path ? { 'http.path': http.path } : {}),
  };
  const extra: Record<string, unknown> = {
    ...asRecord(safeContext),
    logMessage: safeMessage,
    ...(details === undefined ? {} : { details }),
  };
  if (copy) {
    // Without a fingerprint every endpoint's 500 would merge into one issue.
    Sentry.captureException(copy, {
      tags,
      extra,
      ...(http
        ? {
            contexts: { http_error: { ...http } },
            fingerprint: [
              copy.name,
              http.message,
              http.method ?? '',
              http.path ?? '',
              String(http.status ?? ''),
            ],
          }
        : {}),
    });
  } else {
    Sentry.captureMessage(safeMessage, { level: 'error', tags, extra });
  }
}

const errorSummary = (e: Error): Record<string, unknown> => ({
  name: e.name,
  message: e.message,
  stack: e.stack,
  cause: e.cause instanceof Error ? errorSummary(e.cause) : e.cause,
});

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
  message: string,
  error: unknown
): void {
  const http = httpSummary(error);
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
  lastOutageEvent.delete(key);
  lastOutageEvent.set(key, now);
  if (lastOutageEvent.size > MAX_OUTAGE_KEYS) {
    const oldest = lastOutageEvent.keys().next().value;
    if (oldest !== undefined) {
      lastOutageEvent.delete(oldest);
    }
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
      extra: { logMessage: message },
    }
  );
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
    withBudget(fn);
  } catch {
    // Logging must never throw.
  }
};

export function createLogger(scope?: string): Logger {
  const plain =
    (level: 'debug' | 'info') =>
    (message: string, ...data: unknown[]) =>
      safely(() =>
        writeConsole(
          level,
          scope,
          redactString(String(message)),
          data.map(redact)
        )
      );
  const emitWarn = (safeMessage: string, safeData: unknown[]) => {
    safely(() => writeConsole('warn', scope, safeMessage, safeData));
    sendBreadcrumb('warning', scope, safeMessage, safeData);
  };
  const warn = (message: string, ...data: unknown[]) =>
    safely(() => emitWarn(redactString(String(message)), data.map(redact)));
  return {
    debug: plain('debug'),
    info: plain('info'),
    warn,
    error: (message, error, options = {}) =>
      safely(() => {
        if (options.expected) {
          const safeMessage = redactString(String(message));
          emitWarn(safeMessage, [
            ...(error === undefined ? [] : [redact(error)]),
            ...(options.context ? [redact(options.context)] : []),
          ]);
          safely(() => maybeReportExpectedOutage(scope, safeMessage, error));
          return;
        }
        // Redact each input exactly once, in priority order (exception, then
        // log message, then context), and reuse the result for the console
        // and Sentry so the per-call scan budget is spent once.
        const copy = error instanceof Error ? safeErrorCopy(error) : undefined;
        const safeMessage = redactString(String(message));
        const details =
          error !== undefined && !copy ? redact(error) : undefined;
        const safeContext = options.context
          ? redact(options.context)
          : undefined;
        // Each step is isolated: a throwing console must not stop reporting.
        safely(() =>
          writeConsole('error', scope, safeMessage, [
            ...(copy ? [errorSummary(copy)] : []),
            ...(details === undefined ? [] : [details]),
            ...(safeContext === undefined ? [] : [safeContext]),
          ])
        );
        safely(() => sendBreadcrumb('error', scope, safeMessage, []));
        safely(() =>
          report(scope, safeMessage, copy, details, safeContext, error, options)
        );
      }),
  };
}

export const logger = createLogger();
export default logger;
