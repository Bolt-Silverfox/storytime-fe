// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  recordUserProgressService: vi.fn(),
}));

const story = (storyId: string, title: string, lastAccessed: string) => ({
  storyId,
  title,
  coverImageUrl: '',
  lastAccessed,
  progress: 10,
  readStatus: 'reading',
});

const wrap = (ui: ReactNode) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {ui}
  </QueryClientProvider>
);

describe('guest read markers', () => {
  beforeEach(() => {
    svc.loggedIn = false;
    svc.history.mockReset();
  });
  afterEach(cleanup);

  it('badge says Read for a story in the guest history', async () => {
    svc.history.mockResolvedValue([story('a', 'A', '2026-01-01')]);
    render(wrap(<StoryStatusBadge storyId='a' />));
    expect(await screen.findByText('Read')).toBeTruthy();
  });

  it('badge is absent for a story the guest has not opened', async () => {
    svc.history.mockResolvedValue([story('a', 'A', '2026-01-01')]);
    render(wrap(<StoryStatusBadge storyId='b' />));
    await vi.waitFor(() => expect(svc.history).toHaveBeenCalled());
    expect(screen.queryByText('Read')).toBeNull();
  });

  it('row lists read stories most recent first with reopen links', async () => {
    svc.history.mockResolvedValue([
      story('old', 'Old Tale', '2026-01-01T00:00:00Z'),
      story('new', 'New Tale', '2026-02-01T00:00:00Z'),
    ]);
    render(wrap(<ReadBeforeRow />));
    expect(await screen.findByText('Read before')).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/story/new',
      '/story/old',
    ]);
  });

  it('row renders nothing when the guest has read nothing', async () => {
    svc.history.mockResolvedValue([]);
    const { container } = render(wrap(<ReadBeforeRow />));
    await vi.waitFor(() => expect(svc.history).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('row renders nothing silently when history fails', async () => {
    svc.history.mockRejectedValue(new Error('boom'));
    const { container } = render(wrap(<ReadBeforeRow />));
    await vi.waitFor(() => expect(svc.history).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('logged-in users get no row, no badge and no request', async () => {
    svc.loggedIn = true;
    const { container } = render(
      wrap(
        <>
          <ReadBeforeRow />
          <StoryStatusBadge storyId='a' />
        </>
      )
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.history).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });
});
