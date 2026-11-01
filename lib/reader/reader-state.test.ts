import { describe, expect, it } from 'vitest';
import {
  clipForPage,
  initialReaderState,
  pageForClip,
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

  it('advances with the narration (clip -> page)', () => {
    const s = readerReducer(at(0, 10), {
      type: 'clip',
      clip: 4,
      clipCount: 10,
    });
    expect(s.page).toBe(4);
  });
});

describe('page and clip mapping', () => {
  it('is 1:1 when the counts match (backend pages == TTS paragraphs)', () => {
    expect(pageForClip(3, 10, 10)).toBe(3);
    expect(clipForPage(3, 10, 10)).toBe(3);
  });

  it('scales and clamps when the counts differ', () => {
    expect(pageForClip(5, 10, 5)).toBe(2);
    expect(pageForClip(9, 10, 5)).toBe(4);
    expect(pageForClip(50, 10, 10)).toBe(9);
    expect(clipForPage(2, 5, 10)).toBe(4);
    expect(clipForPage(4, 5, 10)).toBe(8);
  });

  it('handles zero counts', () => {
    expect(pageForClip(2, 0, 0)).toBe(0);
    expect(pageForClip(2, 5, 0)).toBe(0);
    expect(clipForPage(2, 0, 5)).toBe(0);
    expect(clipForPage(2, 5, 0)).toBe(0);
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
