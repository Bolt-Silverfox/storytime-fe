// @vitest-environment jsdom
import type { InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { beforeEach, describe, expect, it } from 'vitest';
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
