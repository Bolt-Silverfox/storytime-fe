'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { progressPercent, swipeDirection } from '@/lib/reader/reader-state';

const NAV_BUTTON =
  'min-h-12 min-w-[7.5rem] rounded-full border border-brand px-5 py-3 font-abeezee text-base font-semibold text-brand-text transition hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';

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
  // True while this page is the one being narrated.
  highlighted: boolean;
  onNext: () => void;
  onPrev: () => void;
  // Rendered under the last page only (finish / quiz actions).
  endActions?: ReactNode;
  // Rendered under the text of every page (e.g. per-page audio status).
  pageStatus?: ReactNode;
}

const PageView = ({
  pages,
  page,
  highlighted,
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
      <div className='mb-3 flex items-center justify-between gap-4'>
        <p className='font-abeezee text-sm font-semibold text-body'>{label}</p>
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
        className='touch-pan-y rounded-2xl border-[0.5px] border-solid border-line-mid bg-cream p-3 sm:p-6'
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
          aria-live='polite'
          aria-atomic='true'
          className={`min-h-[12rem] break-words rounded-xl px-3 py-4 text-left font-abeezee text-xl not-italic leading-9 transition-colors duration-300 motion-safe:animate-[reader-page-in_250ms_ease-out] sm:px-4 sm:text-2xl sm:leading-[2.75rem] ${
            highlighted
              ? 'bg-reader-hl font-medium text-reader-hl-fg'
              : 'text-strong'
          }`}
        >
          {pages[page]}
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
