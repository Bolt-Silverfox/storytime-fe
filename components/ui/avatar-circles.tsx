'use client';

import { cn } from '@/lib/utils';

interface Avatar {
  imageUrl: string;
}
interface AvatarCirclesProps {
  className?: string;
  numPeople?: number;
  avatarUrls: Avatar[];
}

export const AvatarCircles = ({
  numPeople,
  className,
  avatarUrls,
}: AvatarCirclesProps) => {
  return (
    <div className={cn('z-10 flex -space-x-4 rtl:space-x-reverse', className)}>
      {avatarUrls.map((url) => (
        <img
          key={url.imageUrl}
          className='md:size-[64px] size-[62px] rounded-full border-2 border-white dark:border-gray-800 relative transition-transform duration-200 hover:z-10 hover:scale-110'
          src={url.imageUrl}
          width={40}
          height={40}
          alt=''
        />
      ))}
      {(numPeople ?? 0) > 0 && (
        <span className='flex md:size-[64px] size-[62px] items-center justify-center rounded-full border-2 border-white bg-black text-center text-xs font-medium text-white dark:border-gray-800 dark:bg-white dark:text-black'>
          +{numPeople}
        </span>
      )}
    </div>
  );
};
