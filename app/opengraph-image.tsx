import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

// Site-wide branded OG card. Applies to the homepage and any route without its
// own opengraph-image. The logo already contains the wordmark, so there is no
// separate 'Storytime' text.
export const runtime = 'nodejs';
export const alt = 'Storytime — stories crafted just for kids';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  // Official full logo (mark + wordmark). satori needs an inline data URI.
  const logo = await readFile(
    path.join(process.cwd(), 'public', 'storytime-logo-full.svg')
  );
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF8ED',
        padding: 80,
        textAlign: 'center',
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: next/og renders plain img */}
      <img src={logoSrc} alt='Storytime' width={560} height={200} />
      <div
        style={{
          display: 'flex',
          marginTop: 40,
          fontSize: 44,
          fontWeight: 500,
          color: '#5B4B33',
          maxWidth: 900,
          lineHeight: 1.25,
        }}
      >
        Listen, read, and explore stories crafted just for kids.
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 56,
          width: 160,
          height: 10,
          borderRadius: 999,
          backgroundColor: '#4807EC',
        }}
      />
    </div>,
    { width: size.width, height: size.height }
  );
}
