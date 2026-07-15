import type { Metadata } from 'next';
import { ageLabel, coverOf, extractStoryId, getStory } from './get-story';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  SITE_URL,
  makeStoryDeepLink,
} from './story-links';
import StoryView from './story-view';

const FALLBACK_DESCRIPTION =
  'Listen, read, and explore stories crafted just for kids on Storytime.';

// og:image / twitter:image are supplied automatically by the sibling
// opengraph-image.tsx (a dynamically generated 1200×630 card with the story
// title), so metadata below only sets text fields.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const story = await getStory(id);
  const url = `${SITE_URL}/story/${id}`;

  if (!story) {
    return {
      metadataBase: new URL(SITE_URL),
      title: 'Storytime',
      description: FALLBACK_DESCRIPTION,
      openGraph: {
        title: 'Storytime',
        description: FALLBACK_DESCRIPTION,
        url,
        siteName: 'Storytime',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Storytime',
        description: FALLBACK_DESCRIPTION,
      },
    };
  }

  const description = story.description?.trim() || FALLBACK_DESCRIPTION;
  const title = `${story.title} · Storytime`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Storytime',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function StorySharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await getStory(id);

  const title = story?.title ?? 'Discover stories on Storytime';
  const description =
    story?.description?.trim() ||
    (story
      ? FALLBACK_DESCRIPTION
      : "This story couldn't be found, but there's a whole library waiting in the Storytime app.");
  const cover = story ? coverOf(story) : null;
  const age = story ? ageLabel(story) : null;
  const deepLink = story ? makeStoryDeepLink(story.id) : null;

  return (
    <main className='min-h-dvh bg-[#FFF8ED] text-[#1B1300]'>
      {/* Header */}
      <header className='mx-auto flex max-w-3xl items-center justify-between px-6 py-5'>
        <a
          href={SITE_URL}
          className='font-[family-name:var(--font-qilka)] text-2xl font-bold text-[#EC4007]'
        >
          Storytime
        </a>
        <a
          href={APP_STORE_URL}
          className='rounded-full bg-[#EC4007] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90'
        >
          Get the app
        </a>
      </header>

      <section className='mx-auto grid max-w-3xl gap-8 px-6 pb-16 pt-4'>
        {/* Cover */}
        <div className='overflow-hidden rounded-3xl bg-[#FCE9CE] shadow-sm'>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host, avoids next.config image allowlist
            <img
              src={cover}
              alt={title}
              className='aspect-[4/3] w-full object-cover'
            />
          ) : (
            <div className='flex aspect-[4/3] w-full items-center justify-center text-6xl'>
              📖
            </div>
          )}
        </div>

        {/* Details */}
        <div className='grid gap-4'>
          {age && (
            <span className='w-fit rounded-full bg-[#4807EC]/10 px-3 py-1 text-sm font-semibold text-[#4807EC]'>
              {age}
            </span>
          )}
          <h1 className='font-[family-name:var(--font-qilka)] text-3xl font-bold leading-tight sm:text-4xl'>
            {title}
          </h1>
          <p className='text-lg leading-relaxed text-[#5B4B33]'>
            {description}
          </p>
        </div>

        {/* Read it here (guest) */}
        {story && <StoryView storyId={extractStoryId(id)} />}

        {/* Or get the app */}
        <div className='grid gap-3 sm:grid-cols-2'>
          {deepLink && (
            <a
              href={deepLink}
              className='flex items-center justify-center rounded-2xl border border-[#EC4007]/40 px-6 py-4 text-center text-base font-semibold text-[#EC4007] transition hover:bg-[#EC4007]/5 sm:col-span-2'
            >
              Open in the Storytime app
            </a>
          )}
          <a
            href={APP_STORE_URL}
            className='flex items-center justify-center rounded-2xl border border-[#1B1300]/15 bg-white px-6 py-4 text-center text-base font-semibold transition hover:border-[#1B1300]/30'
          >
            Download on the App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            className='flex items-center justify-center rounded-2xl border border-[#1B1300]/15 bg-white px-6 py-4 text-center text-base font-semibold transition hover:border-[#1B1300]/30'
          >
            Get it on Google Play
          </a>
        </div>

        <p className='text-center text-sm text-[#5B4B33]/70'>
          Don&apos;t have the app yet? Install Storytime to read this story and
          hundreds more.
        </p>
      </section>
    </main>
  );
}
