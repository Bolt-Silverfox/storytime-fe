import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import {
  beforeSend,
  beforeSendTransaction,
  type TransactionEvent,
} from './sentry-scrub';

const S = 'SENTINEL9f3a7c';

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
    event_id: 'abc',
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
    contexts: { custom: { url: carriers.encoded, kidId: S } },
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
        description: carriers.url,
        data: { 'http.url': carriers.url, query: `?token=${S}` },
      },
    ],
  }) as unknown as ErrorEvent;

const fullTransaction = (): TransactionEvent =>
  ({
    type: 'transaction',
    event_id: 'def',
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
    expect(result?.event_id).toBe('abc');
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
    expect(result?.event_id).toBe('abc');
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
