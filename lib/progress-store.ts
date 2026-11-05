'use client';

import Cookies from 'js-cookie';
import { useSyncExternalStore } from 'react';
import {
  getCompletedStoriesService,
  getInProgressStoriesService,
  isUserLoggedIn,
  recordUserProgressService,
} from '@/lib/services';

// Module-singleton store of per-story reading status. Works for guests
// (persisted to localStorage) and logged-in users (hydrated from the library).

export type StoryStatus = 'reading' | 'done' | null;

const GUEST_READING_KEY = 'guestReadingStories';
const GUEST_DONE_KEY = 'guestDoneStories';

let reading = new Set<string>();
let done = new Set<string>();
const listeners = new Set<() => void>();

let loaded = false;
let loading = false;

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const readGuestIds = (key: string): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const writeGuestIds = (key: string, ids: Set<string>) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Ignore — persistence is best-effort.
  }
};

const loadOnce = () => {
  if (loaded || loading) {
    return;
  }

  if (isUserLoggedIn()) {
    loading = true;
    Promise.all([getInProgressStoriesService(), getCompletedStoriesService()])
      .then(([inProgress, completed]) => {
        reading = new Set(inProgress.map((s) => s.id).filter(Boolean));
        done = new Set(completed.map((s) => s.id).filter(Boolean));
        emit();
      })
      .catch(() => {
        // Ignore — empty sets are a safe default.
      })
      .finally(() => {
        loaded = true;
        loading = false;
      });
    return;
  }

  // Guest — hydrate from localStorage.
  reading = new Set(readGuestIds(GUEST_READING_KEY));
  done = new Set(readGuestIds(GUEST_DONE_KEY));
  loaded = true;
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  loadOnce();
  return () => {
    listeners.delete(listener);
  };
};

const statusOf = (storyId: string): StoryStatus => {
  if (done.has(storyId)) {
    return 'done';
  }
  if (reading.has(storyId)) {
    return 'reading';
  }
  return null;
};

export const markReading = (storyId: string) => {
  if (done.has(storyId) || reading.has(storyId)) {
    return;
  }
  reading = new Set(reading);
  reading.add(storyId);
  emit();

  if (isUserLoggedIn()) {
    // Fire-and-forget — surfacing progress is best-effort.
    recordUserProgressService(storyId, 5, false).catch(() => {
      // Ignore.
    });
  } else {
    writeGuestIds(GUEST_READING_KEY, reading);
  }
};

export const markDone = (storyId: string) => {
  reading = new Set(reading);
  reading.delete(storyId);
  done = new Set(done);
  done.add(storyId);
  emit();

  if (isUserLoggedIn()) {
    // The reader already records completion; just reflect it in memory here.
    return;
  }
  writeGuestIds(GUEST_READING_KEY, reading);
  writeGuestIds(GUEST_DONE_KEY, done);
};

export const useStoryStatus = (storyId: string): StoryStatus => {
  // The snapshot returns a primitive status ('reading' | 'done' | null), so it
  // stays referentially stable between emits and only changes when the status
  // actually changes. Both underlying Sets are replaced on every mutation.
  return useSyncExternalStore(
    subscribe,
    () => statusOf(storyId),
    () => null
  );
};

// Per-story reading position (page index), so reopening resumes where the
// reader left off. Device-local. Keyed by reader identity (guest session or
// signed-in user) so one person's place isn't applied to another on a shared
// browser, and stored with a content signature so it is dropped if the story
// text changed.
const POSITIONS_KEY = 'readerPositions';

type PositionMap = Record<
  string,
  { page: number; count: number; sig?: string; at?: number }
>;

const MAX_POSITIONS = 200;

const tokenUserId = (token: string | undefined): string | null => {
  try {
    const payload = token?.split('.')[1];
    if (!payload) {
      return null;
    }
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    );
    const id = json?.userId ?? json?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
};

const storedUserId = (): string | null => {
  try {
    const id = JSON.parse(window.localStorage.getItem('user') ?? 'null')?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
};

// Who is reading: the signed-in user (backend access token carries `userId`;
// the stored user object covers a refresh-only session) or the guest session.
// A signed-in reader we can't identify returns null: nothing is persisted
// rather than sharing one key between accounts. (A guest's position is not
// carried over to their account on login; the account starts from page one.)
const readerScope = (): string | null => {
  if (isUserLoggedIn()) {
    const id = tokenUserId(Cookies.get('accessToken')) ?? storedUserId();
    return id ? `u:${id}` : null;
  }
  return `g:${Cookies.get('guestSessionId') ?? ''}`;
};

const positionKey = (storyId: string): string | null => {
  const scope = readerScope();
  return scope ? `${scope}|${storyId}` : null;
};

const readPositions = (): PositionMap => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(POSITIONS_KEY) ?? 'null'
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PositionMap)
      : {};
  } catch {
    return {};
  }
};

const writePositions = (map: PositionMap) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(map));
  } catch {
    // Ignore — persistence is best-effort.
  }
};

export const getReadingPosition = (
  storyId: string,
  pageCount: number,
  sig?: string
): number | null => {
  const key = positionKey(storyId);
  const entry = key ? readPositions()[key] : undefined;
  if (
    !entry ||
    entry.count !== pageCount ||
    (sig !== undefined && entry.sig !== sig) ||
    !Number.isInteger(entry.page) ||
    entry.page < 0 ||
    entry.page >= pageCount
  ) {
    return null;
  }
  return entry.page;
};

export const saveReadingPosition = (
  storyId: string,
  page: number,
  pageCount: number,
  sig?: string
) => {
  const key = positionKey(storyId);
  if (pageCount <= 0 || !key) {
    return;
  }
  const map = readPositions();
  // Strictly increasing so recency order survives same-millisecond saves.
  const latest = Math.max(0, ...Object.values(map).map((e) => e?.at ?? 0));
  map[key] = {
    page: Math.min(Math.max(Math.trunc(page) || 0, 0), pageCount - 1),
    count: pageCount,
    sig,
    at: Math.max(Date.now(), latest + 1),
  };
  // Drop legacy bare-id keys and keep only the most recent entries.
  const kept = Object.entries(map)
    .filter(([k]) => k.includes('|'))
    .sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, MAX_POSITIONS);
  writePositions(Object.fromEntries(kept));
};

export const clearReadingPosition = (storyId: string) => {
  const map = readPositions();
  const key = positionKey(storyId);
  if (key && key in map) {
    delete map[key];
    writePositions(map);
  }
};
