// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoryReader from './story-reader';

const forbidden = vi.hoisted(() =>
  Object.assign(new Error('quota'), { status: 403 })
);

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/guest', () => ({ ensureGuestSession: vi.fn() }));
vi.mock('@/lib/services', () => ({
  getGuestStoryService: vi.fn().mockRejectedValue(forbidden),
  getStoryByIdService: vi.fn().mockRejectedValue(forbidden),
  getGuestStoryAudioBatchStatusService: vi.fn(),
  getStoryAudioBatchStatusService: vi.fn(),
  recordUserProgressService: vi.fn(),
  startGuestStoryAudioBatchService: vi.fn(),
  startStoryAudioBatchService: vi.fn(),
}));

const renderReader = (isGuest: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StoryReader
        img=''
        title='t'
        description='d'
        voice='v'
        setStep={() => {}}
        storyId='s1'
        isGuest={isGuest}
      />
    </QueryClientProvider>
  );

describe('StoryReader quota wall (403 on a new story)', () => {
  afterEach(cleanup);

  it('guest sees the sign-up wall', async () => {
    renderReader(true);
    expect(await screen.findByText(/enjoyed your free stories/)).toBeTruthy();
    expect(screen.getByText('Sign up to read more')).toBeTruthy();
  });

  it('logged-in free user sees upgrade messaging, not sign-up', async () => {
    renderReader(false);
    expect(await screen.findByText(/enjoyed your free stories/)).toBeTruthy();
    expect(screen.getByText(/Upgrade to premium/)).toBeTruthy();
    expect(screen.queryByText('Sign up to read more')).toBeNull();
  });
});
