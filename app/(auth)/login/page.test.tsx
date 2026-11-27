// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ registrationData: null }),
}));
vi.mock('@/components/auth/oauth-buttons', () => ({
  OAuthButtons: () => null,
}));
vi.mock('@/lib/axios', () => ({ default: { post: vi.fn() } }));

import Page from './page';

describe('login page passwordless entry', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(cleanup);

  it('offers an email-me-a-code path next to the password form', () => {
    render(<Page />);
    expect(
      screen
        .getByRole('link', { name: /email me a code/i })
        .getAttribute('href')
    ).toBe('/login/code');
    expect(screen.getByRole('button', { name: /^login$/i })).toBeTruthy();
  });

  it('hides the entry once the backend reported the feature off, keeping password login', () => {
    sessionStorage.setItem('passwordlessUnavailable', '1');
    render(<Page />);
    expect(screen.queryByRole('link', { name: /email me a code/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeTruthy();
  });
});
