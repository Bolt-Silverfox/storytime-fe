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
    ['/invite/INVCODE', '/invite/:slug'],
    ['stories/ada-and-the-moon', '/stories/:slug'],
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
    for (let i = 0; i < 400; i++) {
      logger.error(
        'x',
        makeAxiosError(
          401,
          `/thing${'abcdefghij'.repeat(0)}/n${'q'.repeat(i % 5)}x/v${i}w`
        ),
        { expected: true }
      );
    }
    // Oldest keys were evicted, so a very early key is reportable again.
    sentry.captureMessage.mockClear();
    logger.error('x', makeAxiosError(401, '/thing/nx/v0w'), { expected: true });
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

  it('masks percent-encoded separators', () => {
    expect(redact('cb?token%3Dabc123%26page%3D2')).not.toContain('abc123');
    expect(redact('cb?token%3Dabc123%26page%3D2')).toContain('page%3D2');
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

  it('scans at most 64k characters', () => {
    const out = redact(`${'a '.repeat(40_000)}password=late`) as string;
    expect(out).not.toContain('password');
    expect(out.length).toBeLessThan(9_000);
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
