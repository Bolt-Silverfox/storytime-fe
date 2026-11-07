import { pageMetadata } from '@/lib/page-metadata';

export const metadata = pageMetadata({
  title: 'Contact Storytime',
  description:
    'Get in touch with the Storytime team with questions, feedback or support requests. We reply within 24 to 48 hours.',
  path: '/contact',
});

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
