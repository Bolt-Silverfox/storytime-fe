import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services', () => ({
  getCompletedStoriesService: vi.fn(async () => []),
  getInProgressStoriesService: vi.fn(async () => []),
  isUserLoggedIn: vi.fn(() => false),
  recordUserProgressService: vi.fn(async () => undefined),
}));

import {
  clearReadingPosition,
  getReadingPosition,
  saveReadingPosition,
} from './progress-store';

describe('reading position persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null for a story never opened', () => {
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
  });

  it('round-trips per story', () => {
    saveReadingPosition('a', 3, 10, 'sig');
    saveReadingPosition('b', 7, 12, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(3);
    expect(getReadingPosition('b', 12, 'sig')).toBe(7);
  });

  it('ignores a saved position when the page count changed (story edited)', () => {
    saveReadingPosition('a', 3, 10, 'sig');
    expect(getReadingPosition('a', 11)).toBeNull();
  });

  it('clamps and rejects bad values', () => {
    saveReadingPosition('a', 99, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(9);
    saveReadingPosition('a', -3, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(0);
  });

  it('survives corrupt storage', () => {
    window.localStorage.setItem('readerPositions', '{not json');
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    window.localStorage.setItem('readerPositions', '[1,2]');
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    saveReadingPosition('a', 2, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(2);
  });

  it('clear forgets the position', () => {
    saveReadingPosition('a', 3, 10, 'sig');
    clearReadingPosition('a');
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    expect(() => saveReadingPosition('a', 1, 5, 'sig')).not.toThrow();
    spy.mockRestore();
  });

  it('ignores a saved position when the text changed but the count did not', () => {
    saveReadingPosition('a', 3, 10, 'sig-old');
    expect(getReadingPosition('a', 10, 'sig-new')).toBeNull();
    expect(getReadingPosition('a', 10, 'sig-old')).toBe(3);
  });

  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // Same shape as the backend's access token (no `sub`).
  const beToken = (userId: string) =>
    `${b64({ alg: 'HS256' })}.${b64({ id: userId, userId, email: `${userId}@x.test`, userRole: 'parent', expiry: 1, authSessionId: 's' })}.sig`;
  const clearCookie = (n: string) => {
    document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  };

  const signIn = async (token?: string, refresh = 'abcdef0123') => {
    const services = await import('@/lib/services');
    vi.mocked(services.isUserLoggedIn).mockReturnValue(true);
    if (token) {
      document.cookie = `accessToken=${token}; path=/`;
    }
    document.cookie = `refreshToken=${refresh}; path=/`;
  };
  const signOut = async () => {
    const services = await import('@/lib/services');
    vi.mocked(services.isUserLoggedIn).mockReturnValue(false);
    clearCookie('accessToken');
    clearCookie('refreshToken');
  };

  it('keeps guest sessions separate', () => {
    document.cookie = 'guestSessionId=g1; path=/';
    saveReadingPosition('a', 3, 10, 'sig');
    document.cookie = 'guestSessionId=g2; path=/';
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    document.cookie = 'guestSessionId=g1; path=/';
    expect(getReadingPosition('a', 10, 'sig')).toBe(3);
    clearCookie('guestSessionId');
  });

  it('keeps two signed-in users apart using the backend token userId', async () => {
    await signIn(beToken('alice'));
    saveReadingPosition('a', 7, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(7);
    await signIn(beToken('bob'));
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    saveReadingPosition('a', 2, 10, 'sig');
    await signIn(beToken('alice'));
    expect(getReadingPosition('a', 10, 'sig')).toBe(7);
    await signOut();
  });

  it('falls back to `id` when the token has no userId', async () => {
    const tok = (id: string) => `${b64({})}.${b64({ id })}.sig`;
    await signIn(tok('u1'));
    saveReadingPosition('a', 4, 10, 'sig');
    await signIn(tok('u2'));
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    await signOut();
  });

  it('does not share a key when the signed-in identity is unknown (refresh cookie only)', async () => {
    await signIn(undefined, 'deadbeefcafe');
    saveReadingPosition('a', 5, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    expect(window.localStorage.getItem('readerPositions')).toBeNull();
    await signOut();
  });

  it('uses the stored user object when only the refresh cookie is left', async () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 'carol' }));
    await signIn(undefined, 'deadbeefcafe');
    saveReadingPosition('a', 5, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(5);
    window.localStorage.setItem('user', JSON.stringify({ id: 'dave' }));
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    await signOut();
  });

  it('prunes to 200 entries (oldest first) and drops legacy bare keys', () => {
    window.localStorage.setItem(
      'readerPositions',
      JSON.stringify({ 'old-bare-id': { page: 1, count: 5 } })
    );
    for (let i = 0; i < 210; i += 1) {
      saveReadingPosition(`s${i}`, 1, 5, 'sig');
    }
    const map = JSON.parse(window.localStorage.getItem('readerPositions') ?? '{}');
    expect(Object.keys(map).length).toBe(200);
    expect('old-bare-id' in map).toBe(false);
    expect(getReadingPosition('s0', 5, 'sig')).toBeNull();
    expect(getReadingPosition('s209', 5, 'sig')).toBe(1);
  });
});
