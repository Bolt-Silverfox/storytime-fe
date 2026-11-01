// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageView from './page-view';

const pages = ['First page.', 'Second page.', 'Third page.'];

const setup = (over: Partial<Parameters<typeof PageView>[0]> = {}) => {
  const onNext = vi.fn();
  const onPrev = vi.fn();
  const utils = render(
    <PageView
      pages={pages}
      page={1}
      highlighted={false}
      onNext={onNext}
      onPrev={onPrev}
      endActions={<button type='button'>Finish story</button>}
      {...over}
    />
  );
  return { onNext, onPrev, ...utils };
};

afterEach(cleanup);

describe('PageView', () => {
  it('shows only the current page, its indicator and a progress bar', () => {
    setup();
    expect(screen.getByText('Second page.')).toBeTruthy();
    expect(screen.queryByText('First page.')).toBeNull();
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('67');
    expect(bar.getAttribute('aria-valuetext')).toBe('Page 2 of 3');
  });

  it('has labelled Previous and Next buttons that call back', () => {
    const { onNext, onPrev } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('disables Previous on the first page and Next on the last', () => {
    setup({ page: 0 });
    expect(
      screen
        .getByRole('button', { name: 'Previous page' })
        .getAttribute('aria-disabled')
    ).toBe('true');
    cleanup();
    const { onNext } = setup({ page: 2 });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(next.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(next);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('turns pages with the arrow keys, without trapping other keys', () => {
    const { onNext, onPrev } = setup();
    const down = (key: string, init: KeyboardEventInit = {}) =>
      fireEvent.keyDown(document, { key, ...init });
    down('ArrowRight');
    down('ArrowLeft');
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    down('Tab');
    down('ArrowUp');
    down('ArrowRight', { shiftKey: true });
    down('ArrowRight', { altKey: true });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('leaves arrow keys alone inside form fields', () => {
    const { onNext } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
    input.remove();
  });

  it('turns pages on a horizontal swipe but not a vertical scroll', () => {
    const { onNext, onPrev } = setup();
    const area = screen.getByTestId('reader-swipe-area');
    const swipe = (x0: number, y0: number, x1: number, y1: number) => {
      fireEvent.touchStart(area, { touches: [{ clientX: x0, clientY: y0 }] });
      fireEvent.touchEnd(area, {
        changedTouches: [{ clientX: x1, clientY: y1 }],
      });
    };
    swipe(200, 100, 100, 105);
    expect(onNext).toHaveBeenCalledTimes(1);
    swipe(100, 100, 200, 100);
    expect(onPrev).toHaveBeenCalledTimes(1);
    swipe(100, 100, 110, 300);
    swipe(100, 100, 300, 280);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('announces page changes politely', () => {
    setup();
    const live = screen.getByTestId('reader-page-text');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the end-of-story actions only on the last page', () => {
    setup({ page: 1 });
    expect(screen.queryByText('Finish story')).toBeNull();
    cleanup();
    setup({ page: 2 });
    expect(screen.getByText('Finish story')).toBeTruthy();
  });

  it('marks the page being narrated with the reader highlight tokens', () => {
    setup({ highlighted: true });
    expect(screen.getByTestId('reader-page-text').className).toContain(
      'bg-reader-hl'
    );
    cleanup();
    setup({ highlighted: false });
    expect(screen.getByTestId('reader-page-text').className).not.toContain(
      'bg-reader-hl'
    );
  });

  it('respects reduced motion (animation is opt-in via motion-safe)', () => {
    setup();
    const cls = screen.getByTestId('reader-page-text').className;
    expect(cls).toContain('motion-safe:');
    expect(cls).not.toMatch(/(^|\s)animate-/);
  });

  it('renders a friendly empty state with no pages', () => {
    setup({ pages: [], page: 0 });
    expect(screen.getByText('Story content not available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });
});
