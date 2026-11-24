// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuotaIndicator from './quota-indicator';

const st = vi.hoisted(() => ({ loggedIn: false }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock('@/lib/hooks/use-story-quota', () => ({
  useStoryQuota: () => ({
    quota: { remaining: 0, totalAllowed: 3, unlimited: false },
  }),
}));
vi.mock('@/lib/services', () => ({ isUserLoggedIn: () => st.loggedIn }));

describe('QuotaIndicator banner when out of quota', () => {
  afterEach(cleanup);

  it('guest: says re-reading is free and offers sign-up', () => {
    st.loggedIn = false;
    render(<QuotaIndicator variant='banner' />);
    expect(
      screen.getByText(/Stories you've already read are still free\./)
    ).toBeTruthy();
    expect(screen.getByText('Sign up to read more')).toBeTruthy();
  });

  it('logged-in: says re-reading is free and offers upgrade', () => {
    st.loggedIn = true;
    render(<QuotaIndicator variant='banner' />);
    expect(
      screen.getByText(/Stories you've already read are still free\./)
    ).toBeTruthy();
    expect(screen.getByText('Upgrade in the app')).toBeTruthy();
  });
});
