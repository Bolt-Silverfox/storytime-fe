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
  { page: number; count: number; sig?: string }
>;

const jwtSubject = (token: string | undefined): string | null => {
  try {
    const payload = token?.split('.')[1];
    if (!payload) {
      return null;
    }
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    );
    return typeof json?.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
};

const readerScope = (): string => {
  if (isUserLoggedIn()) {
    return `u:${jwtSubject(Cookies.get('accessToken') ?? Cookies.get('refreshToken')) ?? ''}`;
  }
  return `g:${Cookies.get('guestSessionId') ?? ''}`;
};

const positionKey = (storyId: string) => `${readerScope()}|${storyId}`;

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
  const entry = readPositions()[positionKey(storyId)];
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
  if (pageCount <= 0) {
    return;
  }
  const map = readPositions();
  map[positionKey(storyId)] = {
    page: Math.min(Math.max(Math.trunc(page) || 0, 0), pageCount - 1),
    count: pageCount,
    sig,
  };
  writePositions(map);
};

export const clearReadingPosition = (storyId: string) => {
  const map = readPositions();
  const key = positionKey(storyId);
  if (key in map) {
    delete map[key];
    writePositions(map);
  }
};
