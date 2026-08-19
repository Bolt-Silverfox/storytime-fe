import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Apple fetches the (extensionless) AASA file and expects application/json.
  // Apple does NOT follow redirects for it, so it must be served directly here.
  async headers() {
    return [
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

export default withSentryConfig(nextConfig, {
  org: 'emerj',
  project: 'storytime-fe',
  silent: !process.env.CI,
  // Source-map upload needs SENTRY_AUTH_TOKEN in the build env; without it
  // the build still succeeds and events arrive minified.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Tunnel Sentry through our own origin so ad blockers don't eat events.
  tunnelRoute: '/monitoring',
  disableLogger: true,
});
