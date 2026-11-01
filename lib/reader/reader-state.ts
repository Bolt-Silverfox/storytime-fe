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
  // Narration moved to a new audio clip: follow it.
  | { type: 'clip'; clip: number; clipCount: number };

export const initialReaderState: ReaderState = { page: 0, count: 0 };

const clamp = (page: number, count: number): number => {
  if (count <= 0 || !Number.isInteger(page)) {
    return 0;
  }
  return Math.min(Math.max(page, 0), count - 1);
};

// Audio clips are the backend's TTS paragraphs, which equal the pages, so the
// mapping is 1:1. If the counts ever differ (older backend split) scale.
export const pageForClip = (
  clip: number,
  clipCount: number,
  pageCount: number
): number => {
  if (pageCount <= 0 || clipCount <= 0) {
    return 0;
  }
  if (clipCount === pageCount) {
    return clamp(clip, pageCount);
  }
  return clamp(Math.floor((clip * pageCount) / clipCount), pageCount);
};

export const clipForPage = (
  page: number,
  pageCount: number,
  clipCount: number
): number => {
  if (pageCount <= 0 || clipCount <= 0) {
    return 0;
  }
  if (clipCount === pageCount) {
    return clamp(page, clipCount);
  }
  return clamp(Math.floor((page * clipCount) / pageCount), clipCount);
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
      page = pageForClip(action.clip, action.clipCount, state.count);
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
