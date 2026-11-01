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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const words = (n: number, p: string) =>
  Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
// 6 pages: each sentence is 25 words so one sentence per page.
const TEXT = ['a', 'b', 'c', 'd', 'e', 'f']
  .map((p) => `${words(25, p)}.`)
  .join(' ');

const guest = vi.hoisted(() => ({
  story: {} as Record<string, unknown>,
  clips: 0,
}));

vi.mock('next/image', () => ({
  default: (p: { alt?: string }) => <span role='img' aria-label={p.alt} />,
}));
vi.mock('@/lib/guest', () => ({ ensureGuestSession: vi.fn(async () => 's') }));
vi.mock('@/lib/hooks/use-story-quota', () => ({
  STORY_QUOTA_QUERY_KEY: ['quota'],
}));
vi.mock('@/lib/services', () => {
  const batch = () => {
    const n = guest.clips;
    const paras = Array.from({ length: n }, (_, i) => ({
      index: i,
      audioUrl: `${i}.mp3`,
      text: `t${i}`,
    }));
    return {
      status: 'completed',
      completedParagraphs: paras,
      allParagraphs: paras,
      failedParagraphs: [],
      pendingParagraphs: 0,
      totalQueued: n,
    };
  };
  return {
    getGuestStoryService: vi.fn(async () => guest.story),
    getStoryByIdService: vi.fn(),
    startGuestStoryAudioBatchService: vi.fn(async () => batch()),
    getGuestStoryAudioBatchStatusService: vi.fn(async () => batch()),
    startStoryAudioBatchService: vi.fn(),
    getStoryAudioBatchStatusService: vi.fn(),
    recordUserProgressService: vi.fn(),
    getCompletedStoriesService: vi.fn(async () => []),
    getInProgressStoriesService: vi.fn(async () => []),
    isUserLoggedIn: vi.fn(() => false),
  };
});

import StoryReader from './story-reader';

const renderReader = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StoryReader
        img=''
        title='T'
        description='D'
        voice='Storyteller'
        setStep={() => undefined}
        mode='plain'
        storyId='story-1'
        isGuest
      />
    </QueryClientProvider>
  );

const played: string[] = [];
const doneIds = () =>
  JSON.parse(window.localStorage.getItem('guestDoneStories') ?? '[]');
const audioEl = () => document.querySelector('audio') as HTMLAudioElement;
const playButton = () =>
  screen.getByRole('button', { name: /^(Play|Pause)$/ }) as HTMLButtonElement;
const endAudio = async () => {
  await act(async () => {
    fireEvent.ended(audioEl());
  });
};
const waitReady = () =>
  waitFor(() => {
    expect(audioEl()).toBeTruthy();
    expect(playButton().disabled).toBe(false);
  });

beforeEach(() => {
  window.localStorage.clear();
  played.length = 0;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    played.push(this.getAttribute('src') ?? '');
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const turnTo = async (n: number) => {
  for (let i = 0; i < n; i += 1) {
    fireEvent.keyDown(document, { key: 'ArrowRight' });
  }
};

describe('guest with a single stored narration file', () => {
  beforeEach(() => {
    guest.clips = 0;
    guest.story = {
      id: 'story-1',
      title: 'T',
      textContent: TEXT,
      audioUrl: 'full.mp3',
    };
  });

  it('(a) Play on page 3 plays the file', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => screen.getAllByText('Page 1 of 6'));
    await waitReady();
    await turnTo(2);
    expect(screen.getAllByText('Page 3 of 6').length).toBeGreaterThan(0);
    fireEvent.click(playButton());
    expect(played).toEqual(['full.mp3']);
  });

  it('(b) finishes the story when the file ends, whatever page is showing', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    fireEvent.click(playButton());
    await endAudio();
    expect(doneIds()).toContain('story-1');
    // the page is not dragged along by the file ending
    expect(screen.getAllByText('Page 1 of 6').length).toBeGreaterThan(0);
  });
});

describe('batch narration with fewer clips than pages, read-along off', () => {
  beforeEach(() => {
    guest.clips = 4;
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });

  it('plays through the clips and then finishes the story', async () => {
    renderReader();
    await waitReady();
    fireEvent.click(playButton());
    expect(played).toEqual(['0.mp3']);
    for (let i = 0; i < 3; i += 1) {
      await endAudio();
      await waitFor(() => expect(played.length).toBe(i + 2));
    }
    expect(played).toEqual(['0.mp3', '1.mp3', '2.mp3', '3.mp3']);
    expect(doneIds()).toEqual([]);
    await endAudio(); // clip 3, the last one
    expect(doneIds()).toContain('story-1');
    // replay starts from the first clip, not the last
    fireEvent.click(playButton());
    expect(played[played.length - 1]).toBe('0.mp3');
  });
});

describe('pages past the narrated clips', () => {
  beforeEach(() => {
    guest.clips = 4;
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });

  it('shows the notice and disables Play instead of doing nothing', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    await turnTo(4); // page 5, clips cover pages 1-4
    expect(screen.getAllByText('Page 5 of 6').length).toBeGreaterThan(0);
    expect(screen.getByText(/No narration for this page/)).toBeTruthy();
    expect(playButton().disabled).toBe(true);
    fireEvent.click(playButton());
    expect(played).toEqual([]);
  });
});
