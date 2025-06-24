import KidsRow from './_components/kids-row';
import DailyChallenge from './_components/daily-challenge';
import Recommended from './_components/recommended';
import ThemeStory from './_components/theme-story';
import StoryCategory from './_components/story-category';
import Header from '@/components/header';
import { cn } from '@/lib/utils';

const DashboardPage = () => {
  return (
    <div
      className={cn(
        'bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'
      )}
    >
      <Header white={false} />
      <KidsRow />
      <DailyChallenge />
      <Recommended />
      <ThemeStory />
      <StoryCategory />
    </div>
  );
};

export default DashboardPage;
