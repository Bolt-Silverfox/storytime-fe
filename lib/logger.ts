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
 * Nothing the caller or a thrown value supplies is forwarded as free text:
 * messages come from LOG_MESSAGES, context keeps only CONTEXT_RULES keys with
 * values of a fixed shape, and thrown values are reduced to their structure.
 */

export const LOG_MESSAGES = [
  'Error clearing selected mode from localStorage',
  'Error getting selected mode from localStorage',
  'Error parsing user data from localStorage',
  'Error playing audio',
  'Error setting selected mode to localStorage',
  'Failed to delete push token',
  'Failed to fetch daily challenges',
  'Failed to fetch kids',
  'Failed to fetch voices',
  'Failed to initialize Firebase messaging',
  'Failed to load voices',
  'Failed to play voice preview',
  'Failed to prepare story',
  'Failed to remove favorite',
  'Failed to request push permission/token',
  'Failed to subscribe to foreground push',
  'Failed to update favorite',
] as const;

export type LogMessage = (typeof LOG_MESSAGES)[number];
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  route?: string;
  method?: string;
  status?: number;
  code?: string | number;
  durationMs?: number;
  requestId?: string;
  attempt?: number;
}

export interface LogOptions {
  /** Expected, recoverable failure: logged at warn (breadcrumb), not error. */
  expected?: boolean;
  tags?: LogContext;
  context?: LogContext;
}

type Environment = 'development' | 'production' | 'test';

const config: { environment?: Environment } = {};

/** Override the detected environment. Intended for tests. */
export function configureLogger(next: { environment?: Environment }): void {
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

const REDACTED = '[REDACTED]';
const OMITTED = '[omitted]';
const UNREADABLE = '[unreadable]';
const UNLISTED = '[unlisted message]';
const TRUNCATED = '[truncated]';
const CIRCULAR = '[circular]';
const THREW = Symbol('threw');

function safeRead<T, F>(read: () => T, fallback: F): T | F {
  try {
    return read();
  } catch {
    return fallback;
  }
}

const LISTED = new Set<unknown>(LOG_MESSAGES);
const listedMessage = (message: unknown): string =>
  LISTED.has(message) ? (message as string) : UNLISTED;

const ROUTES = `
  auth/apple auth/google auth/change-password auth/kids/:id auth/link/apple
  auth/link/google auth/linked-accounts auth/login auth/logout auth/magic
  auth/refresh auth/refresh-token auth/register auth/passwordless/request
  auth/request-password-reset auth/reset-password/:id auth/send-verification
  auth/validate-reset-token auth/verify-email auth/verify/:id
  auth/unlink/google auth/unlink/apple avatars/system devices/register
  guest/history guest/quota guest/session guest/stories/:id/audio/:id
  help-support/feedback notifications/mark-all-read
  notification-preferences/users/:id notification-preferences/:id
  parent-favorites/:id stories/categories stories/user/library/completed
  stories/user/library/continue-reading stories/user/progress
  stories/user/quota stories/daily-challenge/kid/:id stories/:id/audio
  user/me/avatar user/me/upload-avatar users/:id voice/access
  voice/available voice/preferred voice/story/audio/batch invite/:id
  reset-password/:id kids/:id progress/:id story/:id login/code
  register/setup/success register/setup/voice forgot-password/verify
  create-new-password/success verify-email dashboard/ai-voice
  dashboard/notification dashboard/personal-settings
  dashboard/security-settings favorites library contact privacy-policy faq
  about terms-and-conditions stories kids notifications devices
  parent-favorites auth/kids guest/stories/:id guest/stories/:id/audio user/me
  stories/:id story
`;

interface RouteNode {
  fixed: Map<string, RouteNode>;
  param?: RouteNode;
  complete: boolean;
}

const routeNode = (): RouteNode => ({ fixed: new Map(), complete: false });

const ROUTE_TREE = routeNode();
for (const route of ROUTES.split(/\s+/).filter(Boolean)) {
  let node = ROUTE_TREE;
  for (const seg of route.split('/')) {
    if (seg === ':id') {
      node.param ??= routeNode();
      node = node.param;
    } else {
      const next = node.fixed.get(seg) ?? routeNode();
      node.fixed.set(seg, next);
      node = next;
    }
  }
  node.complete = true;
}
ROUTE_TREE.complete = true;

function longestRoute(
  node: RouteNode,
  words: string[],
  at: number
): string[] | undefined {
  let best: string[] | undefined = node.complete ? [] : undefined;
  if (at >= words.length) {
    return best;
  }
  const branches: [RouteNode | undefined, string][] = [
    [node.fixed.get(words[at]), words[at]],
    [node.param, ':id'],
  ];
  for (const [next, shown] of branches) {
    const rest = next && longestRoute(next, words, at + 1);
    if (rest && (!best || rest.length + 1 > best.length)) {
      best = [shown, ...rest];
    }
  }
  return best;
}

const MAX_SEGMENTS = 20;
const MAX_URL = 4_000;
const RELATIVE_BASE = 'http://relative.invalid';

const decodeSegment = (seg: string) =>
  safeRead(() => decodeURIComponent(seg), ':id');

/** Words stay readable only within the longest known route the path starts with; every other segment becomes ":id". */
function normalisePath(pathname: string): string {
  const words = pathname
    .split('/', MAX_SEGMENTS + 1)
    .filter((seg) => seg !== '')
    .slice(0, MAX_SEGMENTS)
    .map(decodeSegment);
  const prefix = words[0] === 'api' && words[1] === 'v1' ? ['api', 'v1'] : [];
  const rest = words.slice(prefix.length);
  const route = longestRoute(ROUTE_TREE, rest, 0) ?? [];
  const shown = rest.map((_, i) => route[i] ?? ':id');
  return `/${[...prefix, ...shown].join('/')}`;
}

function parseUrl(raw: unknown): URL | undefined {
  return typeof raw === 'string'
    ? safeRead(() => new URL(raw.slice(0, MAX_URL), RELATIVE_BASE), undefined)
    : undefined;
}

function urlPath(raw: unknown): string | undefined {
  const url = parseUrl(raw);
  return url && normalisePath(url.pathname);
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

const isHttpStatus = (s: unknown): s is number =>
  Number.isInteger(s) && (s as number) >= 100 && (s as number) <= 599;

const isSmallCount = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1_000;

const ERROR_CODES = new Set([
  'ERR_NETWORK',
  'ERR_CANCELED',
  'ERR_BAD_REQUEST',
  'ERR_BAD_RESPONSE',
  'ERR_BAD_OPTION',
  'ERR_BAD_OPTION_VALUE',
  'ERR_DEPRECATED',
  'ERR_FR_TOO_MANY_REDIRECTS',
  'ERR_INVALID_URL',
  'ERR_NOT_SUPPORT',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'messaging/permission-blocked',
  'messaging/permission-default',
  'messaging/unsupported-browser',
  'messaging/failed-service-worker-registration',
  'messaging/token-subscribe-failed',
  'messaging/token-unsubscribe-failed',
  'messaging/token-update-failed',
  'messaging/invalid-vapid-key',
  'app/no-app',
  'app/duplicate-app',
  'installations/request-failed',
]);
const isKnownCode = (code: unknown): code is string =>
  typeof code === 'string' && ERROR_CODES.has(code);

const APP_CODE = /^[A-Z]{2,16}(?:_[A-Z]{2,16}){0,3}$/;
const UUID =
  /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

type Rule = (value: unknown) => string | number | undefined;

const CONTEXT_RULES: Record<keyof LogContext, Rule> = {
  route: urlPath,
  method: (v) =>
    typeof v === 'string' && HTTP_METHODS.has(v.toUpperCase())
      ? v.toUpperCase()
      : undefined,
  status: (v) => (isHttpStatus(v) ? v : undefined),
  code: (v) =>
    isSmallCount(v) ||
    isKnownCode(v) ||
    (typeof v === 'string' && APP_CODE.test(v))
      ? (v as string | number)
      : undefined,
  durationMs: (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined,
  requestId: (v) => (typeof v === 'string' && UUID.test(v) ? v : undefined),
  attempt: (v) => (isSmallCount(v) ? v : undefined),
};
const CONTEXT_KEYS = Object.keys(CONTEXT_RULES) as (keyof LogContext)[];

function cleanContext(context: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const isRecord = safeRead(
    () => !!context && typeof context === 'object' && !Array.isArray(context),
    false
  );
  if (!isRecord) {
    return out;
  }
  const source = context as Record<string, unknown>;
  for (const key of CONTEXT_KEYS) {
    if (!safeRead(() => Object.hasOwn(source, key), false)) {
      continue;
    }
    const value = safeRead(() => source[key], undefined);
    out[key] = safeRead(() => CONTEXT_RULES[key](value), undefined) ?? REDACTED;
  }
  return out;
}

const MAX_TAG_VALUE = 200;

function cleanTags(tags: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(cleanContext(tags)).map(([key, value]) => [
      key,
      String(value).slice(0, MAX_TAG_VALUE),
    ])
  );
}

const LIBRARY_MESSAGES = [
  /^Request failed with status code [1-5]\d\d$/,
  /^timeout of \d{1,9}ms exceeded$/,
  /^(?:Network Error|canceled|Failed to fetch|Load failed|No response from server|Unexpected error)$/,
  /^NetworkError when attempting to fetch resource\.$/,
  /^(?:The user aborted a request|The operation was aborted|signal is aborted without reason)\.?$/,
];
const libraryMessage = (text: string): string =>
  text.length <= 120 && LIBRARY_MESSAGES.some((re) => re.test(text))
    ? text
    : OMITTED;

const ERROR_NAMES = new Set([
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'DOMException',
  'AbortError',
  'TimeoutError',
  'NetworkError',
  'NotAllowedError',
  'NotFoundError',
  'NotReadableError',
  'NotSupportedError',
  'InvalidStateError',
  'QuotaExceededError',
  'SecurityError',
  'UnknownError',
  'AxiosError',
  'CanceledError',
  'FirebaseError',
  'ChunkLoadError',
  'ZodError',
]);
const NUMERIC_KEYS = [
  'status',
  'statusCode',
  'errno',
  'lineNumber',
  'columnNumber',
];

const MAX_FRAMES = 30;
const MAX_FRAME_LINE = 1_000;
const MAX_STACK = 64_000;
const FRAME_LOCATION = /^(\S{1,800}?):(\d{1,7}):(\d{1,7})$/;
const V8_FRAME =
  /^\s*at (?:((?:async |new )?[\w$.<>[\]]{1,120}) \((\S{1,820}|<anonymous>|native)\)|(\S{1,820}))$/;
const GECKO_FRAME = /^([\w$.<>/[\]*]{0,120})@(\S{0,820})$/;
const FILE_NAME = /^[\w.-]{1,100}$/;
const PUBLIC_SCRIPTS = new Set(['/firebase-messaging-sw.js']);

function webLocation(file: string): string | undefined {
  const url = parseUrl(file);
  if (!(url && /^https?:$/.test(url.protocol))) {
    return undefined;
  }
  const path =
    url.pathname.startsWith('/_next/static/') ||
    PUBLIC_SCRIPTS.has(url.pathname)
      ? url.pathname
      : normalisePath(url.pathname);
  return `${url.origin}${path}`;
}

function frameLocation(location: string): string | undefined {
  if (location === '<anonymous>' || location === 'native') {
    return location;
  }
  const m = FRAME_LOCATION.exec(location);
  if (!m) {
    return undefined;
  }
  const [, file, line, column] = m;
  if (/^https?:\/\//i.test(file)) {
    const web = webLocation(file);
    return web && `${web}:${line}:${column}`;
  }
  const name = file.split(/[?#]/)[0].split(/[\\/]/).at(-1) ?? '';
  return FILE_NAME.test(name) ? `${name}:${line}:${column}` : undefined;
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

function stackFrames(stack: string, message: unknown, header: string): string {
  const firstLine = stack.slice(0, MAX_FRAME_LINE + 1).split(/\r?\n/, 1)[0];
  const headed = stackFrame(firstLine) === undefined;
  const text = typeof message === 'string' ? message : '';
  const at =
    headed && text ? stack.slice(0, 200 + text.length).indexOf(text) : -1;
  const bodyStart = at === -1 ? 0 : at + text.length;
  const frames: string[] = [];
  for (const line of stack
    .slice(bodyStart, bodyStart + MAX_STACK)
    .split(/\r?\n/)) {
    const frame = stackFrame(line);
    if (frame === undefined) {
      if (frames.length) {
        break;
      }
      continue;
    }
    frames.push(frame);
    if (frames.length >= MAX_FRAMES) {
      break;
    }
  }
  return [...(headed ? [header] : []), ...frames].join('\n');
}

interface HttpFields {
  code?: string;
  status?: number;
  method?: string;
  path?: string;
}

function isAxiosLike(value: object): boolean {
  return safeRead(
    () =>
      (value as { isAxiosError?: unknown }).isAxiosError === true ||
      ('config' in value && 'response' in value),
    false
  );
}

function httpFields(source: Record<string, unknown>): HttpFields {
  const response = safeRead(() => source.response, undefined) as
    | { status?: unknown }
    | undefined;
  const requestConfig = safeRead(() => source.config, undefined) as
    | { url?: unknown; method?: unknown }
    | undefined;
  const fields: HttpFields = {};
  const code = safeRead(() => source.code, undefined);
  if (isKnownCode(code)) {
    fields.code = code;
  }
  const status = [
    safeRead(() => response?.status, undefined),
    safeRead(() => source.status, undefined),
  ].find(isHttpStatus);
  if (status !== undefined) {
    fields.status = status;
  }
  const method = CONTEXT_RULES.method(
    safeRead(() => requestConfig?.method, undefined)
  );
  if (typeof method === 'string') {
    fields.method = method;
  }
  const path = urlPath(safeRead(() => requestConfig?.url, undefined));
  if (path) {
    fields.path = path;
  }
  return fields;
}

const MAX_DEPTH = 4;
const MAX_RECORDS = 12;

interface Walk {
  records: number;
  active: WeakSet<object>;
  errors: WeakSet<object>;
}

type Thrown = string | Record<string, unknown> | unknown[];

function cleanThrown(value: unknown, depth: number, walk: Walk): Thrown {
  if (typeof value === 'string') {
    return libraryMessage(value);
  }
  if (!value || typeof value !== 'object') {
    return OMITTED;
  }
  if (walk.active.has(value)) {
    return CIRCULAR;
  }
  if (depth > MAX_DEPTH || walk.records >= MAX_RECORDS) {
    return TRUNCATED;
  }
  walk.records++;
  walk.active.add(value);
  try {
    return cleanRecord(value, depth, walk);
  } finally {
    walk.active.delete(value);
  }
}

function cleanRecord(
  value: object,
  depth: number,
  walk: Walk
): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  const isError = value instanceof Error;
  const isHttp = isAxiosLike(value);
  const record: Record<string, unknown> = {};
  const name = safeRead(() => source.name, undefined);
  if (typeof name === 'string' && ERROR_NAMES.has(name)) {
    record.name = name;
  } else if (isError || isHttp) {
    record.name = isError ? 'Error' : 'AxiosError';
  }
  const message = safeRead(() => source.message, THREW);
  if (typeof message === 'string') {
    record.message = libraryMessage(message);
  } else if (isError || message === THREW) {
    record.message = message === undefined ? '' : UNREADABLE;
  }
  if (isError) {
    const stack = safeRead(() => source.stack, undefined);
    if (typeof stack === 'string' && stack) {
      record.stack = stackFrames(
        stack,
        message,
        `${record.name}: ${record.message}`
      );
    }
  }
  const code = safeRead(() => source.code, undefined);
  if (
    (typeof code === 'number' && Number.isFinite(code)) ||
    isKnownCode(code)
  ) {
    record.code = code;
  }
  for (const key of NUMERIC_KEYS) {
    const prop = safeRead(() => source[key], undefined);
    if (typeof prop === 'number' && Number.isFinite(prop)) {
      record[key] = prop;
    }
  }
  const cause = safeRead(() => source.cause, THREW);
  if (cause === THREW) {
    record.cause = UNREADABLE;
  } else if (cause !== undefined) {
    record.cause = cleanThrown(cause, depth + 1, walk);
  }
  const errors = safeRead(() => source.errors, undefined);
  if (Array.isArray(errors)) {
    record.errors = errors
      .slice(0, MAX_RECORDS)
      .map((item) => cleanThrown(item, depth + 1, walk));
  }
  if (isHttp) {
    Object.assign(record, httpFields(source));
  }
  if (isError) {
    walk.errors.add(record);
  }
  return record;
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
    Object.defineProperty(error, key, {
      value: key === 'cause' || key === 'errors' ? revive(value) : value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return error;
}

interface HttpSummary extends HttpFields {
  name: string;
  message: string;
}

interface Entry {
  message: string;
  data: unknown[];
}

interface ErrorEntry extends Entry {
  exception?: Error;
  details?: Thrown;
  context: Record<string, string | number>;
  tags: Record<string, string>;
  http?: HttpSummary;
}

function contextEntry(message: unknown, context: unknown): Entry {
  const clean = cleanContext(context);
  return {
    message: listedMessage(message),
    data: Object.keys(clean).length ? [clean] : [],
  };
}

function errorEntry(
  message: unknown,
  error: unknown,
  options: unknown
): ErrorEntry {
  const read = (key: keyof LogOptions) =>
    safeRead(() => (options as LogOptions)[key], undefined);
  const safeMessage = listedMessage(message);
  const walk: Walk = {
    records: 0,
    active: new WeakSet(),
    errors: new WeakSet(),
  };
  const cleaned = error === undefined ? undefined : cleanThrown(error, 0, walk);
  const record =
    cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
      ? cleaned
      : undefined;
  const context = cleanContext(read('context'));
  const exception =
    record && walk.errors.has(record)
      ? toException(
          record.message === OMITTED
            ? { ...record, message: safeMessage }
            : record,
          walk
        )
      : undefined;
  const isHttp = safeRead(
    () => !!error && typeof error === 'object' && isAxiosLike(error),
    false
  );
  const {
    name,
    message: recordMessage,
    code,
    status,
    method,
    path,
  } = record ?? {};
  return {
    message: safeMessage,
    data: [
      ...(cleaned === undefined ? [] : [cleaned]),
      ...(Object.keys(context).length ? [context] : []),
    ],
    exception,
    details: exception ? undefined : cleaned,
    context,
    tags: cleanTags(read('tags')),
    http:
      record && isHttp
        ? ({
            name: String(name),
            message: String(recordMessage),
            ...(code === undefined ? {} : { code }),
            ...(status === undefined ? {} : { status }),
            ...(method === undefined ? {} : { method }),
            ...(path === undefined ? {} : { path }),
          } as HttpSummary)
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
const FETCH_FAILURE =
  /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.|Network Error)$/;

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
  const status = [e.response?.status, e.status].find(isHttpStatus);
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

function writeConsole(level: LogLevel, entry: Entry): void {
  const env = currentEnvironment();
  if (env === 'test') {
    return;
  }
  if (env === 'production' && (level === 'debug' || level === 'info')) {
    return;
  }
  const out = console[level];
  const label = `[${level.toUpperCase()}]`;
  emittingToConsole = true;
  try {
    if (env === 'production') {
      out(`${label} ${entry.message}`, ...entry.data);
      return;
    }
    const time = new Date().toISOString().slice(11, 23);
    if (typeof window !== 'undefined') {
      out(
        `%c${time} ${label}%c ${entry.message}`,
        COLOURS[level].css,
        '',
        ...entry.data
      );
    } else {
      out(
        `${COLOURS[level].ansi}${time} ${label}${ANSI_RESET} ${entry.message}`,
        ...entry.data
      );
    }
  } finally {
    emittingToConsole = false;
  }
}

function sentryClientAvailable(): boolean {
  return safeRead(() => !!Sentry.getClient?.(), false);
}

function sendBreadcrumb(level: 'warning' | 'error', entry: Entry): void {
  if (!sentryClientAvailable()) {
    return;
  }
  Sentry.addBreadcrumb({
    category: 'log',
    level,
    message: entry.message,
    data: entry.data.length ? { details: entry.data } : undefined,
  });
}

function report(entry: ErrorEntry): void {
  if (!sentryClientAvailable()) {
    return;
  }
  const { http } = entry;
  const tags: Record<string, string> = {
    ...entry.tags,
    ...(http?.status === undefined
      ? {}
      : { 'http.status': String(http.status) }),
    ...(http?.method ? { 'http.method': http.method } : {}),
    ...(http?.path ? { 'http.path': http.path } : {}),
  };
  const extra: Record<string, unknown> = {
    ...entry.context,
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
const monotonicNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
// Auth *actions* (a 401 here is a normal wrong-credentials / expired-refresh
// outcome). Other /auth/* endpoints (auth/kids, auth/linked-accounts, ...) are
// ordinary authenticated calls: a 401 there is worth one event per minute.
const AUTH_PATH =
  /^\/(?:api\/v1\/)?auth\/(?:login|logout|register|refresh|refresh-token|apple|google|send-verification|verify-email|request-password-reset|reset-password|validate-reset-token|change-password)(?:\/|$)/;
const MAX_OUTAGE_KEYS = 200;
const lastOutageEvent = new Map<string, number>();

function maybeReportExpectedOutage(entry: ErrorEntry): void {
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
    return;
  }
  const key = `${http.method ?? ''} ${http.path ?? ''} ${network ? 'net' : '401'}`;
  const now = monotonicNow();
  const last = lastOutageEvent.get(key);
  if (
    last !== undefined &&
    now >= last &&
    now - last < OUTAGE_EVENT_INTERVAL_MS
  ) {
    return;
  }
  Sentry.captureMessage(
    `Expected failure: ${network ? 'network error' : 'unauthorised'} ${http.method ?? ''} ${http.path ?? ''}`.trim(),
    {
      level: 'warning',
      tags: {
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
  debug: (message: LogMessage, context?: LogContext) => void;
  info: (message: LogMessage, context?: LogContext) => void;
  warn: (message: LogMessage, context?: LogContext) => void;
  /**
   * `error` is the thrown value. With `{ expected: true }` this logs at warn
   * level and does not create a Sentry issue (except a rate-limited warning
   * event for network errors / 401 on non-auth endpoints). Never throws.
   */
  error: (message: LogMessage, error?: unknown, options?: LogOptions) => void;
}

const safely = (fn: () => void) => {
  try {
    fn();
  } catch {
    // Logging must never throw.
  }
};

const devOnly =
  (level: 'debug' | 'info') => (message: LogMessage, context?: LogContext) =>
    safely(() => {
      if (currentEnvironment() === 'development') {
        writeConsole(level, contextEntry(message, context));
      }
    });

function emitWarn(entry: Entry): void {
  safely(() => writeConsole('warn', entry));
  safely(() => sendBreadcrumb('warning', entry));
}

export const logger: Logger = {
  debug: devOnly('debug'),
  info: devOnly('info'),
  warn: (message, context) =>
    safely(() => emitWarn(contextEntry(message, context))),
  error: (message, error, options = {}) =>
    safely(() => {
      const entry = errorEntry(message, error, options);
      if (safeRead(() => options.expected, false)) {
        emitWarn(entry);
        safely(() => maybeReportExpectedOutage(entry));
        return;
      }
      safely(() => writeConsole('error', entry));
      safely(() =>
        sendBreadcrumb('error', { message: entry.message, data: [] })
      );
      safely(() => report(entry));
    }),
};

export default logger;
