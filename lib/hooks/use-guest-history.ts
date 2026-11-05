'use client';

import { useQuery } from '@tanstack/react-query';
import { getGuestHistoryService, isUserLoggedIn } from '@/lib/services';

export const GUEST_HISTORY_QUERY_KEY = ['guest-history'] as const;

export function useGuestHistory() {
  const query = useQuery({
    queryKey: GUEST_HISTORY_QUERY_KEY,
    queryFn: getGuestHistoryService,
    enabled: !isUserLoggedIn(),
    staleTime: 30_000,
    retry: false,
  });

  return query.data ?? [];
}
