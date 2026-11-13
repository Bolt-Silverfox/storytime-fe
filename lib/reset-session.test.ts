// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearResetSession,
  readResetSession,
  saveResetSession,
} from './reset-session';

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('reset session', () => {
  it('round-trips token and email', () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    expect(readResetSession()).toEqual({ token: '12345678', email: 'a@b.co' });
  });

  it('keeps the values across reads so a reload still works', () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    readResetSession();
    expect(readResetSession()).not.toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(readResetSession()).toBeNull();
  });

  it('returns null for malformed or incomplete stored data', () => {
    for (const bad of ['not json', '{}', '{"token":"1"}', '[]', 'null']) {
      window.sessionStorage.setItem('storytime.resetSession', bad);
      expect(readResetSession()).toBeNull();
    }
  });

  it('clears the stored values', () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    clearResetSession();
    expect(readResetSession()).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() =>
      saveResetSession({ token: '12345678', email: 'a@b.co' })
    ).not.toThrow();
    expect(readResetSession()).toBeNull();
    expect(() => clearResetSession()).not.toThrow();
  });
});
