'use client';

import FavoriteHeart from '@/components/favorite-heart';
import StoryStatusBadge from '@/components/story-status-badge';
import {
  type StoryCategory,
  type StoryListItem,
  listCategoriesService,
  listStoriesService,
} from '@/lib/services';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import StorySection from './story-section';

const AGE_GROUPS = [
  { label: 'All', minAge: undefined, maxAge: undefined },
  { label: '1-3', minAge: 1, maxAge: 3 },
  { label: '4-6', minAge: 4, maxAge: 6 },
  { label: '7-9', minAge: 7, maxAge: 9 },
  // 10-12 intentionally omitted — no stories for that age yet (matches mobile).
] as const;

const StoryHome = () => {
  // Section 1 — Stories by age (re-fetched when the age chip changes).
  const [ageGroup, setAgeGroup] = useState<string>('All');
  const [ageStories, setAgeStories] = useState<StoryListItem[]>([]);
  const [ageLoading, setAgeLoading] = useState(true);

  // Sections 2-5.
  const [topRecommendations, setTopRecommendations] = useState<StoryListItem[]>(
    []
  );
  const [topPicks, setTopPicks] = useState<StoryListItem[]>([]);
  const [seasonal, setSeasonal] = useState<StoryListItem[]>([]);
  const [funAndAdventures, setFunAndAdventures] = useState<StoryListItem[]>([]);
  const [funCategory, setFunCategory] = useState<StoryCategory | null>(null);

  // Section 6 — category tiles.
  const [categories, setCategories] = useState<StoryCategory[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [cats, recs, picks, season] = await Promise.all([
        listCategoriesService(),
        listStoriesService({ isMostLiked: true, shuffle: true, limit: 10 }),
        listStoriesService({ topPicksFromUs: true, shuffle: true, limit: 10 }),
        listStoriesService({ isSeasonal: true, shuffle: true, limit: 10 }),
      ]);

      const firstCat = cats[0] ?? null;
      const funStories = firstCat
        ? await listStoriesService({
            category: firstCat.id,
            shuffle: true,
            limit: 10,
          })
        : [];

      if (cancelled) {
        return;
      }

      setCategories(cats);
      setTopRecommendations(recs);
      setTopPicks(picks);
      setSeasonal(season);
      setFunCategory(firstCat);
      setFunAndAdventures(funStories);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAge = async () => {
      setAgeLoading(true);
      const group =
        AGE_GROUPS.find((g) => g.label === ageGroup) ?? AGE_GROUPS[0];
      const stories = await listStoriesService({
        ...(typeof group.minAge === 'number' ? { minAge: group.minAge } : {}),
        ...(typeof group.maxAge === 'number' ? { maxAge: group.maxAge } : {}),
        shuffle: true,
        limit: 10,
      });
      if (cancelled) {
        return;
      }
      setAgeStories(stories);
      setAgeLoading(false);
    };

    loadAge();
    return () => {
      cancelled = true;
    };
  }, [ageGroup]);

  return (
    <div>
      {/* Section 1 — Stories by age */}
      <section className='mt-12'>
        <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
          <h2 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
            Stories by age
          </h2>
          <Link
            href={
              ageGroup === 'All'
                ? '/stories?filter=all'
                : `/stories?filter=age&minAge=${AGE_GROUPS.find((g) => g.label === ageGroup)?.minAge}&maxAge=${AGE_GROUPS.find((g) => g.label === ageGroup)?.maxAge}`
            }
            className='text-sm font-semibold text-[#EC4007] font-abeezee hover:underline'
          >
            View all
          </Link>
        </div>
        <div className='mb-6 flex flex-wrap gap-2'>
          {AGE_GROUPS.map((group) => {
            const active = ageGroup === group.label;
            return (
              <button
                key={group.label}
                type='button'
                onClick={() => setAgeGroup(group.label)}
                className={`rounded-full px-4 py-2 text-sm font-semibold font-abeezee transition ${
                  active
                    ? 'bg-[#EC4007] text-white'
                    : 'bg-white text-[#4A413F] border border-stone-100 hover:bg-[#FCE9CE]'
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        {ageLoading ? (
          <div className='flex gap-6 overflow-x-auto pb-2'>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className='h-[16rem] w-[15rem] shrink-0 animate-pulse rounded-3xl bg-stone-100'
              />
            ))}
          </div>
        ) : ageStories.length === 0 ? (
          <p className='text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
            No stories for this age group yet.
          </p>
        ) : (
          <div className='flex gap-6 overflow-x-auto pb-2 scrollbar'>
            {ageStories.map((story) => (
              <StorySectionCardLink key={story.id} story={story} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2 — Top recommendations */}
      <StorySection
        title='Top recommendations'
        stories={topRecommendations}
        viewAllHref='/stories?filter=recommendations'
        loading={loading}
      />

      {/* Section 3 — Today's top picks */}
      <StorySection
        title="Today's top picks"
        stories={topPicks}
        viewAllHref='/stories?filter=top-picks'
        loading={loading}
      />

      {/* Section 4 — Seasonal stories */}
      <StorySection
        title='Seasonal stories'
        stories={seasonal}
        viewAllHref='/stories?filter=seasonal'
        loading={loading}
      />

      {/* Section 5 — Fun & adventures (first category) */}
      <StorySection
        title='Fun & adventures'
        stories={funAndAdventures}
        viewAllHref={
          funCategory ? `/stories?category=${funCategory.id}` : undefined
        }
        loading={loading}
      />

      {/* Section 6 — Story categories grid */}
      <section className='mt-12'>
        <h2 className='mb-4 text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
          Story categories
        </h2>
        {loading ? (
          <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className='h-[9rem] animate-pulse rounded-3xl bg-stone-100'
              />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className='text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
            No categories yet.
          </p>
        ) : (
          <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/stories?category=${category.id}`}
                className='group relative flex h-[9rem] items-end overflow-hidden rounded-3xl border border-stone-100 bg-[#FCE9CE] shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] transition-all duration-300 hover:scale-[1.03]'
              >
                {category.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host, avoids next.config image allowlist
                  <img
                    src={category.image}
                    alt={category.name}
                    className='absolute inset-0 h-full w-full object-cover transition group-hover:scale-105'
                  />
                )}
                <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent' />
                <h3 className='relative z-10 p-4 text-white text-lg not-italic font-bold leading-6 font-qilka'>
                  {category.name}
                </h3>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

// Local card matching StorySection's card, used for the age row so the age
// chips can live in the same section wrapper.
const StorySectionCardLink = ({ story }: { story: StoryListItem }) => {
  const age =
    typeof story.ageMin === 'number' && typeof story.ageMax === 'number'
      ? `Ages ${story.ageMin}–${story.ageMax}`
      : typeof story.ageMin === 'number'
        ? `Ages ${story.ageMin}+`
        : null;
  return (
    <div className='relative w-[15rem] shrink-0'>
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
        className='group block overflow-hidden rounded-3xl border border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] transition-all duration-300 hover:scale-[1.03]'
      >
        <div className='aspect-[4/3] w-full overflow-hidden bg-[#FCE9CE]'>
          {story.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host, avoids next.config image allowlist
            <img
              src={story.coverImageUrl}
              alt={story.title}
              className='h-full w-full object-cover transition group-hover:scale-105'
            />
          ) : (
            <div className='flex h-full w-full items-center justify-center text-5xl'>
              📖
            </div>
          )}
        </div>
        <div className='p-4'>
          <h3 className='truncate text-[#221D1D] text-lg not-italic font-bold leading-6 font-qilka'>
            {story.title}
          </h3>
          {age && (
            <span className='mt-1 inline-block text-sm font-semibold text-[#4807EC] font-abeezee'>
              {age}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
};

export default StoryHome;
