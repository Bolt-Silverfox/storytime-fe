import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces .next/standalone/server.js for PM2/blue-green deploys.
  output: 'standalone',
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
