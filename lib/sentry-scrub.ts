import type { Breadcrumb, Event as SentryEvent } from '@sentry/nextjs';

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 10;
const PARAM_KEYS =
  'token|code|email|password|jwt|id_token|access_token|refresh_token|accesstoken|refreshtoken';

const VALUE = '[^&\\s#"\'<>]*';
const FRAGMENT_TOKEN = new RegExp(
  `(#|&|\\?|%23|%26|%3f)t(=|%3d)${VALUE}`,
  'gi'
);
const SECRET_PARAM = new RegExp(`\\b(${PARAM_KEYS})(=|%3d)${VALUE}`, 'gi');
const BEARER = /\bBearer\s+[\w.~+/=-]+/gi;
const SECRET_KEY = new RegExp(
  `^(authorization|cookie|set-cookie|x-api-key|${PARAM_KEYS})$`,
  'i'
);
const DROPPED_REQUEST_KEYS = ['data', 'cookies'];

export function redactString(value: string): string {
  return value
    .replace(FRAGMENT_TOKEN, '$1t$2' + REDACTED)
    .replace(SECRET_PARAM, `$1$2${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`);
}

function scrubValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH || seen.has(value)) {
    return '[Truncated]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (
      value.length === 2 &&
      typeof value[0] === 'string' &&
      SECRET_KEY.test(value[0])
    ) {
      return [value[0], REDACTED];
    }
    return value.map((item) => scrubValue(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key)
      ? REDACTED
      : scrubValue(inner, depth + 1, seen);
  }
  return out;
}

function scrubObject<T extends object>(input: T): T {
  return scrubValue(input, 0, new WeakSet()) as T;
}

function scrubEvent<T extends SentryEvent>(event: T): T {
  const out = scrubObject(event) as T;
  if (out.request) {
    for (const key of DROPPED_REQUEST_KEYS) {
      delete (out.request as Record<string, unknown>)[key];
    }
  }
  if (out.user) {
    out.user = out.user.id === undefined ? {} : { id: out.user.id };
  }
  return out;
}

function failClosedErrorEvent<T extends SentryEvent>(event: T): T {
  const read = (key: keyof SentryEvent) => {
    try {
      const value = event[key];
      return typeof value === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const minimal: Record<string, unknown> = { message: '[scrubbed event]' };
  for (const key of [
    'event_id',
    'timestamp',
    'level',
    'platform',
    'release',
    'environment',
  ] as const) {
    const value = read(key);
    if (value !== undefined) {
      minimal[key] = redactString(value);
    }
  }
  return minimal as unknown as T;
}

export function scrubErrorEvent<T extends SentryEvent>(event: T): T | null {
  try {
    return scrubEvent(event);
  } catch {
    return failClosedErrorEvent(event);
  }
}

export function scrubTransactionEvent<T extends SentryEvent>(
  event: T
): T | null {
  try {
    return scrubEvent(event);
  } catch {
    return null;
  }
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    return scrubObject(breadcrumb);
  } catch {
    return null;
  }
}

export function scrubSpan<T extends object>(span: T): T {
  try {
    return scrubObject(span);
  } catch {
    const description = (span as { description?: unknown }).description;
    return {
      description:
        typeof description === 'string' ? '[scrubbed span]' : undefined,
    } as T;
  }
}
