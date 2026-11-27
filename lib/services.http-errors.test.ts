import * as Sentry from '@sentry/nextjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/axios', () => ({ default: { get } }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => ({})),
}));

import { configureLogger, isExpectedFailure, logger } from './logger';
import {
  getAvailableVoicesService,
  getDailyChallengesService,
  getKidsService,
  getStoryByIdService,
} from './services';

const sentry = vi.mocked(Sentry);

const httpError = (url: string, status?: number) => {
  const config = { url, method: 'get', headers: new AxiosHeaders() };
  const err = new AxiosError(
    status ? `Request failed with status code ${status}` : 'Network Error',
    status ? 'ERR_BAD_REQUEST' : 'ERR_NETWORK',
    config as never,
    { readyState: 4 }
  );
  if (status) {
    err.response = {
      status,
      statusText: 'x',
      headers: {},
      config: config as never,
      data: { message: 'Unauthorized', email: 'kid@example.com' },
    };
  }
  return err;
};

const services: [string, () => Promise<unknown>, string, string][] = [
  ['getKidsService', () => getKidsService(), 'auth/kids', '/auth/kids'],
  [
    'getAvailableVoicesService',
    () => getAvailableVoicesService(),
    'voice/available',
    '/voice/available',
  ],
  [
    'getStoryByIdService',
    () => getStoryByIdService('s1'),
    'stories/s1',
    '/stories/:id',
  ],
  [
    'getDailyChallengesService',
    () => getDailyChallengesService('k1'),
    'stories/daily-challenge/kid/k1',
    '/stories/daily-challenge/kid/:id',
  ],
];

const caught = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
};

beforeEach(() => {
  vi.clearAllMocks();
  sentry.getClient.mockReturnValue({} as never);
  configureLogger({ environment: 'test' });
});

describe.each(services)('%s errors', (_name, call, url, path) => {
  it('keep the caller-facing message, status and body', async () => {
    get.mockRejectedValueOnce(httpError(url, 401));
    const err = (await caught(call)) as Record<string, unknown>;
    expect(err.message).toBe('Unauthorized');
    expect(err.status).toBe(401);
    expect(err.data).toEqual({
      message: 'Unauthorized',
      email: 'kid@example.com',
    });
  });

  it('let the logger report a 401 outage for the endpoint', async () => {
    get.mockRejectedValueOnce(httpError(url, 401));
    const err = await caught(call);
    logger.error('failed', err, { expected: isExpectedFailure(err) });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    const [message, hint] = sentry.captureMessage.mock.calls[0] as [
      string,
      { tags: Record<string, string> },
    ];
    expect(get).toHaveBeenCalledWith(url);
    expect(message).toBe(`Expected failure: unauthorised GET ${path}`);
    expect(hint.tags['http.path']).toBe(path);
    expect(hint.tags['http.status']).toBe('401');
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain(
      'kid@example.com'
    );
  });

  it('keep ERR_NETWORK when there is no response', async () => {
    get.mockRejectedValueOnce(httpError(url));
    const err = (await caught(call)) as Record<string, unknown>;
    expect(err.message).toBe('No response from server');
    expect(err.status).toBeNull();
    expect(isExpectedFailure(err)).toBe(true);
    logger.error('failed', err, { expected: isExpectedFailure(err) });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage.mock.calls[0]?.[0]).toBe(
      `Expected failure: network error GET ${path}`
    );
  });
});
