import type { NextConfig } from 'next';

const AUTH_PATHS = [
  '/login',
  '/register/:path*',
  '/create-new-password/:path*',
  '/forgot-password/:path*',
  '/verify-email',
  '/auth/:path*',
];

const AUTH_PREFIXES = [
  'login',
  'register',
  'create-new-password',
  'forgot-password',
  'verify-email',
  'auth',
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Apple fetches the (extensionless) AASA file and expects application/json.
  // Apple does NOT follow redirects for it, so it must be served directly here.
  async headers() {
    return [
      {
        source: `/:path((?!${AUTH_PREFIXES.join('|')}).*)`,
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      ...AUTH_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      })),
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
