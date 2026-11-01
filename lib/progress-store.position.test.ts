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

  it('keeps positions separate per reader identity (guest vs signed in)', async () => {
    const services = await import('@/lib/services');
    saveReadingPosition('a', 3, 10, 'sig');
    // a different guest session
    document.cookie = 'guestSessionId=other-guest; path=/';
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    // signed in: not the guest's position either
    vi.mocked(services.isUserLoggedIn).mockReturnValue(true);
    expect(getReadingPosition('a', 10, 'sig')).toBeNull();
    saveReadingPosition('a', 6, 10, 'sig');
    expect(getReadingPosition('a', 10, 'sig')).toBe(6);
    vi.mocked(services.isUserLoggedIn).mockReturnValue(false);
    document.cookie =
      'guestSessionId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    expect(getReadingPosition('a', 10, 'sig')).toBe(3);
  });
});
