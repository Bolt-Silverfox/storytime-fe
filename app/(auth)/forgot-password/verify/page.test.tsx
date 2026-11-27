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

const push = vi.hoisted(() => vi.fn());
const validate = vi.hoisted(() => vi.fn());
const requestReset = vi.hoisted(() => vi.fn());
const sendVerification = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ registrationData: { email: 'kid@example.com' } }),
}));
vi.mock('@/lib/services', () => ({
  sendVerificationEmailService: sendVerification,
  requestPasswordResetService: requestReset,
  validateResetTokenService: validate,
}));

import Page from './page';

const input = () => document.querySelector('input') as HTMLInputElement;
const submit = () =>
  screen.getByRole('button', { name: /proceed|verify email/i });

describe('forgot-password verify page', () => {
  beforeEach(() => {
    push.mockReset();
    window.sessionStorage.clear();
    validate.mockReset();
    validate.mockResolvedValue({ message: 'ok' });
    requestReset.mockReset();
    requestReset.mockResolvedValue({ message: 'sent' });
    sendVerification.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    document.elementFromPoint = () => null;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function enterCode(code: string) {
    fireEvent.change(input(), { target: { value: code } });
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(false)
    );
  }

  it('renders 8 slots', () => {
    render(<Page />);
    expect(
      document.querySelectorAll('[data-slot="input-otp-slot"]')
    ).toHaveLength(8);
  });

  it.each([
    ['12345', true],
    ['123456', false],
    ['1234567', true],
    ['12345678', false],
  ])('submit disabled for %s: %s', async (code, disabled) => {
    render(<Page />);
    fireEvent.change(input(), { target: { value: code } });
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(disabled)
    );
  });

  it.each(['00123456', '001234'])(
    'submits %s as a string and keeps leading zeros in the stored session',
    async (code) => {
      render(<Page />);
      fireEvent.change(input(), { target: { value: code } });
      await waitFor(() =>
        expect((submit() as HTMLButtonElement).disabled).toBe(false)
      );
      fireEvent.click(submit());
      await waitFor(() => expect(validate).toHaveBeenCalled());
      expect(validate).toHaveBeenCalledWith({
        token: code,
        email: 'kid@example.com',
      });
      await waitFor(() => expect(push).toHaveBeenCalled());
      expect(push).toHaveBeenCalledWith('/create-new-password');
      expect(readResetSession()).toEqual({
        token: code,
        email: 'kid@example.com',
      });
    }
  );

  it('strips whitespace and non-digits typed into the field', async () => {
    render(<Page />);
    fireEvent.change(input(), { target: { value: '00 12-34' } });
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(submit());
    await waitFor(() =>
      expect(validate).toHaveBeenCalledWith({
        token: '001234',
        email: 'kid@example.com',
      })
    );
  });

  it('strips whitespace and non-digits from a pasted code', async () => {
    render(<Page />);
    input().focus();
    fireEvent.paste(input(), {
      clipboardData: { getData: () => ' 00 12-34\n56 ' },
    });
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(submit());
    await waitFor(() =>
      expect(validate).toHaveBeenCalledWith({
        token: '00123456',
        email: 'kid@example.com',
      })
    );
  });

  it('stores nothing and does not navigate when the code is rejected', async () => {
    validate.mockRejectedValue(new Error('invalid'));
    render(<Page />);
    fireEvent.change(input(), { target: { value: '12345678' } });
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(submit());
    await waitFor(() => expect(validate).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(readResetSession()).toBeNull();
  });

  it('stays on the page with a storage error when the session cannot be saved', async () => {
    saveResetSession({ token: '11111111', email: 'old@example.com' });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(<Page />);
    await enterCode('12345678');
    fireEvent.click(submit());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(readResetSession()).toBeNull();
    expect(input()).toBeTruthy();
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/storage/i);
  });

  it('validates the code once when submitted twice in quick succession', async () => {
    validate.mockReturnValue(new Promise(() => {}));
    render(<Page />);
    await enterCode('12345678');
    fireEvent.click(submit());
    fireEvent.click(submit());
    await waitFor(() => expect(validate).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('resends a password reset code, not an email verification code', async () => {
    vi.useFakeTimers();
    render(<Page />);
    for (let i = 0; i < 60; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    const resend = screen.getByRole('button', { name: 'Resend OTP' });
    expect((resend as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(resend);
    });
    expect(requestReset).toHaveBeenCalledWith('kid@example.com');
    expect(sendVerification).not.toHaveBeenCalled();
  });

  it('requests one new code when Resend is pressed twice before the first request returns', async () => {
    vi.useFakeTimers();
    requestReset.mockReturnValue(new Promise(() => {}));
    render(<Page />);
    for (let i = 0; i < 60; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    const resend = screen.getByRole('button', { name: 'Resend OTP' });
    fireEvent.click(resend);
    fireEvent.click(resend);
    await act(async () => {});
    expect(requestReset).toHaveBeenCalledTimes(1);
  });
});
