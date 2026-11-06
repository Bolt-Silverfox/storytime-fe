import type { Event } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import {
  scrubBreadcrumb,
  scrubErrorEvent,
  scrubSpan,
  scrubTransactionEvent,
} from './sentry-scrub';

const S = 'SENTINEL_9f3a1c';
const url = (extra = '') => `https://app.example.com/auth/magic${extra}`;

const hostile = () => ({
  event_id: 'abc',
  level: 'error',
  message: `failed at ${url(`#t=${S}`)}`,
  transaction: url(`?token=${S}`),
  request: {
    url: url(`#t=${S}`),
    query_string: `code=${S}&x=1`,
    data: { token: S, code: S },
    cookies: { accessToken: S },
    headers: { Authorization: `Bearer ${S}`, Cookie: `accessToken=${S}` },
  },
  exception: {
    values: [
      {
        type: 'Error',
        value: `GET ${url(`?code=${S}`)} failed`,
        stacktrace: { frames: [{ filename: url(`#t=${S}`) }] },
      },
    ],
  },
  breadcrumbs: [
    {
      category: 'navigation',
      message: url(`#t=${S}`),
      data: { from: url(`?token=${S}`), to: url(`%23t%3D${S}`) },
    },
    {
      category: 'xhr',
      data: {
        url: `https://api.example.com/auth/passwordless/verify?code=${S}`,
        request_body: { code: S },
        headers: { authorization: `Bearer ${S}` },
      },
    },
  ],
  spans: [
    {
      description: `navigation ${url(`#t=${S}`)}`,
      data: { 'http.url': url(`?token=${S}`), nested: { deep: [`code=${S}`] } },
    },
  ],
  contexts: {
    trace: {
      trace_id: 't',
      span_id: 's',
      data: { url: url(`#t=${S}`) },
    },
  },
  extra: { href: url(`?token=${S}`) },
  user: { id: 'u1', email: 'p@example.com', ip_address: '1.2.3.4' },
  tags: { route: url(`#t=${S}`) },
});

describe('sentry scrubber', () => {
  it('removes the sentinel from every field of an error event', () => {
    const out = scrubErrorEvent(hostile() as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
    expect(out?.request).not.toHaveProperty('data');
    expect(out?.request).not.toHaveProperty('cookies');
  });

  it('removes the sentinel from a transaction event and its spans', () => {
    const out = scrubTransactionEvent({
      ...hostile(),
      type: 'transaction',
    } as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
  });

  it('removes the sentinel from a breadcrumb', () => {
    const out = scrubBreadcrumb(hostile().breadcrumbs[0] as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
    const xhr = scrubBreadcrumb(hostile().breadcrumbs[1] as unknown as Event);
    expect(JSON.stringify(xhr)).not.toContain(S);
  });

  it('removes the sentinel from a span', () => {
    const out = scrubSpan(hostile().spans[0] as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
  });

  it('redacts percent-encoded fragments and params', () => {
    const out = scrubErrorEvent({
      message: `a %23t%3D${S} b token%3D${S}`,
    } as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
  });

  it('keeps non-secret context so events stay useful', () => {
    const out = scrubErrorEvent(hostile() as unknown as Event);
    expect(out?.exception?.values?.[0]?.type).toBe('Error');
    expect(out?.request?.url).toContain('/auth/magic');
    expect(out?.user).toEqual({ id: 'u1' });
  });

  it('fails closed when scrubbing throws: error event keeps only an allowlist', () => {
    const event = hostile() as Record<string, unknown>;
    Object.defineProperty(event, 'breadcrumbs', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    const out = scrubErrorEvent(event as unknown as Event);
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toContain(S);
    expect(out).not.toHaveProperty('request');
    expect(out).not.toHaveProperty('exception');
    expect(out).not.toHaveProperty('transaction');
  });

  it('fails closed when scrubbing throws: transaction is dropped', () => {
    const event = { ...hostile(), type: 'transaction' } as Record<
      string,
      unknown
    >;
    Object.defineProperty(event, 'spans', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    expect(scrubTransactionEvent(event as unknown as Event)).toBeNull();
  });

  it('fails closed for breadcrumbs and spans that cannot be scrubbed', () => {
    const crumb = { category: 'x' } as Record<string, unknown>;
    Object.defineProperty(crumb, 'data', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    expect(scrubBreadcrumb(crumb as unknown as Event)).toBeNull();
    const span = { description: S } as Record<string, unknown>;
    Object.defineProperty(span, 'data', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    const out = scrubSpan(span as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
  });

  it('survives cyclic and very deep input without hanging', () => {
    const a: Record<string, unknown> = { v: `token=${S}` };
    a.self = a;
    let deep: Record<string, unknown> = { v: `token=${S}` };
    for (let i = 0; i < 5000; i++) {
      deep = { next: deep };
    }
    const out = scrubErrorEvent({ extra: { a, deep } } as unknown as Event);
    expect(JSON.stringify(out)).not.toContain(S);
  });
});
