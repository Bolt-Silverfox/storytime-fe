'use client';

import Link from 'next/link';
import { useGuestHistory } from '@/lib/hooks/use-guest-history';

const ReadBeforeRow = () => {
  const stories = [...useGuestHistory()].sort(
    (a, b) =>
      new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
  );

  if (stories.length === 0) {
    return null;
  }

  return (
    <section className='mb-8'>
      <h2 className='font-[family-name:var(--font-qilka)] text-xl font-bold'>
        Read before
      </h2>
      <div className='mt-3 flex gap-4 overflow-x-auto pb-2'>
        {stories.map((story) => (
          <Link
            key={story.storyId}
            href={`/story/${story.storyId}`}
            className='w-40 shrink-0 overflow-hidden rounded-2xl bg-surface shadow-sm transition hover:shadow-md'
          >
            <div className='aspect-[4/3] w-full overflow-hidden bg-sand'>
              {story.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host
                <img
                  src={story.coverImageUrl}
                  alt={story.title}
                  className='h-full w-full object-cover'
                />
              ) : (
                <div className='flex h-full w-full items-center justify-center text-3xl'>
                  📖
                </div>
              )}
            </div>
            <p className='p-3 text-sm font-semibold leading-snug'>
              {story.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default ReadBeforeRow;
