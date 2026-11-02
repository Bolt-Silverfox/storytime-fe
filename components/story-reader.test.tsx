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
  gate: null as Promise<void> | null,
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
      status: guest.pending ? 'processing' : 'completed',
      completedParagraphs: paras,
      allParagraphs: paras,
      failedParagraphs: [],
      pendingParagraphs: guest.pending,
      totalQueued: n + guest.pending,
      ...(guest.pending ? { batchJobId: 'job-1' } : {}),
    };
  };
  return {
    getGuestStoryService: vi.fn(async () => guest.story),
    getStoryByIdService: vi.fn(),
    startGuestStoryAudioBatchService: vi.fn(async () => {
      await guest.gate;
      return batch();
    }),
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

const renderReader = (onCommit?: () => void) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Profiler id='reader' onRender={() => onCommit?.()}>
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
    renderReader(onCommit);
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
