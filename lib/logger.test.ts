import * as Sentry from '@sentry/nextjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldsMatching } from '@/test/fields-matching';
import {
  configureLogger,
  createLogger,
  isExpectedFailure,
  isLoggerConsoleEmit,
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
  vi.resetAllMocks();
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
  vi.useRealTimers();
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
    expect(captured.message).toBe('Failed to fetch kids');
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
    expect(
      fieldsMatching(
        [sentry.captureException.mock.calls, spies.error.mock.calls],
        /hunter2|me@x\.io|abc\.def\.ghi/
      )
    ).toEqual([]);
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

const dump = (v: unknown) => JSON.stringify(redact(v));

describe('redaction coverage', () => {
  it.each([
    [
      'https://s3.x/f?X-Amz-Signature=abc123&X-Amz-Credential=AKIAZZ/2026',
      ['abc123', 'AKIAZZ'],
    ],
    ['https://app/cb#access_token=eyJabc&x=1', ['eyJabc']],
    ['https://app/r?password=hunter2', ['hunter2']],
    ['https://app/r?otp=123456', ['123456']],
    ['https://app/r?api_key=kkk111', ['kkk111']],
    ['https://app/r?id_token=ttt222', ['ttt222']],
    ['Authorization: Token abc123', ['abc123']],
    ['authorization=Digest zzz999', ['zzz999']],
    ['body was {"pin":"999111","ok":"fine"}', ['999111']],
    ["body was {'cvv': '321'}", ['321']],
    ['https://app/r?code=oauthcode9&state=s', ['oauthcode9']],
  ])('masks secrets inside strings: %s', (input, secrets) => {
    const out = redact(input) as string;
    for (const secret of secrets) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[REDACTED]');
  });

  it('keeps the non-secret parts of those strings', () => {
    expect(redact('https://app/r?password=hunter2&page=3')).toContain('page=3');
    expect(redact('{"pin":"1","ok":"fine"}')).toContain('"ok":"fine"');
  });

  it.each([
    'pass',
    'pwd',
    'code',
    'card',
    'cvv',
    'session',
    'auth',
    'key',
    'sig',
    'x-api-key',
    'accessToken',
    'Set-Cookie',
    'X_Auth_Token',
  ])('masks the object key %s', (key) => {
    expect(dump({ [key]: 'sensitive-value' })).not.toContain('sensitive-value');
  });

  it('does not over-redact ordinary keys and text', () => {
    expect(dump({ statusCode: 500, keyboard: 'k', shipping: 's' })).toContain(
      '500'
    );
    expect(redact('status code: 500 on pkg@1.2.3')).toBe(
      'status code: 500 on pkg@1.2.3'
    );
  });

  it('still masks real emails', () => {
    expect(redact('mail kid.one@example.com now')).not.toContain('kid.one');
  });

  it('stays fast on pathological input and truncates long strings', () => {
    for (const input of [
      'a'.repeat(40_000),
      'a.'.repeat(20_000),
      'a@'.repeat(20_000),
      `"${'a'.repeat(40_000)}`,
    ]) {
      const t = performance.now();
      const out = redact(input) as string;
      expect(performance.now() - t).toBeLessThan(150);
      expect(out.length).toBeLessThan(9_000);
      expect(out).toContain('[truncated]');
    }
  });

  it('marks circular references instead of returning them raw', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(dump(a)).toContain('[Circular]');
  });

  it('caps depth', () => {
    let deep: Record<string, unknown> = { leaf: 'v' };
    for (let i = 0; i < 20; i++) {
      deep = { n: deep };
    }
    expect(dump(deep)).toContain('[Truncated]');
    expect(dump(deep)).not.toContain('"leaf"');
  });

  it('returns a placeholder for unserialisable values', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(redact(proxy)).toBe('[Unserializable]');
  });
});

const makeAxiosError = (
  status: number,
  url = '/stories/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab/audio?token=qsecret'
) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    {
      url,
      method: 'get',
      baseURL: 'https://api.example.com',
      headers: new AxiosHeaders({ Authorization: 'Bearer hdrsecret' }),
      data: JSON.stringify({ password: 'bodysecret' }),
    } as never,
    {},
    {
      status,
      statusText: 'x',
      headers: {},
      config: {} as never,
      data: { email: 'leak@example.com' },
    }
  );

describe('axios errors reach Sentry with context', () => {
  it('captures a copy keeping stack/cause, with tags, contexts and fingerprint', () => {
    const err = makeAxiosError(500);
    logger.error('Failed to fetch audio', err);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const [captured, hint] = sentry.captureException.mock.calls[0] as [
      Error,
      {
        tags: Record<string, string>;
        contexts: Record<string, Record<string, unknown>>;
        fingerprint: string[];
      },
    ];
    expect(captured.stack).toBeTruthy();
    expect(captured.name).toBe('AxiosError');
    expect((captured as unknown as { status?: number }).status).toBe(500);
    expect(hint.tags).toMatchObject({
      'http.status': '500',
      'http.method': 'GET',
      'http.path': '/stories/:id/audio',
    });
    expect(hint.contexts.http_error).toMatchObject({
      status: 500,
      method: 'GET',
      path: '/stories/:id/audio',
    });
    expect(hint.fingerprint).toEqual(
      expect.arrayContaining(['GET', '/stories/:id/audio', '500'])
    );
    expect(
      fieldsMatching(
        sentry.captureException.mock.calls[0],
        /qsecret|hdrsecret|bodysecret|leak@example|9f1c2d3e/
      )
    ).toEqual([]);
  });

  it('different endpoints get different fingerprints', () => {
    logger.error('a', makeAxiosError(500, '/kids/1'));
    logger.error('b', makeAxiosError(500, '/stories/2'));
    const fp = sentry.captureException.mock.calls.map((c) =>
      (c[1] as { fingerprint: string[] }).fingerprint.join('|')
    );
    expect(fp[0]).not.toBe(fp[1]);
  });

  it('keeps cause and AggregateError members, redacted', () => {
    const inner = new Error('inner Bearer abc.def.ghi');
    const outer = new Error('outer', { cause: inner });
    const agg = new AggregateError([new Error('one me@x.io')], 'many');
    logger.error('x', outer);
    logger.error('y', agg);
    const a = sentry.captureException.mock.calls[0][0] as Error;
    const b = sentry.captureException.mock.calls[1][0] as AggregateError;
    expect((a.cause as Error).message).not.toContain('abc.def.ghi');
    expect((a.cause as Error).message).toBe('[omitted]');
    expect(b.errors).toHaveLength(1);
    expect((b.errors[0] as Error).message).toBe('[omitted]');
  });

  it('redacts the message string itself', () => {
    logger.error('x', new Error('boom for me@x.io token=abc123'));
    const captured = sentry.captureException.mock.calls[0][0] as Error;
    expect(captured.message).not.toMatch(/me@x\.io|abc123/);
  });
});

describe('captured messages and console are redacted', () => {
  it('captureMessage never receives the raw message', () => {
    logger.error('fail Bearer abc.def.ghi for me@x.io');
    const [msg] = sentry.captureMessage.mock.calls[0];
    expect(msg).not.toMatch(/abc\.def\.ghi|me@x\.io/);
  });

  it('console output is redacted', () => {
    logger.warn('x ?password=hunter2', { token: 'tok123', email: 'a@b.io' });
    logger.error('y', new Error('Bearer abc.def.ghi'), {
      context: { cookie: 'sess=zzz' },
    });
    expect(
      fieldsMatching(
        [spies.warn.mock.calls, spies.error.mock.calls],
        /hunter2|tok123|a@b\.io|abc\.def\.ghi|sess=zzz/
      )
    ).toEqual([]);
  });

  it('breadcrumb data is redacted', () => {
    logger.warn('w', { password: 'pw1' });
    expect(sentry.addBreadcrumb).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb.mock.calls[0][0]).toMatchObject({
      message: 'w',
      level: 'warning',
    });
    expect(fieldsMatching(sentry.addBreadcrumb.mock.calls, 'pw1')).toEqual([]);
  });
});

describe('never throws', () => {
  it('survives a revoked proxy as error and as context', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(() => logger.error('x', proxy)).not.toThrow();
    expect(() =>
      logger.error('x', new Error('e'), { context: proxy as never })
    ).not.toThrow();
    expect(() => logger.warn('x', proxy)).not.toThrow();
    const hint = sentry.captureException.mock.calls.at(-1)?.[1] as {
      extra: Record<string, unknown>;
    };
    expect(Object.keys(hint.extra)).not.toContain('0');
  });
});

describe('expected failures stay visible when they signal an outage', () => {
  const network = () =>
    new AxiosError('Network Error', 'ERR_NETWORK', {
      url: '/kids/7',
      method: 'get',
      headers: new AxiosHeaders(),
    } as never);

  it('sends one rate-limited warning event for ERR_NETWORK', () => {
    vi.useFakeTimers();
    logger.error('kids', network(), { expected: true });
    logger.error('kids', network(), { expected: true });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({
      level: 'warning',
    });
    vi.advanceTimersByTime(61_000);
    logger.error('kids', network(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does so for 401 on non-auth endpoints only', () => {
    logger.error('kids', makeAxiosError(401, '/kids/7'), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    logger.error('login', makeAxiosError(401, '/auth/login'), {
      expected: true,
    });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
  });

  it('not for 429, aborts, or when the browser is offline', () => {
    logger.error('x', makeAxiosError(429, '/kids/7'), { expected: true });
    logger.error('x', new DOMException('a', 'AbortError'), { expected: true });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    logger.error('x', network(), { expected: true });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('console breadcrumb de-duplication', () => {
  it('flags logger-originated console writes so beforeBreadcrumb can drop them', () => {
    let during: boolean | undefined;
    spies.warn.mockImplementation(() => {
      during = isLoggerConsoleEmit();
    });
    expect(isLoggerConsoleEmit()).toBe(false);
    logger.warn('w');
    expect(during).toBe(true);
    expect(isLoggerConsoleEmit()).toBe(false);
  });
});

describe('error breadcrumbs', () => {
  it('logger.error leaves its own error-level breadcrumb', () => {
    logger.error('kaboom', new Error('e'));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', message: 'kaboom' })
    );
  });
});

describe('round 2: nested pairs, labels and urls', () => {
  it.each([
    ['Failed: password=hunter2', 'hunter2'],
    ['Error: token=abc123', 'abc123'],
    ['url=https://api/x?access_token=abc123', 'abc123'],
    ['Error: https://s3/x?X-Amz-Signature=sigXYZ', 'sigXYZ'],
    ['next=https://a/b#access_token=frag1', 'frag1'],
  ])('masks %s', (input, secret) => {
    expect(redact(input)).not.toContain(secret);
  });

  it('masks every secret in a partially safe url', () => {
    const out = redact(
      'redirect: https://api/x?token=abc123&otp=999111&page=2'
    ) as string;
    expect(out).not.toMatch(/abc123|999111/);
    expect(out).toContain('page=2');
  });

  it('logger.error with a labelled secret leaks nowhere', () => {
    logger.error('Failed: password=hunter2');
    logger.warn('Failed: password=hunter2');
    expect(
      fieldsMatching(
        [
          spies.error.mock.calls,
          spies.warn.mock.calls,
          sentry.captureMessage.mock.calls,
          sentry.addBreadcrumb.mock.calls,
        ],
        'hunter2'
      )
    ).toEqual([]);
  });

  it('masks the exception message and the first stack line', () => {
    for (const msg of ['password=hunter2', 'Failed: password=hunter2']) {
      sentry.captureException.mockClear();
      logger.error('x', new Error(msg));
      const copy = sentry.captureException.mock.calls[0][0] as Error;
      expect(copy.message).not.toContain('hunter2');
      expect(copy.stack).not.toContain('hunter2');
    }
  });

  it('redacts the whole string before truncating (no cut JWT leaks)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXRwYXlsb2FkIn0.c2ln';
    const input = `${'a '.repeat(3_990)}${jwt}`;
    const out = redact(input) as string;
    expect(out).not.toMatch(/eyJ|secretpayload/);
    expect(redact(`${'a '.repeat(3_995)}${jwt}`)).not.toMatch(/eyJhbGci/);
  });

  it('does not mask stack-frame positions or look-alike words', () => {
    expect(redact('at f (use-token-4f3a.js:12:345)')).toBe(
      'at f (use-token-4f3a.js:12:345)'
    );
    expect(redact('footprint: 3')).toBe('footprint: 3');
  });

  it('caps the total size of a context object', () => {
    const big = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`k${i}`, 'x'.repeat(2_000)])
    );
    const out = JSON.stringify(redact(big));
    expect(out.length).toBeLessThan(80_000);
    expect(out).toContain('[truncated]');
  });
});

describe('round 2: endpoint normalisation', () => {
  const path = (url: string) => {
    sentry.captureException.mockClear();
    logger.error('x', makeAxiosError(500, url));
    return (
      sentry.captureException.mock.calls[0][1] as {
        tags: Record<string, string>;
      }
    ).tags['http.path'];
  };
  it.each([
    ['/auth/verify/abcdef123456', '/auth/verify/:id'],
    ['/invite/INVCODE', '/invite/:id'],
    ['stories/ada-and-the-moon', '/stories/:id'],
    ['users/abc123def', '/users/:id'],
    ['reset-password/Xy7Qz9', '/reset-password/:id'],
    ['stories/categories', '/stories/categories'],
    ['stories/user/library/completed', '/stories/user/library/completed'],
    ['auth/kids/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab', '/auth/kids/:id'],
    ['guest/quota', '/guest/quota'],
  ])('%s -> %s', (url, expected) => {
    expect(path(url)).toBe(expected);
  });
});

describe('round 2: expected-outage scope and bounds', () => {
  it('relative auth endpoints: only real auth actions are exempt from the 401 event', () => {
    logger.error('x', makeAxiosError(401, 'auth/login'), { expected: true });
    logger.error('x', makeAxiosError(401, 'auth/change-password'), {
      expected: true,
    });
    logger.error('x', makeAxiosError(401, 'auth/refresh'), { expected: true });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    logger.error('x', makeAxiosError(401, 'auth/kids'), { expected: true });
    logger.error('x', makeAxiosError(401, 'auth/linked-accounts'), {
      expected: true,
    });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps the rate-limiter map bounded', () => {
    vi.useFakeTimers();
    const paths = [
      'kids/1',
      'stories/1',
      'stories/categories',
      'stories/user/quota',
      'stories/user/progress',
      'stories/user/library/completed',
      'stories/user/library/continue-reading',
      'stories/daily-challenge/kid/1',
      'guest/quota',
      'guest/history',
      'guest/session',
      'guest/stories/1/audio/1',
      'voice/access',
      'voice/available',
      'voice/preferred',
      'user/me',
      'user/me/avatar',
      'devices/register',
      'notifications',
      'notifications/mark-all-read',
      'avatars/system',
      'help-support/feedback',
      'parent-favorites/1',
      'auth/kids/1',
      'auth/linked-accounts',
      'notification-preferences/1',
      'users/1',
      'invite/1',
      'progress/1',
      'library',
    ];
    const methods = [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ];
    for (const method of methods) {
      for (const url of paths) {
        const error = makeAxiosError(401, url);
        if (error.config) {
          error.config.method = method;
        }
        logger.error('x', error, { expected: true });
      }
    }
    expect(sentry.captureMessage).toHaveBeenCalledTimes(210);
    sentry.captureMessage.mockClear();
    logger.error('x', makeAxiosError(401, 'kids/1'), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('round 2: isolation', () => {
  it('a throwing console does not stop Sentry reporting or leave the flag set', () => {
    spies.error.mockImplementation(() => {
      throw new Error('console broke');
    });
    expect(() => logger.error('x', new Error('e'))).not.toThrow();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(isLoggerConsoleEmit()).toBe(false);
  });

  it('console.error receives only redacted message and data', () => {
    logger.error('fail token=abc123 for me@x.io', new Error('Bearer q.w.e'), {
      context: { password: 'pw9' },
    });
    expect(
      fieldsMatching(spies.error.mock.calls, /abc123|me@x\.io|q\.w\.e|pw9/)
    ).toEqual([]);
  });

  it('Authorization header without a known scheme is masked', () => {
    expect(redact('Authorization: opaquevalue123')).not.toContain(
      'opaquevalue123'
    );
    expect(redact('authorization=Negotiate xyz987')).not.toContain('xyz987');
  });

  it('the copied stack is redacted', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at x (https://a/b?token=stk123:1:2)';
    logger.error('x', err);
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.stack).not.toContain('stk123');
  });
});

describe('round 3: key-name scan (table tests)', () => {
  const labels = [
    '',
    'Failed: ',
    'Request failed: ',
    'Login error: ',
    'Error: ',
    'url=',
    'note - ',
  ];
  const keys = [
    'token',
    'password',
    'refreshToken',
    'otp',
    'api_key',
    'Access-Token',
    'secret',
  ];
  const seps = ['=', ':', ' = ', '  :  ', '：', '＝', '    =    '];
  const values: [string, string][] = [
    ['plain', 'sEcr3tValue99'],
    ['long', `${'A1'.repeat(300)}`],
  ];

  for (const label of labels) {
    for (const key of keys) {
      for (const sep of seps) {
        for (const [shape, value] of values) {
          it(`masks ${JSON.stringify(`${label}${key}${sep}<${shape}>`)} in strings, messages and stacks`, () => {
            const text = `${label}${key}${sep}${value} tail`;
            expect(redact(text)).not.toContain(value.slice(0, 12));
            expect(redact(text)).not.toContain(value.slice(-12));
            sentry.captureException.mockClear();
            logger.error('x', new Error(text));
            const copy = sentry.captureException.mock.calls[0][0] as Error;
            expect(copy.message).not.toContain(value.slice(0, 12));
            expect(copy.stack).not.toContain(value.slice(0, 12));
            expect(
              fieldsMatching(spies.error.mock.calls, value.slice(0, 12))
            ).toEqual([]);
          });
        }
      }
    }
  }

  it.each([470, 480, 490, 500, 510])(
    'masks a token after a %i-char url prefix',
    (offset) => {
      const text = `url=https://x/${'a'.repeat(offset)}?token=SECRETVALUE123&page=2`;
      const out = redact(text) as string;
      expect(out).not.toMatch(/SECRET|VALUE123|RETVALUE/);
      expect(out).toContain('page=2');
    }
  );

  it('masks quoted values', () => {
    expect(redact('Failed: password = "hunter two"')).not.toMatch(/hunter/);
    expect(redact("note: token: 'abc 123' done")).not.toMatch(/abc 123/);
  });

  it.each(['{"pin ": "2468"}', "{'code\t': '2468'}"])(
    'treats a quoted key with trailing space as explicit: %s',
    (input) => {
      expect(redact(input)).not.toContain('2468');
    }
  );

  it('masks percent-encoded separators', () => {
    expect(redact('cb?token%3Dabc123%26page%3D2')).not.toContain('abc123');
    expect(redact('cb?token%3Dabc123%26page%3D2')).toContain('page%3D2');
  });

  it.each([
    ['https://app/r?password=ab%26cdSECRET&page=3', 'page=3'],
    ['https://app/r?token=ab%26cdSECRET', ''],
    ['password=a%26b%26cSECRET; next', '; next'],
  ])('masks an encoded "&" inside a plain query value: %s', (input, kept) => {
    const out = redact(input) as string;
    expect(out).not.toContain('SECRET');
    expect(out).toContain(kept);
  });

  it('masks every line of a stack and nested causes', () => {
    const inner = new Error('token: abc123');
    const outer = new Error('Failed: password = hunter2', { cause: inner });
    outer.stack =
      'Error: Failed: password = hunter2\n    at a (x.js:1:2)\n    at b (api_key=zzz999)';
    logger.error('x', outer);
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    const all = JSON.stringify([
      copy.message,
      copy.stack,
      (copy.cause as Error).message,
      (copy.cause as Error).stack,
    ]);
    expect(all).not.toMatch(/hunter2|abc123|zzz999/);
  });

  it('stops values at # and does not let a fragment hide a secret', () => {
    const out = redact('next=https://a/b#access_token=frag1&x=1') as string;
    expect(out).not.toContain('frag1');
    expect(out).toContain('https://a/b#');
  });

  it('scans at most 64k characters of one string', () => {
    const late = `${'c'.repeat(1_000)} token=SECRETVALUE`;
    const out = redact({
      a: `${'a '.repeat(50_000)}password=late`,
      b: 'b'.repeat(30_000),
      c: late,
    }) as Record<string, string>;
    expect(out.a).not.toContain('password');
    expect(out.a.length).toBeLessThan(9_000);
    expect(out.c).toBe(`${'c'.repeat(1_000)} token=[REDACTED]`);
  });

  it.each([
    'key to the castle',
    'code: be kind',
    'pass the ball',
    'meet at 12:30',
    'pkg@1.2.3',
    'a token of friendship',
    'Token: a gold coin',
    'the bearer of bad news',
    'Basic information',
    'status code: 500',
  ])('leaves prose readable: %s', (text) => {
    expect(redact(text)).toBe(text);
  });
});

describe('round 3: basic scheme', () => {
  it('masks base64 Basic credentials but not the word', () => {
    expect(redact('sent Basic dXNlcjpwYXNz now')).not.toContain('dXNlcjpwYXNz');
    expect(redact('Basic Information')).toBe('Basic Information');
  });
});

describe('round 3: mutants that survived before', () => {
  it('a value ends at "#" so the fragment stays', () => {
    const out = redact('token=abc123#section-2') as string;
    expect(out).not.toContain('abc123');
    expect(out).toContain('#section-2');
  });
});

const best = (fn: () => void, runs = 7) => {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    min = Math.min(min, performance.now() - t);
  }
  return min;
};

describe('round 4: linear time', () => {
  const shapes: [string, string][] = [
    ['a=', 'a='],
    ['a:', 'a:'],
    ['a.b=', 'a.b='],
    ['eyJ', 'eyJ'],
    ['password="', 'password="a '],
    ['x[a]', '[a]'],
    ['["k"]', '["k"]'],
    ['[0]', '[0]'],
    ['[a][b]', '[a][b]'],
    [']]]', ']]]'],
    ['password=password=', 'password='],
    ['backtick', 'password=`a '],
    ['password[0]', 'password[0]'],
    ['password[ x', 'password[ x'],
    ['password[a][b]=', 'password[a][b]'],
    ['%5B', 'password%5Ba%5D'],
    ['unclosed [', 'password[ '],
    ['sensitive subscript chain', '[token]'],
    ['sensitive subscript chain 2', '[password]'],
    ['cookie header', 'cookie: "a '],
    ['authorization scheme', 'authorization: a-b '],
    ['JSON objects', '{"token":["a","b"],"page":3} '],
    ['pretty JSON', '{\n  "password": [\n    "a"\n  ]\n}\n'],
    ['nested JSON', '{"a":{"b":[{"token":"x"}]},"c":"d"}'],
    ['escaped JSON in JSON', '{"body":"{\\"token\\":\\"x\\"}"} '],
    ['JSON openers', '[{"'],
    ['multi-line group', 'token: [\n'],
    ['deep brackets', '[[[[{{{{'],
    ['URL schemes', 'a://b:c'],
    ['protocol-relative', ' //a:b'],
    ['bare userinfo', ' a:b:c'],
    ['encoded schemes', 'a%3A%2F%2Fb%3Ac'],
    ['home directories', ' C:\\Users\\a'],
    ['bare userinfo after semicolons', ';a:b'],
    ['home directories with spaces', ' C:\\Users\\a b'],
  ];
  // 8k vs 64k characters: linear is ~8x, quadratic ~64x, so < 20x separates
  // them with room for scheduler noise.
  it.each(shapes)('64k chars of %s is not quadratic', (_name, piece) => {
    const make = (chars: number) =>
      `x${piece.repeat(Math.ceil(chars / piece.length))}`;
    const small = make(8_000);
    const large = make(64_000);
    redact(small);
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });

  it('a whole logger call has a total scan budget', () => {
    const s = 'a='.repeat(32_000);
    const t = performance.now();
    logger.error(s, new Error(s), { context: { s, again: s } });
    expect(performance.now() - t).toBeLessThan(500);
    // The last of the three 64k strings is past the 128k budget: it is dropped
    // entirely (not merely cut to 8k like the others).
    expect(JSON.stringify(sentry.captureException.mock.calls)).toContain(
      '"[truncated]"'
    );
  });
});

describe('round 4: quoted values that fail to close', () => {
  it.each([
    'password="SECRETVALUE',
    `password="${'a'.repeat(5_000)}SECRETVALUE"`,
    `password="it's SECRETVALUE"`,
    `{"password":"pa'ss SECRETVALUE"}`,
    `{'password':'pa"ss SECRETVALUE'}`,
    'token: "abc SECRETVALUE and more',
    String.raw`{"password":"a\"b SECRETVALUE"}`,
  ])('masks %s', (input) => {
    const out = redact(input) as string;
    expect(out).not.toContain('SECRETVALUE');
    expect(out).not.toContain('aaaaaaaaaa');
  });

  it('does not stall on an unclosed quote followed by a megabyte', () => {
    const t = performance.now();
    const out = redact(`password="SECRET${'a'.repeat(1_000_000)}`) as string;
    expect(performance.now() - t).toBeLessThan(200);
    expect(out).not.toContain('SECRET');
  });

  it('keeps text after a closed quoted value', () => {
    expect(redact('password="x1" and page=2')).toBe(
      'password="[REDACTED]" and page=2'
    );
  });
});

describe('round 4: escaped JSON', () => {
  it.each([
    String.raw`{\"password\":\"s3cretValue\"}`,
    String.raw`{\\\"token\\\":\\\"s3cretValue\\\"}`,
    String.raw`body: "{\"user\":{\"refreshToken\":\"s3cretValue\"}}"`,
  ])('masks %s', (input) => {
    expect(redact(input)).not.toContain('s3cretValue');
  });
});

describe('round 4: more key names', () => {
  it.each([
    'passphrase',
    'csrf',
    'xsrf',
    'otp_code',
    'verification_code',
    'pin_code',
    'otp',
    'iban',
    'ssn',
    'data[password]',
    'password[]',
    'my_super_long_application_specific_refresh_token_value_for_the_thing',
    'db_pwd',
    'clientSecret',
  ])('masks %s=', (key) => {
    expect(redact(`x ${key}=v4lu3Secret y`)).not.toContain('v4lu3Secret');
    expect(redact(`x ${key}: v4lu3Secret y`)).not.toContain('v4lu3Secret');
  });

  it('keeps look-alikes', () => {
    expect(redact('classname=Foo and status_code=500')).toBe(
      'classname=Foo and status_code=500'
    );
  });
});

describe('round 4: credential keys are masked whatever the value looks like', () => {
  it.each([
    'Password: hunter',
    'Secret: opensesame',
    'passphrase: tiger',
    'API_KEY: abc',
  ])('%s', (text) => {
    const out = redact(text) as string;
    expect(out).toContain('[REDACTED]');
    expect(out).not.toMatch(/hunter|opensesame|tiger|abc/);
  });

  it('only the capitalised story-ish "Token:" keeps the shape rule', () => {
    expect(redact('Token: a gold coin')).toBe('Token: a gold coin');
    expect(redact('Token: abc123')).not.toContain('abc123');
  });

  it('lowercase scheme words need a long credential-shaped value', () => {
    expect(redact('sent bearer abcdefghij1234567890 ok')).not.toContain(
      'abcdefghij1234567890'
    );
    expect(redact('sent token abcdefghij1234567890 ok')).not.toContain(
      'abcdefghij1234567890'
    );
    expect(redact('sent digest abcdefghij1234567890 ok')).not.toContain(
      'abcdefghij1234567890'
    );
  });
});

describe('round 5: one redaction per call, priority budget', () => {
  it('keeps the exception intact and small fields readable beside huge blobs', () => {
    const err = new Error('real failure');
    err.stack =
      'Error: real failure\n    at doThing (app/file.js:10:5)\n    at run (app/main.js:2:1)';
    const big = 'x'.repeat(200_000);
    logger.error('m', err, {
      context: { blob1: big, blob2: big, blob3: big, userId: 'u1' },
    });
    const [copy, hint] = sentry.captureException.mock.calls[0] as [
      Error,
      { extra: Record<string, string> },
    ];
    expect(copy.message).toBe('m');
    expect(copy.stack).toContain('at doThing (app/file.js:10:5)');
    expect(hint.extra.userId).toBe('u1');
    expect(hint.extra.blob1.endsWith('[truncated]')).toBe(true);
    expect(hint.extra.blob3).toBe('[truncated]');
  });

  it('a 200k message plus a 200k error message still reports the exception', () => {
    const big = 'y'.repeat(200_000);
    const t = performance.now();
    logger.error(big, new Error(big));
    expect(performance.now() - t).toBeLessThan(500);
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.message.startsWith('yyyy')).toBe(true);
    expect(copy.stack).toMatch(/^Error: \[omitted\]\n {4}at /);
  });

  it('redacts each input once (context is not scanned for console and Sentry separately)', () => {
    const big = 'z'.repeat(60_000);
    logger.error('m', new Error('e'), { context: { a: big, b: big } });
    const hint = sentry.captureException.mock.calls[0][1] as {
      extra: Record<string, string>;
    };
    expect(hint.extra.b).toBe(`${'z'.repeat(8_000)}…[truncated]`);
  });
});

describe('round 5: more leaks and over-matches', () => {
  it('treats a backtick as a quote kind', () => {
    expect(redact('password=`a b SECRETVALUE`')).not.toMatch(/SECRETVALUE|a b/);
  });

  it('matches the sensitive word even in very long keys', () => {
    expect(redact(`${'a'.repeat(250)}_password=SECRETVALUE`)).not.toContain(
      'SECRETVALUE'
    );
    expect(redact(`${'a'.repeat(5_000)}_password=SECRETVALUE`)).not.toContain(
      'SECRETVALUE'
    );
  });

  it.each([
    'user_sid_count=5',
    'iban_country=NG',
    'ssn_last4_hint=x',
    'otp_sent=true',
    'pwd_changed_at=2026-01-01',
    'sid: main',
    'sidebar=open',
  ])('does not over-match %s', (text) => {
    expect(redact(text)).toBe(text);
  });

  it.each([
    'otp=123456',
    'user_otp=123456',
    'db_pwd=abc',
    'otp_code=123456',
    'verification_code=123456',
    'pin_code=1234',
    'connect.sid=abc123',
    'iban=GB82WEST12345698765432',
    'ssn: 123-45-6789',
  ])('still masks %s', (text) => {
    const out = redact(text) as string;
    expect(out).toContain('[REDACTED]');
    expect(out).not.toMatch(/123456|abc|1234|GB82|123-45/);
  });

  it('object keys use whole-word matching for otp/pwd/ssn/iban/sid', () => {
    const out = JSON.stringify(
      redact({
        classname: 'c1',
        sidebar: 's1',
        hotpot: 'h1',
        Sibanda: 'b1',
        otp: 'SECRET1',
        db_pwd: 'SECRET2',
        user_ssn: 'SECRET3',
      })
    );
    expect(out).toMatch(/c1.*s1.*h1.*b1/);
    expect(out).not.toMatch(/SECRET/);
  });
});

describe('round 6: subscripts after a sensitive key', () => {
  it.each([
    'password[0][1][2][3][4]=SECRETVALUE',
    'password["a"]="SECRETVALUE"',
    "password['a b']=SECRETVALUE",
    'password[a b]=SECRETVALUE',
    'password[ ]=SECRETVALUE',
    'user%5Bpassword%5D=SECRETVALUE',
    'user[password][x][y][z][w][v]=SECRETVALUE',
    'password%5B0%5D%5B1%5D%5B2%5D%5B3%5D%5B4%5D=SECRETVALUE',
    'password[a][b][c][d][e][f][g][h]: SECRETVALUE',
  ])('masks %s', (input) => {
    expect(redact(input)).not.toContain('SECRETVALUE');
  });

  it('keeps the value of non-sensitive subscripted keys', () => {
    expect(redact('page[0][1][2][3][4][5]=ok')).toBe(
      'page[0][1][2][3][4][5]=ok'
    );
  });

  it('handles backticks around a key and in the separator', () => {
    expect(redact('`password`: `a b SECRETVALUE`')).not.toContain(
      'SECRETVALUE'
    );
    expect(redact('password`=SECRETVALUE')).not.toContain('SECRETVALUE');
  });
});

describe('round 6: more credential words', () => {
  it.each([
    'PHPSESSID=abc123xyz',
    'pwd_hash=abc123xyz',
    'pwdHash=abc123xyz',
    'pwd_salt=abc123xyz',
    'otpPin=abc123xyz',
    'connect.sid: abc123xyz',
    'user_sid: abc123xyz',
    'connect.sid=abc123xyz',
  ])('masks %s', (text) => {
    expect(redact(text)).not.toContain('abc123xyz');
  });

  it.each([
    'user_sid_count=5',
    'otp_sent=true',
    'otp_enabled=true',
    'pwd_changed_at=2026',
    'ssn_last4_hint=x',
    'iban_country=NG',
    'sid: main',
  ])('leaves %s alone', (text) => {
    expect(redact(text)).toBe(text);
  });

  it('applies to object keys too', () => {
    const out = JSON.stringify(
      redact({
        PHPSESSID: 'S1',
        pwd_hash: 'S2',
        pwdHash: 'S3',
        pwd_salt: 'S4',
        otpPin: 'S5',
        'connect.sid': 'S6',
        user_sid: 'S7',
        otp_sent: 'keep1',
        user_sid_count: 'keep2',
      })
    );
    expect(out).not.toMatch(/S\d/);
    expect(out).toContain('keep1');
    expect(out).toContain('keep2');
  });
});

describe('round 6: error getters', () => {
  it('reads err.message once per call', () => {
    let reads = 0;
    const err = new Error('x');
    // A preset stack stops V8 formatting it lazily (which reads message too).
    err.stack = 'Error: boom\n    at fn (a.js:1:1)';
    Object.defineProperty(err, 'message', {
      get() {
        reads++;
        return 'boom';
      },
      enumerable: true,
    });
    logger.error('m', err);
    expect(reads).toBe(1);
  });
});

describe('round 7: subscript chains fail closed', () => {
  const tail =
    ' password = SECRETX "password":"SECRETY" password[x]=SECRETZ token: abcSECRET password=plainSECRET';
  const chains: [string, string][] = [
    ['[token]', '[token]'],
    ['%5Btoken%5D', '%5Btoken%5D'],
    ['password[token]', 'password[token]'],
    ['mixed', '[token]%5Bpassword%5D[a b]x[password]'],
    ['[password][x]', '[password][x]'],
  ];
  it.each(chains)(
    'chain of %s never lets later secrets through',
    (_n, piece) => {
      for (const n of [25, 80, 400, 3_000]) {
        const out = redact(`${piece.repeat(n)}${tail}`) as string;
        expect(out).not.toMatch(/SECRET/);
      }
    }
  );

  it('masks a secret at the end of a very long chain', () => {
    const out = redact(
      `${'[token]'.repeat(1_100)}=SECRETVALUE safe-suffix`
    ) as string;
    expect(out).not.toContain('SECRETVALUE');
    expect(out).toContain('=[REDACTED] safe-suffix');
    expect(out).not.toContain('[truncated]');
  });

  it.each([
    'password[%5D=SECRETVALUE',
    'password[[a]]=SECRETVALUE',
    'password[[[a]]]=SECRETVALUE',
  ])('masks nested/odd brackets: %s', (text) => {
    expect(redact(text)).not.toContain('SECRETVALUE');
  });

  it('masks values after many spaces', () => {
    expect(
      redact(`password${' '.repeat(40)}=${' '.repeat(40)}SECRETVALUE`)
    ).not.toContain('SECRETVALUE');
  });

  it.each(['%26', '%3F', '%23', '%20', '%2C', '%2F', '%5B'])(
    'finds a key after the encoded boundary %s',
    (b) => {
      expect(redact(`a=1${b}token=SECRETVALUE`)).not.toContain('SECRETVALUE');
    }
  );
});

describe('round 7: hostile errors', () => {
  const hostile = () => {
    const err = new Error('real');
    err.stack = 'Error: real\n    at fn (a.js:1:1)';
    Object.defineProperty(err, 'extra', {
      enumerable: true,
      get() {
        throw new Error('getter exploded');
      },
    });
    return err;
  };

  it('a throwing enumerable getter does not stop console, breadcrumb or Sentry', () => {
    logger.error('m', hostile());
    expect(spies.error).toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' })
    );
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.message).toBe('m');
  });

  it('a throwing message/stack/cause getter falls back to [unreadable]', () => {
    const err = new Error('x');
    for (const prop of ['message', 'stack', 'cause', 'name']) {
      Object.defineProperty(err, prop, {
        get() {
          throw new Error('nope');
        },
      });
    }
    expect(() => logger.error('m', err)).not.toThrow();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.message).toBe('[unreadable]');
    expect(spies.error).toHaveBeenCalled();
  });
});

describe('round 7: hostile error proxies', () => {
  it('a throwing ownKeys trap still reports the exception', () => {
    const err = new Error('real');
    err.stack = 'Error: real\n    at fn (a.js:1:1)';
    const proxy = new Proxy(err, {
      ownKeys() {
        throw new Error('ownKeys exploded');
      },
    });
    logger.error('m', proxy);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect((sentry.captureException.mock.calls[0][0] as Error).message).toBe(
      'm'
    );
    expect(spies.error).toHaveBeenCalled();
  });
});

describe('passwordless links', () => {
  const linkToken = 'Zx9_mK2-pQ7wR4tY8uI0oP3aS6dF1gH5jK9lZ2xC4vB';

  it('masks the magic-link fragment token in messages, errors and context', () => {
    const link = `https://web.storytimeapp.me/auth/magic#t=${linkToken}`;
    logger.warn(`opened ${link}`, { href: link });
    logger.error(`failed at ${link}`, new Error(`navigation to ${link}`), {
      context: { href: link },
    });
    const sinks = [
      spies.warn.mock.calls,
      spies.error.mock.calls,
      sentry.addBreadcrumb.mock.calls,
      sentry.captureException.mock.calls,
    ];
    expect(fieldsMatching(sinks, linkToken)).toEqual([]);
    expect(fieldsMatching(sinks, '/auth/magic#t=[REDACTED]')).not.toEqual([]);
  });

  it('masks percent-encoded emails', () => {
    logger.warn('redirect /login?next=%2Fstories&e=kid%40example.com');
    expect(fieldsMatching(spies.warn.mock.calls, 'kid%40example.com')).toEqual(
      []
    );
  });
});

describe('round 8: values that start like a mask or a bracket', () => {
  it.each(['"password":"[REDACTED]hunter2"', "password='[REDACTED]hunter2'"])(
    'masks the whole value of %s',
    (text) => {
      expect(redact(text)).not.toContain('hunter2');
    }
  );

  it('leaves an already-masked value as one mask', () => {
    expect(redact('"password":"[REDACTED]"')).toBe('"password":"[REDACTED]"');
  });

  it.each([
    'password=[hunter2]',
    'password=(hunter2)',
    'password={hunter2}',
    'password=<hunter2>',
    'token: [hunter2] rest',
  ])('masks a bracketed value: %s', (text) => {
    expect(redact(text)).not.toContain('hunter2');
  });
});

describe('round 8: percent-encoded magic-link fragment', () => {
  const linkToken = 'Zx9_mK2-pQ7wR4tY8uI0oP3aS6dF1gH5jK9lZ2xC4vB';

  it.each([
    `next=%2Fauth%2Fmagic%23t%3D${linkToken}`,
    `next=%2Fauth%2Fmagic%23T%3d${linkToken}`,
    `x=1%26t%3D${linkToken}`,
  ])('masks %s', (text) => {
    expect(redact(text)).not.toContain(linkToken);
  });

  it('masks a token whose characters are percent-escaped', () => {
    const out = redact('next=%2Fauth%2Fmagic%23t%3D%5A%78%39abc%26x=1');
    expect(out).not.toMatch(/%5A|%78|%39|abc/);
    expect(out).toContain('%26x=1');
  });
});

describe('round 8: axios summaries keep only string codes', () => {
  it('drops an object-valued code and keeps ERR_NETWORK', () => {
    const hostile = {
      config: { url: '/kids', method: 'get' },
      response: { status: 500 },
      code: { secret: 'CODESECRET' },
      message: 'm',
    };
    logger.error('x', hostile, { expected: true });
    expect(
      fieldsMatching(
        [spies.warn.mock.calls, sentry.addBreadcrumb.mock.calls],
        'CODESECRET'
      )
    ).toEqual([]);
    const net = new AxiosError('Network Error', 'ERR_NETWORK', {
      url: '/kids',
      method: 'get',
      headers: new AxiosHeaders(),
    } as never);
    expect((redact(net) as { code?: unknown }).code).toBe('ERR_NETWORK');
  });
});

describe('round 8: error names are redacted on every path', () => {
  const named = () => {
    const err = new Error('boom');
    err.name = 'Failed for kid@example.com';
    return err;
  };

  it('in warn and expected error output', () => {
    logger.warn('w', named());
    logger.error('e', named(), { expected: true });
    expect(
      fieldsMatching(
        [spies.warn.mock.calls, sentry.addBreadcrumb.mock.calls],
        'kid@example.com'
      )
    ).toEqual([]);
  });
});

describe('round 8: offline only excuses network failures', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  });

  it('keeps unrelated errors reportable', () => {
    expect(isExpectedFailure(new SyntaxError('bad json'))).toBe(false);
    expect(isExpectedFailure(new Error('render failed'))).toBe(false);
  });

  it('still excuses network-shaped failures, aborts and rate limits', () => {
    expect(isExpectedFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(
      isExpectedFailure(
        new AxiosError('timeout', 'ECONNABORTED', {
          headers: new AxiosHeaders(),
        } as never)
      )
    ).toBe(true);
    expect(isExpectedFailure(new DOMException('a', 'AbortError'))).toBe(true);
    expect(isExpectedFailure(makeAxiosError(429))).toBe(true);
  });
});

describe('round 8: classification never throws', () => {
  it('returns false when reading the error throws', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
      }
    );
    expect(() => isExpectedFailure(hostile)).not.toThrow();
    expect(isExpectedFailure(hostile)).toBe(false);
  });
});

describe('round 8: caller tags are sanitised', () => {
  it('keeps safe tags and drops sensitive keys and values', () => {
    logger.error('x', new Error('e'), {
      tags: {
        feature: 'kids',
        user: 'kid@example.com',
        token: 'TAGSECRET',
      },
    });
    logger.error('y', undefined, { tags: { note: 'kid@example.com' } });
    const [, exHint] = sentry.captureException.mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(exHint.tags.feature).toBe('kids');
    expect(
      fieldsMatching(
        sentry.captureException.mock.calls,
        /kid@example\.com|TAGSECRET/
      )
    ).toEqual([]);
    expect(
      fieldsMatching(sentry.captureMessage.mock.calls, 'kid@example.com')
    ).toEqual([]);
  });
});

describe('round 8: outage limiter only records delivered events', () => {
  const net = () =>
    new AxiosError('Network Error', 'ERR_NETWORK', {
      url: '/kids/7',
      method: 'get',
      headers: new AxiosHeaders(),
    } as never);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries after a capture that threw', () => {
    vi.useFakeTimers();
    sentry.captureMessage.mockImplementationOnce(() => {
      throw new Error('sdk down');
    });
    logger.error('kids', net(), { expected: true });
    vi.advanceTimersByTime(1_000);
    logger.error('kids', net(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('still suppresses after a capture that succeeded', () => {
    vi.useFakeTimers();
    logger.error('kids', net(), { expected: true });
    vi.advanceTimersByTime(1_000);
    logger.error('kids', net(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
  });
});

describe('round 8: disabled debug and info do no work', () => {
  const watched = () => {
    const read = vi.fn(() => 'v');
    const payload = {};
    Object.defineProperty(payload, 'field', { get: read, enumerable: true });
    return { payload, read };
  };

  it('does not read the payload in production', () => {
    configureLogger({ environment: 'production' });
    const { payload, read } = watched();
    logger.debug('d', payload);
    logger.info('i', payload);
    expect(read).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it('treats an unrecognised NODE_ENV as production', () => {
    configureLogger({ environment: undefined });
    vi.stubEnv('NODE_ENV', 'staging');
    try {
      logger.info('i');
      expect(spies.info).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('still redacts on the development path', () => {
    const { payload, read } = watched();
    logger.info('token=abc123', payload);
    expect(read).toHaveBeenCalledOnce();
    expect(fieldsMatching(spies.info.mock.calls, 'abc123')).toEqual([]);
  });
});

describe('round 8: bounded work', () => {
  it('a no-value subscript chain is not quadratic', () => {
    const make = (chars: number) => `x${'[token]'.repeat(chars / 7)}= `;
    const small = make(7_000);
    const large = make(63_000);
    expect(large.length).toBeLessThan(64_000);
    redact(small);
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });

  it('a key made of many credential words is not quadratic', () => {
    const make = (words: number) => ({
      [`${'pwd_'.repeat(words)}changed`]: 'kept',
    });
    const small = make(8_000);
    const large = make(64_000);
    expect(JSON.stringify(redact(large))).toContain('kept');
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });

  it('stops walking a primitive array once the budget is spent', () => {
    const out = redact(new Array(1_000_000).fill(7)) as unknown[];
    expect(out.length).toBeLessThan(100_000);
    expect(out.at(-1)).toBe('[truncated]');
  });

  it('stops walking object entries once the budget is spent', () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 200_000; i++) {
      big[`k${i}`] = i;
    }
    const out = redact(big) as Record<string, unknown>;
    expect(Object.keys(out).length).toBeLessThan(50_000);
  });

  it('bounds AggregateError members and own props', () => {
    const members = Array.from({ length: 5_000 }, (_, i) => new Error(`m${i}`));
    const agg = new AggregateError(members, 'many');
    for (let i = 0; i < 5_000; i++) {
      (agg as unknown as Record<string, number>)[`p${i}`] = i;
    }
    logger.error('agg', agg);
    const [captured] = sentry.captureException.mock.calls[0] as [
      Error & { errors: unknown[] },
    ];
    expect(captured.errors.length).toBeLessThan(500);
    expect(Object.keys(captured).length).toBeLessThan(500);
  });

  it('counts a repeated member against the member limit', () => {
    const shared = new Error('shared');
    logger.error('agg', new AggregateError(Array(5_000).fill(shared), 'many'));
    const [captured] = sentry.captureException.mock.calls[0] as [
      Error & { errors: unknown[] },
    ];
    expect(captured.errors.length).toBeLessThan(500);
  });
});

describe('round 9: one sanitiser before every sink', () => {
  const revoked = () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    return proxy;
  };
  const leaked = (needle: string | RegExp) =>
    fieldsMatching(
      [
        spies.warn.mock.calls,
        spies.error.mock.calls,
        sentry.addBreadcrumb.mock.calls,
        sentry.captureException.mock.calls,
        sentry.captureMessage.mock.calls,
      ],
      needle
    );

  it('masks every pair of a Cookie header', () => {
    for (const text of [
      'Cookie: theme=dark; account=SECRETVALUE',
      'set-cookie: a=1; account=SECRETVALUE; Path=/',
    ]) {
      expect(redact(text)).not.toContain('SECRETVALUE');
    }
    expect(redact('cookie=a1b2c3; page=2')).toContain('page=2');
  });

  it.each([
    '{"Cookie": "theme=dark; account=SECRETVALUE"}',
    "{'set-cookie': 'account=SECRETVALUE'}",
    'Authorization: Api-Key SECRETVALUE',
    'authorization=X-Custom.v2 SECRETVALUE',
    'Authorization: Digest username="u1", response="SECRETVALUE", nonce="n"',
  ])('masks the whole header value in %s', (text) => {
    expect(redact(text)).not.toContain('SECRETVALUE');
  });

  it('unreadable tags do not drop the exception', () => {
    logger.error('m', new Error('e'), { tags: revoked() as never });
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(spies.error).toHaveBeenCalledOnce();
  });

  it('applies redaction to the logger scope', () => {
    const scoped = createLogger('kid@example.com');
    scoped.warn('w');
    scoped.error('e', new Error('x'));
    expect(leaked('kid@example.com')).toEqual([]);
    createLogger('API').error('e', new Error('x'));
    const hint = sentry.captureException.mock.calls.at(-1)?.[1] as {
      tags: Record<string, string>;
    };
    expect(hint.tags.scope).toBe('API');
  });

  it('a large error leaves room for the caller context', () => {
    const err = new Error('e');
    for (let i = 0; i < 12; i++) {
      (err as unknown as Record<string, string>)[`p${i}`] = 'x'.repeat(8_000);
    }
    logger.error('m', err, { context: { kidId: 'k1' } });
    const hint = sentry.captureException.mock.calls[0][1] as {
      extra: Record<string, unknown>;
    };
    expect(hint.extra.kidId).toBe('k1');
  });

  it('masks an embedded quote in a twice-serialised password', () => {
    const twice = JSON.stringify(
      JSON.stringify({ password: 'a"b SECRETVALUE', next: 'keep' })
    );
    const out = redact(twice) as string;
    expect(out).not.toContain('SECRETVALUE');
    expect(out).toContain(String.raw`\"next\":\"keep\"`);
  });

  it('masks sensitive data in object keys and keeps ordinary keys', () => {
    const out = JSON.stringify(
      redact({ 'kid@example.com': 1, kidId: 'k1', nested: { 'a@b.io': 2 } })
    );
    expect(out).not.toMatch(/kid@example\.com|a@b\.io/);
    expect(out).toContain('"kidId":"k1"');
    const err = Object.assign(new Error('e'), { 'kid@example.com': 3 });
    logger.warn('w', { 'kid@example.com': 1 });
    logger.error('x', err, { context: { 'kid@example.com': 2 } });
    expect(leaked('kid@example.com')).toEqual([]);
  });

  it('charges circular markers against the output budget', () => {
    const shared = { a: 1 };
    const t = performance.now();
    const out = redact(new Array(1_000_000).fill(shared)) as unknown[];
    expect(performance.now() - t).toBeLessThan(500);
    expect(out.length).toBeLessThan(1_000);
    expect(out.at(-1)).toBe('[truncated]');
  });

  it('stops emitting markers once the output budget is spent', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const wide = Array.from({ length: 100 }, () => Array(100).fill(cycle));
    const out = JSON.stringify(redact(wide));
    const markers = out.split('[Circular]').length - 1;
    expect(markers).toBeGreaterThan(0);
    expect(markers).toBeLessThan(5_000);
    expect(out).toContain('[truncated]');
  });

  it('keeps an own __proto__ key as data', () => {
    const out = redact(JSON.parse('{"__proto__":{"kidId":"k1"}}'));
    expect(JSON.stringify(out)).toBe('{"__proto__":{"kidId":"k1"}}');
  });

  it('an unreadable cause does not drop the outer error', () => {
    logger.error('m', new Error('outer', { cause: revoked() }));
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.message).toBe('m');
    expect(copy.cause).toBe('[Unserializable]');
    expect(spies.error).toHaveBeenCalledOnce();
  });

  it('an unreadable AggregateError member list does not drop the error', () => {
    const agg = new AggregateError([], 'many');
    Object.defineProperty(agg, 'errors', { value: revoked() });
    logger.error('m', agg);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect((sentry.captureException.mock.calls[0][0] as Error).name).toBe(
      'AggregateError'
    );
  });

  it('a revoked proxy as the error still reports the message', () => {
    logger.error('m', revoked());
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    expect(spies.error).toHaveBeenCalledOnce();
  });

  it('one hostile context value does not wipe the rest of the context', () => {
    logger.error('m', new Error('e'), {
      context: { kidId: 'k1', bad: revoked() },
    });
    const hint = sentry.captureException.mock.calls[0][1] as {
      extra: Record<string, unknown>;
    };
    expect(hint.extra.kidId).toBe('k1');
    expect(hint.extra.bad).toBe('[Unserializable]');
  });

  it('symbols are rendered as redacted strings', () => {
    const out = redact({ s: Symbol('kid@example.com') }) as { s: unknown };
    expect(typeof out.s).toBe('string');
    expect(out.s).not.toContain('kid@example.com');
  });

  it('the HTTP summary is sanitised before it reaches Sentry', () => {
    const err = makeAxiosError(500, '/kids');
    err.name = 'Failed for kid@example.com';
    logger.error('x', err);
    const hostile = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'm',
      status: '500 kid@example.com',
      config: { url: '/kids', method: 'kid@example.com' },
    };
    logger.error('y', hostile);
    logger.error('z', { ...hostile, code: 'ERR_NETWORK' }, { expected: true });
    expect(leaked('kid@example.com')).toEqual([]);
    const [, hint] = sentry.captureException.mock.calls[0] as [
      Error,
      { contexts: { http_error: Record<string, unknown> } },
    ];
    expect(hint.contexts.http_error).toMatchObject({
      method: 'GET',
      status: 500,
      path: '/kids',
    });
  });

  it('keeps endpoint context and grouping for normalised HTTP errors', () => {
    const normalised = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'Failed to fetch kids',
      status: 500,
      config: { method: 'get', url: 'auth/kids' },
      response: { status: 500 },
    };
    logger.error('kids', normalised);
    logger.error('kids', {
      ...normalised,
      config: { method: 'get', url: 'voice/available' },
    });
    const hints = sentry.captureMessage.mock.calls.map(
      (c) =>
        c[1] as {
          contexts: { http_error: Record<string, unknown> };
          fingerprint: string[];
        }
    );
    expect(hints[0].contexts.http_error).toMatchObject({
      status: 500,
      method: 'GET',
      path: '/auth/kids',
    });
    expect(hints[0].fingerprint).toEqual(
      expect.arrayContaining(['GET', '/auth/kids', '500'])
    );
    expect(hints[0].fingerprint).not.toEqual(hints[1].fingerprint);
    logger.error('plain', { detail: 1 });
    expect(sentry.captureMessage.mock.calls[2][1]).not.toHaveProperty(
      'fingerprint'
    );
  });

  it.each([
    ['stories/daily-challenge/kid/k1', '/stories/daily-challenge/kid/:id'],
    ['stories/daily-challenge/kid/k2', '/stories/daily-challenge/kid/:id'],
    [
      'notification-preferences/users/u1',
      '/notification-preferences/users/:id',
    ],
    ['guest/stories/s1/audio/job7', '/guest/stories/:id/audio/:id'],
    ['auth/unlink/google', '/auth/unlink/google'],
    ['user/me/upload-avatar', '/user/me/upload-avatar'],
  ])('normalises unknown path segments: %s -> %s', (url, expected) => {
    logger.error('x', makeAxiosError(500, url));
    const hint = sentry.captureException.mock.calls[0][1] as {
      tags: Record<string, string>;
    };
    expect(hint.tags['http.path']).toBe(expected);
  });
});

describe('parse errors', () => {
  const parseError = (text: string) => {
    try {
      JSON.parse(text);
    } catch (err) {
      return err as Error;
    }
    throw new Error('expected a parse error');
  };

  it('never forwards the input a JSON SyntaxError quotes', () => {
    logger.error('x', parseError('{"id":"k1","name":Ada}'));
    logger.warn('y', parseError('Ada Lovelace'));
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.name).toBe('SyntaxError');
    expect(copy.stack).toContain('JSON.parse');
    expect(
      fieldsMatching(
        [
          copy.message,
          copy.stack,
          sentry.captureException.mock.calls,
          sentry.addBreadcrumb.mock.calls,
          spies.error.mock.calls,
          spies.warn.mock.calls,
        ],
        'Ada'
      )
    ).toEqual([]);
  });

  it.each([
    ['a header without frames', 'SyntaxError: Unexpected identifier "Ada"'],
    [
      'a header and frames',
      'SyntaxError: "Ada"\n    at JSON.parse (<anonymous>)',
    ],
  ])('drops the quoted input from %s', (_name, stack) => {
    const err = new SyntaxError(
      'JSON Parse error: Unexpected identifier "Ada"'
    );
    err.stack = stack;
    logger.error('x', err);
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.stack).not.toContain('Ada');
    expect(copy.stack).toMatch(/^SyntaxError: /);
  });

  it('drops quoted input that spans lines and looks like a frame', () => {
    logger.error('x', parseError('!\n at Ada'));
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.stack).not.toContain('Ada');
    expect(copy.stack).toContain('JSON.parse');
  });

  it('keeps frame-only stacks', () => {
    const err = new SyntaxError(
      'JSON Parse error: Unexpected identifier "Ada"'
    );
    err.stack = 'parse@\nload@https://app/_next/static/chunks/x.js:1:2';
    logger.error('x', err);
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.stack).toBe(err.stack);
    expect(copy.message).not.toContain('Ada');
  });
});

describe('round 10: credential words inside subscripts and acronyms', () => {
  const SECRET = 'S3cr3tV4lue99';
  const maskedKeys = [
    'form[otp]',
    'form[pwd]',
    '[otp]',
    'otp[]',
    'otp[0]',
    'kid[otp][]',
    'a.b[otp]',
    'user.otp.',
    'userPWDHash',
    'IBANNumber',
    'OTPValue',
    'cvc',
    'card_cvc',
    'pw',
    'admin_pw',
  ];
  const keptKeys = ['form[otp_sent]', 'otp_sent[0]', 'pwa', 'cvcount', 'pwr'];

  it.each(maskedKeys)('masks the value of object key %s', (key) => {
    const out = redact({ [key]: SECRET }) as Record<string, unknown>;
    expect(out[key]).toBe('[REDACTED]');
  });

  it.each(maskedKeys)('masks %s in key=value and JSON text', (key) => {
    expect(redact(`${key}=${SECRET}`)).toBe(`${key}=[REDACTED]`);
    expect(redact(`{"${key}":"${SECRET}"}`)).toBe(`{"${key}":"[REDACTED]"}`);
  });

  it.each(keptKeys)('keeps the value of object key %s', (key) => {
    const out = redact({ [key]: 'kept' }) as Record<string, unknown>;
    expect(out[key]).toBe('kept');
  });

  it('masks a subscripted credential key in every sink', () => {
    const err = Object.assign(new Error('e'), { 'form[otp]': SECRET });
    logger.error('x', err, {
      context: { 'form[otp]': SECRET },
      tags: { 'form[otp]': SECRET },
    });
    logger.warn('w', { 'form[otp]': SECRET });
    const [copy, hint] = sentry.captureException.mock.calls[0] as [
      Record<string, unknown>,
      { extra: Record<string, unknown>; tags: Record<string, string> },
    ];
    expect(copy['form[otp]']).toBeUndefined();
    expect(hint.extra['form[otp]']).toBe('[REDACTED]');
    expect(hint.tags['form[otp]']).toBeUndefined();
    expect(
      fieldsMatching(
        [
          sentry.captureException.mock.calls,
          sentry.addBreadcrumb.mock.calls,
          spies.error.mock.calls,
          spies.warn.mock.calls,
        ],
        SECRET
      )
    ).toEqual([]);
  });
});

describe('round 10: bounded work', () => {
  it('a subscript chain before a long run of trailing spaces is not quadratic', () => {
    const chain = `x${'[token]'.repeat(4_500)}=`;
    const spaces = ' '.repeat(32_000);
    const noValue = `${chain}${spaces}`;
    const withValue = `${chain}v${spaces}`;
    expect(noValue.length).toBeLessThan(64_000);
    redact(withValue);
    const linear = best(() => redact(withValue));
    const t = best(() => redact(noValue));
    expect(t).toBeLessThan(5 * linear + 10);
  });

  it('charges empty containers against the output budget', () => {
    const tree = Array.from({ length: 100 }, () =>
      Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => []))
    );
    expect(JSON.stringify(redact(tree)).length).toBeLessThan(200_000);
    const objects = Array.from({ length: 100 }, () =>
      Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => ({})))
    );
    expect(JSON.stringify(redact(objects)).length).toBeLessThan(200_000);
  });

  it('caps the number of logged data arguments', () => {
    const args = Array.from({ length: 60_000 }, (_, i) => `arg${i}`);
    logger.warn('many', ...args);
    const [crumb] = sentry.addBreadcrumb.mock.calls[0] as [
      { data: { details: unknown[] } },
    ];
    expect(crumb.data.details.length).toBeLessThanOrEqual(101);
    expect(crumb.data.details.at(-1)).toBe('[truncated]');
    expect(spies.warn.mock.calls[0].length).toBeLessThan(110);
  });

  it('keeps small empty containers', () => {
    expect(redact({ list: [], map: {}, nested: [[], [{}]] })).toEqual({
      list: [],
      map: {},
      nested: [[], [{}]],
    });
  });
});

describe('round 11: every serialised header form', () => {
  const SECRET = 'SECRETVALUE';
  const cookie = `pref="a"; theme=${SECRET}; Path=/; HttpOnly`;
  const digest = `Digest u="a", response=${SECRET}`;
  const forms = (name: string, value: string) => [
    `${name}: ${value}`,
    JSON.stringify({ [name]: value, next: 1 }),
    JSON.stringify(JSON.stringify({ [name]: value, next: 1 })),
    JSON.stringify({ msg: `${name}: ${value}`, next: 1 }),
    JSON.stringify({ msg: `${name}: "${value.replace(/"/g, "'")}"` }),
    `{"${name}":${JSON.stringify([value, `x=${SECRET}`])}}`,
    `${name}: '${value.replace(/"/g, "\\'")}'`,
    `${name}%3A%20${encodeURIComponent(value)}`,
    JSON.stringify({ [name]: value }).replace(/"/g, '\\u0022'),
    `{"${name}\\u0022:\\u0022${value.replace(/"/g, '\\\\u0022')}"}`,
    `${name}:\n  ${value}`,
  ];
  const inputs = [
    ...['Cookie', 'Set-Cookie', 'cookie'].flatMap((n) => forms(n, cookie)),
    ...['Authorization', 'Proxy-Authorization'].flatMap((n) =>
      forms(n, digest)
    ),
    `Cookie: a=it's; theme=${SECRET}`,
    `Cookie: a=\`x\`; theme=${SECRET}`,
    `{"password\\u0022:\\u0022${SECRET}\\u0022}`,
    `password\\u003d${SECRET}`,
    `authorization=${JSON.stringify(digest)}, next=1`,
    String.raw`{"cookie":"pref=\u0022a\u0022; theme=${SECRET}","next":1}`,
    `Cookie: a="${SECRET}${' x'.repeat(150)}"; b=1`,
    `Cookie: a="x; theme=${SECRET}`,
    `{"x-api-key\\u0022:\\u0022${SECRET}"}`,
  ];

  it.each(inputs)('masks %s', (input) => {
    expect(redact(input)).not.toContain(SECRET);
  });

  it('masks a quoted cookie value holding escaped quotes in a JSON body', () => {
    const body = JSON.stringify({
      cookie: `session="x"; theme=${SECRET}`,
      next: 'keep',
    });
    const out = JSON.parse(redact(body) as string);
    expect(out).toEqual({ cookie: '[REDACTED]', next: 'keep' });
  });

  it.each([
    [
      JSON.stringify({ msg: 'Cookie: a=1; b=2', next: 'keep' }),
      '"next":"keep"',
    ],
    [
      JSON.stringify({ msg: `Cookie: a="q"; b=${SECRET}`, next: 'keep' }),
      '"next":"keep"',
    ],
    ["{h: 'Cookie: a=1', next: 'keep'}", "next: 'keep'"],
    ['Cookie: a=1\r\nAccept: text/html', 'Accept: text/html'],
    [JSON.stringify({ c: ['a=1'], next: 'keep' }), '"next":"keep"'],
  ])('keeps the text after the header in %s', (input, kept) => {
    expect(redact(input)).toContain(kept);
  });

  it.each([
    ['quoted cookie value', 'cookie: a="'],
    ['escaped quote', String.raw`cookie: \"a `],
    ['array opener', 'cookie: ["a '],
    ['unicode quote', String.raw`password\u0022:\u0022a `],
  ])('64k chars of %s is not quadratic', (_name, piece) => {
    const make = (chars: number) =>
      `x${piece.repeat(Math.ceil(chars / piece.length))}`;
    const small = make(8_000);
    const large = make(64_000);
    redact(small);
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });
});

describe('round 11: failure classification table', () => {
  const axiosConfig = { headers: new AxiosHeaders() } as never;
  const kinds: [string, () => unknown, boolean, boolean][] = [
    ['AbortError', () => new DOMException('a', 'AbortError'), true, true],
    ['CanceledError', () => ({ name: 'CanceledError' }), true, true],
    ['ERR_CANCELED', () => new AxiosError('c', 'ERR_CANCELED'), true, true],
    ['ERR_NETWORK', () => new AxiosError('n', 'ERR_NETWORK'), true, true],
    [
      'ECONNABORTED',
      () => new AxiosError('t', 'ECONNABORTED', axiosConfig),
      false,
      true,
    ],
    [
      'ETIMEDOUT',
      () => new AxiosError('t', 'ETIMEDOUT', axiosConfig),
      false,
      true,
    ],
    ['fetch TypeError', () => new TypeError('Failed to fetch'), false, true],
    ['Safari fetch TypeError', () => new TypeError('Load failed'), false, true],
    ['other TypeError', () => new TypeError('x is undefined'), false, false],
    ['401', () => makeAxiosError(401), true, true],
    ['429', () => makeAxiosError(429), true, true],
    ['403', () => makeAxiosError(403), false, false],
    ['500', () => makeAxiosError(500), false, false],
    ['plain 401 status', () => ({ status: 401 }), true, true],
    [
      'ERR_BAD_OPTION_VALUE',
      () => new AxiosError('bad option', 'ERR_BAD_OPTION_VALUE', axiosConfig),
      false,
      false,
    ],
    [
      'ERR_BAD_OPTION',
      () => new AxiosError('bad option', 'ERR_BAD_OPTION', axiosConfig),
      false,
      false,
    ],
    [
      'ERR_INVALID_URL',
      () => new AxiosError('bad url', 'ERR_INVALID_URL', axiosConfig),
      false,
      false,
    ],
    [
      'axios-shaped without code or response',
      () => ({ isAxiosError: true, config: {}, message: 'm' }),
      false,
      false,
    ],
    ['ERR_BAD_REQUEST', () => makeAxiosError(400), false, false],
    ['SyntaxError', () => new SyntaxError('bad json'), false, false],
    ['plain Error', () => new Error('render failed'), false, false],
    ['string', () => 'Failed to fetch', false, false],
    ['null', () => null, false, false],
  ];

  it.each(kinds)(
    '%s: online %s, offline %s',
    (_name, make, online, offline) => {
      expect(isExpectedFailure(make())).toBe(online);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      expect(isExpectedFailure(make())).toBe(offline);
    }
  );

  it('a caller status is expected online and offline', () => {
    expect(isExpectedFailure(makeAxiosError(403), { statuses: [403] })).toBe(
      true
    );
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isExpectedFailure(makeAxiosError(403), { statuses: [403] })).toBe(
      true
    );
  });
});

describe('value grammar: no fragment of a secret survives in any context', () => {
  const HEAD = 'Kq7Lm';
  const TAIL = 'Zx4Wv';
  const secrets = [
    ',',
    ';',
    '&',
    '=',
    '"',
    "'",
    '\\"',
    ' ',
    'é,ü',
    '%2C',
    '%',
    '#',
    '(',
    ')',
    ':',
    '[',
    '),',
    '],',
    "''",
    ")'",
    "')",
  ].map((c) => `${HEAD}${c}${TAIL}`);
  const credentialKeys = [
    'password',
    'passwd',
    'pwd',
    'pw',
    'token',
    'access_token',
    'client_secret',
    'api_key',
    'APIKey',
    'X-Api-Key',
    'otp',
    'cvc',
    'sessionid',
    'authorization',
    'user[password]',
    'user%5Bpassword%5D',
    'a[b][secret]',
  ];
  const explicitOnlyKeys = ['pin', 'code', 'key'];
  const queryValue = (s: string) =>
    s.replace(/[\s&#%+"<>`]/g, (c) => encodeURIComponent(c));
  const plainValue = (s: string) =>
    s.replace(/[\s&;#%"'`]/g, (c) => encodeURIComponent(c));
  const singleQuoted = (s: string) =>
    `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

  type Context = [
    name: string,
    build: (key: string, secret: string) => string,
    kept: string,
    keys: string[],
  ];
  const everyKey = [...credentialKeys, ...explicitOnlyKeys];
  const contexts: Context[] = [
    [
      'url query, axios-style encoding',
      (k, s) => `GET https://a.io/p?x=1&${k}=${queryValue(s)}&page=3#top`,
      '&page=3#top',
      everyKey,
    ],
    [
      'url query, encodeURIComponent',
      (k, s) => `https://a.io/p?${k}=${encodeURIComponent(s)}&page=3`,
      '&page=3',
      everyKey,
    ],
    [
      'url fragment',
      (k, s) => `https://a.io/cb#${k}=${queryValue(s)}&page=3`,
      '&page=3',
      everyKey,
    ],
    [
      'url inside a url',
      (k, s) =>
        `next=${encodeURIComponent(`https://a.io/p?${k}=${queryValue(s)}&page=3`)} done`,
      'page%3D3',
      everyKey.filter((k) => !k.includes('%')),
    ],
    [
      'form body',
      (k, s) => `${k}=${plainValue(s)}&page=3`,
      '&page=3',
      everyKey,
    ],
    [
      'unquoted assignment in a log line',
      (k, s) => `login failed ${k}=${plainValue(s)} page=3`,
      ' page=3',
      everyKey,
    ],
    [
      'unquoted assignment before a semicolon',
      (k, s) => `${k}=${plainValue(s)}; page=3`,
      '; page=3',
      everyKey,
    ],
    [
      'labelled value in prose',
      (k, s) => `Login failed: ${k}: ${plainValue(s)} page=3`,
      ' page=3',
      credentialKeys.filter((k) => k !== 'authorization'),
    ],
    [
      'header line',
      (k, s) => `${k}: ${s}\nX-Request-Id: 7`,
      '\nX-Request-Id: 7',
      credentialKeys,
    ],
    [
      'double-quoted assignment',
      (k, s) => `${k}=${JSON.stringify(s)} page=3`,
      ' page=3',
      everyKey,
    ],
    [
      'single-quoted assignment',
      (k, s) => `${k}=${singleQuoted(s)} page=3`,
      ' page=3',
      everyKey,
    ],
    [
      'JSON',
      (k, s) => JSON.stringify({ [k]: s, page: 3 }),
      '"page":3',
      everyKey,
    ],
    [
      'JSON inside a JSON string',
      (k, s) => JSON.stringify(JSON.stringify({ [k]: s, page: 3 })),
      String.raw`\"page\":3`,
      everyKey,
    ],
    [
      'python-style dict',
      (k, s) => `{'${k}': ${singleQuoted(s)}, 'page': 3}`,
      "'page': 3",
      everyKey,
    ],
  ];

  it.each(
    contexts.flatMap(([name, build, kept, keys]) =>
      keys.map((key) => [name, key, build, kept] as const)
    )
  )('%s, key %s', (_name, key, build, kept) => {
    const leaks = secrets.flatMap((secret) => {
      const input = build(key, secret);
      const out = String(redact(input));
      return out.includes(HEAD) || out.includes(TAIL) || !out.includes(kept)
        ? [`${input}  ->  ${out}`]
        : [];
    });
    expect(leaks.join('\n')).toBe('');
  });

  it.each(['Kq7Lm', 'Kq7Lm, Zx4Wv'])(
    'masks every Digest parameter of an unquoted authorization assignment (%s)',
    (piece) => {
      const digest = `Digest username="bob", realm="r", nonce="${piece}", uri="/a", response="${piece}Zx4Wv", qop=auth, nc=00000001, cnonce=Zx4Wv`;
      for (const input of [
        `authorization=${digest} page=3`,
        `proxy-authorization=${digest.replace(/"/g, '')} page=3`,
        `headers authorization=${digest}; page=3`,
        `authorization=${digest.replace('Digest ', 'Digest algorithm=SHA-256, ')} page=3`,
        `authorization=${digest.replace(/=/g, ' = ')} page=3`,
      ]) {
        const out = String(redact(input));
        expect(out).not.toMatch(/Kq7Lm|Zx4Wv|bob/);
        expect(out).toMatch(/ page=3$/);
      }
    }
  );

  it('masks every parameter of an AWS4 signature assignment', () => {
    const out = String(
      redact(
        'authorization=AWS4-HMAC-SHA256 Credential=Kq7Lm/20261127/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=Zx4Wv page=3'
      )
    );
    expect(out).not.toMatch(/Kq7Lm|Zx4Wv/);
    expect(out).toMatch(/ page=3$/);
  });

  it('keeps a single-token authorization assignment and its neighbours', () => {
    expect(redact('authorization=Kq7Lm,Zx4Wv page=3')).toBe(
      'authorization=[REDACTED] page=3'
    );
    expect(redact('authorization=Bearer Kq7Lm page=3')).toBe(
      'authorization=[REDACTED] page=3'
    );
    expect(redact('authorization=Kq7Lm; page=3')).toBe(
      'authorization=[REDACTED]; page=3'
    );
  });

  it('keeps the closing quote and the rest of a JSON body after a query value', () => {
    expect(
      redact(JSON.stringify({ url: 'https://a.io/p?token=Kq7Lm', page: 3 }))
    ).toBe('{"url":"https://a.io/p?token=[REDACTED]","page":3}');
  });

  it.each([
    ['{"token":["Kq7Lm","Zx4Wv"],"page":3}', '"page":3'],
    ["{'token': ['Kq7Lm', 'Zx4Wv'], 'page': 3}", "'page': 3"],
    ['password=(Kq7Lm Zx4Wv) page=3', ' page=3'],
    ['password={a: "Kq7Lm", b: [1, "Zx4Wv"]} page=3', ' page=3'],
    ["password=(it's Kq7Lm Zx4Wv) page=3", ' page=3'],
  ])('masks a whole grouped value: %s', (input, kept) => {
    const out = String(redact(input));
    expect(out).not.toMatch(/Kq7Lm|Zx4Wv/);
    expect(out).toContain(kept);
  });

  it('keeps a closing bracket after an unquoted value', () => {
    expect(redact('f(password=Kq7Lm) next')).toBe(
      'f(password=[REDACTED]) next'
    );
    expect(redact('{password=Kq7Lm, user=bob}')).toBe(
      '{password=[REDACTED], user=bob}'
    );
  });

  it.each([
    ['assignment value', 'password', '='],
    ['query value', 'https://a.io/?password', '='],
    ['labelled value', 'Failed: password', ': '],
    ['header line', 'password', ': '],
  ])('64k of a delimiter-rich %s is linear', (_name, prefix, sep) => {
    const make = (chars: number) =>
      `${prefix}${sep}${`a,b;c'd(e)f"g`.repeat(Math.ceil(chars / 13))}`;
    const small = make(8_000);
    const large = make(64_000);
    redact(small);
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });

  it.each([
    ['unclosed groups', 'password=("x '],
    ['groups of quotes', `token=('"\`x `],
    ['deep groups', 'password=((((((((x '],
  ])('64k of repeated %s is linear', (_name, piece) => {
    const make = (chars: number) =>
      piece.repeat(Math.ceil(chars / piece.length));
    const small = make(8_000);
    const large = make(64_000);
    redact(small);
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });

  it('64k of repeated Digest parameters is linear', () => {
    const make = (n: number) =>
      `authorization=Digest ${'a="b", c=d, '.repeat(n)}`;
    const small = make(700);
    const large = make(5_400);
    redact(small);
    const t1 = best(() => redact(small));
    const t2 = best(() => redact(large));
    expect(t2).toBeLessThan(20 * t1 + 25);
  });
});

describe('shared objects are not circular', () => {
  it('sanitises an object shared by the cause and the context at both places', () => {
    const shared = { kidId: 'k1', token: 'Kq7Lm' };
    logger.error('x', new Error('boom', { cause: shared }), {
      context: shared,
    });
    const [exception, hint] = sentry.captureException.mock.calls[0] as [
      Error,
      { extra: Record<string, unknown> },
    ];
    expect(hint.extra.kidId).toBe('k1');
    expect(exception.cause).toEqual({
      '[key 0]': '[omitted]',
      '[key 1]': '[REDACTED]',
    });
    expect(fieldsMatching(sentry.captureException.mock.calls, 'Kq7Lm')).toEqual(
      []
    );
  });

  it('sanitises a sibling repeated in one object and still marks true cycles', () => {
    const leaf = { kidId: 'k1' };
    const node: Record<string, unknown> = { a: leaf, b: leaf };
    node.self = node;
    expect(redact(node)).toEqual({
      a: { kidId: 'k1' },
      b: { kidId: 'k1' },
      self: '[Circular]',
    });
  });

  it('a shared DAG of empty strings stays within the output budget', () => {
    const a = Array(100).fill('');
    const b = Array(100).fill(a);
    const out = JSON.stringify(redact(Array(100).fill(b)));
    expect(out.length).toBeLessThan(200_000);
    expect(out).toContain('[truncated]');
  });

  it('a wide shared DAG stays within the output budget', () => {
    let level: unknown = { leaf: 'x'.repeat(100) };
    for (let i = 0; i < 6; i++) {
      level = Array(100).fill(level);
    }
    const t = performance.now();
    const out = JSON.stringify(redact(level));
    expect(performance.now() - t).toBeLessThan(1_000);
    expect(out.length).toBeLessThan(200_000);
    expect(out).toContain('[truncated]');
  });
});

describe('auth actions are matched by route', () => {
  it.each([
    'auth/login',
    '/auth/login',
    'https://api.example.com/api/v1/auth/login',
    '/api/v1/auth/refresh',
    'auth/reset-password/Xy7Qz9',
  ])('a 401 from %s is not an outage', (url) => {
    logger.error('x', makeAxiosError(401, url), { expected: true });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    'stories/login',
    '/stories/logout',
    '/api/v1/stories/oauth',
    '/kids/auth/login',
  ])('a 401 from %s is reported', (url) => {
    logger.error('x', makeAxiosError(401, url), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
  });
});

describe('untrusted error text is never forwarded', () => {
  const sinks = () => [
    spies.debug.mock.calls,
    spies.info.mock.calls,
    spies.warn.mock.calls,
    spies.error.mock.calls,
    sentry.addBreadcrumb.mock.calls,
    sentry.captureException.mock.calls,
    sentry.captureMessage.mock.calls,
  ];
  const exception = () => sentry.captureException.mock.calls[0][0] as Error;

  it('replaces an error message with the caller message unless it is a known library message', () => {
    logger.error('Loading kids failed', new Error('row Kq7Lm was rejected'));
    logger.error('x', new Error('Request failed with status code 500'));
    logger.error('y', new TypeError('Failed to fetch'));
    expect(exception().message).toBe('Loading kids failed');
    expect((sentry.captureException.mock.calls[1][0] as Error).message).toBe(
      'Request failed with status code 500'
    );
    expect((sentry.captureException.mock.calls[2][0] as Error).message).toBe(
      'Failed to fetch'
    );
    expect(spies.error.mock.calls[0]).toContainEqual(
      expect.objectContaining({ message: '[omitted]' })
    );
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });

  it('keeps only stack frames, without query strings or appended causes', () => {
    const err = new Error('Kq7Lm');
    err.stack = [
      'Error: Kq7Lm',
      '    at loadKids (https://app.example.com/_next/static/chunks/page.js?token=Kq7Lm:10:5)',
      '    at async run (webpack-internal:///(app-pages-browser)/./lib/x.ts:3:9)',
      'Caused by: SyntaxError: Unexpected token "Kq7Lm"',
      '    at JSON.parse (<anonymous>)',
    ].join('\n');
    logger.error('m', err);
    expect(exception().stack).toBe(
      [
        'Error: [omitted]',
        '    at loadKids (https://app.example.com/_next/static/chunks/page.js:10:5)',
        '    at async run (webpack-internal:///(app-pages-browser)/./lib/x.ts:3:9)',
      ].join('\n')
    );
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });

  it('drops the parser excerpt from an axios-wrapped SyntaxError', () => {
    let parseError: unknown;
    try {
      JSON.parse('{"name":Ada}');
    } catch (err) {
      parseError = err;
    }
    const wrapped = AxiosError.from(parseError as Error, 'ERR_BAD_RESPONSE', {
      url: 'auth/kids',
      method: 'get',
    } as never);
    expect(wrapped.stack).toContain('Caused by: SyntaxError');
    logger.error('kids', wrapped);
    logger.warn('kids', wrapped);
    expect(exception().stack).not.toContain('Caused by');
    expect((exception().cause as Error).stack).toContain('JSON.parse');
    expect(fieldsMatching(sinks(), 'Ada')).toEqual([]);
  });

  it('keeps structural fields: class name, code, status and numeric props', () => {
    const err = Object.assign(new Error('x'), {
      name: 'FirebaseError',
      code: 'messaging/permission-blocked',
      detail: 'Kq7Lm',
      status: 503,
      AdaLovelace: 2,
    });
    logger.error('m', err);
    const copy = exception() as unknown as Record<string, unknown>;
    expect(copy.name).toBe('FirebaseError');
    expect(copy.code).toBe('messaging/permission-blocked');
    expect(copy.status).toBe(503);
    expect(copy).not.toHaveProperty('detail');
    expect(copy).not.toHaveProperty('AdaLovelace');
    logger.error(
      'n',
      Object.assign(new Error('y'), { name: 'Kq7Lm', code: 'Kq7Lm-9' })
    );
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });

  it('drops server text from service errors and string throws', () => {
    logger.error('kids', {
      isAxiosError: true,
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      message: 'No kid named Kq7Lm',
      status: 400,
      data: { message: 'No kid named Kq7Lm' },
      config: { method: 'get', url: 'auth/kids' },
      response: { status: 400 },
    });
    logger.error('thrown', 'Kq7Lm');
    logger.error('plain', { message: 'Kq7Lm', status: null });
    const [, hint] = sentry.captureMessage.mock.calls[0] as [
      string,
      { contexts: { http_error: Record<string, unknown> } },
    ];
    expect(hint.contexts.http_error).toMatchObject({
      status: 400,
      method: 'GET',
      path: '/auth/kids',
      code: 'ERR_BAD_REQUEST',
    });
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });

  it('reduces a URL in error data to its normalised path and allow-listed query keys', () => {
    logger.error(
      'm',
      new Error('e', {
        cause: {
          url: 'https://user:Kq7Lm@api.example.com/stories/Kq7Lm?token=Kq7Lm&page=2#t=Kq7Lm',
        },
      })
    );
    expect(exception().cause).toEqual({ '[key 0]': '/stories/:id?page' });
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });
});

describe('thrown values: only allow-listed structure', () => {
  const exception = () => sentry.captureException.mock.calls[0][0] as Error;

  it('keeps known error names and codes only', () => {
    logger.error(
      'm',
      Object.assign(new Error('e'), { name: 'Kq7LmError', code: 'KQ7LM_REF' })
    );
    logger.error(
      'n',
      Object.assign(new TypeError('e'), { code: 'ERR_NETWORK' })
    );
    expect(exception().name).toBe('Error');
    expect(exception()).not.toHaveProperty('code');
    logger.error(
      'c',
      Object.assign(new Error('e'), { code: 'customer/ada-lovelace' })
    );
    expect(sentry.captureException.mock.calls[2][0]).not.toHaveProperty('code');
    const second = sentry.captureException.mock.calls[1][0] as Error;
    expect(second.name).toBe('TypeError');
    expect((second as unknown as { code: string }).code).toBe('ERR_NETWORK');
    logger.error('h', { ...makeAxiosError(500, '/kids'), code: 'KQ7LM_REF' });
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain(
      'KQ7LM'
    );
  });

  it('drops home directories and page paths from frame locations', () => {
    const err = new Error('e');
    err.stack = [
      'Error: e',
      '    at a (file:///Users/kq7lm/app/lib/x.ts:1:2)',
      '    at b (/home/kq7lm/app/lib/y.ts:3:4)',
      '    at c (https://app.example.com/story/kq7lm:5:6)',
      '    at d (https://app.example.com/_next/static/chunks/main.js:7:8)',
      '    at e (https://app.example.com/stories/AdaLovelace/reader.js:9:1)',
    ].join('\n');
    logger.error('m', err);
    expect(exception().stack).toBe(
      [
        'Error: [omitted]',
        '    at a (file:///~/app/lib/x.ts:1:2)',
        '    at b (/~/app/lib/y.ts:3:4)',
        '    at c (https://app.example.com/story/:id:5:6)',
        '    at d (https://app.example.com/_next/static/chunks/main.js:7:8)',
        '    at e (https://app.example.com/stories/:id/:id:9:1)',
      ].join('\n')
    );
  });

  it('keeps a headerless stack whose frame contains the message text', () => {
    const err = new Error('app.js');
    err.stack = 'load@https://app.example.com/_next/static/chunks/app.js:10:5';
    logger.error('m', err);
    expect(exception().stack).toBe(err.stack);
  });

  it('does not keep identifying keys of thrown objects', () => {
    logger.error(
      'm',
      new Error('e', {
        cause: { 'kq7lm@example.com': 1, AdaLovelace: 2, status: 3 },
      })
    );
    expect(exception().cause).toEqual({
      '[key 0]': 1,
      '[key 1]': 2,
      status: 3,
    });
  });

  it('treats a message-bearing object passed to warn as a thrown value', () => {
    logger.warn('w', { message: 'No kid named Kq7Lm', status: null });
    expect(spies.warn.mock.calls[0]).toContainEqual({
      message: '[omitted]',
      status: null,
    });
  });
});

describe('property: no generated secret reaches any sink', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const secretFrom = (rand: () => number) =>
    `Q${Array.from(
      { length: 19 },
      () => ALPHABET[Math.floor(rand() * ALPHABET.length)]
    ).join('')}`;
  const fragments = (secret: string) =>
    Array.from({ length: secret.length - 7 }, (_, i) => secret.slice(i, i + 8));

  const placements: [
    string,
    (s: string) => unknown,
    Record<string, unknown>?,
  ][] = [
    ['message', (s) => new Error(s)],
    ['multi-line message', (s) => new Error(`bad\n    at ${s} (x.js:1:2)`)],
    [
      'stack header and caused-by section',
      (s) => {
        const e = new Error('e');
        e.stack = `Error: ${s}\n    at f (https://a/x.js:1:2)\nCaused by: Error: ${s}\n    at g (https://a/y.js?k=${s}:3:4)`;
        return e;
      },
    ],
    [
      'frame query string',
      (s) => {
        const e = new Error('e');
        e.stack = `Error: e\n    at f (https://a/x.js?v=${s}:1:2)\nf@https://a/x.js#${s}:1:2`;
        return e;
      },
    ],
    ['cause message', (s) => new Error('outer', { cause: new Error(s) })],
    ['string cause', (s) => new Error('outer', { cause: s })],
    [
      'deep cause chain',
      (s) =>
        new Error('a', {
          cause: new Error('b', {
            cause: new Error('c', { cause: { detail: s } }),
          }),
        }),
    ],
    ['aggregate member', (s) => new AggregateError([new Error(s), s], 'many')],
    [
      'own string prop',
      (s) => Object.assign(new Error('e'), { detail: s, code: s }),
    ],
    ['name', (s) => Object.assign(new Error('e'), { name: s })],
    [
      'response data',
      (s) => {
        const e = makeAxiosError(500, '/kids');
        (e.response as { data: unknown }).data = {
          message: s,
          nested: { why: s },
        };
        e.message = s;
        return e;
      },
    ],
    [
      'url path and query',
      (s) =>
        makeAxiosError(500, `https://u:${s}@api/stories/${s}?q=${s}#t=${s}`),
    ],
    [
      'request headers',
      (s) => {
        const e = makeAxiosError(500, '/kids');
        e.config?.headers.set('Authorization', `Bearer ${s}`);
        e.config?.headers.set('Cookie', `sid=${s}`);
        return e;
      },
    ],
    [
      'service error',
      (s) => ({
        isAxiosError: true,
        name: 'AxiosError',
        message: s,
        status: 500,
        data: { message: s },
        config: { method: 'get', url: `stories/${s}?token=${s}` },
        response: { status: 500 },
      }),
    ],
    ['thrown string', (s) => s],
    ['plain thrown object', (s) => ({ message: s, reason: { text: s } })],
    [
      'context values',
      () => new Error('e'),
      {
        token: '%s',
        headers: { Authorization: 'Bearer %s', Cookie: 'a=%s' },
        url: 'https://api/stories?token=%s&page=2',
        failure: new Error('%s'),
        nested: { password: '%s', list: [{ apiKey: '%s' }] },
      },
    ],
  ];

  const fill = (value: unknown, s: string): unknown => {
    if (typeof value === 'string') {
      return value.replaceAll('%s', s);
    }
    if (value instanceof Error) {
      return new Error(fill(value.message, s) as string);
    }
    if (Array.isArray(value)) {
      return value.map((v) => fill(v, s));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, fill(v, s)])
      );
    }
    return value;
  };

  it.each(placements)('a secret in the %s', (_name, make, context) => {
    const rand = seeded(_name.length * 7_919);
    for (let run = 0; run < 25; run++) {
      vi.clearAllMocks();
      const secret = secretFrom(rand);
      const ctx = context && (fill(context, secret) as Record<string, unknown>);
      for (const env of ['development', 'production'] as const) {
        configureLogger({ environment: env });
        logger.error('failed', make(secret), { context: ctx });
        logger.error('failed', make(secret), { context: ctx, expected: true });
        const thrown = make(secret);
        if (typeof thrown !== 'string') {
          logger.warn('warned', thrown, ctx);
          logger.debug('debugged', thrown, ctx);
        }
      }
      const calls = [
        spies.debug.mock.calls,
        spies.warn.mock.calls,
        spies.error.mock.calls,
        sentry.addBreadcrumb.mock.calls,
        sentry.captureException.mock.calls,
        sentry.captureMessage.mock.calls,
      ];
      expect(spies.error).toHaveBeenCalled();
      for (const fragment of fragments(secret)) {
        expect(fieldsMatching(calls, fragment)).toEqual([]);
      }
    }
  });
});

describe('caller text: value ends', () => {
  it('a query value group stops at the next query parameter', () => {
    expect(redact('GET /x?password=a(b&page=3)&view=grid failed')).toBe(
      'GET /x?password=[REDACTED]&page=3)&view=grid failed'
    );
    expect(redact('token=[a&b] next')).toBe('token=[REDACTED] next');
  });

  it('omits the rest of the line when a sensitive group end is not found', () => {
    const member = `x Kq7Lm${'y'.repeat(2_100)}`;
    const out = redact(`token=["${member}", "Zx4Wv"] tail\nnext line`);
    expect(out).toBe('token=[REDACTED]\nnext line');
  });

  it.each([
    ['authorization=opaque page=3', 'authorization=[REDACTED] page=3'],
    ['authorization=Bearer opaque page=3', 'authorization=[REDACTED] page=3'],
    ['authorization=Custom Kq7Lm page=3', 'authorization=[REDACTED] page=3'],
    ['authorization=Custom a=Kq7Lm, b=Zx4Wv', 'authorization=[REDACTED]'],
    ['authorization=Custom a=Kq7Lm', 'authorization=[REDACTED]'],
    [
      'authorization=Digest username="a", response="Kq7Lm" page=3',
      'authorization=[REDACTED] page=3',
    ],
  ])('%s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('caller text: structured values and URL quotes', () => {
  it('masks every member of a sensitive array in pretty-printed JSON', () => {
    const pretty = JSON.stringify(
      { kidId: 'k1', token: ['Qa7x', 'Wb8y'], page: 3 },
      null,
      2
    );
    const out = redact(`Request failed: ${pretty}\nnext line`) as string;
    expect(out).not.toMatch(/Qa7x|Wb8y/);
    expect(out).toContain('"kidId":"k1"');
    expect(out).toContain('"page":3');
    expect(out.endsWith('\nnext line')).toBe(true);
  });

  it('keeps the layout of a whole pretty-printed JSON message', () => {
    const pretty = JSON.stringify(
      { kidId: 'k1', data: { token: ['Qa7x'] } },
      null,
      2
    );
    expect(redact(pretty)).toBe(
      '{\n  "kidId": "k1",\n  "data": {\n    "token": "[REDACTED]"\n  }\n}'
    );
  });

  it('masks a multi-line sensitive group that is not valid JSON', () => {
    const out = redact("token: [\n  'Qa7x',\n  'Wb8y'\n]\npage=3") as string;
    expect(out).not.toMatch(/Qa7x|Wb8y/);
    expect(out).toContain('page=3');
  });

  it('omits the rest of the text when a multi-line sensitive group never closes', () => {
    const out = redact(`token: [\n  "Qa7x",\n  "${'W'.repeat(2_100)}b8y"`);
    expect(out).toBe('token: [REDACTED]');
  });

  it.each([
    ["?password='one'two&page=3", '?password=[REDACTED]&page=3'],
    [
      `?password=${encodeURIComponent("'one'two")}&page=3`,
      '?password=[REDACTED]&page=3',
    ],
    [
      'url=https://a/x?token=%27one%27two&page=3',
      'url=https://a/x?token=[REDACTED]&page=3',
    ],
    [
      "next=%2Fx%3Ftoken%3D'one'two%26page%3D3",
      'next=%2Fx%3Ftoken%3D[REDACTED]%26page%3D3',
    ],
  ])('a quote does not open a URL query value: %s', (input, expected) => {
    expect(redact(`GET ${input}`)).toBe(`GET ${expected}`);
  });

  it('keeps quote parsing for ordinary assignments', () => {
    expect(redact("password='one two' page=3")).toBe(
      "password='[REDACTED]' page=3"
    );
  });

  it.each([
    ['authorization=Bearer opaque, page=3', 'authorization=[REDACTED], page=3'],
    [
      'authorization=Basic Kq7LmZx4, page=3',
      'authorization=[REDACTED], page=3',
    ],
    [
      'authorization=Digest username="a", response="Kq7Lm", page=3',
      'authorization=[REDACTED]',
    ],
    [
      'authorization=AWS4-HMAC-SHA256 Credential=Kq7Lm, Signature=Zx4Wv',
      'authorization=[REDACTED]',
    ],
  ])('a token68 credential ends at its comma: %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('frame paths outside the build output are normalised', () => {
  const stackOf = (frames: string[]) => {
    const err = new Error('e');
    err.stack = ['Error: e', ...frames].join('\n');
    logger.error('m', err);
    return (sentry.captureException.mock.calls[0][0] as Error).stack;
  };

  it('a page path ending in .js keeps no segment', () => {
    expect(
      stackOf([
        '    at e (https://app.example.com/stories/SampleName.js:9:1)',
        '    at f (https://app.example.com/story/AdaLovelace/x.mjs:2:3)',
      ])
    ).toBe(
      [
        'Error: [omitted]',
        '    at e (https://app.example.com/stories/:id:9:1)',
        '    at f (https://app.example.com/story/:id/:id:2:3)',
      ].join('\n')
    );
  });

  it('keeps build output and the messaging service worker', () => {
    expect(
      stackOf([
        '    at a (https://app.example.com/_next/static/chunks/app/page-1a2b.js:1:2)',
        '    at b (https://app.example.com/firebase-messaging-sw.js:3:4)',
      ])
    ).toBe(
      [
        'Error: [omitted]',
        '    at a (https://app.example.com/_next/static/chunks/app/page-1a2b.js:1:2)',
        '    at b (https://app.example.com/firebase-messaging-sw.js:3:4)',
      ].join('\n')
    );
  });
});

describe('tags share the output budget', () => {
  const stringLengths = (value: unknown): number => {
    if (typeof value === 'string') {
      return value.length;
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).reduce(
        (sum, [k, v]) => sum + k.length + stringLengths(v),
        0
      );
    }
    return 0;
  };

  it('large tags cannot push the event past the budget, and a short tag survives', () => {
    const big = 'x'.repeat(7_900);
    const context = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`c${i}`, big])
    );
    const tags = {
      feature: 'kids',
      ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [`t${i}`, big])
      ),
    };
    logger.error('m', new Error('e'), { context, tags });
    const hint = sentry.captureException.mock.calls[0][1] as {
      tags: Record<string, string>;
      extra: Record<string, unknown>;
    };
    expect(hint.tags.feature).toBe('kids');
    expect(stringLengths(hint.tags) + stringLengths(hint.extra)).toBeLessThan(
      64_000 + 8_100
    );
  });
});

describe('outage limiter and the wall clock', () => {
  it('a backward clock step does not suppress the next outage event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    const net = () =>
      new AxiosError('Network Error', 'ERR_NETWORK', {
        url: '/kids/7',
        method: 'get',
        headers: new AxiosHeaders(),
      } as never);
    logger.error('kids', net(), { expected: true });
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    vi.advanceTimersByTime(61_000);
    logger.error('kids', net(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('a backward clock step does not reopen the window early', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    const net = () =>
      new AxiosError('Network Error', 'ERR_NETWORK', {
        url: '/kids/7',
        method: 'get',
        headers: new AxiosHeaders(),
      } as never);
    logger.error('kids', net(), { expected: true });
    vi.setSystemTime(new Date('2026-01-01T00:09:59.999Z'));
    logger.error('kids', net(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(61_000);
    logger.error('kids', net(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });
});

describe('redacted JSON stays JSON', () => {
  it.each([
    [{ cookie: 'sid=Qa7x', next: 1 }],
    [{ Cookie: ['sid=Qa7x', 'b=Wb8y'], next: 1 }],
    [{ 'set-cookie': 'sid=Qa7x; Path=/', next: 1 }],
    [{ authorization: 'Bearer Qa7x', next: 1 }],
    [{ headers: { Authorization: 'Digest a="Qa7x", b="Wb8y"' }, next: 1 }],
    [{ msg: 'Cookie: sid=Qa7x', next: 1 }],
    [{ msg: 'authorization: Bearer Qa7x', next: 1 }],
  ])('%j', (value) => {
    for (const text of [
      JSON.stringify(value),
      JSON.stringify(value, null, 2),
    ]) {
      const out = redact(text) as string;
      expect(out).not.toMatch(/Qa7x|Wb8y/);
      expect(JSON.parse(out)).toMatchObject({ next: 1 });
    }
  });
});

describe('caller text: generated formats x keys x secrets', () => {
  const PIECES = ['Qa7x', 'Wb8y', 'Zc9z'];
  const SECRETS = [
    PIECES.join("'"),
    `'${PIECES.join("'")}`,
    PIECES.join('"'),
    PIECES.join(','),
    PIECES.join('\n'),
    `${PIECES[0]}[${PIECES[1]}]{${PIECES[2]}}`,
    `${PIECES[0]}', "${PIECES[1]}\n]${PIECES[2]}`,
  ];
  const KEYS = [
    'password',
    'token',
    'apiKey',
    'refresh_token',
    'authorization',
    'cookie',
    'secret',
    'sessionId',
  ];
  const noWhitespace = (s: string) => !/\s/.test(s);
  const headerValue = (key: string, s: string) =>
    key === 'authorization'
      ? `Authorization: Bearer ${s}`
      : key === 'cookie'
        ? `Cookie: sid=${s}; theme=dark`
        : `${key}: ${s}`;

  const formats: [
    string,
    (key: string, s: string) => string,
    string,
    ((s: string) => boolean)?,
  ][] = [
    [
      'compact JSON',
      (key, s) => JSON.stringify({ kidId: 'k1', [key]: s, page: 3 }),
      '"page":3',
    ],
    [
      'compact JSON array',
      (key, s) => `failed ${JSON.stringify({ [key]: [s, s], page: 3 })}`,
      '"page":3',
    ],
    [
      'pretty JSON',
      (key, s) => JSON.stringify({ kidId: 'k1', [key]: s, page: 3 }, null, 2),
      '"page": 3',
    ],
    [
      'pretty JSON array in text',
      (key, s) =>
        `Request failed: ${JSON.stringify({ data: { [key]: [s, s] }, page: 3 }, null, 2)}\nnext`,
      '\nnext',
    ],
    [
      'pretty JSON fragment that does not parse',
      (key, s) =>
        `${JSON.stringify({ data: { [key]: [s, s] }, [key]: s, page: 3 }, null, 2).slice(0, -2)}\n...`,
      '"page": 3',
    ],
    [
      'inspected object',
      (key, s) =>
        `{ kidId: 'k1', ${key}: [ ${JSON.stringify(s)}, ${JSON.stringify(s)} ], page: 3 }`,
      'page: 3',
    ],
    [
      'query',
      (key, s) =>
        `GET https://api.example.com/x?${key}=${encodeURIComponent(s)}&page=3 failed`,
      '&page=3 failed',
    ],
    [
      'encoded query',
      (key, s) =>
        `next=${encodeURIComponent(`/x?${key}=${encodeURIComponent(s)}&page=3`)} done`,
      'done',
    ],
    [
      'header',
      (key, s) => `${headerValue(key, s)}\nAccept: */*`,
      '\nAccept: */*',
      noWhitespace,
    ],
    [
      'free text, double-quoted',
      (key, s) => `login failed ${key}=${JSON.stringify(s)} for kid`,
      ' for kid',
    ],
    [
      'free text, colon and double quotes',
      (key, s) => `login failed, ${key}: ${JSON.stringify(s)} for kid`,
      ' for kid',
    ],
    [
      'free text, single-quoted',
      (key, s) =>
        `login failed ${key}='${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}' for kid`,
      ' for kid',
    ],
    [
      'free text, unquoted',
      (key, s) => `login failed ${key}=${s} for kid`,
      ' for kid',
      (s) =>
        noWhitespace(s) && !/['"`]/.test(s[0]) && !/['"`][,:;&]|,["'`]/.test(s),
    ],
  ];

  const cases = formats.flatMap(([format, build, survivor, applies]) =>
    KEYS.flatMap((key) =>
      SECRETS.filter((s) => applies?.(s) ?? true).map(
        (s) =>
          [format, key, JSON.stringify(s), build(key, s), survivor] as const
      )
    )
  );

  it.each(cases)('%s / %s / %s', (format, _key, _secret, input, survivor) => {
    const out = redact(input) as string;
    if (format === 'compact JSON' || format === 'pretty JSON') {
      expect(JSON.parse(out)).toMatchObject({ kidId: 'k1', page: 3 });
    }
    for (const piece of PIECES) {
      expect(out).not.toContain(piece);
    }
    expect(out).toContain(survivor);
  });
});

describe('URL credentials in caller text', () => {
  const USER = 'Qa7xuser';
  const PASS = 'Wb8ypass';
  const hosts = ['internal', 'dbhost:5432', 'api.example.com', '10.0.0.7'];
  const forms: [string, (host: string) => string, string][] = [
    ['https', (h) => `https://${USER}:${PASS}@${h}/path`, '/path'],
    ['postgres', (h) => `postgres://${USER}:${PASS}@${h}/db`, '/db'],
    ['after a label', (h) => `URL:https://${USER}:${PASS}@${h}/path`, '/path'],
    ['apostrophes', (h) => `https://${USER}:it's'${PASS}@${h}/path`, '/path'],
    [
      'encoded with apostrophes',
      (h) => encodeURIComponent(`https://${USER}:it's'${PASS}@${h}/path`),
      '%2Fpath',
    ],
    [
      'bare with apostrophes',
      (h) => `connect ${USER}:it's'${PASS}@${h} failed`,
      ' failed',
    ],
    ['user only', (h) => `https://${USER}@${h}/path`, '/path'],
    ['protocol-relative', (h) => `//${USER}:${PASS}@${h}/path`, '/path'],
    ['bare', (h) => `connect ${USER}:${PASS}@${h} failed`, ' failed'],
    [
      'encoded',
      (h) => encodeURIComponent(`https://${USER}:${PASS}@${h}/path`),
      '%2Fpath',
    ],
    [
      'in a query',
      (h) => `/cb?next=https://${USER}:${PASS}@${h}/x&page=3`,
      '&page=3',
    ],
    [
      'encoded in a query',
      (h) =>
        `/cb?next=${encodeURIComponent(`https://${USER}:${PASS}@${h}/x`)}&page=3`,
      '&page=3',
    ],
    [
      'in JSON',
      (h) => JSON.stringify({ url: `redis://${USER}:${PASS}@${h}`, page: 3 }),
      '"page":3',
    ],
  ];
  const cases = forms.flatMap(([name, build, survivor]) =>
    hosts.map((host) => [name, host, build(host), survivor] as const)
  );

  it.each(cases)('%s on %s', (_name, host, input, survivor) => {
    logger.warn(input);
    const out = redact(input) as string;
    for (const text of [out, String(spies.warn.mock.calls[0][0])]) {
      expect(text).not.toMatch(/Qa7x|Wb8y/);
      expect(text).toContain(survivor);
    }
    const bareHost = host.split(':')[0];
    expect(out).toContain(bareHost);
  });

  it('keeps the host, port and path', () => {
    expect(redact(`https://${USER}:${PASS}@internal:8080/a/b?c=1`)).toBe(
      'https://[REDACTED]@internal:8080/a/b?c=1'
    );
  });
});

describe('Windows user profiles in stack frames and caller text', () => {
  const NAME = 'Qa7xname';
  const frames: [string, string][] = [
    [
      `    at a (C:\\Users\\${NAME}\\app\\lib\\x.js:1:2)`,
      '    at a (C:\\~\\app\\lib\\x.js:1:2)',
    ],
    [
      `    at b (file:///C:/Users/${NAME}/app/lib/y.js:3:4)`,
      '    at b (file:///C:/~/app/lib/y.js:3:4)',
    ],
    [
      `    at c (d:\\users\\${NAME}\\app\\z.js:5:6)`,
      '    at c (d:\\~\\app\\z.js:5:6)',
    ],
    [`    at d (C:\\Documents and Settings\\${NAME}\\w.js:7:8)`, ''],
  ];

  it.each(frames)('%s', (frame, expected) => {
    const err = new Error('e');
    err.stack = `Error: e\n${frame}`;
    logger.error('m', err);
    const stack = (sentry.captureException.mock.calls[0][0] as Error).stack;
    expect(stack).toBe(
      expected ? `Error: [omitted]\n${expected}` : 'Error: [omitted]'
    );
    expect(fieldsMatching(spies.error.mock.calls, NAME)).toEqual([]);
  });

  it.each([
    `failed at C:\\Users\\${NAME}\\app\\x.js:1:2`,
    `failed at file:///C:/Users/${NAME}/app/x.js`,
    JSON.stringify({ stack: `at a (C:\\Users\\${NAME}\\app\\x.js:1:2)` }),
    `open /Users/${NAME}/app/x.ts`,
    `open /home/${NAME}/app/x.ts`,
    `failed at C:\\Users\\Jane ${NAME}\\app\\x.js`,
  ])('caller text: %s', (input) => {
    const out = redact(input) as string;
    expect(out).not.toContain(NAME);
    expect(out).toContain('app');
  });
});

describe('endpoint paths normalise by position, not by word', () => {
  const path = (url: string) => {
    sentry.captureException.mockClear();
    logger.error('x', makeAxiosError(500, url));
    return (
      sentry.captureException.mock.calls[0][1] as {
        tags: Record<string, string>;
      }
    ).tags['http.path'];
  };

  it.each([
    ['stories/login', '/stories/:id'],
    ['stories/library', '/stories/:id'],
    ['stories/categories', '/stories/categories'],
    ['/api/v1/stories/voice', '/api/v1/stories/:id'],
    ['auth/kids/kids', '/auth/kids/:id'],
    ['guest/stories/history/audio/batch', '/guest/stories/:id/audio/:id'],
    ['parent-favorites/me', '/parent-favorites/:id'],
    ['kids/auth/login', '/kids/:id/:id'],
    ['auth/login', '/auth/login'],
  ])('%s -> %s', (url, expected) => {
    expect(path(url)).toBe(expected);
  });

  it('a route-word slug groups with every other slug', () => {
    expect(path('stories/login')).toBe(path('stories/s1'));
  });
});
