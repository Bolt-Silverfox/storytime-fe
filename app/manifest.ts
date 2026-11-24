import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Storytime',
    short_name: 'Storytime',
    description:
      'Listen, read, and explore hundreds of interactive, screen-free stories made just for kids.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF4F2',
    theme_color: '#FAF4F2',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
