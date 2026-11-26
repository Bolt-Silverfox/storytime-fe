import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/page-metadata';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/stories',
        '/story/',
        '/about',
        '/faq',
        '/contact',
        '/privacy-policy',
        '/terms-and-conditions',
      ],
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
