'use client';

import { useEffect, useState } from 'react';
import KidsRow from './_components/kids-row';
import DailyChallenge from './_components/daily-challenge';
import Recommended from './_components/recommended';
import ThemeStory from './_components/theme-story';
import StoryCategory from './_components/story-category';
import Header from '@/components/header';
import { cn } from '@/lib/utils';
import KidPicker from '@/components/kid-picker';

const DashboardPage = () => {
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKidId(localStorage.getItem('selectedKidId'));
  }, []);

  // Handler to update selectedKidId from KidPicker
  const handleKidSelected = (kidId: string) => {
    setSelectedKidId(kidId);
  };

  return (
    <div
      className={cn(
        'bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'
      )}
    >
      <Header white={false} />
      {!selectedKidId ? (
        <KidPicker onKidSelect={handleKidSelected} />
      ) : (
        <>
          <DailyChallenge />
          <Recommended />
          <ThemeStory />
          <StoryCategory />
        </>
      )}
    </div>
  );
};

export default DashboardPage;
