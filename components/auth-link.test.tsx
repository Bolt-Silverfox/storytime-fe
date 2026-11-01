// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthLink } from './auth-link';

const setCookie = (v: string) => {
  document.cookie = v;
};
const clear = () => {
  for (const n of ['accessToken', 'refreshToken']) {
    setCookie(`${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`);
  }
};

describe('AuthLink', () => {
  beforeEach(clear);
  afterEach(cleanup);

  it('guest: guest href and label, visible', () => {
    render(
      <AuthLink href='/register' signedInChildren='Go to app'>
        Get started
      </AuthLink>
    );
    const a = screen.getByText('Get started');
    expect(a.getAttribute('href')).toBe('/register');
    expect(a.className).not.toContain('invisible');
  });

  it('signed in + relabel: Go to app -> /dashboard', () => {
    setCookie('refreshToken=r; path=/');
    render(
      <AuthLink href='/register' signedInChildren='Go to app'>
        Get started
      </AuthLink>
    );
    expect(screen.queryByText('Get started')).toBeNull();
    expect(screen.getByText('Go to app').getAttribute('href')).toBe(
      '/dashboard'
    );
  });

  it('signed in, same label: keeps label, href swaps to /dashboard', () => {
    setCookie('accessToken=a; path=/');
    render(<AuthLink href='/register'>Start listening</AuthLink>);
    expect(screen.getByText('Start listening').getAttribute('href')).toBe(
      '/dashboard'
    );
  });

  it('server render (unknown): relabelled CTA is hidden, same-label CTA stays visible', () => {
    const relabelled = renderToString(
      <AuthLink href='/register' signedInChildren='Go to app'>
        Get started
      </AuthLink>
    );
    expect(relabelled).toContain('auth-pending invisible');
    expect(relabelled).toContain('Get started');
    const same = renderToString(
      <AuthLink href='/register'>Start listening</AuthLink>
    );
    expect(same).not.toContain('invisible');
    expect(same).toContain('href="/register"');
  });
});
