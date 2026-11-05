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

export type AlignKind = 'ok' | 'switch' | 'unavailable' | 'none';

// What Play (or a page turn) should do to the narration for `page`.
// A single stored narration file is one clip for the whole story: pages are
// not mapped to it. Otherwise clip N is page N; pages past the clips have no
// narration ('none'); a clip not generated yet is 'unavailable'.
export const alignClip = (a: {
  page: number;
  currentClip: number;
  clipTotal: number;
  readyCount: number;
  singleFile: boolean;
}): { kind: AlignKind; target: number } => {
  if (a.singleFile) {
    return { kind: 'ok', target: a.currentClip };
  }
  const target = clipForPage(a.page, a.clipTotal || a.readyCount);
  if (target === null) {
    return { kind: 'none', target: a.currentClip };
  }
  if (target === a.currentClip) {
    return { kind: 'ok', target };
  }
  if (target >= a.readyCount) {
    return { kind: 'unavailable', target };
  }
  return { kind: 'switch', target };
};

export type ClipEnd = 'advance' | 'wait' | 'failed' | 'stop' | 'finish';

// What to do when the clip `current` finishes playing.
export const clipEndAction = (a: {
  current: number;
  readyCount: number;
  clipTotal: number;
  nextFailed: boolean;
  pageCount: number;
  textVisible: boolean;
  singleFile: boolean;
}): ClipEnd => {
  // The one stored file ending is the end of the story.
  if (a.singleFile) {
    return 'finish';
  }
  const next = a.current + 1;
  if (next < a.readyCount) {
    return 'advance';
  }
  if (next < a.clipTotal && !a.nextFailed) {
    return 'wait';
  }
  if (a.nextFailed) {
    return 'failed';
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
