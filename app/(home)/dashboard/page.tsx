'use client';

import Header from '@/components/header';
import QuotaIndicator from '@/components/quota-indicator';
import { cn } from '@/lib/utils';
import StoryHome from './_components/story-home';

const DashboardPage = () => {
  return (
    <div
      className={cn(
        'bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-4 sm:px-6 md:px-10 py-6 md:py-[2.125rem] w-full max-w-6xl mx-auto my-6 md:my-12'
      )}
    >
      <Header white={false} />
      <QuotaIndicator className='my-6' />
      <StoryHome />
    </div>
  );
};

export default DashboardPage;
