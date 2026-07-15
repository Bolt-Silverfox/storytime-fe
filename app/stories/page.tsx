'use client';

import {
  type StoryCategory,
  type StoryListItem,
  listCategoriesService,
  listStoriesService,
} from '@/lib/services';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const ALL = 'All';

export default function StoriesBrowsePage() {
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [categories, setCategories] = useState<StoryCategory[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCategoriesService()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    listStoriesService(selected === ALL ? undefined : selected)
      .then(setStories)
      .catch(() => setStories([]))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <main className='min-h-dvh bg-[#FFF8ED] text-[#1B1300]'>
      <header className='mx-auto flex max-w-5xl items-center justify-between px-6 py-5'>
        <Link
          href='/'
          className='font-[family-name:var(--font-qilka)] text-2xl font-bold text-[#EC4007]'
        >
          Storytime
        </Link>
      </header>

      <section className='mx-auto max-w-5xl px-6 pb-16'>
        <h1 className='font-[family-name:var(--font-qilka)] text-3xl font-bold sm:text-4xl'>
          Stories
        </h1>
        <p className='mt-2 text-[#5B4B33]'>
          Pick a story and start reading — no account needed.
        </p>

        {/* Category filter */}
        <div className='mt-6 flex flex-wrap gap-2'>
          {[{ id: ALL, name: ALL }, ...categories].map((cat) => {
            const active = selected === cat.id;
            return (
              <button
                key={cat.id}
                type='button'
                onClick={() => setSelected(cat.id)}
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

        {loading ? (
          <p className='mt-10 text-[#5B4B33]'>Loading stories…</p>
        ) : stories.length === 0 ? (
          <p className='mt-10 text-[#5B4B33]'>
            No stories in this category yet.
          </p>
        ) : (
          <div className='mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/story/${story.id}`}
                className='group overflow-hidden rounded-3xl bg-white shadow-sm transition hover:shadow-md'
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
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
