import { describe, expect, it } from 'vitest';
import { activeSentence, sentencesOf } from './read-along';

const slice = (t: string) => sentencesOf(t).map((s) => t.slice(s.start, s.end));

describe('sentencesOf', () => {
  it('returns nothing for empty or blank text', () => {
    expect(sentencesOf('')).toEqual([]);
    expect(sentencesOf('   ')).toEqual([]);
  });

  it('treats a single sentence as one range covering it', () => {
    expect(slice('Once upon a time.')).toEqual(['Once upon a time.']);
  });

  it('splits at . ! ? followed by whitespace, keeping the punctuation', () => {
    expect(slice('He ran. Did she? Yes! Done')).toEqual([
      'He ran.',
      'Did she?',
      'Yes!',
      'Done',
    ]);
  });

  it('does not split on punctuation inside a word or without a space', () => {
    expect(slice('Pi is 3.14 today. Fine.')).toEqual([
      'Pi is 3.14 today.',
      'Fine.',
    ]);
  });

  it('keeps a hard-split chunk with no punctuation as one sentence', () => {
    const t = 'one two three four five six seven eight nine ten';
    expect(slice(t)).toEqual([t]);
  });

  it('offsets index the original text so spans can rebuild it exactly', () => {
    const t = 'A b.  C d!\nE f';
    const ranges = sentencesOf(t);
    expect(ranges[0]?.start).toBe(0);
    for (const r of ranges) {
      expect(r.end).toBeGreaterThan(r.start);
      expect(t.slice(r.start, r.end)).toBe(t.slice(r.start, r.end).trim());
    }
  });
});

describe('activeSentence', () => {
  // Equal lengths so weights are only distinguished by pause bonus.
  const text = 'Aaaa aaaa. Bbbb bbbb. Cccc cccc.';
  const ss = sentencesOf(text);

  it('is null with no sentences', () => {
    expect(activeSentence('', [], 0.5)).toBeNull();
  });

  it('picks the first at 0, the middle at 0.5, the last at 1', () => {
    expect(activeSentence(text, ss, 0)).toBe(0);
    expect(activeSentence(text, ss, 0.5)).toBe(1);
    expect(activeSentence(text, ss, 1)).toBe(2);
  });

  it('moves on exactly at a sentence boundary', () => {
    const t = 'Aa bb. Cc dd.';
    expect(activeSentence(t, sentencesOf(t), 0.5)).toBe(1);
  });

  it('gives a sentence-final stop a small pause, a bare tail none', () => {
    const t = 'abcd. abcdefghi';
    const s = sentencesOf(t);
    // weights 5+4 and 9 (no stop at the end of the last)
    expect(activeSentence(t, s, 0.45)).toBe(0);
    expect(activeSentence(t, s, 0.55)).toBe(1);
  });

  it('clamps out-of-range fractions', () => {
    expect(activeSentence(text, ss, -3)).toBe(0);
    expect(activeSentence(text, ss, 7)).toBe(2);
  });

  it('is null for NaN / infinite fractions (e.g. duration 0)', () => {
    expect(activeSentence(text, ss, Number.NaN)).toBeNull();
    expect(activeSentence(text, ss, Number.POSITIVE_INFINITY)).toBeNull();
    expect(activeSentence(text, ss, 0 / 0)).toBeNull();
  });

  it('always returns the only sentence', () => {
    const one = sentencesOf('Just one.');
    for (const f of [0, 0.3, 1]) {
      expect(activeSentence('Just one.', one, f)).toBe(0);
    }
  });

  it('weights by length: a long sentence holds the highlight longer', () => {
    const t = 'Hi. This is a much much longer second sentence here.';
    const s = sentencesOf(t);
    expect(activeSentence(t, s, 0.05)).toBe(0);
    expect(activeSentence(t, s, 0.2)).toBe(1);
    expect(activeSentence(t, s, 0.9)).toBe(1);
  });

  it('is stateless, so seeking backwards moves the highlight back', () => {
    expect(activeSentence(text, ss, 0.9)).toBe(2);
    expect(activeSentence(text, ss, 0.1)).toBe(0);
  });
});
