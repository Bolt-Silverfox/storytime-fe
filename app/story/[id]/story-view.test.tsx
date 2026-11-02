// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoryView from './story-view';

const quotaState = vi.hoisted(() => ({
  quota: null as null | {
    remaining: number;
    totalAllowed: number;
    unlimited: boolean;
  },
}));

vi.mock('@/lib/hooks/use-story-quota', () => ({
  useStoryQuota: () => ({ quota: quotaState.quota }),
}));
vi.mock('@/components/quota-indicator', () => ({
  default: ({ variant }: { variant: string }) => (
    <div data-testid='quota-indicator'>{variant}</div>
  ),
}));
vi.mock('@/components/story-reader', () => ({ default: () => null }));
vi.mock('@/components/mode-selector', () => ({ default: () => null }));
vi.mock('@/components/voice-selector', () => ({ default: () => null }));
vi.mock('@/components/ui/modal', () => ({ default: () => null }));
vi.mock('@/lib/services', () => ({
  addFavoriteService: vi.fn(),
  getPreferredVoiceService: vi.fn(),
  getStoryByIdService: vi.fn(),
  getVoiceAccessService: vi.fn(),
  isUserLoggedIn: () => false,
  listFavoritesService: vi.fn(),
  removeFavoriteService: vi.fn(),
}));

describe('StoryView quota', () => {
  afterEach(cleanup);

  it('still lets the user open a story when no free stories are left (re-reading is free; backend 403s new stories)', () => {
    quotaState.quota = { remaining: 0, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    const btn = screen.getByRole('button', { name: 'Read this story' });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('quota-indicator')).toBeTruthy();
  });

  it('shows the read button when quota remains', () => {
    quotaState.quota = { remaining: 2, totalAllowed: 3, unlimited: false };
    render(<StoryView storyId='s1' />);
    expect(
      screen.getByRole('button', { name: 'Read this story' })
    ).toBeTruthy();
  });
});
