// Shared data helpers for the public story share page and its generated OG image.

export type SharedStory = {
  id: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  imageUrl?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

// Story ids are UUIDs. Share URLs are `/story/<slug>-<uuid>` (readable slug +
// trailing id), so extract the UUID from anywhere in the param. Plain
// `/story/<uuid>` links (no slug) still match. Falls back to the raw param.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const extractStoryId = (param: string): string =>
  param.match(UUID_RE)?.[0] ?? param;

export const coverOf = (story: SharedStory): string | null =>
  story.coverImageUrl || story.imageUrl || null;

export const ageLabel = (story: SharedStory): string | null => {
  const { ageMin, ageMax } = story;
  if (typeof ageMin === 'number' && typeof ageMax === 'number') {
    return `Ages ${ageMin}–${ageMax}`;
  }
  if (typeof ageMin === 'number') {
    return `Ages ${ageMin}+`;
  }
  return null;
};

// Server-side fetch of shareable story metadata. The backend's GET /stories/:id
// is @OptionalAuth and only quota-guards authenticated requests, so an anonymous
// server request returns the story. Accepts the raw route param (slug-uuid) and
// resolves the UUID itself. Returns null on any error so callers can degrade.
export async function getStory(param: string): Promise<SharedStory | null> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return null;
  }
  const id = extractStoryId(param);
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  try {
    const res = await fetch(`${base}/api/v1/stories/${id}`, {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const story = (body?.data ?? body) as SharedStory | undefined;
    if (!story?.id) {
      return null;
    }
    return story;
  } catch {
    return null;
  }
}
