'use client';

import { ensureGuestSession } from '@/lib/guest';
import { type GuestStory, getGuestStoryService } from '@/lib/services';
import { useState } from 'react';
import { APP_STORE_URL, PLAY_STORE_URL } from './story-links';

export default function StoryView({ storyId }: { storyId: string }) {
  const [story, setStory] = useState<GuestStory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaReached, setQuotaReached] = useState(false);

  const handleRead = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureGuestSession();
      const result = await getGuestStoryService(storyId);
      setStory(result);
    } catch (err) {
      const status = (err as { status?: number | null })?.status;
      if (status === 403) {
        setQuotaReached(true);
      } else {
        setError(
          (err as { message?: string })?.message ||
            'We couldn’t open this story. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (quotaReached) {
    return (
      <div className='rounded-3xl border border-[#EC4007]/20 bg-white p-8 text-center'>
        <h2 className='font-[family-name:var(--font-qilka)] text-2xl font-bold text-[#1B1300]'>
          You’ve enjoyed your free stories!
        </h2>
        <p className='mx-auto mt-2 max-w-md text-[#5B4B33]'>
          Get the Storytime app for unlimited stories, audio narration, and
          more.
        </p>
        <div className='mt-6 flex flex-col justify-center gap-3 sm:flex-row'>
          <a
            href={APP_STORE_URL}
            className='rounded-2xl bg-[#EC4007] px-6 py-3 font-semibold text-white transition hover:opacity-90'
          >
            Download on the App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            className='rounded-2xl border border-[#1B1300]/15 bg-white px-6 py-3 font-semibold transition hover:border-[#1B1300]/30'
          >
            Get it on Google Play
          </a>
        </div>
      </div>
    );
  }

  if (story?.textContent) {
    const paragraphs = story.textContent
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    return (
      <article className='rounded-3xl bg-white p-6 sm:p-10'>
        <div className='mx-auto max-w-2xl'>
          {paragraphs.map((para, i) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: static story text, order is stable
              key={i}
              className='mb-5 text-lg leading-relaxed text-[#2C2415]'
            >
              {para}
            </p>
          ))}
        </div>
      </article>
    );
  }

  return (
    <div className='flex flex-col items-center gap-3'>
      <button
        type='button'
        onClick={handleRead}
        disabled={loading}
        className='rounded-2xl bg-[#EC4007] px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-60'
      >
        {loading ? 'Opening…' : 'Read this story'}
      </button>
      {error && <p className='text-sm text-red-600'>{error}</p>}
    </div>
  );
}
