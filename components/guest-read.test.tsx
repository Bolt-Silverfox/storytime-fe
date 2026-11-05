// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Cookies from 'js-cookie';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_HISTORY_QUERY_KEY } from '@/lib/hooks/use-guest-history';
import { markDone, markReading } from '@/lib/progress-store';
import ReadBeforeRow from './read-before-row';
import StoryStatusBadge from './story-status-badge';

const svc = vi.hoisted(() => ({
  history: vi.fn(),
  loggedIn: false,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/services', () => ({
  getGuestHistoryService: svc.history,
  isUserLoggedIn: () => svc.loggedIn,
  getCompletedStoriesService: vi.fn().mockResolvedValue([]),
  getInProgressStoriesService: vi.fn().mockResolvedValue([]),
  recordUserProgressService: vi.fn().mockResolvedValue(undefined),
}));

const story = (storyId: string, title: string, lastAccessed: string) => ({
  storyId,
  title,
  coverImageUrl: '',
  lastAccessed,
  progress: 10,
  readStatus: 'reading',
});

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrap = (client: QueryClient, ui: ReactNode) => (
  <QueryClientProvider client={client}>{ui}</QueryClientProvider>
);

const settled = (client: QueryClient, key: readonly unknown[]) =>
  waitFor(() => {
    const status = client.getQueryState(key)?.status;
    expect(status === 'success' || status === 'error').toBe(true);
  });

const SESSION_KEY = [...GUEST_HISTORY_QUERY_KEY, 'sess-1'];

describe('guest read markers', () => {
  beforeEach(() => {
    svc.loggedIn = false;
    svc.history.mockReset();
    Cookies.set('guestSessionId', 'sess-1');
  });
  afterEach(() => {
    cleanup();
    Cookies.remove('guestSessionId');
  });

  it('badge says Read for a story in the guest history', async () => {
    svc.history.mockResolvedValue([story('a', 'A', '2026-01-01')]);
    render(wrap(makeClient(), <StoryStatusBadge storyId='a' />));
    expect(await screen.findByText('Read')).toBeTruthy();
  });

  it('badge is absent for a story the guest has not opened', async () => {
    svc.history.mockResolvedValue([story('a', 'A', '2026-01-01')]);
    const client = makeClient();
    render(
      wrap(
        client,
        <>
          <StoryStatusBadge storyId='a' />
          <StoryStatusBadge storyId='b' />
        </>
      )
    );
    await settled(client, SESSION_KEY);
    expect(await screen.findAllByText('Read')).toHaveLength(1);
  });

  it('guest with local Reading status and server history sees Read', async () => {
    svc.history.mockResolvedValue([story('r1', 'R', '2026-01-01')]);
    markReading('r1');
    render(wrap(makeClient(), <StoryStatusBadge storyId='r1' />));
    expect(await screen.findByText('Read')).toBeTruthy();
    expect(screen.queryByText('Reading')).toBeNull();
  });

  it('guest with local Reading status but no history still sees Reading', async () => {
    svc.history.mockResolvedValue([]);
    markReading('r2');
    const client = makeClient();
    render(wrap(client, <StoryStatusBadge storyId='r2' />));
    await settled(client, SESSION_KEY);
    expect(screen.getByText('Reading')).toBeTruthy();
  });

  it('Done wins over Read for a guest', async () => {
    svc.history.mockResolvedValue([story('d1', 'D', '2026-01-01')]);
    markDone('d1');
    const client = makeClient();
    render(wrap(client, <StoryStatusBadge storyId='d1' />));
    await settled(client, SESSION_KEY);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Read')).toBeNull();
  });

  it('logged-in user keeps Reading and never sees Read', async () => {
    svc.loggedIn = true;
    markReading('l1');
    const client = makeClient();
    client.setQueryData(SESSION_KEY, [story('l1', 'L', '2026-01-01')]);
    render(wrap(client, <StoryStatusBadge storyId='l1' />));
    expect(screen.getByText('Reading')).toBeTruthy();
    expect(screen.queryByText('Read')).toBeNull();
  });

  it('cached guest history does not leak badge or row into a logged-in session', () => {
    svc.loggedIn = true;
    const client = makeClient();
    client.setQueryData(SESSION_KEY, [story('leak', 'Leak', '2026-01-01')]);
    const { container } = render(
      wrap(
        client,
        <>
          <ReadBeforeRow />
          <StoryStatusBadge storyId='leak' />
        </>
      )
    );
    expect(container.textContent).toBe('');
    expect(svc.history).not.toHaveBeenCalled();
  });

  it('history cached under another guest session is not shown', async () => {
    svc.history.mockResolvedValue([]);
    const client = makeClient();
    client.setQueryData(
      [...GUEST_HISTORY_QUERY_KEY, 'old-session'],
      [story('x', 'X', '2026-01-01')]
    );
    const { container } = render(
      wrap(
        client,
        <>
          <ReadBeforeRow />
          <StoryStatusBadge storyId='x' />
        </>
      )
    );
    await settled(client, SESSION_KEY);
    expect(container.textContent).toBe('');
  });

  it('row lists read stories most recent first with reopen links', async () => {
    svc.history.mockResolvedValue([
      story('old', 'Old Tale', '2026-01-01T00:00:00Z'),
      story('new', 'New Tale', '2026-02-01T00:00:00Z'),
    ]);
    render(wrap(makeClient(), <ReadBeforeRow />));
    expect(await screen.findByText('Read before')).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/story/new',
      '/story/old',
    ]);
  });

  it('row puts stories with an invalid lastAccessed last, keeping order', async () => {
    svc.history.mockResolvedValue([
      story('bad1', 'Bad1', 'not-a-date'),
      story('old', 'Old', '2026-01-01T00:00:00Z'),
      story('bad2', 'Bad2', ''),
      story('new', 'New', '2026-02-01T00:00:00Z'),
    ]);
    render(wrap(makeClient(), <ReadBeforeRow />));
    await screen.findByText('Read before');
    expect(
      screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    ).toEqual(['/story/new', '/story/old', '/story/bad1', '/story/bad2']);
  });

  it('row renders nothing when the guest has read nothing', async () => {
    svc.history.mockResolvedValue([]);
    const client = makeClient();
    const { container } = render(wrap(client, <ReadBeforeRow />));
    await settled(client, SESSION_KEY);
    expect(client.getQueryState(SESSION_KEY)?.status).toBe('success');
    expect(container.textContent).toBe('');
  });

  it('row renders nothing silently when history fails', async () => {
    svc.history.mockRejectedValue(new Error('boom'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const client = makeClient();
    const { container } = render(wrap(client, <ReadBeforeRow />));
    await settled(client, SESSION_KEY);
    expect(client.getQueryState(SESSION_KEY)?.status).toBe('error');
    expect(container.textContent).toBe('');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logged-in users get no request', async () => {
    svc.loggedIn = true;
    render(wrap(makeClient(), <ReadBeforeRow />));
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.history).not.toHaveBeenCalled();
  });
});
