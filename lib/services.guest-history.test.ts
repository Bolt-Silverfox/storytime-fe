// @vitest-environment jsdom
import Cookies from 'js-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/axios', () => ({ default: { get } }));

import { getGuestHistoryService } from './services';

const jwtExpiringIn = (offsetMs: number) => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  const exp = Math.floor((Date.now() + offsetMs) / 1000);
  return `${b64({ alg: 'HS256' })}.${b64({ exp })}.sig`;
};

describe('getGuestHistoryService', () => {
  beforeEach(() => {
    get.mockReset();
    Cookies.remove('guestSessionId');
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
  });
  afterEach(() => {
    Cookies.remove('guestSessionId');
    Cookies.remove('accessToken');
  });

  it('returns the stories from GET guest/history for a guest session', async () => {
    Cookies.set('guestSessionId', 'sess-1');
    const stories = [{ storyId: 'a', title: 'A', lastAccessed: '2026-01-02' }];
    get.mockResolvedValue({ data: { stories } });
    expect(await getGuestHistoryService()).toEqual(stories);
    expect(get).toHaveBeenCalledWith('guest/history');
  });

  it('makes no request without a guest session', async () => {
    expect(await getGuestHistoryService()).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('makes no request for a logged-in user', async () => {
    Cookies.set('guestSessionId', 'sess-1');
    Cookies.set('accessToken', jwtExpiringIn(3600_000));
    expect(await getGuestHistoryService()).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads guest history when the only access token has expired', async () => {
    Cookies.set('guestSessionId', 'sess-1');
    Cookies.set('accessToken', jwtExpiringIn(-3600_000));
    get.mockResolvedValue({ data: { stories: [] } });
    expect(await getGuestHistoryService()).toEqual([]);
    expect(get).toHaveBeenCalledWith('guest/history');
  });
});
