import type { Metadata } from 'next';

export const SITE_URL = 'https://web.storytimeapp.me';

export const pageMetadata = ({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata => ({
  title,
  description,
  alternates: { canonical: path },
  openGraph: {
    title,
    description,
    url: path === '/' ? SITE_URL : `${SITE_URL}${path}`,
    siteName: 'Storytime',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title, description },
});
