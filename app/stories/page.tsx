'use client';

import StoryHome from '@/app/(home)/dashboard/_components/story-home';
import BackButton from '@/components/back-button';
import FavoriteHeart from '@/components/favorite-heart';
import StoryStatusBadge from '@/components/story-status-badge';
import { useInfiniteStories } from '@/lib/hooks/use-infinite-stories';
import {
  type StoryCategory,
  type StoryQuery,
  listCategoriesService,
} from '@/lib/services';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

const ALL = 'All';

function StoriesBrowse() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category');
  // "View all" filters from the home sections.
  const filter = searchParams.get('filter');
  const minAge = searchParams.get('minAge');
  const maxAge = searchParams.get('maxAge');

  const [categories, setCategories] = useState<StoryCategory[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Browse mode when any category/filter is present; otherwise show the home.
  const isBrowse = !!(category || filter);

  useEffect(() => {
    listCategoriesService()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Params driving the paginated infinite-scroll query (no shuffle — paging).
  let storyParams: StoryQuery;
  if (category) {
    storyParams = { category };
  } else if (filter === 'recommendations') {
    storyParams = { isMostLiked: true };
  } else if (filter === 'top-picks') {
    storyParams = { topPicksFromUs: true };
  } else if (filter === 'seasonal') {
    storyParams = { isSeasonal: true };
  } else if (filter === 'age') {
    storyParams = {
      minAge: Number(minAge) || undefined,
      maxAge: Number(maxAge) || undefined,
    };
  } else {
    storyParams = {};
  }

  const { stories, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteStories(storyParams);

  useEffect(() => {
    // Load the next page when the sentinel nears the viewport bottom. A scroll
    // check is used (rather than IntersectionObserver) because it's reliable
    // across environments and fires even before the sentinel is fully visible.
    const check = () => {
      if (!hasNextPage || isFetchingNextPage) {
        return;
      }
      const node = sentinelRef.current;
      if (!node) {
        return;
      }
      if (node.getBoundingClientRect().top <= window.innerHeight + 800) {
        fetchNextPage();
      }
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // Run once in case the first page doesn't fill the screen.
    check();
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Nothing selected -> the shared mobile-style home for guests.
  if (!isBrowse) {
    return (
      <main className='min-h-dvh bg-[#FFF8ED] text-[#1B1300]'>
        <header className='mx-auto flex max-w-6xl items-center justify-between px-6 py-5'>
          <Link
            href='/'
            className='font-[family-name:var(--font-qilka)] text-2xl font-bold text-[#EC4007]'
          >
            Storytime
          </Link>
          <Link
            href='/register'
            className='rounded-full bg-[#EC4007] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90'
          >
            Sign up
          </Link>
        </header>
        <section className='mx-auto max-w-6xl px-6 pb-16'>
          <StoryHome />
        </section>
      </main>
    );
  }

  const activeCategory = categories.find((c) => c.id === category);
  const browseTitle = category
    ? (activeCategory?.name ?? 'Stories')
    : filter === 'recommendations'
      ? 'Top recommendations'
      : filter === 'top-picks'
        ? "Today's top picks"
        : filter === 'seasonal'
          ? 'Seasonal stories'
          : filter === 'age' && minAge && maxAge
            ? `Stories for ages ${minAge}–${maxAge}`
            : 'All stories';

  return (
    <main className='min-h-dvh bg-[#FFF8ED] text-[#1B1300]'>
      <header className='mx-auto flex max-w-5xl items-center justify-between px-6 py-5'>
        <div className='flex items-center gap-3'>
          <BackButton />
          <Link
            href='/'
            className='font-[family-name:var(--font-qilka)] text-2xl font-bold text-[#EC4007]'
          >
            Storytime
          </Link>
        </div>
      </header>

      <section className='mx-auto max-w-5xl px-6 pb-16'>
        <h1 className='font-[family-name:var(--font-qilka)] text-3xl font-bold sm:text-4xl'>
          {browseTitle}
        </h1>
        <p className='mt-2 text-[#5B4B33]'>
          Pick a story and start reading — no account needed.
        </p>

        {/* Category filter */}
        <div className='mt-6 flex flex-wrap gap-2'>
          {[{ id: ALL, name: ALL }, ...categories].map((cat) => {
            const active = cat.id === category;
            return (
              <button
                key={cat.id}
                type='button'
                onClick={() => {
                  if (cat.id === ALL) {
                    router.push('/stories');
                  } else {
                    router.push(`/stories?category=${cat.id}`);
                  }
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-[#EC4007] text-white'
                    : 'bg-white text-[#5B4B33] hover:bg-[#FCE9CE]'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <p className='mt-10 text-[#5B4B33]'>Loading stories…</p>
        ) : stories.length === 0 ? (
          <p className='mt-10 text-[#5B4B33]'>
            No stories in this category yet.
          </p>
        ) : (
          <div className='mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
            {stories.map((story) => (
              <div key={story.id} className='relative'>
                <StoryStatusBadge
                  storyId={story.id}
                  className='absolute left-3 top-3 z-10'
                />
                <FavoriteHeart
                  storyId={story.id}
                  className='absolute right-3 top-3 z-10'
                />
                <Link
                  href={`/story/${story.id}`}
                  className='group block overflow-hidden rounded-3xl bg-white shadow-sm transition hover:shadow-md'
                >
                  <div className='aspect-[4/3] w-full overflow-hidden bg-[#FCE9CE]'>
                    {story.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host
                      <img
                        src={story.coverImageUrl}
                        alt={story.title}
                        className='h-full w-full object-cover transition group-hover:scale-[1.03]'
                      />
                    ) : (
                      <div className='flex h-full w-full items-center justify-center text-5xl'>
                        📖
                      </div>
                    )}
                  </div>
                  <div className='p-4'>
                    <h2 className='font-[family-name:var(--font-qilka)] text-lg font-bold leading-snug'>
                      {story.title}
                    </h2>
                    {typeof story.ageMin === 'number' && (
                      <span className='mt-1 inline-block text-sm font-semibold text-[#4807EC]'>
                        Ages {story.ageMin}
                        {typeof story.ageMax === 'number'
                          ? `–${story.ageMax}`
                          : '+'}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Infinite-scroll sentinel + loading indicator */}
        <div ref={sentinelRef} className='h-px w-full' />
        {isFetchingNextPage && (
          <p className='mt-6 text-center text-[#5B4B33]'>Loading more…</p>
        )}
      </section>
    </main>
  );
}

export default function StoriesBrowsePage() {
  return (
    <Suspense fallback={null}>
      <StoriesBrowse />
    </Suspense>
  );
}
