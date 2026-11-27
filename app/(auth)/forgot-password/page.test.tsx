// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readResetSession, saveResetSession } from '@/lib/reset-session';

const push = vi.hoisted(() => vi.fn());
const requestReset = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ registrationData: null, setRegistrationData: vi.fn() }),
}));
vi.mock('@/lib/services', () => ({
  requestPasswordResetService: requestReset,
}));

import Page from './page';

async function requestCodeFor(email: string) {
  fireEvent.change(screen.getByPlaceholderText('Enter your email address'), {
    target: { value: email },
  });
  const proceed = screen.getByRole('button', { name: 'Proceed' });
  await waitFor(() => expect(proceed.hasAttribute('disabled')).toBe(false));
  fireEvent.click(proceed);
}

describe('forgot-password page', () => {
  beforeEach(() => {
    push.mockReset();
    requestReset.mockReset();
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it('drops a reset session left from an earlier request once a new code is sent', async () => {
    saveResetSession({ token: '11111111', email: 'old@example.com' });
    requestReset.mockResolvedValue({ message: 'sent' });
    render(<Page />);
    await requestCodeFor('new@example.com');
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/forgot-password/verify')
    );
    expect(requestReset).toHaveBeenCalledWith('new@example.com');
    expect(readResetSession()).toBeNull();
  });

  it('requests one code when Proceed is pressed twice in quick succession', async () => {
    requestReset.mockReturnValue(new Promise(() => {}));
    render(<Page />);
    await requestCodeFor('new@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));
    await waitFor(() => expect(requestReset).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(requestReset).toHaveBeenCalledTimes(1);
  });
  it('does not navigate when the request settles after the page has gone, but still drops the old session', async () => {
    saveResetSession({ token: '11111111', email: 'old@example.com' });
    let resolve: (v: { message: string }) => void = () => {};
    requestReset.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { unmount } = render(<Page />);
    await requestCodeFor('new@example.com');
    await waitFor(() => expect(requestReset).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolve({ message: 'sent' });
    });
    expect(push).not.toHaveBeenCalled();
    expect(readResetSession()).toBeNull();
  });
});
