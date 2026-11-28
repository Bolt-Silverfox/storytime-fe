import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldsMatching } from '@/test/fields-matching';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => ({})),
}));

import { configureLogger } from './logger';
import { getUserFromStorage } from './services';

const sentry = vi.mocked(Sentry);

beforeEach(() => {
  configureLogger({ environment: 'production' });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  configureLogger({ environment: undefined });
});

describe('getUserFromStorage', () => {
  it('reports an unreadable stored profile without its contents', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    localStorage.setItem('user', '{"id":"u1","name":Ada}');

    expect(getUserFromStorage()).toBeNull();

    expect(
      sentry.captureException.mock.calls.length +
        sentry.captureMessage.mock.calls.length
    ).toBe(1);
    expect(
      fieldsMatching(
        [
          sentry.captureException.mock.calls,
          sentry.captureMessage.mock.calls,
          sentry.addBreadcrumb.mock.calls,
          consoleError.mock.calls,
        ],
        'Ada'
      )
    ).toEqual([]);
  });

  it('returns the stored profile when it parses', () => {
    localStorage.setItem('user', '{"id":"u1","name":"Ada"}');
    expect(getUserFromStorage()).toEqual({ id: 'u1', name: 'Ada' });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
