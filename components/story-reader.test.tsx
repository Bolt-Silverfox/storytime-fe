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
import { Profiler, useState } from 'react';
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
  pending: 0,
  failed: [] as number[],
  generating: [] as number[],
  gate: null as Promise<void> | null,
  status: null as string | null,
  jobId: 'job-1',
  failPollFor: null as string | null,
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
    const pending = guest.pending + guest.generating.length;
    return {
      status: guest.status ?? (pending ? 'processing' : 'completed'),
      completedParagraphs: paras.filter(
        (p) =>
          !(
            guest.failed.includes(p.index) || guest.generating.includes(p.index)
          )
      ),
      allParagraphs: paras,
      failedParagraphs: guest.failed,
      pendingParagraphs: pending,
      totalQueued: n + guest.pending,
      ...(pending ? { batchJobId: guest.jobId } : {}),
    };
  };
  return {
    getGuestStoryService: vi.fn(async () => guest.story),
    getStoryByIdService: vi.fn(),
    startGuestStoryAudioBatchService: vi.fn(async () => {
      await guest.gate;
      return batch();
    }),
    getGuestStoryAudioBatchStatusService: vi.fn(
      async (_storyId: string, jobId: string) => {
        if (jobId === guest.failPollFor) {
          throw new Error('poll failed');
        }
        return batch();
      }
    ),
    startStoryAudioBatchService: vi.fn(),
    getStoryAudioBatchStatusService: vi.fn(),
    recordUserProgressService: vi.fn(),
    getCompletedStoriesService: vi.fn(async () => []),
    getInProgressStoriesService: vi.fn(async () => []),
    isUserLoggedIn: vi.fn(() => false),
  };
});

import { getReadingPosition, saveReadingPosition } from '@/lib/progress-store';
import { pagesSignature, resolvePages } from '@/lib/reader/paginate';
import * as services from '@/lib/services';
import StoryReader from './story-reader';

const renderReader = (isGuest = true, mode = 'plain', onCommit?: () => void) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Profiler id='reader' onRender={() => onCommit?.()}>
        <StoryReader
          img=''
          title='T'
          description='D'
          voice='Storyteller'
          setStep={() => undefined}
          mode={mode}
          storyId='story-1'
          isGuest={isGuest}
        />
      </Profiler>
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

  it('(b) finishes the story when the file ends, on a middle page, without moving the page', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    await turnTo(2); // page 3 of 6
    fireEvent.click(playButton());
    await endAudio();
    expect(doneIds()).toContain('story-1');
    expect(screen.getAllByText('Page 3 of 6').length).toBeGreaterThan(0);
  });

  it('toggling read-along off and on mid-file keeps the page and the saved position', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    await turnTo(4); // page 5
    fireEvent.click(playButton());
    expect(screen.getAllByText('Page 5 of 6').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('switch')); // off
    fireEvent.click(screen.getByRole('switch')); // on again
    await waitFor(() => screen.getAllByText(/^Page \d of 6$/));
    expect(screen.getAllByText('Page 5 of 6').length).toBeGreaterThan(0);
    const saved = Object.values(
      JSON.parse(window.localStorage.getItem('readerPositions') ?? '{}')
    ) as { page: number }[];
    expect(saved.map((e) => e.page)).toEqual([4]);
  });
});

describe('saved reading position', () => {
  const positions = () =>
    JSON.parse(
      window.localStorage.getItem('readerPositions') ?? '{}'
    ) as Record<string, { page: number }>;
  const b64 = (o: object) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const signInElsewhere = async (userId: string) => {
    const services = await import('@/lib/services');
    vi.mocked(services.isUserLoggedIn).mockReturnValue(true);
    document.cookie = `accessToken=${b64({})}.${b64({ userId })}.sig; path=/`;
  };

  beforeEach(() => {
    guest.clips = 0;
    guest.story = {
      id: 'story-1',
      title: 'T',
      textContent: TEXT,
      audioUrl: 'full.mp3',
    };
  });
  afterEach(async () => {
    const services = await import('@/lib/services');
    vi.mocked(services.isUserLoggedIn).mockReturnValue(false);
    document.cookie =
      'accessToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('is not saved again by page turns after the story is finished', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    await turnTo(2);
    expect(positions()['g:|story-1']?.page).toBe(2);
    fireEvent.click(playButton());
    await endAudio();
    expect(doneIds()).toContain('story-1');
    expect(positions()).toEqual({});
    await turnTo(1);
    expect(screen.getAllByText('Page 4 of 6').length).toBeGreaterThan(0);
    expect(positions()).toEqual({});
  });

  it('does not write to an account that signed in from another tab', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    await turnTo(1);
    window.localStorage.setItem(
      'readerPositions',
      JSON.stringify({
        ...positions(),
        'u:alice|story-1': { page: 5, count: 6, at: 1 },
      })
    );
    await signInElsewhere('alice');
    await turnTo(2);
    expect(screen.getAllByText('Page 4 of 6').length).toBeGreaterThan(0);
    expect(positions()['u:alice|story-1']).toEqual({
      page: 5,
      count: 6,
      at: 1,
    });
  });

  it('does not clear the position of an account that signed in from another tab', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    window.localStorage.setItem(
      'readerPositions',
      JSON.stringify({ 'u:alice|story-1': { page: 5, count: 6, at: 1 } })
    );
    await signInElsewhere('alice');
    fireEvent.click(playButton());
    await endAudio();
    expect(positions()['u:alice|story-1']).toEqual({
      page: 5,
      count: 6,
      at: 1,
    });
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

  it('does the same while the batch is still generating (in-progress)', async () => {
    guest.pending = 1; // 4 ready + 1 generating = 5 clips for 6 pages
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    await turnTo(5); // page 6, past the 5 clips
    expect(screen.getAllByText('Page 6 of 6').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Preparing audio/i).length).toBeGreaterThan(0); // batch still running
    expect(screen.getByText(/No narration for this page/)).toBeTruthy();
    expect(playButton().disabled).toBe(true);
    fireEvent.click(playButton());
    expect(played).toEqual([]);
    guest.pending = 0;
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

describe('synth wave animation', () => {
  const wave = () =>
    document.querySelector('.synth-wave') as HTMLElement | null;
  const playing = () => wave()?.getAttribute('data-playing');
  const fire = async (
    ev: 'playing' | 'play' | 'pause' | 'emptied' | 'ended' | 'error' | 'waiting'
  ) => {
    await act(async () => {
      fireEvent[ev](audioEl());
    });
  };
  const ready = async (readAlong: boolean) => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    if (readAlong) {
      fireEvent.click(screen.getByRole('switch'));
    }
    await waitReady();
  };
  const cases = [
    ['single stored file', 0],
    ['per-page clips', 3],
  ] as const;

  beforeEach(() => {
    guest.gate = null;
    guest.pending = 0;
  });

  for (const [label, clips] of cases) {
    for (const readAlong of [false, true]) {
      it(`${label}, read-along ${readAlong ? 'on' : 'off'}: moves only while audio is sounding`, async () => {
        guest.clips = clips;
        guest.story = {
          id: 'story-1',
          title: 'T',
          textContent: TEXT,
          ...(clips ? {} : { audioUrl: 'full.mp3' }),
        };
        await ready(readAlong);
        expect(playing()).toBe('false');
        // `play` alone is a request, not sound
        await fire('play');
        expect(playing()).toBe('false');
        await fire('playing');
        expect(playing()).toBe('true');
        await fire('pause');
        expect(playing()).toBe('false');
        await fire('playing');
        await fire('error');
        expect(playing()).toBe('false');
        await fire('playing');
        await fire('emptied');
        expect(playing()).toBe('false');
        await fire('playing');
        await fire('waiting');
        expect(playing()).toBe('false');
        await fire('playing');
        expect(playing()).toBe('true');
        await fire('ended');
        expect(playing()).toBe('false');
      });
    }
  }

  it('keeps moving while later paragraphs are still generating', async () => {
    guest.clips = 2;
    guest.pending = 2;
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
    await ready(false);
    await fire('playing');
    expect(playing()).toBe('true');
  });

  it('is still on a freshly mounted, paused element after Try again', async () => {
    guest.clips = 3;
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
    await ready(false);
    await fire('playing');
    expect(playing()).toBe('true');
    // Playback then errors out without the element emitting pause/emptied.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.reject(new Error('nope'))
    );
    fireEvent.click(playButton()); // isPlaying was false -> tries to play, fails
    const retry = await screen.findByRole('button', { name: /try again/i });
    expect(playing()).toBe('true');
    let release: () => void = () => undefined;
    guest.gate = new Promise<void>((r) => {
      release = r;
    });
    fireEvent.click(retry);
    await waitFor(() => expect(audioEl()).toBeNull());
    expect(playing()).toBe('false');
    await act(async () => {
      release();
    });
    await waitFor(() => expect(audioEl()).toBeTruthy());
    expect(playing()).toBe('false');
  });
});

describe('sentence read-along highlight', () => {
  // 10-word sentences, three per page (30 words), two pages.
  const S = (p: string) => `${words(9, p)}.`;
  const MULTI = ['a', 'b', 'c', 'd', 'e', 'f'].map(S).join(' ');
  const active = () =>
    Array.from(document.querySelectorAll('[data-active="true"]')).map((e) =>
      e.textContent?.slice(0, 2)
    );
  const setClock = async (time: number, duration = 30) => {
    const el = audioEl();
    Object.defineProperty(el, 'duration', {
      value: duration,
      configurable: true,
    });
    Object.defineProperty(el, 'currentTime', {
      value: time,
      configurable: true,
      writable: true,
    });
    await act(async () => {
      fireEvent.loadedMetadata(el);
      fireEvent.timeUpdate(el);
    });
  };
  const start = async (clips = 2, onCommit?: () => void) => {
    guest.clips = clips;
    guest.pending = 0;
    guest.gate = null;
    guest.story = { id: 'story-1', title: 'T', textContent: MULTI };
    renderReader(true, 'plain', onCommit);
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    fireEvent.click(playButton());
    await waitFor(() =>
      expect(playButton().getAttribute('aria-pressed')).toBe('true')
    );
  };

  // Active sentence index seen in every committed render while tracking.
  const seen: (string | undefined)[] = [];
  let tracking = false;
  const record = () => {
    if (tracking) {
      seen.push(
        document
          .querySelector('[data-active="true"]')
          ?.getAttribute('data-sentence') ?? undefined
      );
    }
  };

  it('follows timeupdate through the sentences of the narrated page', async () => {
    await start();
    await setClock(1);
    expect(active()).toEqual(['a0']);
    await setClock(15);
    expect(active()).toEqual(['b0']);
    await setClock(29);
    expect(active()).toEqual(['c0']);
    // seeking back moves it back
    await setClock(2);
    expect(active()).toEqual(['a0']);
  });

  it('keeps the highlight on the current sentence while paused mid-clip', async () => {
    await start();
    await setClock(15);
    expect(active()).toEqual(['b0']);
    fireEvent.click(playButton());
    await waitFor(() =>
      expect(playButton().getAttribute('aria-pressed')).toBe('false')
    );
    expect(active()).toEqual(['b0']);
    fireEvent.click(playButton());
    await waitFor(() => expect(active()).toEqual(['b0']));
  });

  it('hides the highlight once the story has finished and rewound', async () => {
    await start(2, record);
    await setClock(29);
    await endAudio();
    await setClock(29);
    // The rewound first clip of a real element starts from zero.
    Object.defineProperty(audioEl(), 'currentTime', {
      value: 0,
      configurable: true,
    });
    seen.length = 0;
    tracking = true;
    await endAudio();
    tracking = false;
    // not even for one commit: the old playhead is gone with the clip
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((i) => i === undefined)).toBe(true);
    await waitFor(() =>
      expect(playButton().getAttribute('aria-pressed')).toBe('false')
    );
    expect(active()).toEqual([]);
  });

  it('keeps read-along on through a finish and replay loop', async () => {
    await start();
    await setClock(29);
    await endAudio();
    await setClock(29);
    await endAudio();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'true'
    );
  });

  it('does not show the first clip duration on a later page before play', async () => {
    await start(1); // only page 1 has a clip; page 2 has none yet
    await setClock(0, 3);
    fireEvent.click(playButton()); // pause
    await turnTo(1);
    expect(screen.queryByText('00:00 / 00:03')).toBeNull();
    expect(screen.getByText('--:-- / --:--')).toBeTruthy();
  });

  it('hands over to the next page without ever highlighting a stale sentence', async () => {
    await start(2, record);
    await setClock(29);
    expect(active()).toEqual(['c0']);
    // A new clip starts from zero with unknown duration, as in a browser.
    const el = audioEl();
    Object.defineProperty(el, 'currentTime', { value: 0, configurable: true });
    Object.defineProperty(el, 'duration', {
      value: Number.NaN,
      configurable: true,
    });
    seen.length = 0;
    tracking = true;
    await endAudio();
    tracking = false;
    // Page 2 shows (d/e/f); at no commit may its last sentence be lit.
    expect(screen.getAllByText('Page 2 of 2').length).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((i) => i === undefined || i === '0')).toBe(true);
    expect(active().every((a) => a === 'd0')).toBe(true);
    await setClock(1);
    expect(active()).toEqual(['d0']);
  });

  it('a manual page turn mid-clip does not flash a stale sentence', async () => {
    await start(2, record);
    await setClock(29);
    const el = audioEl();
    Object.defineProperty(el, 'currentTime', { value: 0, configurable: true });
    Object.defineProperty(el, 'duration', {
      value: Number.NaN,
      configurable: true,
    });
    seen.length = 0;
    tracking = true;
    await turnTo(1);
    tracking = false;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((i) => i === undefined || i === '0')).toBe(true);
  });

  it('shows nothing on a page that has no narration', async () => {
    await start(1);
    await setClock(15);
    expect(active()).toEqual(['b0']);
    await turnTo(1);
    expect(active()).toEqual([]);
  });

  it('does not touch the page turn: the page follows the clip end', async () => {
    await start();
    await setClock(29);
    await endAudio();
    await waitFor(() =>
      expect(screen.getAllByText('Page 2 of 2').length).toBeGreaterThan(0)
    );
  });

  it('single stored file gets no sentence highlight', async () => {
    guest.clips = 0;
    guest.story = {
      id: 'story-1',
      title: 'T',
      textContent: MULTI,
      audioUrl: 'full.mp3',
    };
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    fireEvent.click(playButton());
    await setClock(15);
    expect(active()).toEqual([]);
  });

  it('clears the highlight when the narration stops at the clip cap and the reader goes back', async () => {
    guest.clips = 2;
    guest.pending = 0;
    guest.gate = null;
    guest.story = {
      id: 'story-1',
      title: 'T',
      textContent: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
        .map(S)
        .join(' '),
    };
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
    fireEvent.click(playButton());
    await setClock(29);
    await endAudio(); // clip 0 -> 1
    await setClock(29);
    await endAudio(); // clip 1 is the last one: stop on page 3
    await waitFor(() =>
      expect(playButton().getAttribute('aria-pressed')).toBe('false')
    );
    await turnTo(0);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getAllByText('Page 2 of 4').length).toBeGreaterThan(0);
    expect(active()).toEqual([]);
    expect(screen.getByText('00:00 / 00:00')).toBeTruthy();
  });

  it('keeps the spoken sentence clear of the sticky Play button', async () => {
    await start();
    await setClock(15);
    const span = document.querySelector('[data-active="true"]');
    expect(span?.className).toContain('scroll-mb-32');
    expect(playButton().className).toContain('sticky');
    expect(playButton().className).toContain('safe-area-inset-bottom');
  });

  it('keeps read-along on when the reader unmounts and comes back (Change voice, modal)', async () => {
    guest.clips = 2;
    guest.story = { id: 'story-1', title: 'T', textContent: MULTI };
    const Host = ({ show }: { show: boolean }) => {
      const [on, setOn] = useState(false);
      const [client] = useState(() => new QueryClient());
      return show ? (
        <QueryClientProvider client={client}>
          <StoryReader
            img=''
            title='T'
            description='D'
            voice='V'
            setStep={() => undefined}
            mode='plain'
            storyId='story-1'
            isGuest
            readAlong={on}
            onReadAlongChange={setOn}
          />
        </QueryClientProvider>
      ) : null;
    };
    // The state lives above the reader, like story-view.
    const Parent = () => {
      const [show, setShow] = useState(true);
      return (
        <>
          <button type='button' onClick={() => setShow((v) => !v)}>
            toggle-reader
          </button>
          <Host show={show} />
        </>
      );
    };
    render(<Parent />);
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
        'true'
      )
    );
    fireEvent.click(screen.getByText('toggle-reader'));
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.click(screen.getByText('toggle-reader'));
    await waitFor(() => screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'true'
    );
  });
});

describe('a clip in the middle of the narration failed or is still generating', () => {
  const pageShown = (n: number) =>
    expect(screen.getAllByText(`Page ${n} of 6`).length).toBeGreaterThan(0);
  const openReadAlong = async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitReady();
  };

  beforeEach(() => {
    guest.clips = 4;
    guest.pending = 0;
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(() => {
    guest.failed = [];
    guest.generating = [];
  });

  it('Play on a page after the failed clip narrates that page and carries on', async () => {
    guest.failed = [1];
    await openReadAlong();
    await turnTo(2);
    pageShown(3);
    expect(screen.queryByText(/Audio unavailable/)).toBeNull();
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['2.mp3']));
    pageShown(3);
    await endAudio();
    await waitFor(() => expect(played).toEqual(['2.mp3', '3.mp3']));
    pageShown(4);
  });

  it('Play on a page after a clip still generating narrates that page', async () => {
    guest.generating = [1];
    await openReadAlong();
    await turnTo(2);
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['2.mp3']));
    pageShown(3);
  });

  it('turning onto a page after the failed clip while playing follows with the narration', async () => {
    guest.failed = [1];
    await openReadAlong();
    fireEvent.click(playButton());
    expect(played).toEqual(['0.mp3']);
    await turnTo(2);
    await waitFor(() => expect(played).toEqual(['0.mp3', '2.mp3']));
    pageShown(3);
  });

  it('on the failed page offers the retry, keeps the page and plays nothing', async () => {
    guest.failed = [1];
    await openReadAlong();
    await turnTo(1);
    pageShown(2);
    expect(screen.getByText(/Audio unavailable/)).toBeTruthy();
    expect(playButton().disabled).toBe(true);
    fireEvent.click(playButton());
    expect(played).toEqual([]);
    pageShown(2);
  });

  it('narration reaching the failed clip stops and offers a retry instead of skipping silently', async () => {
    guest.failed = [1];
    await openReadAlong();
    fireEvent.click(playButton());
    await endAudio();
    expect(played).toEqual(['0.mp3']);
    expect(
      screen.getByText(/Some of the audio couldn’t be prepared/)
    ).toBeTruthy();
    expect(doneIds()).toEqual([]);
  });
});

describe('the first clip failed', () => {
  beforeEach(() => {
    guest.clips = 4;
    guest.pending = 0;
    guest.failed = [0];
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(() => {
    guest.failed = [];
  });

  it('still lets the ready clips play, from the first ready one, and replays from it', async () => {
    renderReader();
    await waitReady();
    expect(
      screen.queryByText(/couldn’t prepare the audio for this story/)
    ).toBeNull();
    fireEvent.click(playButton());
    expect(played).toEqual(['1.mp3']);
    await endAudio();
    await endAudio();
    await waitFor(() => expect(played).toEqual(['1.mp3', '2.mp3', '3.mp3']));
    await endAudio();
    expect(doneIds()).toContain('story-1');
    fireEvent.click(playButton());
    expect(played[played.length - 1]).toBe('1.mp3');
  });

  it('with read-along on, Play on page 2 narrates page 2', async () => {
    renderReader();
    await waitFor(() => screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(audioEl()).toBeTruthy());
    expect(playButton().disabled).toBe(true);
    await turnTo(1);
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['1.mp3']));
    expect(screen.getAllByText('Page 2 of 6').length).toBeGreaterThan(0);
  });
});

describe('the first clip is still generating', () => {
  beforeEach(() => {
    guest.clips = 4;
    guest.pending = 0;
    guest.generating = [0];
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(() => {
    guest.generating = [];
  });

  it('does not start the narration on a later clip', async () => {
    renderReader();
    await waitFor(() =>
      expect(screen.getAllByText(/Preparing audio/i).length).toBeGreaterThan(0)
    );
    expect(audioEl()).toBeNull();
    expect(playButton().disabled).toBe(true);
    fireEvent.click(playButton());
    expect(played).toEqual([]);
  });
});

const pageShownIs = (n: number) =>
  expect(screen.getAllByText(`Page ${n} of 6`).length).toBeGreaterThan(0);
const batchApplied = async () => {
  await waitFor(() =>
    expect(services.startGuestStoryAudioBatchService).toHaveBeenCalled()
  );
  await act(async () => {
    await vi.mocked(services.startGuestStoryAudioBatchService).mock.results[0]
      ?.value;
  });
};
let jobSeq = 0;
const nextPoll = async () => {
  const polls = vi.mocked(services.getGuestStoryAudioBatchStatusService);
  const mine = () =>
    polls.mock.calls.flatMap((call, i) =>
      call[1] === guest.jobId ? [polls.mock.results[i]?.value] : []
    );
  const before = mine().length;
  await waitFor(() => expect(mine().length).toBeGreaterThan(before), {
    timeout: 3500,
  });
  await act(async () => {
    await Promise.allSettled(mine());
  });
};
const restorePage = (page: number) =>
  saveReadingPosition(
    'story-1',
    page,
    6,
    pagesSignature(resolvePages(undefined, TEXT))
  );
const resetGuest = () => {
  guest.clips = 0;
  guest.pending = 0;
  guest.failed = [];
  guest.generating = [];
  guest.status = null;
  guest.gate = null;
  guest.failPollFor = null;
  jobSeq += 1;
  guest.jobId = `job-${jobSeq}`;
};

describe('the first clip is still generating while later clips are ready', () => {
  beforeEach(() => {
    vi.mocked(services.startGuestStoryAudioBatchService).mockClear();
    vi.mocked(services.getGuestStoryAudioBatchStatusService).mockClear();
    resetGuest();
    guest.clips = 4;
    guest.generating = [0];
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(resetGuest);

  it('turning to a ready page enables Play and narrates that page', async () => {
    renderReader();
    fireEvent.click(await screen.findByRole('switch'));
    await batchApplied();
    expect(playButton().disabled).toBe(true);
    await turnTo(1);
    pageShownIs(2);
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['1.mp3']));
    pageShownIs(2);
  });

  it('opening on a saved page whose clip is ready lets Play narrate it', async () => {
    restorePage(2);
    renderReader();
    fireEvent.click(await screen.findByRole('switch'));
    await batchApplied();
    pageShownIs(3);
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['2.mp3']));
    pageShownIs(3);
  });

  it('keeps the page the reader chose when the first clip arrives later', async () => {
    renderReader();
    fireEvent.click(await screen.findByRole('switch'));
    await batchApplied();
    await turnTo(1);
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['1.mp3']));
    guest.generating = [];
    await nextPoll();
    expect(audioEl().getAttribute('src')).toBe('1.mp3');
    pageShownIs(2);
  });

  it('with the text hidden, starts the narration once the first clip is ready', async () => {
    renderReader();
    await batchApplied();
    expect(playButton().disabled).toBe(true);
    guest.generating = [];
    await nextPoll();
    expect(playButton().disabled).toBe(false);
    expect(screen.queryByText(/Preparing audio/)).toBeNull();
    fireEvent.click(playButton());
    expect(played).toEqual(['0.mp3']);
  });

  it('with the text hidden, starts on the next clip once the first one fails', async () => {
    renderReader();
    await batchApplied();
    guest.generating = [];
    guest.failed = [0];
    await nextPoll();
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    expect(played).toEqual(['1.mp3']);
  });

  it('when the batch ends without the first clip, the ready clips still play', async () => {
    guest.status = 'failed';
    renderReader();
    await batchApplied();
    expect(screen.queryByText(/Preparing audio/)).toBeNull();
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    expect(played).toEqual(['1.mp3']);
  });

  it('when a status poll fails, the ready clips still play', async () => {
    guest.failPollFor = guest.jobId;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderReader();
    await batchApplied();
    await nextPoll();
    expect(screen.getByText('Failed to load audio')).toBeTruthy();
    expect(screen.queryByText(/Preparing audio/)).toBeNull();
    expect(playButton().disabled).toBe(false);
    fireEvent.click(playButton());
    expect(played).toEqual(['1.mp3']);
  });
});

type Clip = 'ready' | 'generating' | 'failed';
const clipCombos = (n: number): Clip[][] =>
  n === 0
    ? [[]]
    : clipCombos(n - 1).flatMap((rest) =>
        (['ready', 'generating', 'failed'] as const).map((c) => [c, ...rest])
      );

describe('every combination of three clips for six pages', () => {
  beforeEach(() => {
    vi.mocked(services.startGuestStoryAudioBatchService).mockClear();
    resetGuest();
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(resetGuest);

  const setUp = (states: Clip[]) => {
    guest.clips = 3;
    guest.failed = states.flatMap((s, i) => (s === 'failed' ? [i] : []));
    guest.generating = states.flatMap((s, i) =>
      s === 'generating' ? [i] : []
    );
    const first = states.findIndex((s) => s !== 'failed');
    return first !== -1 && states[first] === 'ready' ? first : null;
  };

  for (const states of clipCombos(3)) {
    it(`${states.join(',')}, text hidden`, async () => {
      const start = setUp(states);
      renderReader();
      await batchApplied();
      expect(playButton().disabled).toBe(start === null);
      expect(screen.queryAllByText(/Preparing audio/).length > 0).toBe(
        states.includes('generating')
      );
      expect(
        screen.queryByText(/couldn’t prepare the audio for this story/) !== null
      ).toBe(states.every((s) => s === 'failed'));
      if (start !== null) {
        fireEvent.click(playButton());
        expect(played).toEqual([`${start}.mp3`]);
      }
    });

    for (let page = 0; page < 3; page += 1) {
      const clip = states[page];
      it(`${states.join(',')}, text shown on page ${page + 1}`, async () => {
        const start = setUp(states);
        restorePage(page);
        renderReader();
        fireEvent.click(await screen.findByRole('switch'));
        await batchApplied();
        pageShownIs(page + 1);
        const enabled =
          clip === 'ready' || (clip === 'generating' && start !== null);
        expect(playButton().disabled).toBe(!enabled);
        expect(screen.queryByText(/Audio unavailable/) !== null).toBe(
          clip === 'failed'
        );
        fireEvent.click(playButton());
        if (!enabled) {
          expect(played).toEqual([]);
          return;
        }
        const narrated = clip === 'ready' ? page : (start as number);
        await waitFor(() => expect(played).toEqual([`${narrated}.mp3`]));
        pageShownIs(narrated + 1);
      });
    }
  }
});

describe('finishing the story from the last page', () => {
  const positions = () =>
    JSON.parse(window.localStorage.getItem('readerPositions') ?? '{}');
  const toLastPage = async () => {
    fireEvent.click(await screen.findByRole('switch'));
    await waitFor(() => screen.getAllByText(/^Page 1 of 6$/));
    await turnTo(5);
    pageShownIs(6);
  };

  beforeEach(() => {
    resetGuest();
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(resetGuest);

  const guestShapes: [string, () => void][] = [
    [
      'more pages than clips',
      () => {
        guest.clips = 4;
      },
    ],
    [
      'no narration clips at all',
      () => {
        guest.clips = 0;
      },
    ],
    [
      'every clip failed',
      () => {
        guest.clips = 4;
        guest.failed = [0, 1, 2, 3];
      },
    ],
    [
      'a single stored narration file',
      () => {
        guest.story = { ...guest.story, audioUrl: 'full.mp3' };
      },
    ],
  ];

  for (const [shape, arrange] of guestShapes) {
    it(`a guest can finish a story with ${shape}`, async () => {
      arrange();
      renderReader();
      await toLastPage();
      expect(positions()).not.toEqual({});
      fireEvent.click(screen.getByRole('button', { name: 'Finish story' }));
      expect(doneIds()).toContain('story-1');
      expect(positions()).toEqual({});
      expect(screen.queryByRole('button', { name: 'Finish story' })).toBeNull();
      expect(
        screen.getByText('You finished the story!').getAttribute('role')
      ).toBe('status');
    });
  }

  it('a guest who narrated the clips and read on to the last page can finish', async () => {
    guest.clips = 4;
    renderReader();
    fireEvent.click(await screen.findByRole('switch'));
    await waitReady();
    fireEvent.click(playButton());
    for (let i = 0; i < 4; i += 1) {
      await endAudio();
    }
    pageShownIs(5);
    expect(doneIds()).toEqual([]);
    await turnTo(1);
    fireEvent.click(screen.getByRole('button', { name: 'Finish story' }));
    expect(doneIds()).toContain('story-1');
  });

  it('a guest on an interactive story with a quiz finishes through the quiz', async () => {
    guest.clips = 4;
    guest.story = {
      ...guest.story,
      questions: [
        {
          id: 'q',
          storyId: 'story-1',
          question: 'Q?',
          options: ['x', 'y'],
          correctOption: 0,
        },
      ],
    };
    renderReader(true, 'interactive');
    await toLastPage();
    expect(screen.queryByRole('button', { name: 'Finish story' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Take the quiz/ }));
    expect(doneIds()).toContain('story-1');
    expect(screen.getByText('Q?')).toBeTruthy();
  });

  describe('signed in', () => {
    beforeEach(() => {
      guest.clips = 4;
      vi.mocked(services.getStoryByIdService).mockResolvedValue(guest.story);
      vi.mocked(services.startStoryAudioBatchService).mockImplementation(() =>
        vi.mocked(services.startGuestStoryAudioBatchService)('story-1')
      );
    });

    it('offers one Finish story action on the last page', async () => {
      vi.mocked(services.recordUserProgressService).mockResolvedValue(
        undefined as never
      );
      renderReader(false);
      await toLastPage();
      expect(
        screen.getAllByRole('button', { name: 'Finish story' })
      ).toHaveLength(1);
    });

    it('retries saving the completion after it failed, and announces the result', async () => {
      const record = vi.mocked(services.recordUserProgressService);
      record.mockReset();
      let saved: () => void = () => undefined;
      record.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(
        new Promise<never>((resolve) => {
          saved = () => resolve(undefined as never);
        })
      );
      renderReader(false);
      await toLastPage();
      fireEvent.click(screen.getByRole('button', { name: 'Finish story' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(
        /Couldn.t save progress/
      );
      fireEvent.click(screen.getByRole('button', { name: 'Finish story' }));
      await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
      const saving = screen.getByRole('button', { name: 'Saving…' });
      expect(saving.getAttribute('aria-disabled')).toBe('true');
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(saving);
      expect(record).toHaveBeenCalledTimes(2);
      await act(async () => {
        saved();
      });
      expect(
        (
          await screen.findByText('✓ Added to your completed stories')
        ).getAttribute('role')
      ).toBe('status');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('read-along highlight when the narrated clip changes', () => {
  const SENTENCES = ['a', 'b', 'c', 'd', 'e', 'f']
    .map((p) => `${words(9, p)}.`)
    .join(' ');
  const seen: (string | null)[] = [];
  let tracking = false;
  const record = () => {
    if (tracking) {
      seen.push(
        document
          .querySelector('[data-active="true"]')
          ?.getAttribute('data-sentence') ?? null
      );
    }
  };
  const setClock = async (time: number, duration: number) => {
    const el = audioEl();
    Object.defineProperty(el, 'duration', {
      value: duration,
      configurable: true,
    });
    Object.defineProperty(el, 'currentTime', {
      value: time,
      configurable: true,
      writable: true,
    });
    await act(async () => {
      fireEvent.loadedMetadata(el);
      fireEvent.timeUpdate(el);
    });
  };
  const srcChangeRewindsElement = () => {
    const el = audioEl();
    Object.defineProperty(el, 'currentTime', { value: 0, configurable: true });
    Object.defineProperty(el, 'duration', {
      value: Number.NaN,
      configurable: true,
    });
  };
  const activeSentences = () =>
    Array.from(document.querySelectorAll('[data-active="true"]')).map((e) =>
      e.textContent?.slice(0, 2)
    );

  beforeEach(() => {
    vi.mocked(services.startGuestStoryAudioBatchService).mockClear();
    vi.mocked(services.getGuestStoryAudioBatchStatusService).mockClear();
    resetGuest();
    guest.clips = 2;
    guest.story = { id: 'story-1', title: 'T', textContent: SENTENCES };
  });
  afterEach(() => {
    tracking = false;
    seen.length = 0;
    vi.restoreAllMocks();
    resetGuest();
  });

  const playFirstClipToItsEnd = async () => {
    renderReader(true, 'plain', record);
    fireEvent.click(await screen.findByRole('switch'));
    await batchApplied();
    fireEvent.click(playButton());
    await waitFor(() => expect(played).toEqual(['0.mp3']));
    await setClock(29, 30);
    expect(activeSentences()).toEqual(['c0']);
  };

  const scenarios: {
    name: string;
    generating: number[];
    change: () => Promise<void>;
    page: number;
  }[] = [
    {
      name: 'the next clip arrives after the narration waited for it',
      generating: [1],
      page: 2,
      change: async () => {
        await endAudio();
        srcChangeRewindsElement();
        guest.generating = [];
        tracking = true;
        await nextPoll();
      },
    },
    {
      name: 'Try again prepares the audio afresh',
      generating: [],
      page: 1,
      change: async () => {
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
          Promise.reject(new Error('nope'))
        );
        fireEvent.click(playButton());
        fireEvent.click(playButton());
        const retry = await screen.findByRole('button', { name: /try again/i });
        let release: () => void = () => undefined;
        guest.gate = new Promise<void>((r) => {
          release = r;
        });
        fireEvent.click(retry);
        await waitFor(() => expect(audioEl()).toBeNull());
        tracking = true;
        await act(async () => {
          release();
        });
        await waitFor(() => expect(audioEl()).toBeTruthy());
      },
    },
  ];

  it.each(scenarios)(
    'never lights a stale sentence when $name',
    async ({ generating, change, page }) => {
      guest.generating = generating;
      await playFirstClipToItsEnd();
      await change();
      tracking = false;
      expect(screen.getAllByText(`Page ${page} of 2`).length).toBeGreaterThan(
        0
      );
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.filter((i) => i !== null && i !== '0')).toEqual([]);
    }
  );
});

describe('the reader opens with read-along already on', () => {
  const sig = () => pagesSignature(resolvePages(undefined, TEXT));
  const renderControlled = (readAlong: boolean) =>
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
          readAlong={readAlong}
          onReadAlongChange={() => undefined}
        />
      </QueryClientProvider>
    );

  beforeEach(() => {
    vi.mocked(services.startGuestStoryAudioBatchService).mockClear();
    resetGuest();
    guest.clips = 6;
    guest.story = { id: 'story-1', title: 'T', textContent: TEXT };
  });
  afterEach(resetGuest);

  it.each([
    { saved: null, shown: 1, savedAfter: 0 },
    { saved: 3, shown: 4, savedAfter: 3 },
  ])(
    'with saved page $saved it shows page $shown and keeps $savedAfter saved',
    async ({ saved, shown, savedAfter }) => {
      if (saved !== null) {
        restorePage(saved);
      }
      renderControlled(true);
      await batchApplied();
      pageShownIs(shown);
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
        'true'
      );
      expect(getReadingPosition('story-1', 6, sig())).toBe(savedAfter);
    }
  );

  it.each([
    { page: 0, label: 'the first page' },
    { page: 2, label: 'a later page' },
  ])(
    'Play on $label narrates that page and turns with it',
    async ({ page }) => {
      restorePage(page);
      renderControlled(true);
      await batchApplied();
      pageShownIs(page + 1);
      fireEvent.click(playButton());
      await waitFor(() => expect(played).toEqual([`${page}.mp3`]));
      await endAudio();
      await waitFor(() =>
        expect(played).toEqual([`${page}.mp3`, `${page + 1}.mp3`])
      );
      pageShownIs(page + 2);
    }
  );
});
