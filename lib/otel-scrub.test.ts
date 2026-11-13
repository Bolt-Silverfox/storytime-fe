import type {
  ReadableSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { describe, expect, it, vi } from 'vitest';
import { QueryScrubbingSpanProcessor, scrubSpanAttributes } from './otel-scrub';

const S = 'SENTINEL9f3a7c';

describe('scrubSpanAttributes', () => {
  it('strips the query string from every url-bearing attribute', () => {
    const attrs = {
      'http.target': `/create-new-password?token=${S}&email=${S}%40x.co`,
      'http.url': `https://app.storytimeapp.me/create-new-password?token=${S}`,
      'url.full': `https://app.storytimeapp.me/create-new-password?token=${S}#f`,
      'url.query': `token=${S}`,
      'http.method': 'GET',
      'http.status_code': 200,
    };
    const out = scrubSpanAttributes(attrs);
    expect(JSON.stringify(out)).not.toContain(S);
    expect(out['http.target']).toBe('/create-new-password');
    expect(out['http.url']).toBe(
      'https://app.storytimeapp.me/create-new-password'
    );
    expect(out['url.full']).toBe(
      'https://app.storytimeapp.me/create-new-password'
    );
    expect(out['url.query']).toBeUndefined();
    expect(out['http.method']).toBe('GET');
    expect(out['http.status_code']).toBe(200);
  });

  it('leaves attributes without a query untouched', () => {
    expect(scrubSpanAttributes({ 'http.target': '/login' })).toEqual({
      'http.target': '/login',
    });
  });
});

describe('QueryScrubbingSpanProcessor', () => {
  it('scrubs the span before the wrapped processor sees it', () => {
    const onEnd = vi.fn();
    const inner = {
      onStart: vi.fn(),
      onEnd,
      forceFlush: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as SpanProcessor;
    const span = {
      attributes: { 'http.target': `/x?token=${S}` },
    } as unknown as ReadableSpan;
    new QueryScrubbingSpanProcessor(inner).onEnd(span);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onEnd.mock.calls[0][0].attributes)).not.toContain(S);
  });
});
