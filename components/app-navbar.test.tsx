// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { AppNavbar } from './app-navbar';

const clearCookies = () => {
  for (const name of ['accessToken', 'refreshToken']) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

const USER = JSON.stringify({ id: 'u1', email: 'a@b.c' });

describe('AppNavbar auth state', () => {
  beforeEach(() => {
    clearCookies();
    localStorage.clear();
  });
  afterEach(cleanup);

  it('guest (no cookie, no user): shows Login and Get started', () => {
    render(<AppNavbar />);
    expect(screen.getAllByText('Login').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Get started').length).toBeGreaterThan(0);
    expect(screen.queryByText('Go to app')).toBeNull();
  });

  it('cookie only (no stored user): shows Go to app, never Login/Get started', () => {
    document.cookie = 'accessToken=abc; path=/';
    render(<AppNavbar />);
    expect(screen.getAllByText('Go to app').length).toBe(1); // desktop
    fireEvent.click(screen.getByLabelText('Toggle menu'));
    expect(screen.getAllByText('Go to app').length).toBe(2); // + mobile menu
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('cookie + stored user: shows Go to app', () => {
    document.cookie = 'accessToken=abc; path=/';
    localStorage.setItem('user', USER);
    render(<AppNavbar />);
    expect(screen.getAllByText('Go to app').length).toBe(1);
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('expired access token + valid refresh token: shows Go to app', () => {
    document.cookie = 'refreshToken=ref; path=/';
    render(<AppNavbar />);
    expect(screen.getAllByText('Go to app').length).toBe(1);
    expect(screen.queryByText('Login')).toBeNull();
  });

  it('stored user but no token cookies: treated as guest', () => {
    localStorage.setItem('user', USER);
    render(<AppNavbar />);
    expect(screen.getAllByText('Login').length).toBeGreaterThan(0);
    expect(screen.queryByText('Go to app')).toBeNull();
  });

  it('server render (auth unknown): no Go to app, guest buttons hidden, no-JS fallback present', () => {
    const html = renderToString(<AppNavbar />);
    expect(html).not.toContain('Go to app');
    expect(html).toMatch(
      /class="[^"]*\bauth-pending invisible\b[^"]*"><a[^>]*href="\/login"/
    );
    expect(html).toContain(
      '<noscript><style>.auth-pending{visibility:visible!important}</style></noscript>'
    );
  });

  it('reserves the guest-button width in the slot so the theme toggle never shifts', () => {
    // jsdom has no layout; measured in a real browser (toggle x identical for
    // unknown, guest and signed-in). This guards the class that does it.
    for (const cookie of [null, 'refreshToken=r; path=/']) {
      if (cookie) {
        document.cookie = cookie;
      }
      const { container, unmount } = render(<AppNavbar />);
      expect(container.querySelector('.min-w-\\[272px\\]')).not.toBeNull();
      unmount();
    }
  });
});
