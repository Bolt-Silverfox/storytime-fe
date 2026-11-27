// Pure page-navigation state for the story reader.

export interface ReaderState {
  page: number;
  count: number;
}

export type ReaderAction =
  | { type: 'init'; count: number; page: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'go'; page: number }
  // Narration moved from clip `from` to clip `clip`. The page only follows if
  // it was on `from`: a reader who read ahead (or turned back) is left alone.
  | { type: 'clip'; clip: number; from: number };

export const initialReaderState: ReaderState = { page: 0, count: 0 };

const clamp = (page: number, count: number): number => {
  if (count <= 0 || !Number.isInteger(page)) {
    return 0;
  }
  return Math.min(Math.max(page, 0), count - 1);
};

// Audio clips are the FIRST N pages of the backend split (capped, e.g. 50), so
// clip N is page N. Pages from clipCount on have no narration (null).
export const pageForClip = (clip: number, pageCount: number): number =>
  clamp(clip, pageCount);

export const clipForPage = (page: number, clipCount: number): number | null =>
  Number.isInteger(page) && page >= 0 && page < clipCount ? page : null;

export const firstReadyClip = (ready: ReadonlySet<number>): number | null =>
  ready.size > 0 ? Math.min(...ready) : null;

export const narrationStart = (
  ready: ReadonlySet<number>,
  failed: ReadonlySet<number>
): number | null => {
  let start = 0;
  while (failed.has(start)) {
    start += 1;
  }
  return ready.has(start) ? start : null;
};

const knownClipCount = (clipTotal: number, ready: ReadonlySet<number>) =>
  clipTotal || (ready.size > 0 ? Math.max(...ready) + 1 : 0);

export type AlignKind = 'ok' | 'switch' | 'unavailable' | 'failed' | 'none';

// What Play (or a page turn) should do to the narration for `page`.
// A single stored narration file is one clip for the whole story: pages are
// not mapped to it. Otherwise clip N is page N; pages past the clips have no
// narration ('none'); a clip not generated yet is 'unavailable'.
export const alignClip = (a: {
  page: number;
  currentClip: number;
  clipTotal: number;
  ready: ReadonlySet<number>;
  failed: ReadonlySet<number>;
  singleFile: boolean;
}): { kind: AlignKind; target: number } => {
  if (a.singleFile) {
    return { kind: 'ok', target: a.currentClip };
  }
  const target = clipForPage(a.page, knownClipCount(a.clipTotal, a.ready));
  if (target === null) {
    return { kind: 'none', target: a.currentClip };
  }
  if (target === a.currentClip) {
    return { kind: 'ok', target };
  }
  if (a.ready.has(target)) {
    return { kind: 'switch', target };
  }
  return { kind: a.failed.has(target) ? 'failed' : 'unavailable', target };
};

export type ClipEnd = 'advance' | 'wait' | 'failed' | 'stop' | 'finish';

// What to do when the clip `current` finishes playing.
export const clipEndAction = (a: {
  current: number;
  ready: ReadonlySet<number>;
  failed: ReadonlySet<number>;
  clipTotal: number;
  pageCount: number;
  textVisible: boolean;
  singleFile: boolean;
}): ClipEnd => {
  // The one stored file ending is the end of the story.
  if (a.singleFile) {
    return 'finish';
  }
  const next = a.current + 1;
  if (a.ready.has(next)) {
    return 'advance';
  }
  if (a.failed.has(next)) {
    return 'failed';
  }
  if (next < knownClipCount(a.clipTotal, a.ready)) {
    return 'wait';
  }
  // Out of clips. Long stories narrate only their first pages: with the text
  // on screen, stop on the next page and let the reader carry on; with the
  // text hidden there is nothing to carry on to, so the narration is done.
  if (a.pageCount > next && a.textVisible) {
    return 'stop';
  }
  return 'finish';
};

export const readerReducer = (
  state: ReaderState,
  action: ReaderAction
): ReaderState => {
  let page: number;
  switch (action.type) {
    case 'init':
      return {
        count: action.count,
        page: clamp(action.page, action.count),
      };
    case 'next':
      page = clamp(state.page + 1, state.count);
      break;
    case 'prev':
      page = clamp(state.page - 1, state.count);
      break;
    case 'go':
      page = clamp(action.page, state.count);
      break;
    case 'clip':
      if (state.page !== action.from) {
        return state;
      }
      page = pageForClip(action.clip, state.count);
      break;
    default:
      return state;
  }
  return page === state.page ? state : { ...state, page };
};

// Percent through the story, counting the page being read (so the last page
// shows 100%).
export const progressPercent = (page: number, count: number): number =>
  count <= 0 ? 0 : Math.round(((page + 1) / count) * 100);

const SWIPE_MIN_PX = 50;

// Horizontal swipe -> navigation. Mostly-vertical gestures are scrolling.
export const swipeDirection = (
  dx: number,
  dy: number
): 'next' | 'prev' | null => {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) {
    return null;
  }
  return dx < 0 ? 'next' : 'prev';
};
