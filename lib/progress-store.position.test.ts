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
    expect(getReadingPosition('a', 10)).toBeNull();
  });

  it('round-trips per story', () => {
    saveReadingPosition('a', 3, 10);
    saveReadingPosition('b', 7, 12);
    expect(getReadingPosition('a', 10)).toBe(3);
    expect(getReadingPosition('b', 12)).toBe(7);
  });

  it('ignores a saved position when the page count changed (story edited)', () => {
    saveReadingPosition('a', 3, 10);
    expect(getReadingPosition('a', 11)).toBeNull();
  });

  it('clamps and rejects bad values', () => {
    saveReadingPosition('a', 99, 10);
    expect(getReadingPosition('a', 10)).toBe(9);
    saveReadingPosition('a', -3, 10);
    expect(getReadingPosition('a', 10)).toBe(0);
  });

  it('survives corrupt storage', () => {
    window.localStorage.setItem('readerPositions', '{not json');
    expect(getReadingPosition('a', 10)).toBeNull();
    window.localStorage.setItem('readerPositions', '[1,2]');
    expect(getReadingPosition('a', 10)).toBeNull();
    saveReadingPosition('a', 2, 10);
    expect(getReadingPosition('a', 10)).toBe(2);
  });

  it('clear forgets the position', () => {
    saveReadingPosition('a', 3, 10);
    clearReadingPosition('a');
    expect(getReadingPosition('a', 10)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    expect(() => saveReadingPosition('a', 1, 5)).not.toThrow();
    spy.mockRestore();
  });
});
