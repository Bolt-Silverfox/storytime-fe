// @vitest-environment jsdom
import Cookies from 'js-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/axios', () => ({ default: { get } }));

import { getGuestHistoryService } from './services';

describe('getGuestHistoryService', () => {
  beforeEach(() => {
    get.mockReset();
    Cookies.remove('guestSessionId');
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
  });
  afterEach(() => {
    Cookies.remove('guestSessionId');
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
    Cookies.set('accessToken', 'tok');
    expect(await getGuestHistoryService()).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
});
