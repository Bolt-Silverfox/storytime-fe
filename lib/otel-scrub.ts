import type { Context } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

const URL_ATTRIBUTES = ['http.target', 'http.url', 'url.full', 'url.path'];
const QUERY_ATTRIBUTES = ['url.query', 'http.query'];

function stripQuery(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

export function scrubSpanAttributes<T extends Record<string, unknown>>(
  attributes: T
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...attributes };
  for (const key of URL_ATTRIBUTES) {
    if (typeof out[key] === 'string') {
      out[key] = stripQuery(out[key]);
    }
  }
  for (const key of QUERY_ATTRIBUTES) {
    delete out[key];
  }
  return out;
}

export class QueryScrubbingSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const scrubbed = scrubSpanAttributes(span.attributes);
    for (const key of Object.keys(span.attributes)) {
      delete (span.attributes as Record<string, unknown>)[key];
    }
    Object.assign(span.attributes, scrubbed);
    this.inner.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}
