// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isUserLoggedIn } from '@/lib/services';

const clear = () => {
  for (const n of ['accessToken', 'refreshToken']) {
    document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
  localStorage.clear();
};

describe('isUserLoggedIn matches middleware (token cookie = signed in)', () => {
  beforeEach(clear);
  it('false for guests', () => expect(isUserLoggedIn()).toBe(false));
  it('false for stored user without tokens', () => {
    localStorage.setItem('user', '{"id":"u"}');
    expect(isUserLoggedIn()).toBe(false);
  });
  it('true for access cookie only', () => {
    document.cookie = 'accessToken=a; path=/';
    expect(isUserLoggedIn()).toBe(true);
  });
  it('true for refresh cookie only', () => {
    document.cookie = 'refreshToken=r; path=/';
    expect(isUserLoggedIn()).toBe(true);
  });
});
