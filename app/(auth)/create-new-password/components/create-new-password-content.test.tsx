// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readResetSession, saveResetSession } from '@/lib/reset-session';

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };
const resetPasswordService = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/lib/services', () => ({
  resetPasswordService: (...a: unknown[]) => resetPasswordService(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CreateNewPasswordContent } from './create-new-password-content';

const PASSWORD = 'Str0ng!Passw0rd';

beforeEach(() => {
  search = '';
  push.mockReset();
  replace.mockReset();
  resetPasswordService.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/create-new-password');
});
afterEach(cleanup);

async function submitNewPassword() {
  const [pw, confirm] = screen.getAllByPlaceholderText('Enter your password');
  fireEvent.change(pw, { target: { value: PASSWORD } });
  fireEvent.change(confirm, { target: { value: PASSWORD } });
  const button = screen.getByRole('button', { name: 'Change password' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
}

describe('CreateNewPasswordContent', () => {
  it('submits the token and email stored in sessionStorage', async () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    resetPasswordService.mockResolvedValue({ message: 'ok' });
    render(<CreateNewPasswordContent />);
    await submitNewPassword();
    await waitFor(() =>
      expect(resetPasswordService).toHaveBeenCalledWith({
        token: '12345678',
        email: 'a@b.co',
        newPassword: PASSWORD,
      })
    );
  });

  it('clears the stored values on success', async () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    resetPasswordService.mockResolvedValue({ message: 'ok' });
    render(<CreateNewPasswordContent />);
    await submitNewPassword();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/create-new-password/success')
    );
    expect(readResetSession()).toBeNull();
  });

  it('keeps the stored values when the reset fails so the user can retry or reload', async () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    resetPasswordService.mockRejectedValue(new Error('bad'));
    render(<CreateNewPasswordContent />);
    await submitNewPassword();
    await waitFor(() => expect(resetPasswordService).toHaveBeenCalled());
    expect(readResetSession()).toEqual({ token: '12345678', email: 'a@b.co' });
  });

  it('still works after a reload because reading does not consume the values', () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    const first = render(<CreateNewPasswordContent />);
    first.unmount();
    render(<CreateNewPasswordContent />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('Create new password')).toBeTruthy();
  });

  it('redirects a direct visit with nothing stored to /forgot-password', async () => {
    render(<CreateNewPasswordContent />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/forgot-password')
    );
    expect(toast.error).toHaveBeenCalledWith(
      'Start the reset again to continue.'
    );
  });

  it('ignores token and email in the query string and strips the query', async () => {
    search = 'token=99999999&email=x%40y.co';
    window.history.replaceState(
      null,
      '',
      '/create-new-password?token=99999999&email=x%40y.co'
    );
    render(<CreateNewPasswordContent />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/forgot-password')
    );
    expect(window.location.search).toBe('');
    expect(readResetSession()).toBeNull();
  });

  it('submits the reset once when the button is pressed twice in quick succession', async () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    resetPasswordService.mockReturnValue(new Promise(() => {}));
    render(<CreateNewPasswordContent />);
    const [pw, confirm] = screen.getAllByPlaceholderText('Enter your password');
    fireEvent.change(pw, { target: { value: PASSWORD } });
    fireEvent.change(confirm, { target: { value: PASSWORD } });
    const button = screen.getByRole('button', { name: 'Change password' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(resetPasswordService).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(resetPasswordService).toHaveBeenCalledTimes(1);
  });
  it('clears the stored values but does not navigate when the reset settles after the page has gone', async () => {
    saveResetSession({ token: '12345678', email: 'a@b.co' });
    let resolve: (v: { message: string }) => void = () => {};
    resetPasswordService.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { unmount } = render(<CreateNewPasswordContent />);
    await submitNewPassword();
    await waitFor(() => expect(resetPasswordService).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolve({ message: 'ok' });
    });
    expect(push).not.toHaveBeenCalled();
    expect(readResetSession()).toBeNull();
  });

  it('keeps a newer reset session saved while an older reset was still pending', async () => {
    saveResetSession({ token: '11111111', email: 'a@b.co' });
    let resolve: (v: { message: string }) => void = () => {};
    resetPasswordService.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { unmount } = render(<CreateNewPasswordContent />);
    await submitNewPassword();
    await waitFor(() =>
      expect(resetPasswordService).toHaveBeenCalledWith(
        expect.objectContaining({ token: '11111111' })
      )
    );
    unmount();
    saveResetSession({ token: '22222222', email: 'a@b.co' });
    await act(async () => {
      resolve({ message: 'ok' });
    });
    expect(push).not.toHaveBeenCalled();
    expect(readResetSession()).toEqual({ token: '22222222', email: 'a@b.co' });
  });
});
