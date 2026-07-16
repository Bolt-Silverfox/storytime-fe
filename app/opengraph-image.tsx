import { ImageResponse } from 'next/og';

// Site-wide branded OG card. Applies to the homepage and any route without its
// own opengraph-image (the story route overrides this with its per-story card).
export const runtime = 'nodejs';
export const alt = 'Storytime — stories crafted just for kids';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
      <div
        style={{
          fontSize: 120,
          fontWeight: 800,
          color: '#EC4007',
          letterSpacing: -1,
        }}
      >
        Storytime
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 24,
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
