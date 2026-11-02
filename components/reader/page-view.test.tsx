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
      activeSentence={null}
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
    expect(screen.getAllByText('Page 2 of 3').length).toBeGreaterThan(0);
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

  it('announces page changes via one persistent live region, not the page text', () => {
    const { rerender, onNext, onPrev } = setup();
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Page 2 of 3');
    rerender(
      <PageView
        pages={pages}
        page={2}
        activeSentence={null}
        onNext={onNext}
        onPrev={onPrev}
      />
    );
    // same DOM node, updated text (not re-created each turn)
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).toBe('Page 3 of 3');
    // the story text is not a live region (it would be read over the TTS)
    expect(
      screen.getByTestId('reader-page-text').closest('[aria-live]')
    ).toBeNull();
  });

  it('shows the end-of-story actions only on the last page', () => {
    setup({ page: 1 });
    expect(screen.queryByText('Finish story')).toBeNull();
    cleanup();
    setup({ page: 2 });
    expect(screen.getByText('Finish story')).toBeTruthy();
  });

  it('highlights only the active sentence, not the whole page', () => {
    setup({
      pages: ['One two. Three four! Five six?'],
      page: 0,
      activeSentence: 1,
    });
    const text = screen.getByTestId('reader-page-text');
    expect(text.className).not.toContain('bg-reader-hl');
    const active = text.querySelectorAll('[data-active="true"]');
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toBe('Three four!');
    expect(active[0]?.className).toContain('bg-reader-hl');
  });

  it('shows no highlight when activeSentence is null', () => {
    setup({ pages: ['One two. Three four!'], page: 0 });
    expect(document.querySelector('[data-active]')).toBeNull();
  });

  it('keeps the text content identical so copy works', () => {
    const t = 'One two.  Three four!\nFive six?';
    setup({ pages: [t], page: 0, activeSentence: 2 });
    expect(screen.getByTestId('reader-page-text').textContent).toBe(t);
  });

  it('adds no live region or role to the highlight; only the page is announced', () => {
    setup({ pages: ['One two. Three four!'], page: 0, activeSentence: 0 });
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Page 1 of 1');
    const span = document.querySelector('[data-active]') as HTMLElement;
    expect(span.getAttribute('role')).toBeNull();
    expect(span.hasAttribute('aria-live')).toBe(false);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('scrolls only the active span into view, nearest, smooth unless reduced motion', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const mm = vi.fn(() => ({ matches: false }));
    window.matchMedia = mm as unknown as typeof window.matchMedia;
    const { rerender } = setup({
      pages: ['One two. Three four!'],
      page: 0,
      activeSentence: 0,
    });
    expect(scroll).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'smooth',
    });
    mm.mockReturnValue({ matches: true });
    rerender(
      <PageView
        pages={['One two. Three four!']}
        page={0}
        activeSentence={1}
        onNext={() => undefined}
        onPrev={() => undefined}
      />
    );
    expect(scroll).toHaveBeenLastCalledWith({
      block: 'nearest',
      behavior: 'auto',
    });
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('does not scroll again on a re-render with the same sentence', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const props = {
      pages: ['One two. Three four!'],
      page: 0,
      activeSentence: 1,
      onPrev: () => undefined,
    };
    const { rerender } = setup(props);
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(<PageView {...props} onNext={() => undefined} />);
    rerender(<PageView {...props} onNext={() => undefined} />);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('keeps leading and trailing whitespace in the text content', () => {
    const t = '  One two. Three four!  ';
    setup({ pages: [t], page: 0, activeSentence: 0 });
    expect(screen.getByTestId('reader-page-text').textContent).toBe(t);
  });

  it('backs off the follow-scroll for 4 s after the user scrolls', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const props = {
      pages: ['One. Two. Three. Four.'],
      page: 0,
      onNext: () => undefined,
      onPrev: () => undefined,
    };
    const { rerender } = setup({ ...props, activeSentence: 0 });
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.wheel(window);
    now += 1000;
    rerender(<PageView {...props} activeSentence={1} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.touchMove(window);
    now += 3000;
    rerender(<PageView {...props} activeSentence={2} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    now += 4100;
    rerender(<PageView {...props} activeSentence={3} />);
    expect(scroll).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('gives the active sentence bottom scroll margin and an underline readable in both themes', () => {
    setup({ pages: ['One two. Three four!'], page: 0, activeSentence: 0 });
    const cls = document.querySelector('[data-active]')?.className ?? '';
    expect(cls).toContain('scroll-mb-32');
    expect(cls).toContain('dark:decoration-reader-hl-fg');
  });

  it('also backs off when the page scrolls on its own accord, but not for our own scroll', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    let now = 5_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const props = {
      pages: ['One. Two. Three. Four.'],
      page: 0,
      onNext: () => undefined,
      onPrev: () => undefined,
    };
    const { rerender } = setup({ ...props, activeSentence: 0 });
    // scroll events right after our own scrollIntoView are ours
    now += 300;
    fireEvent.scroll(window);
    now += 300;
    rerender(<PageView {...props} activeSentence={1} />);
    expect(scroll).toHaveBeenCalledTimes(2);
    // a later scroll (keyboard, scrollbar) is the user's
    now += 5000;
    fireEvent.scroll(window);
    now += 1000;
    rerender(<PageView {...props} activeSentence={2} />);
    expect(scroll).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('adds an underline second cue to the active sentence', () => {
    setup({ pages: ['One two. Three four!'], page: 0, activeSentence: 0 });
    expect(document.querySelector('[data-active]')?.className).toContain(
      'underline'
    );
  });

  it('does not scroll when nothing is highlighted', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    setup({ pages: ['One two.'], page: 0 });
    expect(scroll).not.toHaveBeenCalled();
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
