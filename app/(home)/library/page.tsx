'use client';

import BackButton from '@/components/back-button';
import FavoriteHeart from '@/components/favorite-heart';
import Header from '@/components/header';
import QuotaIndicator from '@/components/quota-indicator';
import StoryStatusBadge from '@/components/story-status-badge';
import {
  type StoryListItem,
  getCompletedStoriesService,
  getInProgressStoriesService,
  isUserLoggedIn,
} from '@/lib/services';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const StoryCard = ({ story }: { story: StoryListItem }) => {
  return (
    <div className='group relative overflow-hidden rounded-3xl border border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] transition-all duration-300 hover:scale-[1.02]'>
      <StoryStatusBadge
        storyId={story.id}
        className='absolute left-3 top-3 z-10'
      />
      <FavoriteHeart
        storyId={story.id}
        className='absolute right-3 top-3 z-10'
      />
      <Link href={`/story/${story.id}`}>
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
          {typeof story.ageMin === 'number' &&
            typeof story.ageMax === 'number' && (
              <span className='mt-1 inline-block text-sm font-semibold text-[#4807EC] font-abeezee'>
                Ages {story.ageMin}–{story.ageMax}
              </span>
            )}
        </div>
      </Link>
    </div>
  );
};

type TabKey = 'in-progress' | 'completed';

const StoryGrid = ({
  stories,
  emptyMessage,
}: {
  stories: StoryListItem[];
  emptyMessage: string;
}) => {
  if (stories.length === 0) {
    return (
      <p className='text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
        {emptyMessage}
      </p>
    );
  }
  return (
    <div className='grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4'>
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} />
      ))}
    </div>
  );
};

const LibraryPage = () => {
  const [inProgress, setInProgress] = useState<StoryListItem[]>([]);
  const [completed, setCompleted] = useState<StoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('in-progress');

  useEffect(() => {
    if (!isUserLoggedIn()) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }

    const fetchLibrary = async () => {
      setLoading(true);
      const [ongoing, done] = await Promise.all([
        getInProgressStoriesService(),
        getCompletedStoriesService(),
      ]);
      setInProgress(ongoing);
      setCompleted(done);
      setLoading(false);
    };

    fetchLibrary();
  }, []);

  const tabButtonClass = (tab: TabKey) => {
    const base =
      'rounded-full px-5 py-2.5 text-sm font-semibold font-abeezee transition';
    if (activeTab === tab) {
      return `${base} bg-[#EC4007] text-white`;
    }
    return `${base} text-[#4A413F] hover:bg-[#FEEAE6]`;
  };

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'>
      <Header white={false} />

      <QuotaIndicator className='mt-6' />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
          Your library
        </h2>
        <p className='mb-6 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          Pick up where you left off and revisit the stories you've finished.
        </p>

        {!loggedIn ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              Log in to see your library.
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
        ) : (
          <div>
            <div className='mb-6 inline-flex gap-2 rounded-full bg-[#FAF4F2] p-1'>
              <button
                type='button'
                onClick={() => setActiveTab('in-progress')}
                className={tabButtonClass('in-progress')}
              >
                In progress
                {inProgress.length > 0 ? ` (${inProgress.length})` : ''}
              </button>
              <button
                type='button'
                onClick={() => setActiveTab('completed')}
                className={tabButtonClass('completed')}
              >
                Completed
                {completed.length > 0 ? ` (${completed.length})` : ''}
              </button>
            </div>

            {activeTab === 'in-progress' ? (
              <StoryGrid
                stories={inProgress}
                emptyMessage='Nothing here yet — start reading to fill your library.'
              />
            ) : (
              <StoryGrid
                stories={completed}
                emptyMessage='Nothing here yet — finish a story to see it here.'
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default LibraryPage;
