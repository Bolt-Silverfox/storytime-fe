'use client';

import BackButton from '@/components/back-button';
import Header from '@/components/header';
import StoryStatusBadge from '@/components/story-status-badge';
import {
  type FavoriteStory,
  isUserLoggedIn,
  listFavoritesService,
  removeFavoriteService,
} from '@/lib/services';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const FavoritesPage = () => {
  const [favorites, setFavorites] = useState<FavoriteStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    const list = await listFavoritesService();
    setFavorites(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isUserLoggedIn()) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }
    fetchFavorites();
  }, [fetchFavorites]);

  const handleRemove = async (storyId: string) => {
    setRemoving(storyId);
    try {
      await removeFavoriteService(storyId);
      setFavorites((prev) => prev.filter((f) => f.storyId !== storyId));
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-4 sm:px-6 md:px-10 py-6 md:py-[2.125rem] w-full max-w-6xl mx-auto my-6 md:my-12'>
      <Header white={false} />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
          Favorites
        </h2>
        <p className='mb-6 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          Stories you've saved to read again.
        </p>

        {!loggedIn ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              Log in to see your favorite stories.
            </p>
            <Link
              href='/login'
              className='mt-4 inline-block rounded-2xl bg-[#EC4007] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
            >
              Log in
            </Link>
          </div>
        ) : loading ? (
          <div className='grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4'>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className='h-[16rem] animate-pulse rounded-3xl bg-stone-100'
              />
            ))}
          </div>
        ) : favorites.length === 0 ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              No favorites yet. Tap the heart on a story to save it here.
            </p>
            <Link
              href='/stories'
              className='mt-4 inline-block rounded-2xl bg-[#EC4007] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
            >
              Browse stories
            </Link>
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4'>
            {favorites.map((story) => (
              <div
                key={story.id}
                className='group relative overflow-hidden rounded-3xl border border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] transition-all duration-300 hover:scale-[1.02]'
              >
                <StoryStatusBadge
                  storyId={story.storyId}
                  className='absolute left-3 top-3 z-10'
                />
                <Link href={`/story/${story.storyId}`}>
                  <div className='aspect-[4/3] w-full overflow-hidden bg-[#FCE9CE]'>
                    {story.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host
                      <img
                        src={story.coverImageUrl}
                        alt={story.title}
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      <div className='flex h-full w-full items-center justify-center text-5xl'>
                        📖
                      </div>
                    )}
                  </div>
                  <div className='p-4'>
                    <h3 className='text-[#221D1D] text-base not-italic font-bold leading-5 font-qilka line-clamp-2'>
                      {story.title}
                    </h3>
                    {story.ageRange && (
                      <span className='mt-1 inline-block text-sm font-semibold text-[#4807EC] font-abeezee'>
                        Ages {story.ageRange}
                      </span>
                    )}
                  </div>
                </Link>
                <button
                  type='button'
                  onClick={() => handleRemove(story.storyId)}
                  disabled={removing === story.storyId}
                  aria-label='Remove from favorites'
                  className='absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-md transition hover:scale-110 disabled:opacity-50'
                >
                  {removing === story.storyId ? '…' : '❤️'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FavoritesPage;
