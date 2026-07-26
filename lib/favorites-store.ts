'use client';

import { isUserLoggedIn } from '@/lib/services';
import { useSyncExternalStore } from 'react';

// Module-singleton store of the current user's favorited story ids. Shared by
// every FavoriteHeart on the page so a toggle on one card reflects everywhere.
//
// Blue's backend favorites are kid-scoped and the web app has no kid context,
// so favorites here are CLIENT-SIDE ONLY — persisted to localStorage. No
// parent-favorites backend calls are made.

const FAVORITES_KEY = 'favoriteStories';

let favorites = new Set<string>();
const listeners = new Set<() => void>();

// One-time hydrate guard so we only read localStorage once per session.
let loaded = false;

const EMPTY_SET = new Set<string>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const readIds = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const writeIds = (ids: Set<string>) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore — persistence is best-effort.
  }
};

const setFavorites = (next: Set<string>) => {
  favorites = next;
  writeIds(next);
  emit();
};

const loadOnce = () => {
  if (loaded) {
    return;
  }
  loaded = true;
  favorites = new Set(readIds());
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  loadOnce();
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => favorites;

const getServerSnapshot = () => EMPTY_SET;

const toggleFavorite = (storyId: string) => {
  const next = new Set(favorites);
  if (next.has(storyId)) {
    next.delete(storyId);
  } else {
    next.add(storyId);
  }
  setFavorites(next);
};

export const useFavorite = (storyId: string) => {
  const current = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  return {
    isFavorite: current.has(storyId),
    canFavorite: isUserLoggedIn(),
    toggle: () => toggleFavorite(storyId),
  };
};
