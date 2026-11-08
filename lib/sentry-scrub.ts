import type { BrowserOptions, ErrorEvent, EventHint } from '@sentry/nextjs';

export type TransactionEvent = Parameters<
  NonNullable<BrowserOptions['beforeSendTransaction']>
>[0];

const FILTERED = '[Filtered]';
const MAX_DEPTH = 10;
const MAX_TEXT = 20_000;

const PROTECTED_KEY =
  /^(event_id|trace_id|span_id|parent_span_id|segment_id|debug_id|public_key|sample_rand)$/;

const SENSITIVE_SUBSTRING =
  /auth|token|cookie|secret|key|session|password|passwd|pwd|credential|jwt|bearer|private|signature/i;

const SENSITIVE_WORDS = new Set([
  'pin',
  'otp',
  'code',
  'cvv',
  'cvc',
  'card',
  'pan',
  'sig',
  'reset',
  'nonce',
]);

const PII_SUBSTRING =
  /e-?mail|phone|msisdn|first.?name|last.?name|full.?name|display.?name|user.?name|user.?id|birth|avatar|client.?ip|forwarded|real.?ip|remote.?addr|address/i;

const PII_WORDS = new Set(['dob', 'kid', 'kids', 'child', 'children']);

const OUTCOME_VALUES = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'invalid_token',
  'access_denied',
  'expired',
  'invalid',
  'missing',
  'required',
]);

const words = (key: string): string[] =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const isSensitive = (key: string): boolean => {
  if (SENSITIVE_SUBSTRING.test(key) || PII_SUBSTRING.test(key)) {
    return true;
  }
  if (key.includes('.')) {
    return false;
  }
  return words(key).some(
    (word) => SENSITIVE_WORDS.has(word) || PII_WORDS.has(word)
  );
};

const isSecretLabel = (key: string): boolean =>
  (SENSITIVE_SUBSTRING.test(key) && !key.includes('.')) ||
  words(key).some((word) => word === 'pin' || word === 'otp');

const decodeKey = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
};

const KEY_VALUE_HEAD =
  /(?<![^\s=:&?#{}()[\],;<>"'])(["']?)([^\s=:&?#{}()[\],;<>"']{1,100})\1(?:[ \t]*(?:=>|[:=])[ \t]*|([ \t]+))/g;

const URL_USERINFO =
  /(?<![a-z0-9+.-])(?:([a-z][a-z0-9+.-]*(?::|%3A)\/\/)[^\s/?#"'<>]*(@|%40)|([a-z][a-z0-9+.-]*(?::|%3A)%2F%2F)(?:(?!%2F|%3F|%23)[^\s/?#"'<>])*(@|%40))/gi;

const UNQUOTED_VALUE = /[^\s&,;"'})\]]+/y;

const readValue = (
  text: string,
  at: number
): { inner: string; end: number; quote: string } | null => {
  const quote = text[at];
  if (quote === '"' || quote === "'") {
    for (let i = at + 1; i < text.length; i++) {
      if (text[i] === '\\') {
        i++;
      } else if (text[i] === quote) {
        return { inner: text.slice(at + 1, i), end: i + 1, quote };
      }
    }
    return { inner: text.slice(at + 1), end: text.length, quote };
  }
  UNQUOTED_VALUE.lastIndex = at;
  const match = UNQUOTED_VALUE.exec(text);
  return match
    ? { inner: match[0], end: at + match[0].length, quote: '' }
    : null;
};

const hasNestedSecret = (value: string): boolean => {
  let current = value;
  for (let i = 0; i < 4; i++) {
    if (
      /[=@]|%40/i.test(current) &&
      scrubKeyValues(current, false) !== current
    ) {
      return true;
    }
    let next: string;
    try {
      next = decodeURIComponent(current.replace(/\+/g, ' '));
    } catch {
      return false;
    }
    if (next === current) {
      return false;
    }
    current = next;
  }
  return false;
};

const scrubKeyValues = (text: string, nested = true): string => {
  const src = text
    .replace(
      URL_USERINFO,
      (
        _match,
        rawHead: string | undefined,
        rawAt: string | undefined,
        encodedHead: string | undefined,
        encodedAt: string | undefined
      ) => `${rawHead ?? encodedHead}${FILTERED}${rawAt ?? encodedAt}`
    )
    .replace(
      /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/gi,
      (_match, scheme: string) => `${scheme} ${FILTERED}`
    );
  let out = '';
  let last = 0;
  for (const match of src.matchAll(KEY_VALUE_HEAD)) {
    if (match.index < last) {
      continue;
    }
    const byWhitespace = match[3] !== undefined;
    if (byWhitespace && !isSecretLabel(decodeKey(match[2]))) {
      continue;
    }
    const valueAt = match.index + match[0].length;
    if (src.startsWith(FILTERED, valueAt)) {
      continue;
    }
    const sensitive = isSensitive(decodeKey(match[2]));
    const mayHideSecret = nested && !byWhitespace && match[0].includes('=');
    if (!(sensitive || mayHideSecret)) {
      continue;
    }
    const value = readValue(src, valueAt);
    if (!value || value.inner === '') {
      continue;
    }
    const { inner, quote } = value;
    if (!quote && OUTCOME_VALUES.has(inner.toLowerCase())) {
      continue;
    }
    if (byWhitespace && /^[a-z]+$/.test(inner)) {
      continue;
    }
    if (!sensitive && quote) {
      continue;
    }
    if (!(sensitive || hasNestedSecret(inner))) {
      out += src.slice(last, value.end);
      last = value.end;
      continue;
    }
    out += src.slice(last, valueAt) + quote + FILTERED + quote;
    last = value.end;
  }
  return out + src.slice(last);
};

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}/g;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g;
const QUERY = /\?[^\s#"']*=[^\s#"']*/g;
const PHONE = /(?<!\d)(?:\+?234|0)[789][01]\d{8}(?!\d)/g;
const NAMED_RESOURCE_ID =
  /\/(kids?|children|child)\/(?!(?:daily-challenge|categories|category|kid|kids|search)(?:[/?#\s"']|$))([^/?#\s"']+)/gi;
const DIGIT_RESOURCE_ID =
  /\/(stories|story|users?|parents?|favou?rites|progress)\/(?=[^/?#\s"']*\d)([^/?#\s"']+)/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_HEX = /\b[0-9a-f]{24,}\b/gi;
const CUID = /\bc[a-z0-9]{24}\b/g;

const scrubPlain = (value: string): string =>
  scrubKeyValues(value)
    .replace(JWT, FILTERED)
    .replace(EMAIL, '[email]')
    .replace(QUERY, '?[Filtered]')
    .replace(PHONE, '[phone]')
    .replace(NAMED_RESOURCE_ID, '/$1/:id')
    .replace(DIGIT_RESOURCE_ID, '/$1/:id')
    .replace(UUID, ':id')
    .replace(LONG_HEX, ':id')
    .replace(CUID, ':id');

const decodePercent = (value: string): string =>
  value.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );

export const scrubString = (value: string): string => {
  if (value.length > MAX_TEXT) {
    return FILTERED;
  }
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
    return FILTERED;
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
    if (PROTECTED_KEY.test(key) && typeof child === 'string') {
      out[key] = child;
      continue;
    }
    const opaqueHeaders =
      /headers$/i.test(key) &&
      (typeof child === 'string' || Array.isArray(child));
    out[key] =
      isSensitive(key) || opaqueHeaders
        ? FILTERED
        : scrubValue(child, depth + 1, seen);
  }
  return out;
};

const scrubSamplingContext = (metadata: unknown): unknown => {
  if (metadata === null || typeof metadata !== 'object') {
    return undefined;
  }
  const source = metadata as Record<string, unknown>;
  const context = source.dynamicSamplingContext;
  if (context === null || typeof context !== 'object') {
    return { ...source, dynamicSamplingContext: undefined };
  }
  const dsc = { ...(context as Record<string, unknown>) };
  if (typeof dsc.transaction === 'string') {
    dsc.transaction = scrubString(dsc.transaction);
  }
  return { ...source, dynamicSamplingContext: dsc };
};

const scrubEvent = <T extends ErrorEvent | TransactionEvent>(event: T): T => {
  const { sdkProcessingMetadata, ...rest } = event as unknown as Record<
    string,
    unknown
  >;
  const scrubbed = scrubValue(rest, 0, new WeakSet()) as Record<
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
  if (sdkProcessingMetadata !== undefined) {
    scrubbed.sdkProcessingMetadata = scrubSamplingContext(
      sdkProcessingMetadata
    );
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
