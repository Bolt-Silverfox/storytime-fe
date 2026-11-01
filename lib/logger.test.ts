import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureLogger,
  createLogger,
  isExpectedFailure,
  logger,
  redact,
} from './logger';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => ({})),
}));

const sentry = vi.mocked(Sentry);

let spies: Record<
  'debug' | 'info' | 'warn' | 'error',
  ReturnType<typeof vi.spyOn>
>;

beforeEach(() => {
  vi.clearAllMocks();
  sentry.getClient.mockReturnValue({} as never);
  spies = {
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
  configureLogger({ environment: 'development' });
});

afterEach(() => {
  vi.restoreAllMocks();
  configureLogger({ environment: undefined });
});

describe('redact', () => {
  it('masks secret-looking keys at any depth', () => {
    const out = redact({
      token: 'abc',
      nested: { Authorization: 'Bearer xyz', password: 'p', ok: 1 },
      list: [{ refreshToken: 'r' }],
      cookie: 'a=b',
      guestSessionId: 'g-123',
      email: 'kid@example.com',
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/abc|xyz|"p"|a=b|g-123|kid@|"r"/);
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
  });

  it('masks bearer tokens, JWTs and emails inside strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl';
    const out = redact(`Bearer sekret.value fail for a.b@c.io with ${jwt}`);
    expect(out).not.toMatch(/sekret|a\.b@c\.io|eyJ/);
  });

  it('survives circular references', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });

  it('keeps only safe fields of axios-like errors (no headers/config)', () => {
    const err = Object.assign(
      new Error('Request failed with status code 500'),
      {
        isAxiosError: true,
        code: 'ERR_BAD_RESPONSE',
        config: {
          url: '/story?token=secret',
          headers: { Authorization: 'Bearer top-secret' },
        },
        response: { status: 500, data: { email: 'a@b.co' } },
      }
    );
    const out = JSON.stringify(redact(err));
    expect(out).not.toMatch(/top-secret|secret|a@b\.co/);
    expect(out).toContain('500');
  });
});

describe('level routing', () => {
  it('debug/info print in development and do not touch Sentry', () => {
    logger.debug('d');
    logger.info('i');
    expect(spies.debug).toHaveBeenCalledOnce();
    expect(spies.info).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('debug/info are silent in production', () => {
    configureLogger({ environment: 'production' });
    logger.debug('d');
    logger.info('i');
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('warn is a breadcrumb only, never an issue', () => {
    logger.warn('careful', { a: 1 });
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning', message: 'careful' })
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('error with an Error captures the exception with tags and context', () => {
    const err = new Error('boom');
    createLogger('API').error('Failed to fetch kids', err, {
      tags: { feature: 'kids' },
      context: { kidId: 'k1' },
    });
    expect(spies.error).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const [captured, hint] = sentry.captureException.mock.calls[0] as [
      Error,
      { tags: Record<string, string>; extra: Record<string, unknown> },
    ];
    expect(captured.message).toBe('boom');
    expect(hint.tags).toMatchObject({ feature: 'kids', scope: 'API' });
    expect(hint.extra).toMatchObject({
      kidId: 'k1',
      logMessage: 'Failed to fetch kids',
    });
  });

  it('error without an Error captures a message', () => {
    logger.error('Something odd', { detail: 1 });
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Something odd',
      expect.objectContaining({ level: 'error' })
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('never sends secrets to Sentry or console', () => {
    logger.error('login failed', new Error('bad Bearer abc.def.ghi'), {
      context: { password: 'hunter2', email: 'me@x.io' },
    });
    const sent = JSON.stringify([
      sentry.captureException.mock.calls,
      spies.error.mock.calls,
    ]);
    expect(sent).not.toMatch(/hunter2|me@x\.io|abc\.def\.ghi/);
  });
});

describe('expected failures', () => {
  it('expected:true logs at warn (breadcrumb) instead of error', () => {
    logger.error('session expired', new Error('401'), { expected: true });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledOnce();
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('isExpectedFailure covers 401, 429, aborts and network errors', () => {
    expect(isExpectedFailure({ response: { status: 401 } })).toBe(true);
    expect(isExpectedFailure({ status: 429 })).toBe(true);
    expect(isExpectedFailure({ response: { status: 500 } })).toBe(false);
    expect(isExpectedFailure({ response: { status: 403 } })).toBe(false);
    expect(
      isExpectedFailure({ response: { status: 403 } }, { statuses: [403] })
    ).toBe(true);
    expect(isExpectedFailure(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isExpectedFailure({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isExpectedFailure({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isExpectedFailure(new Error('plain'))).toBe(false);
  });
});

describe('robustness', () => {
  it('does not throw when Sentry has no client', () => {
    sentry.getClient.mockReturnValue(undefined as never);
    expect(() => logger.error('x', new Error('y'))).not.toThrow();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not throw when Sentry itself throws', () => {
    sentry.captureException.mockImplementation(() => {
      throw new Error('sdk down');
    });
    sentry.addBreadcrumb.mockImplementation(() => {
      throw new Error('sdk down');
    });
    expect(() => logger.error('x', new Error('y'))).not.toThrow();
    expect(() => logger.warn('x')).not.toThrow();
  });

  it('is silent on the console in the test environment', () => {
    configureLogger({ environment: 'test' });
    logger.warn('w');
    logger.error('e', new Error('e'));
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });
});
