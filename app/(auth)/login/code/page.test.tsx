// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AxiosError } from 'axios';
import Cookies from 'js-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/axios', () => ({ default: { post: mocks.post } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));

import Page from './page';

const EMAIL = 'parent@example.com';
const CODE = '482913';

const loginBody = (extra: Record<string, unknown> = {}) => ({
  data: {
    jwt: 'jwt-1',
    refreshToken: 'refresh-1',
    user: { id: 'u1', email: EMAIL },
    isNewUser: false,
    ...extra,
  },
});

const requestOk = {
  data: { message: 'ok', expiresInSeconds: 600, resendAfterSeconds: 60 },
};

const httpError = (status: number) =>
  new AxiosError('x', 'ERR_BAD_REQUEST', undefined, {}, {
    status,
    data: { message: 'Invalid or expired code' },
  } as never);
const networkError = () =>
  new AxiosError('Network Error', 'ERR_NETWORK', undefined, {});

let client: QueryClient;

const renderPage = () => {
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
};

const submitEmail = async () => {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: EMAIL },
  });
  fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
  await screen.findByText(/enter the 6-digit code/i);
};

const otpInput = () => screen.getByTestId('otp-input') as HTMLInputElement;
const typeCode = (value = CODE) =>
  fireEvent.change(otpInput(), { target: { value } });

describe('passwordless code page', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    for (const name of Object.keys(Cookies.get())) {
      Cookies.remove(name);
    }
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('idle: shows the email step with the terms and privacy notice', () => {
    renderPage();
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.getByText(/By continuing you agree to the/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /terms/i }).getAttribute('href')
    ).toBe('/terms-and-conditions');
    expect(
      screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')
    ).toBe('/privacy-policy');
    expect(
      (
        screen.getByRole('button', {
          name: /email me a code/i,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('requests a code with the email and moves to the code step', async () => {
    mocks.post.mockResolvedValueOnce(requestOk);
    renderPage();
    await submitEmail();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('auth/passwordless/request', {
      email: EMAIL,
    });
    expect(otpInput().getAttribute('autocomplete')).toBe('one-time-code');
    expect(otpInput().getAttribute('inputmode')).toBe('numeric');
  });

  it('disables resend during the 60 s countdown and enables it after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.post.mockResolvedValueOnce(requestOk);
    renderPage();
    await submitEmail();
    const resend = () =>
      screen.getByRole('button', { name: /resend code/i }) as HTMLButtonElement;
    expect(resend().disabled).toBe(true);
    expect(resend().textContent).toMatch(/60/);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(resend().textContent).toMatch(/30/);
    expect(resend().disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(resend().disabled).toBe(false);
    mocks.post.mockResolvedValueOnce(requestOk);
    fireEvent.click(resend());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(resend().disabled).toBe(true);
  });

  it('signs in like password login and refreshes quota, history and stories state', async () => {
    Cookies.set('guestSessionId', 'guest-1');
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockResolvedValueOnce(loginBody());
    renderPage();
    await submitEmail();
    typeCode();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.post).toHaveBeenLastCalledWith(
      'auth/passwordless/verify',
      { email: EMAIL, code: CODE },
      { headers: { 'X-Guest-Session-Id': 'guest-1' } }
    );
    expect(Cookies.get('accessToken')).toBe('jwt-1');
    expect(Cookies.get('refreshToken')).toBe('refresh-1');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').id).toBe('u1');
    const keys = (
      client.invalidateQueries as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        '["story-quota"]',
        '["guest-history"]',
        '["stories"]',
      ])
    );
  });

  it('new user: shows the setup notice and routes into account setup', async () => {
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockResolvedValueOnce(loginBody({ isNewUser: true }));
    renderPage();
    await submitEmail();
    typeCode();
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/register/setup')
    );
    expect(mocks.success).toHaveBeenCalledWith(
      'Welcome! Finish setting up your account'
    );
    expect(mocks.push).not.toHaveBeenCalledWith('/dashboard');
  });

  it('existing user is not sent to setup, whatever onboardingStatus says', async () => {
    mocks.post.mockResolvedValueOnce(requestOk).mockResolvedValueOnce(
      loginBody({
        isNewUser: false,
        user: { id: 'u1', onboardingStatus: 'email_verified' },
      })
    );
    renderPage();
    await submitEmail();
    typeCode();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.push).not.toHaveBeenCalledWith('/register/setup');
  });

  it('wrong, expired or locked code: one message, no server text, new code offered after the countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockRejectedValueOnce(httpError(400));
    renderPage();
    await submitEmail();
    typeCode();
    await screen.findByText(/That code didn't work/);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(Cookies.get('accessToken')).toBeUndefined();
    expect(screen.queryByText(/Invalid or expired code/)).toBeNull();
    expect(mocks.error).not.toHaveBeenCalled();
    const again = () =>
      screen.getByRole('button', {
        name: /(email me a new code|resend code)/i,
      }) as HTMLButtonElement;
    expect(again().disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(again().textContent).toMatch(/email me a new code/i);
    mocks.post.mockResolvedValueOnce(requestOk);
    fireEvent.click(again());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(3));
    expect(mocks.post).toHaveBeenLastCalledWith('auth/passwordless/request', {
      email: EMAIL,
    });
    expect(screen.queryByText(/That code didn't work/)).toBeNull();
  });

  it('honours resendAfterSeconds from the response', async () => {
    mocks.post.mockResolvedValueOnce({
      data: { message: 'ok', expiresInSeconds: 600, resendAfterSeconds: 45 },
    });
    renderPage();
    await submitEmail();
    expect(
      screen.getByRole('button', { name: /resend code/i }).textContent
    ).toMatch(/45/);
  });

  it('two resend clicks in one tick send one request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.post.mockResolvedValueOnce(requestOk);
    renderPage();
    await submitEmail();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    let resolve: (v: unknown) => void = () => {};
    mocks.post.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    const resend = screen.getByRole('button', { name: /resend code/i });
    await act(async () => {
      resend.click();
      resend.click();
    });
    expect(mocks.post).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve(requestOk);
    });
  });

  it('429 on verify: asks the user to wait', async () => {
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockRejectedValueOnce(httpError(429));
    renderPage();
    await submitEmail();
    typeCode();
    await screen.findByText(/too many attempts/i);
    expect(screen.queryByText(/That code didn't work/)).toBeNull();
  });

  it('never shows server error text or an error toast on request failure', async () => {
    mocks.post.mockRejectedValueOnce(httpError(500));
    renderPage();
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    await screen.findByText(/something went wrong/i);
    expect(screen.queryByText(/Invalid or expired code/)).toBeNull();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('429 on request: asks the user to wait and stays on the email step', async () => {
    mocks.post.mockRejectedValueOnce(httpError(429));
    renderPage();
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    await screen.findByText(/too many attempts/i);
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
  });

  it('network error on verify: shows a connection message and allows retry', async () => {
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(loginBody());
    renderPage();
    await submitEmail();
    typeCode();
    await screen.findByText(/couldn't reach storytime/i);
    typeCode('111111');
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
  });

  it('404 on request: shows a neutral not-available message and remembers it for the session', async () => {
    mocks.post.mockRejectedValueOnce(httpError(404));
    renderPage();
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    await screen.findByText(/isn't available right now/i);
    expect(
      screen.getByRole('link', { name: /password/i }).getAttribute('href')
    ).toBe('/login');
    expect(sessionStorage.getItem('passwordlessUnavailable')).toBe('1');
  });

  it('paste fills all six boxes and submits once', async () => {
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockResolvedValueOnce(loginBody());
    renderPage();
    await submitEmail();
    fireEvent.paste(otpInput(), {
      clipboardData: { getData: () => '482 913' },
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    const verifyCalls = mocks.post.mock.calls.filter(
      (c) => c[0] === 'auth/passwordless/verify'
    );
    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0][1]).toEqual({ email: EMAIL, code: CODE });
  });

  it('ignores a second submit while the first is in flight', async () => {
    let resolve: (v: unknown) => void = () => {};
    mocks.post.mockResolvedValueOnce(requestOk).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    renderPage();
    await submitEmail();
    typeCode();
    const button = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        mocks.post.mock.calls.filter((c) => c[0] === 'auth/passwordless/verify')
      ).toHaveLength(1)
    );
    expect((button as HTMLButtonElement).disabled).toBe(true);
    resolve(loginBody());
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it('never writes the email or code to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {})
    );
    mocks.post
      .mockResolvedValueOnce(requestOk)
      .mockRejectedValueOnce(httpError(400));
    renderPage();
    await submitEmail();
    typeCode();
    await screen.findByText(/That code didn't work/);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(CODE);
    expect(logged).not.toContain(EMAIL);
  });
});
