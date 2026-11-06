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
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/axios', () => ({
  default: { post: mocks.post, get: mocks.get },
}));
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

const TOKEN = 'Zk3_-'.repeat(8) + 'Zk3';

const loginBody = (extra: Record<string, unknown> = {}) => ({
  data: {
    jwt: 'jwt-1',
    refreshToken: 'refresh-1',
    user: { id: 'u1' },
    isNewUser: false,
    ...extra,
  },
});
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

const openLink = (hash: string) => {
  window.history.replaceState(null, '', `/auth/magic${hash}`);
};

describe('magic link page', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) {
      m.mockReset();
    }
    localStorage.clear();
    for (const name of Object.keys(Cookies.get())) {
      Cookies.remove(name);
    }
    openLink(`#t=${TOKEN}`);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('makes no network request on load and strips the fragment', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderPage();
    await screen.findByRole('button', { name: /continue/i });
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(replaceState).toHaveBeenCalled();
    expect(screen.getByText(/signed in on this device/i)).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it('still offers the confirm button under React StrictMode double effects', async () => {
    client = new QueryClient();
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <Page />
        </QueryClientProvider>
      </StrictMode>
    );
    await screen.findByRole('button', { name: /continue/i });
    expect(screen.queryByText(/link didn't work/i)).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('posts the token once, in the body only, when the button is clicked', async () => {
    mocks.post.mockResolvedValueOnce(loginBody());
    renderPage();
    const button = await screen.findByRole('button', { name: /continue/i });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = mocks.post.mock.calls[0];
    expect(url).toBe('auth/passwordless/consume');
    expect(body).toEqual({ token: TOKEN });
    expect(JSON.stringify(config ?? {})).not.toContain(TOKEN);
    expect(url).not.toContain(TOKEN);
    expect(Cookies.get('accessToken')).toBe('jwt-1');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').id).toBe('u1');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('forwards the guest session and refreshes quota, history and stories state', async () => {
    Cookies.set('guestSessionId', 'guest-1');
    mocks.post.mockResolvedValueOnce(loginBody());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][2]).toEqual({
      headers: { 'X-Guest-Session-Id': 'guest-1' },
    });
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
    mocks.post.mockResolvedValueOnce(loginBody({ isNewUser: true }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/register/setup')
    );
    expect(mocks.success).toHaveBeenCalledWith(
      'Welcome! Finish setting up your account'
    );
  });

  it.each([
    ['missing', ''],
    ['empty', '#t='],
    ['malformed', '#t=short'],
    ['wrong key', `#x=${TOKEN}`],
    ['token after another key', `#a=1&t=${TOKEN}`],
    ['extra keys after token', `#t=${TOKEN}&a=1`],
    ['token with trailing text', `#t=${TOKEN}x`],
  ])(
    '%s token: friendly error, new-code link, no request',
    async (_n, hash) => {
      openLink(hash);
      renderPage();
      await screen.findByText(/link didn't work/i);
      expect(
        screen
          .getByRole('link', { name: /request a new code/i })
          .getAttribute('href')
      ).toBe('/login/code');
      expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
      expect(mocks.post).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('');
    }
  );

  it('already signed in: says so, links home, does not offer the token', async () => {
    Cookies.set('accessToken', 'existing');
    renderPage();
    await screen.findByText(/already signed in/i);
    expect(
      screen.getByRole('link', { name: /home|dashboard/i }).getAttribute('href')
    ).toBe('/dashboard');
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('400: invalid or expired link with a new-code link, and no retry with the dead token', async () => {
    mocks.post.mockRejectedValueOnce(httpError(400));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByText(/link didn't work/i);
    expect(
      screen
        .getByRole('link', { name: /request a new code/i })
        .getAttribute('href')
    ).toBe('/login/code');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(Cookies.get('accessToken')).toBeUndefined();
  });

  it('404: says email sign-in is unavailable and points to password sign-in', async () => {
    mocks.post.mockRejectedValueOnce(httpError(404));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByText(/isn't available right now/i);
    expect(
      screen.getByRole('link', { name: /password/i }).getAttribute('href')
    ).toBe('/login');
    expect(screen.queryByText(/link didn't work/i)).toBeNull();
  });

  it('429: asks to wait and keeps the confirm button', async () => {
    mocks.post.mockRejectedValueOnce(httpError(429));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByText(/too many attempts/i);
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });

  it('network error: keeps the button so the user can retry', async () => {
    mocks.post
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(loginBody());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByText(/couldn't reach storytime/i);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it('never writes the token to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {})
    );
    mocks.post.mockRejectedValueOnce(httpError(400));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByText(/link didn't work/i);
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain(
      TOKEN
    );
  });
});
