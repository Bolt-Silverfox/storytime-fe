import { pageMetadata } from '@/lib/page-metadata';

export const metadata = pageMetadata({
  title: 'Browse stories — Storytime',
  description:
    'Browse audio stories for kids by category and age, from bedtime tales to adventures, and listen on the web or in the app.',
  path: '/stories',
});

export default function StoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
