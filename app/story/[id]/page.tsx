import type { Metadata } from 'next';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  SITE_URL,
  makeStoryDeepLink,
} from './story-links';

type SharedStory = {
  id: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  imageUrl?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

const FALLBACK_DESCRIPTION =
  'Listen, read, and explore stories crafted just for kids on Storytime.';
const FALLBACK_OG_IMAGE = `${SITE_URL}/og-default.png`;

const coverOf = (story: SharedStory) =>
  story.coverImageUrl || story.imageUrl || null;

// Server-side fetch of the shareable story metadata. The backend's GET
// /stories/:id is @OptionalAuth and only quota-guards authenticated requests,
// so an anonymous server request returns the story. Returns null on any error
// so the page can degrade gracefully instead of hard-failing.
async function getStory(id: string): Promise<SharedStory | null> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return null;
  }
  try {
    const res = await fetch(`${base}/api/v1/stories/${id}`, {
      headers: { Accept: 'application/json' },
      // Cache the preview; stories rarely change and this is public metadata.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const story = (body?.data ?? body) as SharedStory | undefined;
    if (!story?.id) {
      return null;
    }
    return story;
  } catch {
    return null;
  }
}

const ageLabel = (story: SharedStory): string | null => {
  const { ageMin, ageMax } = story;
  if (typeof ageMin === 'number' && typeof ageMax === 'number') {
    return `Ages ${ageMin}–${ageMax}`;
  }
  if (typeof ageMin === 'number') {
    return `Ages ${ageMin}+`;
  }
  return null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const story = await getStory(id);

  if (!story) {
    return {
      metadataBase: new URL(SITE_URL),
      title: 'Storytime',
      description: FALLBACK_DESCRIPTION,
      openGraph: {
        title: 'Storytime',
        description: FALLBACK_DESCRIPTION,
        url: `${SITE_URL}/story/${id}`,
        siteName: 'Storytime',
        images: [FALLBACK_OG_IMAGE],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Storytime',
        description: FALLBACK_DESCRIPTION,
        images: [FALLBACK_OG_IMAGE],
      },
    };
  }

  const description = story.description?.trim() || FALLBACK_DESCRIPTION;
  const image = coverOf(story) || FALLBACK_OG_IMAGE;
  const title = `${story.title} · Storytime`;
  const url = `${SITE_URL}/story/${story.id}`;

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
      images: [{ url: image, alt: story.title }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
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

        {/* CTAs */}
        <div className='grid gap-3 sm:grid-cols-2'>
          {deepLink && (
            <a
              href={deepLink}
              className='flex items-center justify-center rounded-2xl bg-[#EC4007] px-6 py-4 text-center text-base font-semibold text-white transition hover:opacity-90 sm:col-span-2'
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
