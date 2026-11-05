// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuotaWall from './quota-wall';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));

describe('QuotaWall', () => {
  afterEach(cleanup);

  it('guest: sign-up copy does not promise unlimited, says re-reads are free', () => {
    render(<QuotaWall isGuest />);
    expect(screen.getByText(/Sign up to read more stories/)).toBeTruthy();
    expect(screen.queryByText(/unlimited/i)).toBeNull();
    expect(
      screen.getByText(/Stories you've already read are still free\./)
    ).toBeTruthy();
    expect(screen.getByText('Sign up to read more')).toBeTruthy();
  });

  it('logged-in: upgrade copy, re-reads free, no sign-up link', () => {
    render(<QuotaWall isGuest={false} />);
    expect(screen.getByText(/Upgrade to premium/)).toBeTruthy();
    expect(
      screen.getByText(/Stories you've already read are still free\./)
    ).toBeTruthy();
    expect(screen.queryByText('Sign up to read more')).toBeNull();
  });
});
