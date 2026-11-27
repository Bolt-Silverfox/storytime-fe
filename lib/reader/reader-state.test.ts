import { describe, expect, it } from 'vitest';
import {
  alignClip,
  clipEndAction,
  clipForPage,
  firstReadyClip,
  initialReaderState,
  narrationStart,
  pageForClip,
  playEnabled,
  progressPercent,
  readerReducer,
  swipeDirection,
} from './reader-state';

const at = (page: number, count: number) =>
  readerReducer(initialReaderState, { type: 'init', count, page });

describe('readerReducer', () => {
  it('starts empty', () => {
    expect(initialReaderState).toEqual({ page: 0, count: 0 });
  });

  it('init clamps the restored page into range', () => {
    expect(at(3, 10).page).toBe(3);
    expect(at(99, 10).page).toBe(9);
    expect(at(-4, 10).page).toBe(0);
    expect(at(2.7, 10).page).toBe(0);
    expect(at(Number.NaN, 10).page).toBe(0);
    expect(at(5, 0)).toEqual({ page: 0, count: 0 });
  });

  it('next and prev move by one and stop at the bounds', () => {
    let s = at(0, 3);
    s = readerReducer(s, { type: 'prev' });
    expect(s.page).toBe(0);
    s = readerReducer(s, { type: 'next' });
    s = readerReducer(s, { type: 'next' });
    expect(s.page).toBe(2);
    s = readerReducer(s, { type: 'next' });
    expect(s.page).toBe(2);
    s = readerReducer(s, { type: 'prev' });
    expect(s.page).toBe(1);
  });

  it('go clamps', () => {
    expect(readerReducer(at(0, 5), { type: 'go', page: 4 }).page).toBe(4);
    expect(readerReducer(at(0, 5), { type: 'go', page: 40 }).page).toBe(4);
    expect(readerReducer(at(2, 5), { type: 'go', page: -1 }).page).toBe(0);
  });

  it('does nothing when there are no pages', () => {
    const s = readerReducer(initialReaderState, { type: 'next' });
    expect(s).toEqual({ page: 0, count: 0 });
  });

  it('returns the same state object when nothing changes (no re-render)', () => {
    const s = at(0, 3);
    expect(readerReducer(s, { type: 'prev' })).toBe(s);
    const last = at(2, 3);
    expect(readerReducer(last, { type: 'next' })).toBe(last);
  });

  it('advances with the narration when the page was following it', () => {
    const s = readerReducer(at(3, 10), { type: 'clip', clip: 4, from: 3 });
    expect(s.page).toBe(4);
  });

  it('never yanks the reader back when they read ahead of the audio (M2)', () => {
    // audio on clip 4, clip 5 not generated yet; reader taps Next up to page 8
    let s = at(4, 60);
    for (let i = 0; i < 4; i++) {
      s = readerReducer(s, { type: 'next' });
    }
    expect(s.page).toBe(8);
    // clip 4 ends, narration moves to clip 5: the page must stay at 8
    const after = readerReducer(s, { type: 'clip', clip: 5, from: 4 });
    expect(after.page).toBe(8);
    expect(after).toBe(s);
  });

  it('ignores narration events when the reader turned back', () => {
    const s = readerReducer(at(2, 60), { type: 'clip', clip: 6, from: 5 });
    expect(s.page).toBe(2);
  });

  it('follows a clip that lands past the last page by clamping', () => {
    expect(
      readerReducer(at(9, 10), { type: 'clip', clip: 10, from: 9 }).page
    ).toBe(9);
  });
});

describe('page and clip mapping', () => {
  it('clip N is page N (clips are the first N pages of the split)', () => {
    expect(pageForClip(3, 60)).toBe(3);
    expect(pageForClip(10, 60)).toBe(10);
    expect(pageForClip(49, 60)).toBe(49);
    expect(clipForPage(12, 50)).toBe(12);
    expect(clipForPage(49, 50)).toBe(49);
  });

  it('pages beyond the narrated clips have no audio (60 pages, 50 clips)', () => {
    expect(clipForPage(50, 50)).toBeNull();
    expect(clipForPage(59, 50)).toBeNull();
  });

  it('handles zero counts and bad input', () => {
    expect(pageForClip(2, 0)).toBe(0);
    expect(pageForClip(99, 10)).toBe(9);
    expect(clipForPage(2, 0)).toBeNull();
    expect(clipForPage(-1, 5)).toBeNull();
  });
});

describe('progressPercent', () => {
  it('is page / count of the way through, 100 on the last page', () => {
    expect(progressPercent(0, 4)).toBe(25);
    expect(progressPercent(3, 4)).toBe(100);
    expect(progressPercent(0, 1)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe('swipeDirection', () => {
  it('swipe left means next, swipe right means prev', () => {
    expect(swipeDirection(-80, 5)).toBe('next');
    expect(swipeDirection(80, -5)).toBe('prev');
  });
  it('ignores short or mostly vertical gestures (scrolling)', () => {
    expect(swipeDirection(-20, 0)).toBeNull();
    expect(swipeDirection(-80, 90)).toBeNull();
    expect(swipeDirection(0, 0)).toBeNull();
  });
});

const clips = (...i: number[]) => new Set(i);

describe('alignClip (what Play / a page turn does to the narration)', () => {
  const base = {
    currentClip: 0,
    clipTotal: 4,
    ready: clips(0, 1, 2, 3),
    failed: clips(),
    singleFile: false,
  };
  it('single stored narration file: never maps pages to clips (a)', () => {
    for (const page of [0, 2, 5]) {
      expect(
        alignClip({
          ...base,
          page,
          clipTotal: 0,
          ready: clips(0),
          singleFile: true,
        }).kind
      ).toBe('ok');
    }
  });
  it('maps page N to clip N', () => {
    expect(alignClip({ ...base, page: 2 })).toEqual({
      kind: 'switch',
      target: 2,
    });
    expect(alignClip({ ...base, page: 0 })).toEqual({ kind: 'ok', target: 0 });
  });
  it('unavailable when the clip is not ready, none past the clips', () => {
    expect(alignClip({ ...base, page: 3, ready: clips(0, 1) }).kind).toBe(
      'unavailable'
    );
    expect(alignClip({ ...base, page: 4 }).kind).toBe('none');
  });
  it('switches to a ready clip after a failed or still-generating one', () => {
    expect(
      alignClip({ ...base, page: 2, ready: clips(0, 2, 3), failed: clips(1) })
    ).toEqual({ kind: 'switch', target: 2 });
    expect(alignClip({ ...base, page: 2, ready: clips(0, 2, 3) })).toEqual({
      kind: 'switch',
      target: 2,
    });
  });
  it('failed when the page clip failed', () => {
    expect(
      alignClip({ ...base, page: 1, ready: clips(0, 2, 3), failed: clips(1) })
        .kind
    ).toBe('failed');
  });
  it('with no clip count yet, a ready clip still counts as narration', () => {
    expect(
      alignClip({ ...base, clipTotal: 0, page: 2, ready: clips(0, 2) }).kind
    ).toBe('switch');
  });
});

describe('clipEndAction (what happens when a clip ends)', () => {
  const base = {
    current: 0,
    ready: clips(0, 1, 2, 3),
    failed: clips(),
    clipTotal: 4,
    pageCount: 4,
    textVisible: true,
    singleFile: false,
  };
  it('advances while the next clip is ready', () => {
    expect(clipEndAction(base)).toBe('advance');
  });
  it('advances from a clip played after a gap', () => {
    expect(
      clipEndAction({
        ...base,
        current: 2,
        ready: clips(0, 2, 3),
        failed: clips(1),
      })
    ).toBe('advance');
  });
  it('waits for a clip still generating, flags a failed one', () => {
    expect(clipEndAction({ ...base, ready: clips(0) })).toBe('wait');
    expect(
      clipEndAction({ ...base, ready: clips(0, 2, 3), failed: clips(1) })
    ).toBe('failed');
  });
  it('waits for a gap before a later ready clip even with no clip count yet', () => {
    expect(
      clipEndAction({
        ...base,
        ready: clips(0, 2),
        clipTotal: 0,
        textVisible: false,
      })
    ).toBe('wait');
  });
  it('single file: finishes the story when the file ends, even with many pages (b)', () => {
    expect(
      clipEndAction({
        ...base,
        current: 0,
        ready: clips(0),
        clipTotal: 0,
        pageCount: 9,
        singleFile: true,
      })
    ).toBe('finish');
  });
  it('finishes after the last clip when every page was narrated', () => {
    expect(clipEndAction({ ...base, current: 3 })).toBe('finish');
  });
  it('more pages than clips: stops on the next page when the text is visible', () => {
    expect(clipEndAction({ ...base, current: 3, pageCount: 6 })).toBe('stop');
  });
  it('more pages than clips with the text hidden: finishes (nothing to continue)', () => {
    expect(
      clipEndAction({ ...base, current: 3, pageCount: 6, textVisible: false })
    ).toBe('finish');
  });
});

describe('firstReadyClip (where narration starts and replays from)', () => {
  it('is the lowest ready clip, skipping a failed start', () => {
    expect(firstReadyClip(clips(0, 1))).toBe(0);
    expect(firstReadyClip(clips(3, 1, 2))).toBe(1);
  });
  it('is null when nothing is ready', () => {
    expect(firstReadyClip(clips())).toBeNull();
  });
});

describe('narrationStart (the clip narration opens on)', () => {
  it('is the first clip that has not failed, once it is ready', () => {
    expect(narrationStart(clips(0, 1), clips())).toBe(0);
    expect(narrationStart(clips(1, 2), clips(0))).toBe(1);
  });
  it('waits for an earlier clip still generating instead of skipping it', () => {
    expect(narrationStart(clips(1, 2), clips())).toBeNull();
    expect(narrationStart(clips(2), clips(0))).toBeNull();
  });
});

type ClipState = 'ready' | 'generating' | 'failed';
const STATES: ClipState[] = ['ready', 'generating', 'failed'];
const combos = (n: number): ClipState[][] =>
  n === 0
    ? [[]]
    : combos(n - 1).flatMap((rest) => STATES.map((s) => [s, ...rest]));
const setsOf = (states: ClipState[]) => ({
  ready: new Set(states.flatMap((s, i) => (s === 'ready' ? [i] : []))),
  failed: new Set(states.flatMap((s, i) => (s === 'failed' ? [i] : []))),
});

describe('every combination of four clips', () => {
  for (const states of combos(4)) {
    const { ready, failed } = setsOf(states);
    const firstUsable = states.findIndex((s) => s !== 'failed');
    const start =
      firstUsable !== -1 && states[firstUsable] === 'ready'
        ? firstUsable
        : null;

    describe(states.join(','), () => {
      it('narration opens on the first clip that has not failed, once it is ready', () => {
        expect(narrationStart(ready, failed)).toBe(start);
      });

      for (const hasAudio of [false, true]) {
        it(`Play with the text hidden ${hasAudio ? 'plays the selected clip' : 'waits for a clip to be selected'}`, () => {
          expect(
            playEnabled({
              isPlaying: false,
              hasAudio,
              textVisible: false,
              singleFile: false,
              page: 0,
              currentClip: start ?? 0,
              clipTotal: 4,
              ready,
              failed,
            })
          ).toBe(hasAudio);
        });

        for (let page = 0; page < 6; page += 1) {
          const clip = states[page];
          const expected =
            clip === 'ready' || (clip === 'generating' && hasAudio);
          it(`Play on page ${page + 1} with ${hasAudio ? 'a' : 'no'} clip selected is ${expected ? 'enabled' : 'disabled'}`, () => {
            expect(
              playEnabled({
                isPlaying: false,
                hasAudio,
                textVisible: true,
                singleFile: false,
                page,
                currentClip: hasAudio ? (start ?? 0) : 0,
                clipTotal: 4,
                ready,
                failed,
              })
            ).toBe(expected);
          });
        }
      }

      for (let current = 0; current < 4; current += 1) {
        if (states[current] !== 'ready') {
          continue;
        }
        const next = states[current + 1];
        for (const textVisible of [false, true]) {
          const expected =
            next === 'ready'
              ? 'advance'
              : next === 'failed'
                ? 'failed'
                : next === 'generating'
                  ? 'wait'
                  : textVisible
                    ? 'stop'
                    : 'finish';
          it(`clip ${current} ending with the text ${textVisible ? 'shown' : 'hidden'} on 6 pages: ${expected}`, () => {
            expect(
              clipEndAction({
                current,
                ready,
                failed,
                clipTotal: 4,
                pageCount: 6,
                textVisible,
                singleFile: false,
              })
            ).toBe(expected);
          });
        }
      }
    });
  }

  it('Pause is always available while narrating', () => {
    expect(
      playEnabled({
        isPlaying: true,
        hasAudio: true,
        textVisible: true,
        singleFile: false,
        page: 5,
        currentClip: 3,
        clipTotal: 4,
        ready: clips(0, 1, 2, 3),
        failed: clips(),
      })
    ).toBe(true);
  });

  it('a single stored file plays from any page once loaded', () => {
    for (const hasAudio of [false, true]) {
      expect(
        playEnabled({
          isPlaying: false,
          hasAudio,
          textVisible: true,
          singleFile: true,
          page: 4,
          currentClip: 0,
          clipTotal: 0,
          ready: clips(0),
          failed: clips(),
        })
      ).toBe(hasAudio);
    }
  });
});
