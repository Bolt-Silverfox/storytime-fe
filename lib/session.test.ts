// @vitest-environment jsdom
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { isUserLoggedIn } from '@/lib/services';
import { hasUsableSession, isAccessTokenUsable } from '@/lib/session';

const NOW = Date.now();
const jwt = (payload: Record<string, unknown>) => {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
};
const sec = (offsetMs: number) => Math.floor((NOW + offsetMs) / 1000);
// Same shape as the owner's token: expired ~6 days ago.
const expired = jwt({ id: 'u', userId: 'u', expiry: sec(-6 * 86400_000) });
const fresh = jwt({ id: 'u', userId: 'u', expiry: sec(3600_000) });

const clear = () => {
  for (const n of ['accessToken', 'refreshToken', 'guestSessionId']) {
    Cookies.remove(n);
  }
  localStorage.clear();
};

let seen: InternalAxiosRequestConfig | undefined;
const send = async (url: string) => {
  seen = undefined;
  api.defaults.adapter = async (config) => {
    seen = config;
    return {
      data: { success: true, data: {} },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  await api.get(url);
  return seen as unknown as InternalAxiosRequestConfig;
};

describe('isAccessTokenUsable', () => {
  it('true for a future exp, false for past', () => {
    expect(isAccessTokenUsable(fresh, NOW)).toBe(true);
    expect(isAccessTokenUsable(expired, NOW)).toBe(false);
  });
  it('reads exp as well as expiry', () => {
    expect(isAccessTokenUsable(jwt({ exp: sec(3600_000) }), NOW)).toBe(true);
    expect(isAccessTokenUsable(jwt({ exp: sec(-3600_000) }), NOW)).toBe(false);
  });
  it('treats a token expiring within 30s as unusable (clock skew)', () => {
    expect(isAccessTokenUsable(jwt({ exp: sec(10_000) }), NOW)).toBe(false);
    expect(isAccessTokenUsable(jwt({ exp: sec(60_000) }), NOW)).toBe(true);
  });
  it('malformed or missing token is unusable', () => {
    expect(isAccessTokenUsable('garbage', NOW)).toBe(false);
    expect(isAccessTokenUsable('a.b.c', NOW)).toBe(false);
    expect(isAccessTokenUsable(undefined, NOW)).toBe(false);
  });
});

describe('isAccessTokenUsable token structure', () => {
  const [header, payload, signature] = jwt({ exp: sec(3600_000) }).split('.');

  it('accepts a complete unexpired header.payload.signature token', () => {
    expect(isAccessTokenUsable(`${header}.${payload}.${signature}`, NOW)).toBe(
      true
    );
  });

  it('rejects a token missing its signature segment and final separator', () => {
    expect(isAccessTokenUsable(`${header}.${payload}`, NOW)).toBe(false);
  });

  it('rejects a token with an empty signature segment', () => {
    expect(isAccessTokenUsable(`${header}.${payload}.`, NOW)).toBe(false);
  });

  it('rejects a token with an empty header segment', () => {
    expect(isAccessTokenUsable(`.${payload}.${signature}`, NOW)).toBe(false);
  });

  it('rejects a token with an empty payload segment', () => {
    expect(isAccessTokenUsable(`${header}..${signature}`, NOW)).toBe(false);
  });

  it('rejects a token with more than three segments', () => {
    expect(
      isAccessTokenUsable(`${header}.${payload}.${signature}.extra`, NOW)
    ).toBe(false);
    expect(isAccessTokenUsable(`${header}.${payload}.${signature}.`, NOW)).toBe(
      false
    );
  });

  it('a two-segment access token without a refresh token is no session', () => {
    expect(hasUsableSession({ accessToken: `${header}.${payload}` }, NOW)).toBe(
      false
    );
  });
});

describe('isAccessTokenUsable payload decoding', () => {
  const withRawPayload = (json: string) => {
    const bytes = new TextEncoder().encode(json);
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `eyJhbGciOiJIUzI1NiJ9.${b64}.sig`;
  };

  it('decodes base64url payloads that use - and _ and drop padding', () => {
    const token = withRawPayload(`{"exp":${sec(3600_000)},"n":"??>>~~"}`);
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(token.split('.')[1].length % 4).not.toBe(0);
    expect(isAccessTokenUsable(token, NOW)).toBe(true);
  });

  it('decodes a payload carrying non-ASCII UTF-8 text', () => {
    expect(
      isAccessTokenUsable(
        withRawPayload(`{"name":"Zoë 😀","exp":${sec(3600_000)}}`),
        NOW
      )
    ).toBe(true);
  });

  it('rejects a payload that is not JSON or not an object', () => {
    expect(isAccessTokenUsable(withRawPayload('not json'), NOW)).toBe(false);
    expect(isAccessTokenUsable(withRawPayload(`${sec(3600_000)}`), NOW)).toBe(
      false
    );
    expect(isAccessTokenUsable(withRawPayload('null'), NOW)).toBe(false);
    expect(isAccessTokenUsable(withRawPayload(`[${sec(3600_000)}]`), NOW)).toBe(
      false
    );
  });

  it('rejects an exp that is not a usable future time', () => {
    for (const exp of [0, -1, '', 'soon', true, null, {}, [sec(3600_000)]]) {
      expect(isAccessTokenUsable(jwt({ exp }), NOW)).toBe(false);
    }
  });

  it('accepts a numeric-string exp in the future', () => {
    expect(isAccessTokenUsable(jwt({ exp: String(sec(3600_000)) }), NOW)).toBe(
      true
    );
  });

  it('ignores exp supplied through __proto__ in the payload', () => {
    expect(
      isAccessTokenUsable(
        withRawPayload(`{"__proto__":{"exp":${sec(3600_000)}}}`),
        NOW
      )
    ).toBe(false);
    expect(({} as Record<string, unknown>).exp).toBeUndefined();
  });
});

describe('hasUsableSession', () => {
  it('expired access alone is signed out; with refresh stays in', () => {
    expect(hasUsableSession({ accessToken: expired }, NOW)).toBe(false);
    expect(
      hasUsableSession({ accessToken: expired, refreshToken: 'r' }, NOW)
    ).toBe(true);
    expect(hasUsableSession({ accessToken: fresh }, NOW)).toBe(true);
    expect(hasUsableSession({ refreshToken: 'r' }, NOW)).toBe(true);
    expect(hasUsableSession({}, NOW)).toBe(false);
  });
});

describe('owner reproduction: expired accessToken + guestSessionId, no refresh', () => {
  beforeEach(() => {
    clear();
    Cookies.set('accessToken', expired);
    Cookies.set('guestSessionId', 'guest-1');
    localStorage.setItem('user', '{"id":"u"}');
  });

  it('isUserLoggedIn is false and the stale session is cleared', () => {
    expect(isUserLoggedIn()).toBe(false);
    expect(Cookies.get('accessToken')).toBeUndefined();
    expect(localStorage.getItem('user')).toBeNull();
    expect(Cookies.get('guestSessionId')).toBe('guest-1');
  });

  it('a guest read sends X-Guest-Session-Id and no bearer', async () => {
    const config = await send('guest/stories/s1');
    expect(config.headers.get('X-Guest-Session-Id')).toBe('guest-1');
    expect(config.headers.get('Authorization')).toBeFalsy();
  });

  it('a non-guest endpoint sends the guest header and NO bearer', async () => {
    const config = await send('stories/x');
    expect(config.headers.get('X-Guest-Session-Id')).toBe('guest-1');
    expect(config.headers.get('Authorization')).toBeFalsy();
  });

  it('guest URLs strip an Authorization header set earlier (refresh retry)', async () => {
    seen = undefined;
    api.defaults.adapter = async (config) => {
      seen = config;
      return {
        data: { success: true, data: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    await api.get('guest/stories/s1', {
      headers: { Authorization: 'Bearer stale' },
    });
    const config = seen as unknown as InternalAxiosRequestConfig;
    expect(config.headers.get('Authorization')).toBeFalsy();
    expect(config.headers.get('X-Guest-Session-Id')).toBe('guest-1');
  });
});

describe('expired access token WITH a refresh token', () => {
  beforeEach(() => {
    clear();
    Cookies.set('accessToken', expired);
    Cookies.set('refreshToken', 'r');
    Cookies.set('guestSessionId', 'guest-1');
    localStorage.setItem('user', '{"id":"u"}');
  });
  it('stays signed in and is not cleared', () => {
    expect(isUserLoggedIn()).toBe(true);
    expect(Cookies.get('accessToken')).toBe(expired);
    expect(localStorage.getItem('user')).not.toBeNull();
  });
  it('non-guest requests keep the bearer so the refresh flow runs', async () => {
    const config = await send('stories/user/quota');
    expect(config.headers.get('Authorization')).toBe(`Bearer ${expired}`);
    expect(config.headers.get('X-Guest-Session-Id')).toBeFalsy();
  });
  it('guest endpoints still get the guest header, not the bearer', async () => {
    const config = await send('guest/stories/s1');
    expect(config.headers.get('X-Guest-Session-Id')).toBe('guest-1');
    expect(config.headers.get('Authorization')).toBeFalsy();
  });
});

describe('401 handling with a refresh token cookie', () => {
  const reject401 = () => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        data: { message: 'Unauthorized' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };
  };

  beforeEach(() => {
    clear();
    vi.restoreAllMocks();
    Cookies.set('accessToken', expired);
    Cookies.set('refreshToken', 'r');
    Cookies.set('guestSessionId', 'guest-1');
  });

  it('a guest endpoint 401 skips the refresh and keeps the session cookies', async () => {
    const refresh = vi
      .spyOn(axios, 'post')
      .mockRejectedValue(new Error('refresh rejected'));
    reject401();

    const error = await api.get('guest/stories/s1').catch((e: unknown) => e);

    expect(refresh).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(AxiosError);
    expect((error as AxiosError).response?.status).toBe(401);
    expect(Cookies.get('refreshToken')).toBe('r');
    expect(Cookies.get('accessToken')).toBe(expired);
  });

  it('a non-guest 401 still refreshes and retries with the new token', async () => {
    const renewed = jwt({ expiry: sec(3600_000) });
    const refresh = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { data: { jwt: renewed } } });
    let calls = 0;
    api.defaults.adapter = async (config) => {
      calls += 1;
      if (calls === 1) {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
          data: {},
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        });
      }
      seen = config;
      return {
        data: { success: true, data: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await api.get('stories/user/quota');

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen?.headers.get('Authorization')).toBe(`Bearer ${renewed}`);
  });
});

describe('valid access token', () => {
  it('sends the bearer on normal endpoints', async () => {
    clear();
    Cookies.set('accessToken', fresh);
    Cookies.set('guestSessionId', 'guest-1');
    const config = await send('stories/x');
    expect(config.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
    expect(config.headers.get('X-Guest-Session-Id')).toBeFalsy();
  });
});
