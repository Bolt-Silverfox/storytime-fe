import {
  BrowserClient,
  browserTracingIntegration,
  defaultStackParser,
  setCurrentClient,
  startSpan,
} from '@sentry/browser';
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

const EVENT_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const PUBLIC_KEY = '45bcefe21ed944d0f799390f13187379';
const KID_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PARENT_EMAIL = 'parent.sentinel@example.com';

type Envelope = [Record<string, unknown>, [Record<string, unknown>, unknown][]];

let envelopes: Envelope[] = [];

const makeClient = async () => {
  vi.mocked(Sentry.init).mockClear();
  vi.resetModules();
  await import('../instrumentation-client');
  const options = vi.mocked(Sentry.init).mock.calls[0]?.[0];
  const client = new BrowserClient({
    ...options,
    dsn: 'https://abc123@o1.ingest.invalid/1',
    enabled: true,
    tracesSampleRate: 1,
    stackParser: defaultStackParser,
    integrations: [
      browserTracingIntegration({
        instrumentNavigation: false,
        instrumentPageLoad: false,
      }),
    ],
    transport: () => ({
      send: async (envelope: unknown) => {
        envelopes.push(envelope as Envelope);
        return {};
      },
      flush: async () => true,
    }),
  } as ConstructorParameters<typeof BrowserClient>[0]);
  setCurrentClient(client);
  client.init();
  return client;
};

const itemTypes = () =>
  envelopes.flatMap((envelope) => envelope[1].map((item) => item[0].type));

beforeEach(() => {
  envelopes = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sentry client wiring', () => {
  it('sends error envelopes with the original event_id and trace header', async () => {
    const client = await makeClient();
    client.captureEvent({
      event_id: EVENT_ID,
      message: `login failed for ${PARENT_EMAIL}`,
      sdkProcessingMetadata: {
        dynamicSamplingContext: {
          trace_id: TRACE_ID,
          public_key: PUBLIC_KEY,
          transaction: `/auth/kids/${KID_ID}`,
        },
      },
    });
    await client.flush(2000);

    expect(envelopes).toHaveLength(1);
    const header = envelopes[0][0] as {
      event_id: string;
      trace: Record<string, string>;
    };
    expect(header.event_id).toBe(EVENT_ID);
    expect(header.trace.trace_id).toBe(TRACE_ID);
    expect(header.trace.public_key).toBe(PUBLIC_KEY);
    expect(JSON.stringify(envelopes)).not.toContain(PARENT_EMAIL);
    expect(JSON.stringify(envelopes)).not.toContain(KID_ID);
  });

  it('runs beforeSendTransaction so email and kid ids never reach the transport', async () => {
    const client = await makeClient();
    startSpan(
      {
        name: '/verify-email',
        op: 'navigation',
        attributes: {
          'url.full': `https://web.storytimeapp.me/verify-email?email=${encodeURIComponent(PARENT_EMAIL)}`,
        },
      },
      () => {
        startSpan(
          {
            name: `GET /auth/kids/${KID_ID}`,
            op: 'http.client',
            attributes: {
              'url.full': `https://api.storytimeapp.me/auth/kids/${KID_ID}`,
            },
          },
          () => undefined
        );
      }
    );
    await client.flush(2000);

    expect(itemTypes()).toContain('transaction');
    const sent = JSON.stringify(envelopes);
    expect(sent).not.toContain(PARENT_EMAIL);
    expect(sent).not.toContain(encodeURIComponent(PARENT_EMAIL));
    expect(sent).not.toContain(KID_ID);
    expect(sent).toContain('/verify-email?[Filtered]');
  });
});
