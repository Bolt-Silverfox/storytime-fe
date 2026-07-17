'use client';

import { getStoryQuotaService } from '@/lib/services';
import { useQuery } from '@tanstack/react-query';

// Shared query key so a story read can invalidate the quota everywhere it's shown.
export const STORY_QUOTA_QUERY_KEY = ['story-quota'] as const;

// Current story-read quota for the active audience (guest or free user).
// `quota` is null while loading or when it couldn't be determined; premium /
// unlimited users report `unlimited: true` so callers can hide the indicator.
export function useStoryQuota() {
  const query = useQuery({
    queryKey: STORY_QUOTA_QUERY_KEY,
    queryFn: getStoryQuotaService,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    quota: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
