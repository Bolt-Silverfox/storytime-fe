'use client';

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { type SentenceRange, sentencesOf } from '@/lib/reader/read-along';
import { progressPercent, swipeDirection } from '@/lib/reader/reader-state';

const NAV_BUTTON =
  'min-h-12 min-w-[6.5rem] whitespace-nowrap rounded-full border border-brand px-4 py-3 font-abeezee text-base font-semibold text-brand-text transition hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';

// Keys typed into these belong to the control, not the pager.
const isEditable = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') {
    return false;
  }
  return !!el.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="radio"], [role="tab"]'
  );
};

interface PageViewProps {
  pages: string[];
  page: number;
  // Index of the sentence being narrated on this page (estimated), or null for
  // no highlight.
  activeSentence: number | null;
  onNext: () => void;
  onPrev: () => void;
  // Rendered under the last page only (finish / quiz actions).
  endActions?: ReactNode;
  // Rendered under the text of every page (e.g. per-page audio status).
  pageStatus?: ReactNode;
}

// Tint plus an underline: the tint alone is too close to the page colour to
// find at a glance, the brand underline gives the second, stronger cue (and no
// reflow, unlike a heavier font weight).
const ACTIVE_SENTENCE =
  'rounded-sm bg-reader-hl text-reader-hl-fg scroll-mb-32 underline decoration-brand-text decoration-2 dark:decoration-reader-hl-fg underline-offset-4 [box-decoration-break:clone]';

// scroll-mb-32 keeps the sentence clear of the sticky Play button when
// scrollIntoView aligns it to the panel bottom. In dark mode the brand colour
// is too dim against the tint (2.6:1), so the underline takes the text colour.

// Follow-scroll backs off this long after the user scrolls by hand.
const USER_SCROLL_PAUSE_MS = 4000;
// A smooth scroll of our own keeps emitting scroll events for about this long.
const OWN_SCROLL_SETTLE_MS = 1000;

const renderSentences = (
  text: string,
  sentences: SentenceRange[],
  active: number | null,
  activeRef: RefObject<HTMLSpanElement | null>
): ReactNode[] => {
  const out: ReactNode[] = [];
  let at = 0;
  sentences.forEach((s, i) => {
    if (s.start > at) {
      out.push(text.slice(at, s.start));
    }
    const isActive = i === active;
    out.push(
      <span
        key={s.start}
        ref={isActive ? activeRef : undefined}
        data-sentence={i}
        data-active={isActive ? 'true' : undefined}
        className={isActive ? ACTIVE_SENTENCE : undefined}
      >
        {text.slice(s.start, s.end)}
      </span>
    );
    at = s.end;
  });
  if (at < text.length) {
    out.push(text.slice(at));
  }
  return out;
};

const PageView = ({
  pages,
  page,
  activeSentence,
  onNext,
  onPrev,
  endActions,
  pageStatus,
}: PageViewProps) => {
  const count = pages.length;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isFirst = page <= 0;
  const isLast = page >= count - 1;

  // Latest handlers for the once-attached document listener.
  const handlers = useRef({ onNext, onPrev, isFirst, isLast });
  handlers.current = { onNext, onPrev, isFirst, isLast };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        isEditable(e.target)
      ) {
        return;
      }
      const h = handlers.current;
      if (e.key === 'ArrowRight' && !h.isLast) {
        h.onNext();
      } else if (e.key === 'ArrowLeft' && !h.isFirst) {
        h.onPrev();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const text = pages[page] ?? '';
  const sentences = useMemo(() => sentencesOf(text), [text]);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const lastUserScroll = useRef(Number.NEGATIVE_INFINITY);
  const lastOwnScroll = useRef(Number.NEGATIVE_INFINITY);

  // Wheel and touch-drag come only from the user (scrollIntoView fires
  // neither), so they mark manual scrolling without catching our own.
  useEffect(() => {
    const mark = () => {
      lastUserScroll.current = Date.now();
    };
    // Scrolls with no wheel/touch (keyboard, scrollbar) only show up as scroll
    // events; ours also do, so ignore those shortly after our own call.
    const onScroll = () => {
      if (Date.now() - lastOwnScroll.current > OWN_SCROLL_SETTLE_MS) {
        mark();
      }
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, []);

  // Keep the spoken sentence in view on long pages / small screens. Only that
  // span scrolls into view ('nearest' = no movement when already visible).
  useEffect(() => {
    if (
      activeSentence === null ||
      Date.now() - lastUserScroll.current < USER_SCROLL_PAUSE_MS
    ) {
      return;
    }
    const el = activeRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') {
      return;
    }
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lastOwnScroll.current = Date.now();
    el.scrollIntoView({
      block: 'nearest',
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [activeSentence]);

  if (count === 0) {
    return (
      <p className='rounded-2xl bg-cream px-6 py-8 text-center font-abeezee text-lg text-body'>
        Story content not available
      </p>
    );
  }

  const label = `Page ${page + 1} of ${count}`;

  return (
    <section aria-label='Story pages' className='w-full'>
      {/* One live region for the life of the reader: announces the page number
          only, so screen readers don't read the text over the narration. */}
      <p role='status' aria-live='polite' className='sr-only'>
        {label}
      </p>
      <div className='mb-3 flex items-center justify-between gap-4'>
        <p
          aria-hidden='true'
          className='font-abeezee text-sm font-semibold text-body'
        >
          {label}
        </p>
        <div
          role='progressbar'
          aria-label='Reading progress'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent(page, count)}
          aria-valuetext={label}
          className='h-2 flex-1 overflow-hidden rounded-full bg-line-mid/60'
        >
          <div
            className='h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none'
            style={{ width: `${progressPercent(page, count)}%` }}
          />
        </div>
      </div>

      <div
        data-testid='reader-swipe-area'
        className='touch-pan-y'
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          const t = e.changedTouches[0];
          touchStart.current = null;
          if (!(start && t)) {
            return;
          }
          const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y);
          if (dir === 'next' && !isLast) {
            onNext();
          } else if (dir === 'prev' && !isFirst) {
            onPrev();
          }
        }}
      >
        <div
          // Keyed by page so the enter animation replays on every turn. The
          // animation is motion-safe only: reduced-motion users get a plain swap.
          key={page}
          data-testid='reader-page-text'
          id={`reading-page-${page}`}
          className={`min-h-[12rem] break-words py-2 text-left font-abeezee text-xl not-italic leading-9 motion-safe:animate-[reader-page-in_250ms_ease-out] text-strong`}
        >
          {/* One continuous text flow: the spans add no whitespace of their own,
              so selecting and copying yields the page text unchanged. */}
          {renderSentences(text, sentences, activeSentence, activeRef)}
        </div>
        {pageStatus}
      </div>

      <div className='mt-4 flex items-center justify-between gap-3'>
        <button
          type='button'
          aria-label='Previous page'
          aria-disabled={isFirst}
          onClick={() => {
            if (!isFirst) {
              onPrev();
            }
          }}
          className={NAV_BUTTON}
        >
          ← Previous
        </button>
        <button
          type='button'
          aria-label='Next page'
          aria-disabled={isLast}
          onClick={() => {
            if (!isLast) {
              onNext();
            }
          }}
          className={NAV_BUTTON}
        >
          Next →
        </button>
      </div>

      {isLast ? <div className='mt-6 text-center'>{endActions}</div> : null}
    </section>
  );
};

export default PageView;
