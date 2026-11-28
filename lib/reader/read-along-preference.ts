import { useSyncExternalStore } from 'react';

export const READ_ALONG_DEFAULT_KEY = 'storytime:readAlongDefault';

const listeners = new Set<() => void>();

export function getReadAlongDefault(): boolean {
  try {
    return localStorage.getItem(READ_ALONG_DEFAULT_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setReadAlongDefault(on: boolean): void {
  try {
    localStorage.setItem(READ_ALONG_DEFAULT_KEY, String(on));
  } catch {
    return;
  } finally {
    for (const listener of listeners) {
      listener();
    }
  }
}

export function subscribeReadAlongDefault(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === READ_ALONG_DEFAULT_KEY || e.key === null) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useReadAlongDefault(): boolean {
  return useSyncExternalStore(
    subscribeReadAlongDefault,
    getReadAlongDefault,
    () => true
  );
}
