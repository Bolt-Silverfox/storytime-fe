'use client';

import { useQuery } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import {
  type GuestHistoryStory,
  getGuestHistoryService,
  isUserLoggedIn,
} from '@/lib/services';

export const GUEST_HISTORY_QUERY_KEY = ['guest-history'] as const;

const NO_HISTORY: GuestHistoryStory[] = [];

export function useGuestHistory() {
  const loggedIn = isUserLoggedIn();
  const sessionId = Cookies.get('guestSessionId');
  const query = useQuery({
    queryKey: [...GUEST_HISTORY_QUERY_KEY, sessionId],
    queryFn: getGuestHistoryService,
    enabled: !loggedIn && !!sessionId,
    staleTime: 30_000,
    retry: false,
  });

  if (loggedIn || !sessionId) {
    return NO_HISTORY;
  }
  return query.data ?? NO_HISTORY;
}
