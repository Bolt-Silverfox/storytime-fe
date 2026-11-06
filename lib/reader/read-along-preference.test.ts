// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getReadAlongDefault,
  READ_ALONG_DEFAULT_KEY,
  setReadAlongDefault,
  subscribeReadAlongDefault,
} from './read-along-preference';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('read-along preference', () => {
  it('defaults to on when nothing is stored', () => {
    expect(getReadAlongDefault()).toBe(true);
  });

  it('persists and reads back false and true', () => {
    setReadAlongDefault(false);
    expect(localStorage.getItem(READ_ALONG_DEFAULT_KEY)).toBe('false');
    expect(getReadAlongDefault()).toBe(false);
    setReadAlongDefault(true);
    expect(getReadAlongDefault()).toBe(true);
  });

  it('falls back to on for an unrecognised stored value', () => {
    localStorage.setItem(READ_ALONG_DEFAULT_KEY, 'garbage');
    expect(getReadAlongDefault()).toBe(true);
  });

  it('falls back to on when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getReadAlongDefault()).toBe(true);
  });

  it('does not throw when writing storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setReadAlongDefault(false)).not.toThrow();
  });

  it('notifies subscribers on set and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReadAlongDefault(listener);
    setReadAlongDefault(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setReadAlongDefault(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
