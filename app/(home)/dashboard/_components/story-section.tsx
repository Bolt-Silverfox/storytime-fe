'use client';

import FavoriteHeart from '@/components/favorite-heart';
import StoryStatusBadge from '@/components/story-status-badge';
import type { StoryListItem } from '@/lib/services';
import Link from 'next/link';

const ageLabel = (story: StoryListItem): string | null => {
  const { ageMin, ageMax } = story;
  if (typeof ageMin === 'number' && typeof ageMax === 'number') {
    return `Ages ${ageMin}–${ageMax}`;
  }
  if (typeof ageMin === 'number') {
    return `Ages ${ageMin}+`;
  }
  return null;
};

const StoryRowCard = ({ story }: { story: StoryListItem }) => {
  const age = ageLabel(story);
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

interface StorySectionProps {
  title: string;
  stories: StoryListItem[];
  viewAllHref?: string;
  loading?: boolean;
}

const StorySection = ({
  title,
  stories,
  viewAllHref,
  loading = false,
}: StorySectionProps) => {
  return (
    <section className='mt-12'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
          {title}
        </h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className='text-sm font-semibold text-[#EC4007] font-abeezee hover:underline'
          >
            View all
          </Link>
        )}
      </div>

      {loading ? (
        <div className='flex gap-6 overflow-x-auto pb-2'>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className='h-[16rem] w-[15rem] shrink-0 animate-pulse rounded-3xl bg-stone-100'
            />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <p className='text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          No stories here yet.
        </p>
      ) : (
        <div className='flex gap-6 overflow-x-auto pb-2 scrollbar'>
          {stories.map((story) => (
            <StoryRowCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </section>
  );
};

export default StorySection;
