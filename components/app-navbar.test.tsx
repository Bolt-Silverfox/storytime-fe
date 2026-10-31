// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getAllByText('Go to app').length).toBe(2); // desktop + mobile
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('cookie + stored user: shows Go to app', () => {
    document.cookie = 'accessToken=abc; path=/';
    localStorage.setItem('user', USER);
    render(<AppNavbar />);
    expect(screen.getAllByText('Go to app').length).toBe(2);
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('expired access token + valid refresh token: shows Go to app', () => {
    document.cookie = 'refreshToken=ref; path=/';
    render(<AppNavbar />);
    expect(screen.getAllByText('Go to app').length).toBe(2);
    expect(screen.queryByText('Login')).toBeNull();
  });

  it('stored user but no token cookies: treated as guest', () => {
    localStorage.setItem('user', USER);
    render(<AppNavbar />);
    expect(screen.getAllByText('Login').length).toBeGreaterThan(0);
    expect(screen.queryByText('Go to app')).toBeNull();
  });

  it('server render (auth unknown) shows neither Login/Get started nor Go to app as visible links', () => {
    const html = renderToString(<AppNavbar />);
    expect(html).not.toContain('Go to app');
    expect(html).not.toMatch(/href="\/(login|register)"/);
  });
});
