import { describe, expect, it } from 'vitest';
import {
  pagesSignature,
  resolvePages,
  STORY_WORDS_PER_PAGE,
  splitStoryIntoPages,
} from './paginate';

const words = (n: number, prefix = 'w') =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
const count = (s: string) => s.split(' ').length;

describe('splitStoryIntoPages (mirror of the backend splitter)', () => {
  it('uses 30 words per page', () => {
    expect(STORY_WORDS_PER_PAGE).toBe(30);
  });

  it('returns no pages for empty, whitespace or missing text', () => {
    expect(splitStoryIntoPages('')).toEqual([]);
    expect(splitStoryIntoPages('  \n\t  ')).toEqual([]);
    expect(splitStoryIntoPages(null)).toEqual([]);
    expect(splitStoryIntoPages(undefined)).toEqual([]);
  });

  it('keeps a short story on one page', () => {
    expect(splitStoryIntoPages('Once upon a time. The end.')).toEqual([
      'Once upon a time. The end.',
    ]);
  });

  it('never splits mid-sentence when a sentence fits (same case as the backend spec)', () => {
    const pages = splitStoryIntoPages(
      `${words(20, 'a')}. ${words(20, 'b')}. ${words(5, 'c')}.`
    );
    expect(pages).toHaveLength(2);
    expect(count(pages[0])).toBe(20);
    expect(pages[1]).toBe(`${words(20, 'b')}. ${words(5, 'c')}.`);
  });

  it('packs many tiny sentences up to 30 words per page', () => {
    const text = Array.from({ length: 100 }, (_, i) => `S${i} ok.`).join(' ');
    const pages = splitStoryIntoPages(text);
    for (const p of pages) {
      expect(count(p)).toBeLessThanOrEqual(30);
    }
    // 15 two-word sentences per page -> 100 sentences = 7 pages
    expect(pages).toHaveLength(7);
    expect(pages.join(' ')).toBe(text);
  });

  it('treats paragraph breaks as whitespace, like the backend', () => {
    const pages = splitStoryIntoPages('One.\n\nTwo.\nThree.');
    expect(pages).toEqual(['One. Two. Three.']);
  });

  it('handles one huge paragraph', () => {
    const text = Array.from(
      { length: 50 },
      (_, i) => `${words(9, `p${i}x`)}.`
    ).join(' ');
    const pages = splitStoryIntoPages(text);
    expect(pages.length).toBeGreaterThan(10);
    for (const p of pages) {
      expect(count(p)).toBeLessThanOrEqual(30);
    }
    expect(pages.join(' ')).toBe(text);
  });

  it('hard-splits a sentence longer than the limit into 30-word chunks', () => {
    const pages = splitStoryIntoPages(`${words(75)}. Short.`);
    expect(pages.map(count)).toEqual([30, 30, 15, 1]);
  });

  it('ignores trailing and repeated whitespace', () => {
    const pages = splitStoryIntoPages('  Hello   there.   \n  Bye.  \n\n');
    expect(pages).toEqual(['Hello there. Bye.']);
  });

  it('keeps unicode and emoji intact', () => {
    const text =
      'Il était une fois 🐉 très gentil. Ça va ? Oui ! 你好。 日本語です。';
    const pages = splitStoryIntoPages(text);
    expect(pages.join(' ')).toBe(text);
    expect(pages[0]).toContain('🐉');
  });

  it('text without terminal punctuation is still paged', () => {
    const pages = splitStoryIntoPages(words(45));
    expect(pages.map(count)).toEqual([30, 15]);
  });
});

describe('resolvePages', () => {
  const text = `${words(20, 'a')}. ${words(20, 'b')}. ${words(5, 'c')}.`;

  it('prefers the pages sent by the API (same text, its own split)', () => {
    const api = [`${words(20, 'a')}. ${words(20, 'b')}.`, `${words(5, 'c')}.`];
    expect(resolvePages(api, text)).toEqual(api);
    expect(api).not.toEqual(splitStoryIntoPages(text));
  });

  it('falls back to client pagination when the API has no pages', () => {
    const expected = splitStoryIntoPages(text);
    expect(resolvePages(undefined, text)).toEqual(expected);
    expect(resolvePages(null, text)).toEqual(expected);
    expect(resolvePages([], text)).toEqual(expected);
  });

  it('falls back when the API pages are malformed', () => {
    const expected = splitStoryIntoPages(text);
    expect(resolvePages('nope' as unknown as string[], text)).toEqual(expected);
    expect(resolvePages([1, null] as unknown as string[], text)).toEqual(
      expected
    );
    expect(resolvePages(['  ', ''], text)).toEqual(expected);
  });

  it('API pages and the client fallback give the same shape', () => {
    const fromApi = resolvePages(splitStoryIntoPages(text), text);
    const fromClient = resolvePages(undefined, text);
    expect(fromApi).toEqual(fromClient);
    expect(Array.isArray(fromApi)).toBe(true);
    expect(fromApi.every((p) => typeof p === 'string' && p.length > 0)).toBe(
      true
    );
  });

  it('returns [] when there is nothing at all', () => {
    expect(resolvePages(undefined, '')).toEqual([]);
    expect(resolvePages(undefined, undefined)).toEqual([]);
  });

  it('falls back when the API pages do not match the story text', () => {
    const expected = splitStoryIntoPages(text);
    expect(resolvePages(['Totally different story.'], text)).toEqual(expected);
    // truncated pages
    expect(resolvePages(splitStoryIntoPages(text).slice(0, 1), text)).toEqual(
      expected
    );
  });

  it('rejects a list with the last page dropped (tail check, even when under the length tolerance)', () => {
    // ~400 pages: one page is ~0.25% of the text, below the 0.5% tolerance
    const huge = Array.from(
      { length: 10000 },
      (_, i) => `Sentence ${i} here.`
    ).join(' ');
    const hugePages = splitStoryIntoPages(huge);
    expect(resolvePages(hugePages, huge)).toEqual(hugePages);
    const dropped = hugePages.slice(0, -1);
    const out = resolvePages(dropped, huge);
    expect(out).toEqual(hugePages);
    expect(out.length).toBe(dropped.length + 1);
  });

  it('length tolerance is 0.5%: just inside accepted, just outside rejected', () => {
    const long = Array.from(
      { length: 300 },
      (_, i) => `Sentence number ${i} is here.`
    ).join(' ');
    const split = splitStoryIntoPages(long);
    const total = long.length;
    const cut = (chars: number) => {
      const pages = [...split];
      // remove `chars` characters from the middle of page 0 (tail untouched)
      const p0 = pages[0];
      const mid = Math.floor(p0.length / 2);
      pages[0] = p0.slice(0, mid) + p0.slice(mid + chars);
      return pages;
    };
    const inside = Math.floor(total * 0.005) - 1;
    const outside = Math.ceil(total * 0.005) + 2;
    expect(inside).toBeGreaterThan(0);
    expect(resolvePages(cut(inside), long)).toEqual(cut(inside));
    expect(resolvePages(cut(outside), long)).toEqual(split);
  });

  it('rejects pages with an empty entry', () => {
    const api = splitStoryIntoPages(text);
    expect(resolvePages([...api, ' '], text)).toEqual(api);
  });

  it('accepts API pages that differ only in whitespace', () => {
    const api = splitStoryIntoPages(text);
    const spaced = `${words(20, 'a')}.\n\n${words(20, 'b')}.  ${words(5, 'c')}.`;
    expect(resolvePages(api, spaced)).toEqual(api);
  });

  it('trusts API pages when there is no text to compare', () => {
    expect(resolvePages(['A.', 'B.'], undefined)).toEqual(['A.', 'B.']);
  });
});

describe('pagesSignature', () => {
  it('is stable and changes with the text', () => {
    expect(pagesSignature(['a', 'b'])).toBe(pagesSignature(['a', 'b']));
    expect(pagesSignature(['a', 'b'])).not.toBe(pagesSignature(['a', 'c']));
    expect(pagesSignature(['ab'])).not.toBe(pagesSignature(['a', 'b']));
  });
});
