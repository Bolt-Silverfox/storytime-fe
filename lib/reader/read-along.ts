// Estimated sentence-level read-along. The backend returns plain mp3 with no
// word timings, so we guess which sentence of the page is being spoken from how
// far through the clip the playhead is. It is an estimate, not an alignment:
// expect drift of a second or two on a 30-word page.

export interface SentenceRange {
  start: number;
  end: number;
}

// Same boundary as paginate.ts (splitByWordCountPreservingSentences), so a page
// is cut into the sentences the backend cut it from. A hard-split chunk with no
// punctuation is simply one sentence.
const SENTENCE_BREAK = /(?<=[.!?])\s+/g;
const ENDS_SENTENCE = /[.!?]$/;

// Narration runs at roughly 15 characters a second, so the ~0.25 s pause a
// voice leaves after a full stop is worth about this many characters.
const PAUSE_WEIGHT = 4;

export const sentencesOf = (pageText: string): SentenceRange[] => {
  const ranges: SentenceRange[] = [];
  const push = (from: number, to: number) => {
    let start = from;
    let end = to;
    while (start < end && /\s/.test(pageText.charAt(start))) {
      start += 1;
    }
    while (end > start && /\s/.test(pageText.charAt(end - 1))) {
      end -= 1;
    }
    if (end > start) {
      ranges.push({ start, end });
    }
  };
  let from = 0;
  for (const m of pageText.matchAll(SENTENCE_BREAK)) {
    push(from, m.index);
    from = m.index + m[0].length;
  }
  push(from, pageText.length);
  return ranges;
};

const weightOf = (text: string, s: SentenceRange): number =>
  s.end -
  s.start +
  (ENDS_SENTENCE.test(text.slice(s.start, s.end)) ? PAUSE_WEIGHT : 0);

// Index of the sentence being spoken at `fraction` (currentTime / duration) of
// the clip, or null when there is nothing to show (no sentences, unknown
// duration). Stateless, so seeking backwards just works.
export const activeSentence = (
  pageText: string,
  sentences: SentenceRange[],
  fraction: number
): number | null => {
  if (sentences.length === 0 || !Number.isFinite(fraction)) {
    return null;
  }
  const weights = sentences.map((s) => weightOf(pageText, s));
  const total = weights.reduce((a, b) => a + b, 0);
  // Out-of-range fractions need no clamp: below 0 lands in the first
  // sentence, above 1 falls through to the last.
  const target = fraction * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i] ?? 0;
    if (target < acc) {
      return i;
    }
  }
  return sentences.length - 1;
};
