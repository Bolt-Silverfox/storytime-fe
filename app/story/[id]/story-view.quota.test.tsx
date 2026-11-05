// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoryView from './story-view';

const quotaState = vi.hoisted(() => ({
  quota: null as null | {
    remaining: number;
    totalAllowed: number;
    unlimited: boolean;
  },
}));

const svc = vi.hoisted(() => ({
  loggedIn: false,
  story: null as null | Record<string, unknown>,
  error: {
    message: 'limit',
    status: 403,
    data: { code: 'STORY_LIMIT_EXCEEDED' },
  } as unknown,
}));

vi.mock('@/lib/hooks/use-story-quota', () => ({
  useStoryQuota: () => ({ quota: quotaState.quota }),
}));
vi.mock('@/components/quota-indicator', () => ({
  default: ({ variant }: { variant: string }) => (
    <div data-testid='quota-indicator'>{variant}</div>
  ),
}));
vi.mock('@/components/story-reader', () => ({
  default: ({ storyId }: { storyId: string }) => (
    <div data-testid='story-reader'>{storyId}</div>
  ),
}));
vi.mock('@/components/mode-selector', () => ({ default: () => null }));
vi.mock('@/components/voice-selector', () => ({ default: () => null }));
vi.mock('@/components/ui/modal', () => ({
  default: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div data-testid='modal'>{children}</div> : null),
}));
vi.mock('@/lib/services', () => ({
  addFavoriteService: vi.fn(),
  getPreferredVoiceService: () => Promise.resolve({ id: 'v1', name: 'Voice' }),
  getStoryByIdService: () =>
    svc.story ? Promise.resolve(svc.story) : Promise.reject(svc.error),
  getVoiceAccessService: () => Promise.resolve({}),
  isUserLoggedIn: () => svc.loggedIn,
  listFavoritesService: () => Promise.resolve([]),
  removeFavoriteService: vi.fn(),
}));

describe('StoryView quota', () => {
  afterEach(() => {
    cleanup();
    svc.story = null;
  });

  it('keeps the Read button enabled and shows the banner when no free stories are left', () => {
    quotaState.quota = { remaining: 0, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    const btn = screen.getByRole('button', { name: 'Read this story' });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('quota-indicator').textContent).toBe('banner');
  });

  it('out of quota, an already-read story (backend resolves it) opens the reader', async () => {
    svc.loggedIn = true;
    svc.story = { id: 's1', title: 'Seen before' };
    quotaState.quota = { remaining: 0, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Read this story' }));
    expect((await screen.findByTestId('story-reader')).textContent).toBe('s1');
    expect(screen.queryByText(/enjoyed your free stories/)).toBeNull();
    expect(screen.queryByText(/couldn.t open this story/)).toBeNull();
    svc.loggedIn = false;
  });

  it('shows the compact pill (not the banner) when quota remains', () => {
    quotaState.quota = { remaining: 2, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    expect(screen.getByTestId('quota-indicator').textContent).toBe('compact');
  });

  it('logged-in free user opening a NEW story (403) sees the upgrade wall, not a generic error', async () => {
    svc.loggedIn = true;
    quotaState.quota = { remaining: 0, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Read this story' }));
    expect(await screen.findByText(/enjoyed your free stories/)).toBeTruthy();
    expect(screen.getByText(/Upgrade to premium/)).toBeTruthy();
    expect(screen.queryByText(/couldn.t open this story/)).toBeNull();
    svc.loggedIn = false;
  });

  it('recognises the limit by data.code even without a status', async () => {
    svc.loggedIn = true;
    svc.error = { message: 'limit', data: { code: 'STORY_LIMIT_EXCEEDED' } };
    quotaState.quota = { remaining: 0, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Read this story' }));
    expect(await screen.findByText(/enjoyed your free stories/)).toBeTruthy();
    svc.loggedIn = false;
  });

  it('a non-403 failure still shows the generic error', async () => {
    svc.loggedIn = true;
    svc.error = new Error('boom');
    quotaState.quota = { remaining: 2, totalAllowed: 3, unlimited: false };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StoryView storyId='s1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Read this story' }));
    expect(await screen.findByText(/couldn.t open this story/)).toBeTruthy();
    svc.loggedIn = false;
  });

  it('shows the read button when quota remains', () => {
    quotaState.quota = { remaining: 2, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    expect(
      screen.getByRole('button', { name: 'Read this story' })
    ).toBeTruthy();
  });
});
