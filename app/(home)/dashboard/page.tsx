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
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

const DashboardPage = () => {
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);

  useEffect(() => {
    // Check for selectedKid in localStorage (the full kid object)
    const selectedKidData = localStorage.getItem('selectedKid');
    if (selectedKidData) {
      try {
        const selectedKid = JSON.parse(selectedKidData);
        setSelectedKidId(selectedKid.id);
      } catch (error) {
        console.error('Error parsing selectedKid from localStorage:', error);
        setSelectedKidId(null);
      }
    }
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
          <div className='mt-6 flex items-center justify-between rounded-2xl border-[0.5px] border-[#FAF4F2] bg-[#FFF6F3] px-6 py-5'>
            <div>
              <h2 className='text-[#221D1D] text-xl font-bold font-qilka'>
                Create a new story
              </h2>
              <p className='text-[#4A413F] font-abeezee'>
                Personalize a brand-new AI story for your child
              </p>
            </div>
            <Link
              href='/dashboard/create-story'
              className={cn(
                buttonVariants({ variant: 'primary' }),
                'py-[15px] h-auto px-8'
              )}
            >
              Create a story
            </Link>
          </div>
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
