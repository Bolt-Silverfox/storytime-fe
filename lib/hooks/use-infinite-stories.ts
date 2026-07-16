'use client';

import { type StoryQuery, listStoriesPageService } from '@/lib/services';
import { useInfiniteQuery } from '@tanstack/react-query';

export function useInfiniteStories(params: StoryQuery) {
  const query = useInfiniteQuery({
    queryKey: ['stories', params],
    queryFn: ({ pageParam }) =>
      listStoriesPageService({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined,
  });

  const stories = query.data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    stories,
    totalCount,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}
