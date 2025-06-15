import KidsRow from './_components/kids-row';
import DailyChallenge from './_components/daily-challenge';
import Recommended from './_components/recommended';
import ThemeStory from './_components/theme-story';
import StoryCategory from './_components/story-category';

const DashboardPage = () => {
  return (
    <div>
      <KidsRow />
      <DailyChallenge />
      <Recommended />
      <ThemeStory />
      <StoryCategory />
    </div>
  );
};

export default DashboardPage;
