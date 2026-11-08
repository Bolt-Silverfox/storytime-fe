import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import {
  beforeSend,
  beforeSendTransaction,
  type TransactionEvent,
} from './sentry-scrub';

const S = 'SENTINEL9f3a7c';
const EVENT_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const SPAN_ID = 'fedcba9876543210';
const PUBLIC_KEY = '45bcefe21ed944d0f799390f13187379';
const DEBUG_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const carriers = {
  email: `parent.${S}@example.com`,
  bearer: `Bearer ${S}`,
  url: `https://api.storytimeapp.me/api/v1/auth/kids/${S}?token=${S}&email=${S}`,
  encoded: `https%3A%2F%2Fapi.storytimeapp.me%2Fauth%2Fkids%2F${S}%3Ftoken%3D${S}`,
  dailyChallenge: `GET /stories/daily-challenge/kid/${S}`,
};

const dirty = () => Object.values(carriers).join(' | ');

const serialised = (value: unknown) => JSON.stringify(value);

const fullErrorEvent = (): ErrorEvent =>
  ({
    type: undefined,
    event_id: EVENT_ID,
    message: dirty(),
    transaction: `/auth/kids/${S}`,
    user: { id: S, email: carriers.email, username: S, ip_address: S },
    request: {
      url: carriers.url,
      query_string: `token=${S}`,
      cookies: { session: S },
      headers: {
        Authorization: `Bearer ${S}`,
        Cookie: `accessToken=${S}`,
        Referer: carriers.url,
      },
      data: { password: S },
    },
    extra: { nested: { deep: [{ token: S }, dirty()] }, list: [dirty()] },
    contexts: {
      custom: { url: carriers.encoded, kidId: S },
      trace: { trace_id: TRACE_ID, span_id: SPAN_ID },
    },
    debug_meta: { images: [{ type: 'sourcemap', debug_id: DEBUG_ID }] },
    sdkProcessingMetadata: {
      dynamicSamplingContext: {
        trace_id: TRACE_ID,
        public_key: PUBLIC_KEY,
        sample_rand: '0.123456789',
        transaction: `/auth/kids/${S}`,
      },
    },
    tags: { page: carriers.url },
    breadcrumbs: [
      {
        category: 'fetch',
        message: dirty(),
        data: { url: carriers.url, to: carriers.encoded, headers: [S] },
      },
    ],
    exception: {
      values: [
        {
          type: 'Error',
          value: dirty(),
          stacktrace: {
            frames: [{ filename: carriers.url, vars: { token: S } }],
          },
        },
      ],
    },
    spans: [
      {
        trace_id: TRACE_ID,
        span_id: SPAN_ID,
        description: carriers.url,
        data: { 'http.url': carriers.url, query: `?token=${S}` },
      },
    ],
  }) as unknown as ErrorEvent;

const fullTransaction = (): TransactionEvent =>
  ({
    type: 'transaction',
    event_id: EVENT_ID,
    transaction: carriers.url,
    start_timestamp: 1,
    timestamp: 2,
    user: { id: S },
    request: { url: carriers.url, headers: { Cookie: S } },
    contexts: {
      trace: { description: carriers.url, data: { url: carriers.encoded } },
    },
    spans: [
      {
        trace_id: TRACE_ID,
        span_id: SPAN_ID,
        description: dirty(),
        data: { 'http.url': carriers.url, 'http.query': `token=${S}` },
      },
    ],
    breadcrumbs: [{ message: dirty() }],
    extra: { token: S },
  }) as unknown as TransactionEvent;

const throwingEvent = <T extends object>(event: T): T => {
  Object.defineProperty(event, 'extra', {
    enumerable: true,
    get() {
      throw new Error('boom');
    },
  });
  return event;
};

describe('beforeSend', () => {
  it('removes the sentinel from every field of an error event', async () => {
    const result = await beforeSend(fullErrorEvent(), {});
    expect(result).not.toBeNull();
    expect(serialised(result)).not.toContain(S);
  });

  it('replaces kid and story ids in API URLs with placeholders', async () => {
    const result = await beforeSend(fullErrorEvent(), {});
    const text = serialised(result);
    expect(text).toContain('auth/kids/:id');
    expect(text).toContain('stories/daily-challenge/kid/:id');
  });

  it('keeps non-sensitive context so events stay useful', async () => {
    const result = await beforeSend(fullErrorEvent(), {});
    expect(result?.exception?.values?.[0]?.type).toBe('Error');
    expect(result?.event_id).toBe(EVENT_ID);
  });

  it('drops user, cookies and query strings entirely', async () => {
    const result = await beforeSend(fullErrorEvent(), {});
    expect(result?.user).toBeUndefined();
    expect(result?.request?.cookies).toBeUndefined();
    expect(result?.request?.query_string).toBeUndefined();
  });

  it('removes the sentinel when scrubbing throws', async () => {
    const result = await beforeSend(throwingEvent(fullErrorEvent()), {});
    expect(serialised(result)).not.toContain(S);
  });

  it('does not copy the original event through when scrubbing throws', async () => {
    const result = await beforeSend(throwingEvent(fullErrorEvent()), {});
    expect(result).not.toBeNull();
    expect(result?.message).toBeUndefined();
    expect(result?.exception).toBeUndefined();
    expect(result?.request).toBeUndefined();
    expect(result?.event_id).toBe(EVENT_ID);
  });

  it('survives circular references without leaking', async () => {
    const event = fullErrorEvent();
    const loop: Record<string, unknown> = { token: S, url: carriers.url };
    loop.self = loop;
    event.extra = { loop };
    const result = await beforeSend(event, {});
    expect(serialised(result)).not.toContain(S);
  });
});

describe('beforeSendTransaction', () => {
  it('removes the sentinel from every field of a transaction', async () => {
    const result = await beforeSendTransaction(fullTransaction(), {});
    expect(result).not.toBeNull();
    expect(serialised(result)).not.toContain(S);
  });

  it('scrubs span descriptions and data', async () => {
    const result = await beforeSendTransaction(fullTransaction(), {});
    expect(serialised(result?.spans)).toContain('auth/kids/:id');
  });

  it('removes the sentinel when scrubbing throws', async () => {
    const result = await beforeSendTransaction(
      throwingEvent(fullTransaction()),
      {}
    );
    expect(serialised(result)).not.toContain(S);
    expect(result?.spans).toBeUndefined();
    expect(result?.type).toBe('transaction');
  });
});

describe('trace and event identifiers', () => {
  const get = (value: unknown, dotted: string) =>
    dotted
      .split('.')
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        value
      );

  it('leaves sentry ids untouched', async () => {
    const result = await beforeSend(fullErrorEvent(), {});
    expect(get(result, 'event_id')).toBe(EVENT_ID);
    expect(get(result, 'contexts.trace.trace_id')).toBe(TRACE_ID);
    expect(get(result, 'contexts.trace.span_id')).toBe(SPAN_ID);
    expect(get(result, 'spans.0.trace_id')).toBe(TRACE_ID);
    expect(get(result, 'spans.0.span_id')).toBe(SPAN_ID);
    expect(get(result, 'debug_meta.images.0.debug_id')).toBe(DEBUG_ID);
  });

  it('keeps the dynamic sampling context but scrubs its transaction', async () => {
    const result = await beforeSend(fullErrorEvent(), {});
    const dsc = 'sdkProcessingMetadata.dynamicSamplingContext';
    expect(get(result, `${dsc}.trace_id`)).toBe(TRACE_ID);
    expect(get(result, `${dsc}.public_key`)).toBe(PUBLIC_KEY);
    expect(get(result, `${dsc}.sample_rand`)).toBe('0.123456789');
    expect(get(result, `${dsc}.transaction`)).toBe('/auth/kids/:id');
  });

  it('keeps ids on transactions too', async () => {
    const result = await beforeSendTransaction(fullTransaction(), {});
    expect(get(result, 'event_id')).toBe(EVENT_ID);
    expect(get(result, 'spans.0.trace_id')).toBe(TRACE_ID);
  });
});

describe('text secrets', () => {
  const scrub = async (message: string) =>
    ((await beforeSend({ message } as ErrorEvent, {})) as ErrorEvent).message;

  it.each([
    ['json password', `{"password":"${S}"}`, S],
    ['colon password', `password: ${S}`, S],
    ['equals password', `password = ${S}`, S],
    ['colon token', `token: ${S}`, S],
    ['cookie header', `Cookie: sid=${S}`, S],
    ['otp', `otp: ${S}`, S],
    ['json refresh token', `{"refresh_token":"${S}"}`, S],
    ['userinfo localhost', `https://user:${S}@localhost:3000/x`, S],
    ['userinfo host', `https://user:${S}@example.com/x`, S],
    ['nigerian local phone', 'call 08012345678 now', '08012345678'],
    ['nigerian intl phone', 'call +2348012345678 now', '8012345678'],
    ['bare kid id', `kidId=${S}`, S],
    ['numeric favourites', '/favorites/123456', '123456'],
    ['numeric progress', '/progress/123456', '123456'],
  ])('removes %s', async (_label, input, secret) => {
    expect(await scrub(input)).not.toContain(secret);
  });

  it('keeps host after stripping userinfo', async () => {
    expect(await scrub(`https://user:${S}@example.com/x`)).toContain(
      '@example.com/x'
    );
  });

  it('does not treat words after stories/user as ids', async () => {
    expect(await scrub('GET /stories/user/library/completed')).toBe(
      'GET /stories/user/library/completed'
    );
  });

  it('replaces uuids appearing outside resource paths', async () => {
    expect(await scrub(`failed for ${DEBUG_ID} twice`)).toBe(
      'failed for :id twice'
    );
  });

  it('strips whole query strings', async () => {
    expect(await scrub('GET /list?page=1&ref=abc')).toBe(
      'GET /list?[Filtered]'
    );
  });

  it('scrubs values nested deeper than the depth limit', async () => {
    let deep: Record<string, unknown> = { note: `Bearer ${S}` };
    for (let i = 0; i < 40; i++) {
      deep = { next: deep };
    }
    const result = await beforeSend(
      { extra: deep } as unknown as ErrorEvent,
      {}
    );
    expect(serialised(result)).not.toContain(S);
  });
});

describe('performance', () => {
  it('scrubs many oversized fields within budget', async () => {
    const big = `${'a=b&'.repeat(25_000)}token=${S}`;
    const event = {
      breadcrumbs: Array.from({ length: 100 }, () => ({ message: big })),
    } as unknown as ErrorEvent;
    const start = performance.now();
    const result = await beforeSend(event, {});
    expect(performance.now() - start).toBeLessThan(1000);
    expect(serialised(result)).not.toContain(S);
  });

  it('filters text over the cap entirely', async () => {
    const result = await beforeSend(
      { message: `${'y'.repeat(20_001)} ${S}` } as ErrorEvent,
      {}
    );
    expect(result?.message).toBe('[Filtered]');
  });

  it('scrubs many fields just under the cap within budget', async () => {
    const text = `${'x'.repeat(19_000)} token=${S}`;
    const event = {
      breadcrumbs: Array.from({ length: 100 }, () => ({ message: text })),
    } as unknown as ErrorEvent;
    const start = performance.now();
    const result = await beforeSend(event, {});
    expect(performance.now() - start).toBeLessThan(2000);
    expect(serialised(result)).not.toContain(S);
  });
});
