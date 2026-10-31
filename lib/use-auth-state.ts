'use client';
import { useSyncExternalStore } from 'react';
import { isUserLoggedIn } from '@/lib/services';

export type AuthState = 'unknown' | 'in' | 'out';

const subscribe = (cb: () => void) => {
  // Cookies don't emit events; re-check on focus/visibility and storage
  // changes (other tabs signing in or out).
  window.addEventListener('focus', cb);
  window.addEventListener('storage', cb);
  document.addEventListener('visibilitychange', cb);
  return () => {
    window.removeEventListener('focus', cb);
    window.removeEventListener('storage', cb);
    document.removeEventListener('visibilitychange', cb);
  };
};

const getSnapshot = (): AuthState => (isUserLoggedIn() ? 'in' : 'out');
const getServerSnapshot = (): AuthState => 'unknown';

/**
 * Signed-in state for UI, from the same signal as middleware.ts (token
 * cookie). 'unknown' during SSR and hydration (no mismatch), then 'in'/'out'.
 */
export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
