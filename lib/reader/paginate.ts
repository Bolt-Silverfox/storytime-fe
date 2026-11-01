// Page split for the web reader. This is a line-for-line mirror of the
// backend's splitByWordCountPreservingSentences (storytime_be
// src/voice/utils/paragraph-splitter.ts) with STORY_WORDS_PER_PAGE = 30
// (src/story/scenes/story-pages.util.ts). The backend uses the same split for
// TTS paragraphs, so page N lines up with audio clip N. Keep them in sync.

export const STORY_WORDS_PER_PAGE = 30;

const splitByWordCountPreservingSentences = (
  text: string,
  wordsPerChunk: number
): string[] => {
  const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const words = sentence.split(' ').filter((w) => w.length > 0);

    // A single sentence over the limit is hard-split into sub-chunks.
    if (words.length > wordsPerChunk) {
      if (current.length > 0) {
        chunks.push(current.join(' '));
        current = [];
        currentWords = 0;
      }
      for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
      }
      continue;
    }

    if (currentWords + words.length > wordsPerChunk && current.length > 0) {
      chunks.push(current.join(' '));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += words.length;
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }
  return chunks;
};

export const splitStoryIntoPages = (text: string | null | undefined): string[] =>
  text?.trim()
    ? splitByWordCountPreservingSentences(text, STORY_WORDS_PER_PAGE)
    : [];

// Pages sent by the API (backend >= v1.7.0) win; older backends send none, so
// we paginate the story text ourselves. Always returns non-empty strings.
export const resolvePages = (
  apiPages: unknown,
  text: string | null | undefined
): string[] => {
  if (Array.isArray(apiPages)) {
    const pages = apiPages
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean);
    if (pages.length > 0 && pages.length === apiPages.length) {
      return pages;
    }
  }
  return splitStoryIntoPages(text);
};
