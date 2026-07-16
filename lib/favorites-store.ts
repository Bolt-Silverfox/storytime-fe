'use client';

import {
  addFavoriteService,
  isUserLoggedIn,
  listFavoritesService,
  removeFavoriteService,
} from '@/lib/services';
import { useSyncExternalStore } from 'react';

// Module-singleton store of the current user's favorited story ids. Shared by
// every FavoriteHeart on the page so a toggle on one card reflects everywhere.

let favorites = new Set<string>();
const listeners = new Set<() => void>();

// One-time load guards so we only fetch the server list once per session.
let loaded = false;
let loading = false;

const EMPTY_SET = new Set<string>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const setFavorites = (next: Set<string>) => {
  favorites = next;
  emit();
};

const loadOnce = () => {
  if (loaded || loading) {
    return;
  }
  if (!isUserLoggedIn()) {
    loaded = true;
    return;
  }
  loading = true;
  listFavoritesService()
    .then((list) => {
      const ids = list.map((item) => item.storyId).filter(Boolean);
      setFavorites(new Set(ids));
    })
    .catch(() => {
      // Ignore — an empty favorites set is a safe default.
    })
    .finally(() => {
      loaded = true;
      loading = false;
    });
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
  const isFavorite = favorites.has(storyId);
  const next = new Set(favorites);

  if (isFavorite) {
    next.delete(storyId);
  } else {
    next.add(storyId);
  }
  // Optimistic update — flip immediately, then sync with the server.
  setFavorites(next);

  const request = isFavorite
    ? removeFavoriteService(storyId)
    : addFavoriteService(storyId);

  request.catch(() => {
    // Revert on failure.
    const reverted = new Set(favorites);
    if (isFavorite) {
      reverted.add(storyId);
    } else {
      reverted.delete(storyId);
    }
    setFavorites(reverted);
  });
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
