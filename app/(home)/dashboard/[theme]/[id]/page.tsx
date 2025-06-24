import { recommended, stories, storyCategory } from '@/data/kids';
import ThemePageClient from './theme-page-client';

const ThemePage = async ({
  params,
}: {
  params: Promise<{ theme: string; id: string }>;
}) => {
  const { theme, id } = await params;
  const story = stories.find((story) => story.id === Number(id));

  return (
    <ThemePageClient
      story={story}
      recommended={recommended}
      storyCategory={storyCategory}
    />
  );
};

export default ThemePage;
