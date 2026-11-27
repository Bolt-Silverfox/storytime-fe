// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUEST_HISTORY_QUERY_KEY } from '@/lib/hooks/use-guest-history';
import StoryReader from './story-reader';

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/guest', () => ({ ensureGuestSession: vi.fn() }));
vi.mock('@/lib/services', () => ({
  getGuestStoryService: vi.fn().mockResolvedValue({ id: 's1', title: 't' }),
  getStoryByIdService: vi.fn(),
  isUserLoggedIn: () => false,
  getGuestStoryAudioBatchStatusService: vi.fn(),
  getStoryAudioBatchStatusService: vi.fn(),
  recordUserProgressService: vi.fn(),
  startGuestStoryAudioBatchService: vi.fn(),
  startStoryAudioBatchService: vi.fn(),
}));

describe('StoryReader guest history refresh', () => {
  afterEach(cleanup);

  it('invalidates guest history after a guest opens a story', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <StoryReader
          img=''
          title='t'
          description='d'
          voice='v'
          setStep={() => {}}
          storyId='s1'
          isGuest
        />
      </QueryClientProvider>
    );
    await vi.waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: GUEST_HISTORY_QUERY_KEY })
    );
  });
});
