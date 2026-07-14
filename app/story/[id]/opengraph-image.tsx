import { ImageResponse } from 'next/og';
import { ageLabel, coverOf, getStory } from './get-story';

// Node runtime so we can Buffer-encode the cover image.
export const runtime = 'nodejs';
export const alt = 'Storytime';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fetch the cover and inline it as a data URI so Satori never has to resolve a
// remote host (and so a slow/broken cover degrades to a title-only card rather
// than failing the whole image).
async function coverDataUri(url: string | null): Promise<string | null> {
  if (!url) {
    return null;
  }
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return null;
    }
    const type = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await getStory(id);

  const rawTitle = story?.title ?? 'Discover stories on Storytime';
  const title = rawTitle.length > 90 ? `${rawTitle.slice(0, 89)}…` : rawTitle;
  const age = story ? ageLabel(story) : null;
  const cover = story ? await coverDataUri(coverOf(story)) : null;

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        backgroundColor: '#FFF8ED',
        padding: 64,
        color: '#1B1300',
      }}
    >
      {/* Text column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          paddingRight: cover ? 48 : 0,
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: '#EC4007',
            letterSpacing: 1,
          }}
        >
          STORYTIME
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 45 ? 60 : 76,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 24,
          }}
        >
          {title}
        </div>
        {age && (
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 30,
              fontWeight: 600,
              color: '#4807EC',
              backgroundColor: 'rgba(72,7,236,0.10)',
              padding: '10px 22px',
              borderRadius: 999,
              alignSelf: 'flex-start',
            }}
          >
            {age}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            marginTop: 36,
            fontSize: 28,
            color: '#5B4B33',
          }}
        >
          Read it on Storytime
        </div>
      </div>

      {/* Cover */}
      {cover && (
        <div
          style={{
            display: 'flex',
            width: 400,
            height: 502,
            borderRadius: 32,
            overflow: 'hidden',
            backgroundColor: '#FCE9CE',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={title}
            width={400}
            height={502}
            style={{ width: 400, height: 502, objectFit: 'cover' }}
          />
        </div>
      )}
    </div>,
    { width: size.width, height: size.height }
  );
}
