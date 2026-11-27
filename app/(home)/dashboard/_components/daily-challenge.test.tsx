// @vitest-environment jsdom
import * as Sentry from '@sentry/nextjs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLogger } from '@/lib/logger';
import { getDailyChallengesService } from '@/lib/services';
import DailyChallenge from './daily-challenge';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/services', () => ({ getDailyChallengesService: vi.fn() }));

const sentry = vi.mocked(Sentry);

beforeEach(() => {
  configureLogger({ environment: 'production' });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  configureLogger({ environment: undefined });
});

describe('DailyChallenge', () => {
  it('reports an unreadable selected child without the stored data', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    localStorage.setItem('selectedKid', '{"id":"k1","name":Ada}');

    render(<DailyChallenge />);

    expect(
      await screen.findByText('Failed to load daily challenges')
    ).toBeTruthy();
    expect(getDailyChallengesService).not.toHaveBeenCalled();
    expect(
      sentry.captureException.mock.calls.length +
        sentry.captureMessage.mock.calls.length
    ).toBe(1);
    expect(
      JSON.stringify([
        sentry.captureException.mock.calls,
        sentry.captureMessage.mock.calls,
        sentry.addBreadcrumb.mock.calls,
        consoleError.mock.calls,
      ])
    ).not.toContain('Ada');
  });

  it('still reports a failed challenge request with its error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('selectedKid', '{"id":"k1","name":"Ada"}');
    vi.mocked(getDailyChallengesService).mockRejectedValue(new Error('boom'));

    render(<DailyChallenge />);

    expect(
      await screen.findByText('Failed to load daily challenges')
    ).toBeTruthy();
    expect(getDailyChallengesService).toHaveBeenCalledWith('k1');
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect((sentry.captureException.mock.calls[0][0] as Error).message).toBe(
      'boom'
    );
  });
});
