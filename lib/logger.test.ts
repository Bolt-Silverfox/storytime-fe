import * as Sentry from '@sentry/nextjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldsMatching } from '@/test/fields-matching';
import {
  configureLogger,
  isExpectedFailure,
  isLoggerConsoleEmit,
  LOG_MESSAGES,
  type LogContext,
  logger,
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

const sinks = () => [
  spies.debug.mock.calls,
  spies.info.mock.calls,
  spies.warn.mock.calls,
  spies.error.mock.calls,
  sentry.addBreadcrumb.mock.calls,
  sentry.captureException.mock.calls,
  sentry.captureMessage.mock.calls,
];

const exception = (call = 0) =>
  sentry.captureException.mock.calls[call][0] as Error &
    Record<string, unknown>;

type Hint = {
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  contexts: Record<string, Record<string, unknown>>;
  fingerprint: string[];
};
const exceptionHint = (call = 0) =>
  sentry.captureException.mock.calls[call][1] as Hint;

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

const networkError = (url = '/kids/7') =>
  new AxiosError('Network Error', 'ERR_NETWORK', {
    url,
    method: 'get',
    headers: new AxiosHeaders(),
  } as never);

describe('level routing', () => {
  it('debug/info print in development and do not touch Sentry', () => {
    logger.debug('Failed to fetch kids');
    logger.info('Failed to fetch kids');
    expect(spies.debug).toHaveBeenCalledOnce();
    expect(spies.info).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('debug/info are silent in production and read nothing', () => {
    configureLogger({ environment: 'production' });
    const read = vi.fn(() => 200);
    const context = {};
    Object.defineProperty(context, 'status', { get: read, enumerable: true });
    logger.debug('Failed to fetch kids', context);
    logger.info('Failed to fetch kids', context);
    expect(read).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('treats an unrecognised NODE_ENV as production', () => {
    configureLogger({ environment: undefined });
    vi.stubEnv('NODE_ENV', 'staging');
    try {
      logger.info('Failed to fetch kids');
      expect(spies.info).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('warn is a breadcrumb only, never an issue', () => {
    logger.warn('Failed to fetch kids', { status: 404 });
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        message: 'Failed to fetch kids',
        data: { details: [{ status: 404 }] },
      })
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('error with an Error captures the exception with tags and context', () => {
    logger.error('Failed to fetch kids', new Error('boom'), {
      tags: { route: '/auth/kids' },
      context: { status: 500, durationMs: 12 },
    });
    expect(spies.error).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(exception().message).toBe('Failed to fetch kids');
    expect(exceptionHint().tags).toEqual({ route: '/auth/kids' });
    expect(exceptionHint().extra).toEqual({
      status: 500,
      durationMs: 12,
      logMessage: 'Failed to fetch kids',
    });
  });

  it('error without an Error captures a message', () => {
    logger.error('Failed to fetch kids');
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Failed to fetch kids',
      expect.objectContaining({ level: 'error' })
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('logger.error leaves its own error-level breadcrumb', () => {
    logger.error('Failed to fetch kids', new Error('e'));
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'Failed to fetch kids',
      })
    );
  });

  it('is silent on the console in the test environment', () => {
    configureLogger({ environment: 'test' });
    logger.warn('Failed to fetch kids');
    logger.error('Failed to fetch kids', new Error('e'));
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });
});

describe('messages come from a fixed list', () => {
  it('forwards a listed message unchanged', () => {
    for (const message of LOG_MESSAGES) {
      logger.warn(message);
    }
    expect(
      sentry.addBreadcrumb.mock.calls.map(
        ([crumb]) => (crumb as { message: string }).message
      )
    ).toEqual([...LOG_MESSAGES]);
  });

  it('replaces any other message, whatever it contains', () => {
    logger.error('fail Bearer abc.def.ghi for me@x.io' as never);
    logger.warn('x ?password=hunter2' as never);
    logger.info(987654 as never);
    expect(sentry.captureMessage.mock.calls[0][0]).toBe('[unlisted message]');
    expect(fieldsMatching(sinks(), /abc\.def|me@x|hunter2|987654/)).toEqual([]);
  });

  it('a message object with a hostile toString is not read', () => {
    const stringify = vi.fn(() => 'Kq7Lm');
    logger.error({ toString: stringify } as never);
    expect(stringify).not.toHaveBeenCalled();
    expect(sentry.captureMessage.mock.calls[0][0]).toBe('[unlisted message]');
  });
});

describe('caller context: only allow-listed keys and shapes pass', () => {
  const extraFor = (context: unknown) => {
    sentry.captureMessage.mockClear();
    logger.error('Failed to fetch kids', undefined, {
      context: context as LogContext,
    });
    const { extra } = sentry.captureMessage.mock.calls[0][1] as Hint;
    const { logMessage: _, ...rest } = extra;
    return rest;
  };

  it('keeps every allow-listed key with a valid value', () => {
    expect(
      extraFor({
        route: '/api/v1/stories/9f1c2d3e/audio?token=Kq7Lm#t=Kq7Lm',
        method: 'post',
        status: 503,
        code: 'ERR_NETWORK',
        durationMs: 1250.5,
        requestId: '9f1c2d3e-aaaa-4bbb-8ccc-1234567890ab',
        attempt: 2,
      })
    ).toEqual({
      route: '/api/v1/stories/:id/audio',
      method: 'POST',
      status: 503,
      code: 'ERR_NETWORK',
      durationMs: 1250.5,
      requestId: '9f1c2d3e-aaaa-4bbb-8ccc-1234567890ab',
      attempt: 2,
    });
  });

  it('keeps an upper-snake application code and a numeric code', () => {
    expect(extraFor({ code: 'QUOTA_EXCEEDED' })).toEqual({
      code: 'QUOTA_EXCEEDED',
    });
    expect(extraFor({ code: 403 })).toEqual({ code: 403 });
  });

  it.each([
    ['route', 42],
    ['method', 'STEAL'],
    ['status', 999],
    ['status', '500'],
    ['code', 'Kq7Lm-secret'],
    ['code', 'TOKEN_Kq7Lm'],
    ['durationMs', -1],
    ['durationMs', Number.NaN],
    ['requestId', 'Kq7Lm'],
    ['attempt', 1.5],
    ['attempt', { nested: 'Kq7Lm' }],
  ])('replaces an invalid %s value with [REDACTED]: %j', (key, value) => {
    expect(extraFor({ [key]: value })).toEqual({ [key]: '[REDACTED]' });
  });

  it('drops every other key, its name and its value', () => {
    expect(
      extraFor({
        kidId: 'k1',
        password: 'Kq7Lm',
        'kq7lm@example.com': 1,
        nested: { status: 500 },
        __proto__: { status: 500 },
      })
    ).toEqual({});
    expect(fieldsMatching(sinks(), /Kq7Lm|kq7lm|kidId|k1/)).toEqual([]);
  });

  it('ignores a context that is not a plain record', () => {
    expect(extraFor('status=500 Kq7Lm')).toEqual({});
    expect(extraFor([{ status: 500 }])).toEqual({});
    expect(extraFor(null)).toEqual({});
  });

  it('a throwing getter or a revoked proxy never throws', () => {
    const context = {};
    Object.defineProperty(context, 'status', {
      enumerable: true,
      get() {
        throw new Error('getter');
      },
    });
    expect(extraFor(context)).toEqual({ status: '[REDACTED]' });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(() => extraFor(proxy)).not.toThrow();
    expect(() =>
      logger.warn('Failed to fetch kids', proxy as never)
    ).not.toThrow();
  });

  it('tags follow the same allow-list, as strings within the tag budget', () => {
    logger.error('Failed to fetch kids', new Error('e'), {
      tags: {
        route: `/stories/${'a'.repeat(5_000)}`,
        status: 500,
        feature: 'kids',
        token: 'Kq7Lm',
      } as never,
    });
    expect(exceptionHint().tags).toEqual({
      route: '/stories/:id',
      status: '500',
    });
  });
});

describe('route values are parsed as URLs', () => {
  const routeOf = (route: string) => {
    sentry.addBreadcrumb.mockClear();
    logger.warn('Failed to fetch kids', { route });
    const crumb = sentry.addBreadcrumb.mock.calls[0][0] as {
      data: { details: [{ route: string }] };
    };
    return crumb.data.details[0].route;
  };

  it.each([
    ['https://user:Kq7Lm@api.example.com/kids?token=Kq7Lm', '/kids'],
    ['/stories?%70assword=Kq7Lm&page=2', '/stories'],
    ['/stories?page=`Kq7Lm`&x=1', '/stories'],
    ['/stories#t=Kq7Lm', '/stories'],
    ['stories/categories', '/stories/categories'],
    ['/%61uth/kids', '/auth/kids'],
    ['/auth/%6Bids/Kq7Lm', '/auth/kids/:id'],
    ['/users/kq7lm%40example.com', '/users/:id'],
    ['//evil.example/Kq7Lm', '/:id'],
    ['/stories/%E0%A4%A', '/stories/:id'],
    ['Bearer Kq7Lm', '/:id'],
  ])('%s -> %s', (route, expected) => {
    expect(routeOf(route)).toBe(expected);
    expect(fieldsMatching(sinks(), /Kq7Lm|kq7lm/)).toEqual([]);
  });
});

describe('thrown values: only allow-listed structure', () => {
  it('replaces an error message with the caller message unless it is a known library message', () => {
    logger.error('Failed to fetch kids', new Error('row Kq7Lm was rejected'));
    logger.error(
      'Failed to fetch kids',
      new Error('Request failed with status code 500')
    );
    logger.error('Failed to fetch kids', new TypeError('Failed to fetch'));
    expect(exception(0).message).toBe('Failed to fetch kids');
    expect(exception(1).message).toBe('Request failed with status code 500');
    expect(exception(2).message).toBe('Failed to fetch');
    expect(spies.error.mock.calls[0]).toContainEqual(
      expect.objectContaining({ message: '[omitted]' })
    );
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });

  it('keeps known error names and codes only', () => {
    logger.error(
      'Failed to fetch kids',
      Object.assign(new Error('e'), { name: 'Kq7LmError', code: 'KQ7LM_REF' })
    );
    logger.error(
      'Failed to fetch kids',
      Object.assign(new TypeError('e'), { code: 'ERR_NETWORK' })
    );
    logger.error(
      'Failed to fetch kids',
      Object.assign(new Error('e'), { code: 'customer/ada-lovelace' })
    );
    expect(exception(0).name).toBe('Error');
    expect(exception(0)).not.toHaveProperty('code');
    expect(exception(1).name).toBe('TypeError');
    expect(exception(1).code).toBe('ERR_NETWORK');
    expect(exception(2)).not.toHaveProperty('code');
    expect(fieldsMatching(sinks(), /Kq7Lm|KQ7LM|ada-lovelace/)).toEqual([]);
  });

  it('keeps structural numbers and drops every other property', () => {
    logger.error(
      'Failed to fetch kids',
      Object.assign(new Error('x'), {
        name: 'FirebaseError',
        code: 'messaging/permission-blocked',
        detail: 'Kq7Lm',
        status: 503,
        AdaLovelace: 2,
      })
    );
    expect(exception().name).toBe('FirebaseError');
    expect(exception().code).toBe('messaging/permission-blocked');
    expect(exception().status).toBe(503);
    expect(exception()).not.toHaveProperty('detail');
    expect(exception()).not.toHaveProperty('AdaLovelace');
  });

  it('keeps cause and AggregateError members as error structure', () => {
    const inner = new Error('inner Bearer abc.def.ghi');
    logger.error('Failed to fetch kids', new Error('outer', { cause: inner }));
    logger.error(
      'Failed to fetch kids',
      new AggregateError([new Error('one me@x.io')], 'many')
    );
    expect((exception(0).cause as Error).message).toBe('[omitted]');
    const members = (exception(1) as unknown as AggregateError).errors;
    expect(members).toHaveLength(1);
    expect((members[0] as Error).message).toBe('[omitted]');
    expect(fieldsMatching(sinks(), /abc\.def|me@x/)).toEqual([]);
  });

  it('reduces a plain cause object to its structural fields', () => {
    logger.error(
      'Failed to fetch kids',
      new Error('e', {
        cause: {
          'kq7lm@example.com': 1,
          url: 'https://user:Kq7Lm@api.example.com/stories/Kq7Lm',
          status: 404,
          message: 'No kid named Kq7Lm',
        },
      })
    );
    expect(exception().cause).toEqual({ status: 404, message: '[omitted]' });
  });

  it('drops server text from service errors and string throws', () => {
    logger.error('Failed to fetch kids', {
      isAxiosError: true,
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      message: 'No kid named Kq7Lm',
      status: 400,
      data: { message: 'No kid named Kq7Lm' },
      config: { method: 'get', url: 'auth/kids' },
      response: { status: 400 },
    });
    logger.error('Failed to fetch kids', 'Kq7Lm');
    logger.error('Failed to fetch kids', { message: 'Kq7Lm', status: null });
    logger.error('Failed to fetch kids', 123456);
    const [, hint] = sentry.captureMessage.mock.calls[0] as [string, Hint];
    expect(hint.contexts.http_error).toMatchObject({
      status: 400,
      method: 'GET',
      path: '/auth/kids',
      code: 'ERR_BAD_REQUEST',
    });
    expect(fieldsMatching(sinks(), /Kq7Lm|123456/)).toEqual([]);
  });

  it('drops an object-valued axios code', () => {
    logger.error(
      'Failed to fetch kids',
      {
        config: { url: '/kids', method: 'get' },
        response: { status: 500 },
        code: { secret: 'CODESECRET' },
        message: 'm',
      },
      { expected: true }
    );
    expect(fieldsMatching(sinks(), 'CODESECRET')).toEqual([]);
  });

  it('redacts error names on the expected path too', () => {
    const err = new Error('boom');
    err.name = 'Failed for kid@example.com';
    logger.error('Failed to fetch kids', err, { expected: true });
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(fieldsMatching(sinks(), 'kid@example.com')).toEqual([]);
  });

  it('reads err.message once per call', () => {
    let reads = 0;
    const err = new Error('x');
    err.stack = 'Error: boom\n    at fn (a.js:1:1)';
    Object.defineProperty(err, 'message', {
      get() {
        reads++;
        return 'boom';
      },
    });
    logger.error('Failed to fetch kids', err);
    expect(reads).toBe(1);
  });

  it('marks cycles and bounds nesting', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    Object.defineProperty(a, 'cause', { value: b });
    logger.error('Failed to fetch kids', b);
    expect((exception().cause as Record<string, unknown>).cause).toBe(
      '[circular]'
    );
    let deep: Error = new Error('leaf');
    for (let i = 0; i < 20; i++) {
      deep = new Error('n', { cause: deep });
    }
    logger.error('Failed to fetch kids', deep);
    expect(JSON.stringify(sentry.captureException.mock.calls[1])).toContain(
      '[truncated]'
    );
  });

  it('bounds the number of AggregateError members', () => {
    logger.error(
      'Failed to fetch kids',
      new AggregateError(
        Array.from({ length: 500 }, () => new Error('x')),
        'many'
      )
    );
    expect(
      JSON.stringify(sentry.captureException.mock.calls).length
    ).toBeLessThan(64_000);
  });
});

describe('hostile errors never stop reporting', () => {
  it('a throwing enumerable getter does not stop console, breadcrumb or Sentry', () => {
    const err = new Error('real');
    err.stack = 'Error: real\n    at fn (a.js:1:1)';
    Object.defineProperty(err, 'status', {
      enumerable: true,
      get() {
        throw new Error('getter exploded');
      },
    });
    logger.error('Failed to fetch kids', err);
    expect(spies.error).toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' })
    );
    expect(exception().message).toBe('Failed to fetch kids');
  });

  it('a throwing message/stack/cause/name getter falls back to [unreadable]', () => {
    const err = new Error('x');
    for (const prop of ['message', 'stack', 'cause', 'name']) {
      Object.defineProperty(err, prop, {
        get() {
          throw new Error('nope');
        },
      });
    }
    expect(() => logger.error('Failed to fetch kids', err)).not.toThrow();
    expect(exception().message).toBe('[unreadable]');
    expect(exception().cause).toBe('[unreadable]');
  });

  it('a throwing ownKeys trap or a revoked proxy still reports', () => {
    const err = new Error('real');
    err.stack = 'Error: real\n    at fn (a.js:1:1)';
    const proxy = new Proxy(err, {
      ownKeys() {
        throw new Error('ownKeys exploded');
      },
    });
    logger.error('Failed to fetch kids', proxy);
    expect(exception().message).toBe('Failed to fetch kids');
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(() => logger.error('Failed to fetch kids', revoked)).not.toThrow();
  });

  it('a throwing console does not stop Sentry reporting or leave the flag set', () => {
    spies.error.mockImplementation(() => {
      throw new Error('console broke');
    });
    expect(() =>
      logger.error('Failed to fetch kids', new Error('e'))
    ).not.toThrow();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(isLoggerConsoleEmit()).toBe(false);
  });

  it('does not throw when Sentry has no client', () => {
    sentry.getClient.mockReturnValue(undefined as never);
    expect(() =>
      logger.error('Failed to fetch kids', new Error('y'))
    ).not.toThrow();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not throw when Sentry itself throws', () => {
    sentry.captureException.mockImplementation(() => {
      throw new Error('sdk down');
    });
    sentry.addBreadcrumb.mockImplementation(() => {
      throw new Error('sdk down');
    });
    expect(() =>
      logger.error('Failed to fetch kids', new Error('y'))
    ).not.toThrow();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.captureException.mock.results[0].type).toBe('throw');
    expect(() => logger.warn('Failed to fetch kids')).not.toThrow();
    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(2);
    expect(sentry.addBreadcrumb.mock.results[1].type).toBe('throw');
  });
});

describe('stack frames', () => {
  const stackOf = (frames: string[], message = 'e') => {
    sentry.captureException.mockClear();
    const err = new Error(message);
    err.stack = [`Error: ${message}`, ...frames].join('\n');
    logger.error('Failed to fetch kids', err);
    return exception().stack;
  };

  it('keeps function:file:line:col, without query strings or appended causes', () => {
    expect(
      stackOf(
        [
          '    at loadKids (https://app.example.com/_next/static/chunks/page.js?token=Kq7Lm:10:5)',
          'Caused by: SyntaxError: Unexpected token "Kq7Lm"',
          '    at JSON.parse (<anonymous>)',
        ],
        'Kq7Lm'
      )
    ).toBe(
      [
        'Error: [omitted]',
        '    at loadKids (https://app.example.com/_next/static/chunks/page.js:10:5)',
      ].join('\n')
    );
    expect(fieldsMatching(sinks(), 'Kq7Lm')).toEqual([]);
  });

  it('normalises page paths and keeps build output and the service worker', () => {
    expect(
      stackOf([
        '    at c (https://app.example.com/story/kq7lm:5:6)',
        '    at d (https://user:pw@app.example.com/_next/static/chunks/main.js:7:8)',
        '    at e (https://app.example.com/stories/AdaLovelace/reader.js:9:1)',
        '    at f (https://app.example.com/firebase-messaging-sw.js:3:4)',
        'load@https://app.example.com/%61uth/kids/Kq7Lm.js:1:2',
      ])
    ).toBe(
      [
        'Error: [omitted]',
        '    at c (https://app.example.com/story/:id:5:6)',
        '    at d (https://app.example.com/_next/static/chunks/main.js:7:8)',
        '    at e (https://app.example.com/stories/:id/:id:9:1)',
        '    at f (https://app.example.com/firebase-messaging-sw.js:3:4)',
        'load@https://app.example.com/auth/kids/:id:1:2',
      ].join('\n')
    );
  });

  it('keeps only the file name of a non-web location', () => {
    expect(
      stackOf([
        '    at a (file:///Users/kq7lm/app/lib/x.ts:1:2)',
        '    at b (/home/kq7lm/app/lib/y.ts:3:4)',
        '    at c (C:\\Users\\Kq7Lm\\app\\lib\\z.ts:5:6)',
        '    at async run (webpack-internal:///(app-pages-browser)/./lib/w.ts:3:9)',
        '    at JSON.parse (<anonymous>)',
        '    at d (/srv/kq7lm/a b.ts:1:1)',
      ])
    ).toBe(
      [
        'Error: [omitted]',
        '    at a (x.ts:1:2)',
        '    at b (y.ts:3:4)',
        '    at c (z.ts:5:6)',
        '    at async run (w.ts:3:9)',
        '    at JSON.parse (<anonymous>)',
      ].join('\n')
    );
    expect(fieldsMatching(sinks(), /kq7lm|Kq7Lm/)).toEqual([]);
  });

  it('a message that fakes a frame does not become one', () => {
    expect(
      stackOf(
        ['    at real (https://app.example.com/_next/static/a.js:1:1)'],
        'x\n    at Kq7Lm (a.js:1:1)'
      )
    ).toBe(
      [
        'Error: [omitted]',
        '    at real (https://app.example.com/_next/static/a.js:1:1)',
      ].join('\n')
    );
  });

  it('keeps a headerless stack whose frame contains the message text', () => {
    const err = new Error('app.js');
    err.stack = 'load@https://app.example.com/_next/static/chunks/app.js:10:5';
    logger.error('Failed to fetch kids', err);
    expect(exception().stack).toBe(err.stack);
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
    logger.error('Failed to fetch kids', wrapped);
    expect(exception().stack).not.toContain('Caused by');
    expect((exception().cause as Error).stack).toContain('JSON.parse');
    expect(fieldsMatching(sinks(), 'Ada')).toEqual([]);
  });
});

describe('axios errors reach Sentry with context', () => {
  it('captures a copy with tags, contexts and fingerprint, without request data', () => {
    logger.error('Failed to prepare story', makeAxiosError(500));
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(exception().stack).toBeTruthy();
    expect(exception().name).toBe('AxiosError');
    expect(exception().status).toBe(500);
    expect(exceptionHint().tags).toMatchObject({
      'http.status': '500',
      'http.method': 'GET',
      'http.path': '/stories/:id/audio',
    });
    expect(exceptionHint().contexts.http_error).toMatchObject({
      status: 500,
      method: 'GET',
      path: '/stories/:id/audio',
    });
    expect(exceptionHint().fingerprint).toEqual(
      expect.arrayContaining(['GET', '/stories/:id/audio', '500'])
    );
    expect(
      fieldsMatching(
        sinks(),
        /qsecret|hdrsecret|bodysecret|leak@example|9f1c2d3e/
      )
    ).toEqual([]);
  });

  it('different endpoints get different fingerprints', () => {
    logger.error('Failed to fetch kids', makeAxiosError(500, '/kids/1'));
    logger.error('Failed to fetch kids', makeAxiosError(500, '/stories/2'));
    expect(exceptionHint(0).fingerprint).not.toEqual(
      exceptionHint(1).fingerprint
    );
  });

  const path = (url: string) => {
    sentry.captureException.mockClear();
    logger.error('Failed to fetch kids', makeAxiosError(500, url));
    return exceptionHint().tags['http.path'];
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
    ['stories/login', '/stories/:id'],
    ['/api/v1/stories/voice', '/api/v1/stories/:id'],
    ['guest/stories/history/audio/batch', '/guest/stories/:id/audio/:id'],
    ['kids/auth/login', '/kids/:id/:id'],
    ['stories/user', '/stories/:id'],
    ['stories/daily-challenge', '/stories/:id'],
    ['auth/link', '/:id/:id'],
    ['kids', '/kids'],
    ['%61uth/%6Bids', '/auth/kids'],
    ['https://u:Kq7Lm@api.example.com/kids?%74oken=Kq7Lm', '/kids'],
  ])('endpoint %s -> %s', (url, expected) => {
    expect(path(url)).toBe(expected);
  });

  it('an incomplete route groups with a slug', () => {
    expect(path('stories/user')).toBe(path('stories/s1'));
  });
});

describe('expected failures', () => {
  it('expected:true logs at warn (breadcrumb) instead of error', () => {
    logger.error('Failed to fetch kids', new Error('401'), { expected: true });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledOnce();
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('sends one rate-limited warning event for ERR_NETWORK', () => {
    vi.useFakeTimers();
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    expect(sentry.captureMessage.mock.calls[0]).toEqual([
      'Expected failure: network error GET /kids/:id',
      expect.objectContaining({ level: 'warning' }),
    ]);
    vi.advanceTimersByTime(61_000);
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    'auth/login',
    '/auth/login',
    'https://api.example.com/api/v1/auth/login',
    '/api/v1/auth/refresh',
    'auth/reset-password/Xy7Qz9',
    'auth/change-password',
  ])('a 401 from the auth action %s is not an outage', (url) => {
    logger.error('Failed to fetch kids', makeAxiosError(401, url), {
      expected: true,
    });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    'kids/7',
    'auth/kids',
    'auth/linked-accounts',
    'stories/login',
    '/kids/auth/login',
  ])('a 401 from %s is reported', (url) => {
    logger.error('Failed to fetch kids', makeAxiosError(401, url), {
      expected: true,
    });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
  });

  it('not for 429, aborts, or when the browser is offline', () => {
    logger.error('Failed to fetch kids', makeAxiosError(429, '/kids/7'), {
      expected: true,
    });
    logger.error('Failed to fetch kids', new DOMException('a', 'AbortError'), {
      expected: true,
    });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('keeps the rate-limiter map bounded by evicting the oldest endpoint', () => {
    vi.useFakeTimers();
    const methods = [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ];
    const urls = Array.from({ length: 19 }, (_, n) => `kids${'/x'.repeat(n)}`);
    const send = (method: string, url: string, network: boolean) => {
      const error = network ? networkError(url) : makeAxiosError(401, url);
      if (error.config) {
        error.config.method = method;
      }
      logger.error('Failed to fetch kids', error, { expected: true });
    };
    for (const network of [false, true]) {
      for (const method of methods) {
        for (const url of urls) {
          send(method, url, network);
        }
      }
    }
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2 * 7 * 19);
    sentry.captureMessage.mockClear();
    send('options', urls[18], true);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    send('get', urls[0], false);
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
  });

  it('retries after a capture that threw', () => {
    vi.useFakeTimers();
    sentry.captureMessage.mockImplementationOnce(() => {
      throw new Error('sdk down');
    });
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    vi.advanceTimersByTime(1_000);
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('a backward wall-clock step neither suppresses nor reopens the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    vi.setSystemTime(new Date('2026-01-01T00:09:59.999Z'));
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    vi.advanceTimersByTime(61_000);
    logger.error('Failed to fetch kids', networkError(), { expected: true });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });
});

describe('isExpectedFailure', () => {
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
    [
      'Firefox fetch TypeError',
      () => new TypeError('NetworkError when attempting to fetch resource.'),
      false,
      true,
    ],
    [
      'other TypeError',
      () => new TypeError('Failed to fetch the avatar config from cache'),
      false,
      false,
    ],
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

  it.each([
    [{ response: { status: 0 }, status: 401 }, true],
    [{ response: { status: 500 }, status: 401 }, false],
    [{ response: { status: 401 }, status: 500 }, true],
    [{ response: { status: '401' }, status: 429 }, true],
  ])('status is chosen like the HTTP summary: %j', (error, expected) => {
    expect(isExpectedFailure(error)).toBe(expected);
  });

  it('returns false when reading the error throws', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
      }
    );
    expect(isExpectedFailure(hostile)).toBe(false);
  });
});

describe('console breadcrumb de-duplication', () => {
  it('flags logger-originated console writes so beforeBreadcrumb can drop them', () => {
    let during: boolean | undefined;
    spies.warn.mockImplementation(() => {
      during = isLoggerConsoleEmit();
    });
    expect(isLoggerConsoleEmit()).toBe(false);
    logger.warn('Failed to fetch kids');
    expect(during).toBe(true);
    expect(isLoggerConsoleEmit()).toBe(false);
  });
});

describe('every sink payload is valid JSON', () => {
  it('round-trips the extra, tags, contexts and breadcrumbs unchanged', () => {
    const shared = { status: 500 };
    logger.error('Failed to prepare story', makeAxiosError(500), {
      context: { ...shared, route: '/stories/1', durationMs: 3 },
      tags: shared,
    });
    logger.error(
      'Failed to fetch kids',
      new Error('e', { cause: new AggregateError([new Error('x')]) })
    );
    logger.warn('Failed to fetch kids', { status: 404 });
    const payloads = [
      ...sentry.captureException.mock.calls.map(([, hint]) => hint),
      ...sentry.addBreadcrumb.mock.calls.map(([crumb]) => crumb),
    ];
    for (const payload of payloads) {
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    }
    const copy = exception(1);
    const record = { ...copy, message: copy.message, stack: copy.stack };
    expect(() => JSON.stringify(record)).not.toThrow();
  });
});

describe('property: no secret in a caller value reaches any sink', () => {
  const PIECES = ['Qa7x', 'Wb8y'];
  const SECRETS = [
    'Qa7x`Wb8y',
    "Qa7x'Wb8y",
    'Qa7x"Wb8y',
    'Qa7x Wb8y',
    'Qa7x\\Wb8y',
    'Qa7x#Wb8y',
    'Qa7x&Wb8y',
    'Qa7x%26Wb8y',
    'Qa7x%60Wb8y',
    'Qa7x,Wb8y',
    'Qa7x;Wb8y',
    'Qa7x\nWb8y',
    'Qa7x＝Wb8y',
    'Qa7x/Wb8y',
    'Qa7x.Wb8y.Zz',
    'eyJQa7x.eyJWb8y.sig',
  ];
  const KEYS = [
    'password',
    'token',
    'access_token',
    'Authorization',
    'cookie',
    'email',
    'otp',
    'pin',
    'api_key',
    'sid',
  ];
  const encodeFirst = (key: string) =>
    `%${key.charCodeAt(0).toString(16)}${key.slice(1)}`;
  const FORMATS: [string, (key: string, secret: string) => string][] = [
    ['query', (k, s) => `https://api.example.com/kids?${k}=${s}&page=1`],
    [
      'encoded query',
      (k, s) => `/kids?${encodeFirst(k)}=${encodeURIComponent(s)}`,
    ],
    ['userinfo', (k, s) => `https://${k}:${encodeURIComponent(s)}@a.io/kids`],
    ['header', (k, s) => `${k}: ${s}`],
    ['bearer header', (_k, s) => `Authorization: Bearer ${s}`],
    ['JSON', (k, s) => JSON.stringify({ [k]: s, ok: 1 })],
    ['free text', (k, s) => `could not save ${k} ${s} for the kid`],
  ];

  const feed = (text: string) => {
    const context = {
      route: text,
      method: text,
      code: text,
      requestId: text,
      status: text,
      note: text,
      [text]: 1,
    };
    const err = Object.assign(new Error(text), {
      name: text,
      code: text,
      detail: text,
    });
    err.stack = `Error: ${text}\n    at ${text} (https://app.example.com/${text}:1:2)\n    at f (/home/${text}/x.ts:1:2)`;
    logger.error(text as never, err, {
      context: context as never,
      tags: context as never,
    });
    logger.error('Failed to fetch kids', text);
    logger.error('Failed to fetch kids', { message: text, [text]: text });
    logger.error(
      'Failed to fetch kids',
      {
        isAxiosError: true,
        message: text,
        code: text,
        config: { url: text, method: text },
        response: { status: 500, data: text },
      },
      { expected: true }
    );
    logger.error(
      'Failed to fetch kids',
      new AxiosError(text, 'ERR_NETWORK', {
        url: text,
        method: 'get',
        headers: new AxiosHeaders(),
      } as never),
      { expected: true }
    );
    logger.warn(text as never, context as never);
    logger.info(text as never, context as never);
  };

  for (const [format, build] of FORMATS) {
    it.each(KEYS)(`${format}: %s`, (key) => {
      for (const secret of SECRETS) {
        feed(build(key, secret));
      }
      for (const piece of PIECES) {
        expect(fieldsMatching(sinks(), piece)).toEqual([]);
      }
    });
  }
});
