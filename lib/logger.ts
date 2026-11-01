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
  'otp',
];
// Short words match only as the whole key (substring would hit "keyboard",
// "shipping", "statusCode", ...).
const SENSITIVE_EXACT = new Set([
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

function isSensitiveKey(
  key: string,
  inText = false,
  strictSeparator = true
): boolean {
  const k = normaliseKey(key);
  if (SENSITIVE_STEMS.some((stem) => k.includes(stem))) {
    return true;
  }
  if (!SENSITIVE_EXACT.has(k)) {
    return false;
  }
  return !(inText && AMBIGUOUS_IN_TEXT.has(k) && !strictSeparator);
}

const JWT = /eyJ[\w-]{3,}\.[\w-]+\.[\w-]*/g;
// "Authorization: <scheme> <token>" with any scheme (or none).
const AUTH_HEADER =
  /(authorization["']?\s*[:=]\s*)(?:"[^"]{0,2000}"|'[^']{0,2000}'|(?:[A-Za-z]{1,20}\s+)?[^\s,;"'&]+)/gi;
const SCHEME_TOKEN = /\b(Bearer|Basic|Token|Digest)\s+[\w.~+/=-]+/gi;
// key=value / key: value / "key":"value" pairs. Bounded so it stays linear.
const PAIR =
  /(["']?)([A-Za-z][\w.-]{0,40})\1(\s{0,3}[:=](?!\/\/)\s{0,3})(?:"([^"]{0,500})"|'([^']{0,500})'|([^\s,&;}"']{1,500}))/g;
// Bounded quantifiers keep this linear; the TLD must be letters, so
// "pkg@1.2.3" is left alone.
const EMAIL =
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,5}\.[A-Za-z]{2,24}/g;

function redactString(input: string): string {
  let value = input;
  let truncated = false;
  if (value.length > MAX_STRING) {
    value = value.slice(0, MAX_STRING);
    truncated = true;
  }
  value = value
    .replace(JWT, REDACTED)
    .replace(AUTH_HEADER, `$1${REDACTED}`)
    .replace(SCHEME_TOKEN, `$1 ${REDACTED}`)
    .replace(PAIR, (match, quote: string, key: string, sep: string) => {
      const strict = quote !== '' || sep.trim() === '=';
      return isSensitiveKey(key, true, strict)
        ? `${quote}${key}${quote}${sep}${quote ? `${quote}${REDACTED}${quote}` : REDACTED}`
        : match;
    })
    .replace(EMAIL, REDACTED);
  return truncated ? `${value}…[truncated]` : value;
}

function isAxiosLike(value: object): boolean {
  return (
    (value as { isAxiosError?: unknown }).isAxiosError === true ||
    ('config' in value && 'response' in value)
  );
}

const ID_SEGMENT =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|c[a-z0-9]{20,})$/i;

/** Path only (no origin/query/fragment), with ids replaced by ":id". */
function normalisePath(url: unknown): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }
  let path = url.split(/[?#]/)[0];
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const segments = path
    .split('/')
    .map((seg) =>
      ID_SEGMENT.test(seg) || (seg.length >= 20 && /\d/.test(seg)) ? ':id' : seg
    );
  return redactString(segments.join('/')) || '/';
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

function redactInner(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (typeof value === 'string') {
    return redactString(value);
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
          : redactInner(value.cause, depth + 1, seen),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactInner(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key)
      ? REDACTED
      : redactInner(inner, depth + 1, seen);
  }
  return out;
}

/** Deep-copy `value` with secrets (tokens, auth headers, cookies, emails, passwords, session ids) masked. */
export function redact(value: unknown): unknown {
  try {
    return redactInner(value, 0, new WeakSet());
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

function report(
  scope: string | undefined,
  message: string,
  error: unknown,
  options: LogOptions
): void {
  if (!sentryClientAvailable()) {
    return;
  }
  const http = httpSummary(error);
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
    ...asRecord(redact(options.context)),
    logMessage: message,
    ...(error !== undefined && !(error instanceof Error)
      ? { details: redact(error) }
      : {}),
  };
  const isError = error instanceof Error;
  if (isError) {
    // A copy keeps stack/cause/status but never request headers or bodies.
    // Without a fingerprint every endpoint's 500 would merge into one issue.
    const copy = safeErrorCopy(error);
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
    Sentry.captureMessage(message, { level: 'error', tags, extra });
  }
}

// Expected failures are warn-only, which would hide a real outage (every call
// failing with ERR_NETWORK / CORS) or a misrouted bearer (401 on a normal
// endpoint). Send one warning-level event per endpoint per minute for those.
const OUTAGE_EVENT_INTERVAL_MS = 60_000;
const AUTH_PATH =
  /\/(auth|login|logout|register|refresh|session|verify|password|token|oauth)\b/i;
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
  lastOutageEvent.set(key, now);
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
    fn();
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
  const warn = (message: string, ...data: unknown[]) =>
    safely(() => {
      const safeMessage = redactString(String(message));
      const safeData = data.map(redact);
      writeConsole('warn', scope, safeMessage, safeData);
      sendBreadcrumb('warning', scope, safeMessage, safeData);
    });
  return {
    debug: plain('debug'),
    info: plain('info'),
    warn,
    error: (message, error, options = {}) =>
      safely(() => {
        if (options.expected) {
          warn(
            message,
            ...(error === undefined ? [] : [error]),
            ...(options.context ? [options.context] : [])
          );
          safely(() =>
            maybeReportExpectedOutage(
              scope,
              redactString(String(message)),
              error
            )
          );
          return;
        }
        const safeMessage = redactString(String(message));
        writeConsole('error', scope, safeMessage, [
          ...(error === undefined ? [] : [redact(error)]),
          ...(options.context ? [redact(options.context)] : []),
        ]);
        sendBreadcrumb('error', scope, safeMessage, []);
        safely(() => report(scope, safeMessage, error, options));
      }),
  };
}

export const logger = createLogger();
export default logger;
