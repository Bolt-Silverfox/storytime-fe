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

const SENSITIVE_KEY =
  /token|authori[sz]ation|cookie|passw(or)?d|secret|api[-_]?key|session[-_]?id|credential|email|otp|pin$|set-cookie|jwt|bearer/i;

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER = /\b(Bearer|Basic)\s+[\w.~+/=-]+/gi;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const QUERY_SECRET =
  /([?&](?:token|access_token|refresh_token|code|key|sig|signature|email)=)[^&#\s]*/gi;

function redactString(value: string): string {
  return value
    .replace(JWT, REDACTED)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(QUERY_SECRET, `$1${REDACTED}`)
    .replace(EMAIL, REDACTED);
}

function isAxiosLike(value: object): boolean {
  return (
    (value as { isAxiosError?: unknown }).isAxiosError === true ||
    ('config' in value && 'response' in value)
  );
}

function stripQuery(url: unknown): string | undefined {
  return typeof url === 'string' ? redactString(url.split('?')[0]) : undefined;
}

/** Axios errors carry request headers/body; keep only a safe summary. */
function summariseAxios(err: Record<string, unknown>) {
  const response = err.response as { status?: number } | undefined;
  const config = err.config as { url?: string; method?: string } | undefined;
  return {
    name: typeof err.name === 'string' ? err.name : 'AxiosError',
    message: redactString(String(err.message ?? '')),
    code: err.code,
    status: response?.status,
    method: config?.method,
    url: stripQuery(config?.url),
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
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactInner(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key)
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

function firstError(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
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
  const tags = { ...options.tags, ...(scope ? { scope } : {}) };
  const extra = {
    ...(redact(options.context) as Record<string, unknown> | undefined),
    logMessage: message,
    ...(error !== undefined && !(error instanceof Error)
      ? { details: redact(error) }
      : {}),
  };
  try {
    const err = firstError(error);
    if (err) {
      const safe = redact(err) as {
        name: string;
        message: string;
        stack?: string;
      };
      const copy = new Error(safe.message);
      copy.name = safe.name;
      copy.stack = safe.stack;
      Sentry.captureException(copy, { tags, extra });
    } else {
      Sentry.captureMessage(message, { level: 'error', tags, extra });
    }
  } catch {
    // Logging must never throw.
  }
}

export interface Logger {
  debug: (message: string, ...data: unknown[]) => void;
  info: (message: string, ...data: unknown[]) => void;
  warn: (message: string, ...data: unknown[]) => void;
  /**
   * `error` is the thrown value (or any detail). With `{ expected: true }` this
   * logs at warn level and does not create a Sentry issue.
   */
  error: (message: string, error?: unknown, options?: LogOptions) => void;
}

export function createLogger(scope?: string): Logger {
  const plain =
    (level: 'debug' | 'info') =>
    (message: string, ...data: unknown[]) => {
      writeConsole(level, scope, redactString(message), data.map(redact));
    };
  const warn = (message: string, ...data: unknown[]) => {
    const safeMessage = redactString(message);
    const safeData = data.map(redact);
    writeConsole('warn', scope, safeMessage, safeData);
    sendBreadcrumb('warning', scope, safeMessage, safeData);
  };
  return {
    debug: plain('debug'),
    info: plain('info'),
    warn,
    error: (message, error, options = {}) => {
      if (options.expected) {
        warn(
          message,
          ...(error === undefined ? [] : [error]),
          ...(options.context ? [options.context] : [])
        );
        return;
      }
      const safeMessage = redactString(message);
      const safeError = error === undefined ? [] : [redact(error)];
      writeConsole('error', scope, safeMessage, [
        ...safeError,
        ...(options.context ? [redact(options.context)] : []),
      ]);
      report(scope, safeMessage, error, options);
    },
  };
}

export const logger = createLogger();
export default logger;
