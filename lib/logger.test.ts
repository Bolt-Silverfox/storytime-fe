import * as Sentry from '@sentry/nextjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    const sent =
      JSON.stringify(sentry.captureException.mock.calls[0]) + captured.stack;
    expect(sent).not.toMatch(
      /qsecret|hdrsecret|bodysecret|leak@example|9f1c2d3e/
    );
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
    expect((a.cause as Error).message).toContain('inner');
    expect(b.errors).toHaveLength(1);
    expect((b.errors[0] as Error).message).not.toContain('me@x.io');
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
    const out = JSON.stringify([spies.warn.mock.calls, spies.error.mock.calls]);
    expect(out).not.toMatch(/hunter2|tok123|a@b\.io|abc\.def\.ghi|sess=zzz/);
  });

  it('breadcrumb data is redacted', () => {
    logger.warn('w', { password: 'pw1' });
    expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toContain(
      'pw1'
    );
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
    const all = JSON.stringify([
      spies.error.mock.calls,
      spies.warn.mock.calls,
      sentry.captureMessage.mock.calls,
      sentry.addBreadcrumb.mock.calls,
    ]);
    expect(all).not.toContain('hunter2');
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
    const words = [
      'kids',
      'stories',
      'guest',
      'voice',
      'user',
      'devices',
      'notifications',
      'avatars',
      'help-support',
      'parent-favorites',
      'categories',
      'library',
      'progress',
      'quota',
      'history',
      'session',
      'audio',
      'feedback',
      'access',
      'available',
    ];
    for (const a of words) {
      for (const b of words) {
        logger.error('x', makeAxiosError(401, `/${a}/${b}`), {
          expected: true,
        });
      }
    }
    expect(sentry.captureMessage).toHaveBeenCalledTimes(400);
    // Oldest keys were evicted, so a very early key is reportable again.
    sentry.captureMessage.mockClear();
    logger.error('x', makeAxiosError(401, '/kids/kids'), { expected: true });
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
    expect(JSON.stringify(spies.error.mock.calls)).not.toMatch(
      /abc123|me@x\.io|q\.w\.e|pw9/
    );
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
            expect(JSON.stringify(spies.error.mock.calls)).not.toContain(
              value.slice(0, 12)
            );
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
    logger.error(s, new Error(s), { context: { s } });
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
    expect(copy.message).toBe('real failure');
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
    expect(copy.stack).toContain('yyyy');
  });

  it('redacts each input once (context is not scanned for console and Sentry separately)', () => {
    const big = 'z'.repeat(60_000);
    logger.error('m', new Error('e'), { context: { a: big, b: big } });
    const hint = sentry.captureException.mock.calls[0][1] as {
      extra: Record<string, string>;
    };
    // 2 x 60k fits the 128k budget only if scanned once.
    expect(hint.extra.b).not.toBe('[truncated]');
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
    expect(copy.message).toBe('real');
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
      'real'
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
    const out = JSON.stringify([
      spies.warn.mock.calls,
      spies.error.mock.calls,
      sentry.addBreadcrumb.mock.calls,
      sentry.captureException.mock.calls,
    ]);
    expect(out).not.toContain(linkToken);
    expect(out).toContain('/auth/magic#t=[REDACTED]');
  });

  it('masks percent-encoded emails', () => {
    logger.warn('redirect /login?next=%2Fstories&e=kid%40example.com');
    expect(JSON.stringify(spies.warn.mock.calls)).not.toContain(
      'kid%40example.com'
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
      JSON.stringify([spies.warn.mock.calls, sentry.addBreadcrumb.mock.calls])
    ).not.toContain('CODESECRET');
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
      JSON.stringify([spies.warn.mock.calls, sentry.addBreadcrumb.mock.calls])
    ).not.toContain('kid@example.com');
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
    expect(JSON.stringify(sentry.captureException.mock.calls)).not.toMatch(
      /kid@example\.com|TAGSECRET/
    );
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain(
      'kid@example.com'
    );
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
    expect(JSON.stringify(spies.info.mock.calls)).not.toContain('abc123');
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
  const everything = () =>
    JSON.stringify([
      spies.warn.mock.calls,
      spies.error.mock.calls,
      sentry.addBreadcrumb.mock.calls,
      sentry.captureException.mock.calls,
      sentry.captureMessage.mock.calls,
    ]);

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
    expect(everything()).not.toContain('kid@example.com');
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
    expect(everything()).not.toContain('kid@example.com');
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
    const shared = { a: 1 };
    const wide = Array.from({ length: 100 }, () => Array(100).fill(shared));
    const out = JSON.stringify(redact(wide));
    expect(out.split('[Circular]').length - 1).toBeLessThan(7_000);
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
    expect(copy.message).toBe('outer');
    expect(copy.cause).toBe('[Unserializable]');
    expect(spies.error).toHaveBeenCalledOnce();
  });

  it('an unreadable AggregateError member list does not drop the error', () => {
    const agg = new AggregateError([], 'many');
    Object.defineProperty(agg, 'errors', { value: revoked() });
    logger.error('m', agg);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect((sentry.captureException.mock.calls[0][0] as Error).message).toBe(
      'many'
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
    expect(everything()).not.toContain('kid@example.com');
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
      JSON.stringify([
        copy.message,
        copy.stack,
        sentry.captureException.mock.calls,
        sentry.addBreadcrumb.mock.calls,
        spies.error.mock.calls,
        spies.warn.mock.calls,
      ])
    ).not.toContain('Ada');
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
    err.stack = 'parse@\nload@https://app/x.js:1:2';
    logger.error('x', err);
    const copy = sentry.captureException.mock.calls[0][0] as Error;
    expect(copy.stack).toBe(err.stack);
    expect(copy.message).not.toContain('Ada');
  });
});
