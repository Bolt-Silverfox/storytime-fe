// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearResetSession,
  clearResetSessionIfUnchanged,
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

  it('reports a successful write', () => {
    expect(saveResetSession({ token: '12345678', email: 'a@b.co' })).toBe(true);
  });

  it('reports a failed write and drops the older session', () => {
    saveResetSession({ token: '11111111', email: 'old@b.co' });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveResetSession({ token: '22222222', email: 'new@b.co' })).toBe(
      false
    );
    expect(readResetSession()).toBeNull();
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
    expect(saveResetSession({ token: '12345678', email: 'a@b.co' })).toBe(
      false
    );
    expect(readResetSession()).toBeNull();
    expect(() => clearResetSession()).not.toThrow();
  });
  it('clears the stored session when it is still the one seen earlier', () => {
    saveResetSession({ token: '11111111', email: 'a@b.co' });
    clearResetSessionIfUnchanged({ token: '11111111', email: 'a@b.co' });
    expect(readResetSession()).toBeNull();
  });

  it('keeps a session saved after the one seen earlier', () => {
    saveResetSession({ token: '22222222', email: 'a@b.co' });
    clearResetSessionIfUnchanged({ token: '11111111', email: 'a@b.co' });
    expect(readResetSession()).toEqual({ token: '22222222', email: 'a@b.co' });
  });

  it('keeps a session saved when none was seen earlier', () => {
    saveResetSession({ token: '22222222', email: 'a@b.co' });
    clearResetSessionIfUnchanged(null);
    expect(readResetSession()).toEqual({ token: '22222222', email: 'a@b.co' });
  });
});
