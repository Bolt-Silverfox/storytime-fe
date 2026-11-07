import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/page-metadata';

const PUBLIC_PATHS = [
  '',
  '/stories',
  '/about',
  '/faq',
  '/contact',
  '/privacy-policy',
  '/terms-and-conditions',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }));
}
