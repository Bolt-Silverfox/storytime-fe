'use client';

import { getUserFromStorage, isUserLoggedIn } from '@/lib/services';
import { useEffect, useState, useSyncExternalStore } from 'react';

// Module-singleton store of the current user's favorited story ids. Shared by
// every FavoriteHeart on the page so a toggle on one card reflects everywhere.
//
// Blue's backend favorites are kid-scoped and the web app has no kid context,
// so favorites here are CLIENT-SIDE ONLY — persisted to localStorage. No
// parent-favorites backend calls are made.

const FAVORITES_KEY_BASE = 'favoriteStories';

// Scope persisted favorites by the signed-in user id so a shared browser never
// leaks one account's favorites to the next account (or after logout). Guests
// keep the legacy unscoped key so their favorites survive.
const favoritesKey = (): string => {
  const userId = getUserFromStorage()?.id;
  return userId ? `${FAVORITES_KEY_BASE}:${userId}` : FAVORITES_KEY_BASE;
};

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
    const raw = window.localStorage.getItem(favoritesKey());
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
    window.localStorage.setItem(favoritesKey(), JSON.stringify([...ids]));
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

// Reset in-memory state so the next account (or a re-hydrate) reads its own
// namespaced key rather than the previous account's favorites. Wire into logout.
export const resetFavoritesStore = () => {
  favorites = new Set();
  loaded = false;
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

  // isUserLoggedIn() reads localStorage/cookies, which are unavailable during
  // SSR/first render — calling it inline would risk a hydration mismatch.
  // Resolve it after mount so the server snapshot is a stable `false`.
  const [canFavorite, setCanFavorite] = useState(false);
  useEffect(() => {
    setCanFavorite(isUserLoggedIn());
  }, []);

  return {
    isFavorite: current.has(storyId),
    canFavorite,
    toggle: () => toggleFavorite(storyId),
  };
};
