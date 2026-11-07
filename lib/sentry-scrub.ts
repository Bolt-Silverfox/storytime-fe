import type { BrowserOptions, ErrorEvent, EventHint } from '@sentry/nextjs';

export type TransactionEvent = Parameters<
  NonNullable<BrowserOptions['beforeSendTransaction']>
>[0];

const FILTERED = '[Filtered]';
const MAX_DEPTH = 12;

const SENSITIVE_KEY =
  /token|secret|passw|authorization|cookie|api[-_]?key|credential|session|jwt|(^|[-_])otp($|[-_])|^code$|e?mail|phone|(first|last|full|user|kid|child|parent|display)[-_]?name|kid|child|user[-_]?id|^pin$|birth|^dob$|set-cookie/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\b(Bearer|Basic)\s+[^\s,;"']+/gi;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g;
const QUERY = /\?[^\s#"']*=[^\s#"']*/g;
const BARE_PARAM =
  /\b(token|access_token|refresh_token|password|email|code|otp|key|secret)=[^\s&#"']*/gi;
const RESOURCE_ID =
  /\/(kids?|stories|story|users?|parents?|children|child)\/(?!(?:daily-challenge|categories|category|kid|kids|search)(?:[/?#\s"']|$))([^/?#\s"']+)/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_HEX = /\b[0-9a-f]{24,}\b/gi;
const CUID = /\bc[a-z0-9]{24}\b/g;

const scrubPlain = (value: string): string =>
  value
    .replace(JWT, FILTERED)
    .replace(BEARER, '$1 [Filtered]')
    .replace(EMAIL, '[email]')
    .replace(QUERY, '?[Filtered]')
    .replace(BARE_PARAM, '$1=[Filtered]')
    .replace(RESOURCE_ID, '/$1/:id')
    .replace(UUID, ':id')
    .replace(LONG_HEX, ':id')
    .replace(CUID, ':id');

const decodePercent = (value: string): string =>
  value.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );

export const scrubString = (value: string): string => {
  const plain = scrubPlain(value);
  let decoded = plain;
  for (let pass = 0; pass < 3 && /%[0-9a-f]{2}/i.test(decoded); pass++) {
    decoded = decodePercent(decoded);
  }
  if (decoded === plain) {
    return plain;
  }
  const scrubbed = scrubPlain(decoded);
  return scrubbed === decoded ? plain : scrubbed;
};

const scrubValue = (
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown => {
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    const opaqueHeaders =
      /headers$/i.test(key) &&
      (typeof child === 'string' || Array.isArray(child));
    out[key] =
      SENSITIVE_KEY.test(key) || opaqueHeaders
        ? FILTERED
        : scrubValue(child, depth + 1, seen);
  }
  return out;
};

const scrubEvent = <T extends ErrorEvent | TransactionEvent>(event: T): T => {
  const scrubbed = scrubValue(event, 0, new WeakSet()) as Record<
    string,
    unknown
  >;
  delete scrubbed.user;
  const request = scrubbed.request as Record<string, unknown> | undefined;
  if (request) {
    delete request.cookies;
    delete request.query_string;
    delete request.data;
  }
  return scrubbed as T;
};

const SAFE_FIELDS = [
  'event_id',
  'timestamp',
  'start_timestamp',
  'level',
  'platform',
  'type',
  'release',
  'environment',
] as const;

const failClosed = <T extends ErrorEvent | TransactionEvent>(event: T): T => {
  const safe: Record<string, unknown> = {};
  for (const field of SAFE_FIELDS) {
    try {
      const value = (event as unknown as Record<string, unknown>)[field];
      if (typeof value === 'string' || typeof value === 'number') {
        safe[field] = value;
      }
    } catch {}
  }
  return safe as T;
};

export const beforeSend = (event: ErrorEvent, _hint: EventHint): ErrorEvent => {
  try {
    return scrubEvent(event);
  } catch {
    return failClosed(event);
  }
};

export const beforeSendTransaction = (
  event: TransactionEvent,
  _hint: EventHint
): TransactionEvent => {
  try {
    return scrubEvent(event);
  } catch {
    return failClosed(event);
  }
};
