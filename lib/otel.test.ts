import type {
  ReadableSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerOTel = vi.hoisted(() => vi.fn());
const exported = vi.hoisted(() => [] as ReadableSpan[]);

vi.mock('@vercel/otel', () => ({
  registerOTel,
  OTLPHttpProtoTraceExporter: class {
    export(spans: ReadableSpan[], done: (r: { code: number }) => void) {
      exported.push(...spans);
      done({ code: 0 });
    }
    shutdown() {
      return Promise.resolve();
    }
  },
}));

import { registerTelemetry } from './otel';

const S = 'SENTINEL9f3a7c';

describe('registerTelemetry', () => {
  beforeEach(() => {
    registerOTel.mockReset();
    exported.length = 0;
    vi.stubEnv(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'https://collector.example.com/otlp'
    );
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('exports spans with the query string stripped from url attributes', async () => {
    registerTelemetry();
    const [processor] = registerOTel.mock.calls[0][0]
      .spanProcessors as SpanProcessor[];
    const span = {
      spanContext: () => ({ traceFlags: 1 }),
      resource: {},
      attributes: {
        'http.target': `/create-new-password?token=${S}&email=a%40b.co`,
        'http.method': 'GET',
      },
    } as unknown as ReadableSpan;

    processor.onEnd(span);
    await processor.forceFlush();

    expect(exported).toHaveLength(1);
    expect(JSON.stringify(exported[0].attributes)).not.toContain(S);
    expect(exported[0].attributes['http.target']).toBe('/create-new-password');
    expect(exported[0].attributes['http.method']).toBe('GET');
  });
});
