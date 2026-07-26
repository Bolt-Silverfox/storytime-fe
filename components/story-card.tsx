'use client';

import CategoryImage from '@/components/category-image';
import { cn } from '@/lib/utils';
import heartFilled from '@/public/hearted.svg';
import heart from '@/public/not-hearted.svg';
import Image, { type StaticImageData } from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface StoryCardProps {
  img: string | StaticImageData;
  title: string;
  desc: string;
  link?: string;
  author?: string;
  dynamic?: boolean;
  setModal?: (modal: boolean) => void;
}

const StoryCard = ({
  img,
  title,
  desc,
  link,
  dynamic,
  setModal,
}: StoryCardProps) => {
  const [isFavorite, setIsFavorite] = useState(false);
  const router = useRouter();
  return (
    <div
      role={link ? 'link' : setModal ? 'button' : undefined}
      tabIndex={link || setModal ? 0 : undefined}
      onClick={() => {
        if (link) {
          router.push(link);
        }
        if (setModal) {
          setModal(true);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (link) {
            router.push(link);
          }
          if (setModal) {
            setModal(true);
          }
        }
      }}
      className='border border-stone-100 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] rounded-3xl border-solid hover:scale-105 transition-all duration-300 cursor-pointer relative'
    >
      <CategoryImage
        src={img}
        alt={title}
        width={224}
        height={224}
        className={cn(
          'w-full rounded-t-3xl object-cover',
          dynamic ? 'h-[19.25rem]' : 'h-[14.25rem]'
        )}
      />
      {dynamic && (
        <Image
          src={isFavorite ? heartFilled : heart}
          alt='heart'
          width={50}
          height={50}
          onClick={(e) => {
            e.stopPropagation();
            setIsFavorite(!isFavorite);
          }}
          className='absolute top-4 right-4'
        />
      )}
      <div className='p-6'>
        <h3 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
          {title}
        </h3>
        <p className='text-[#4A413F] text-base not-italic font-normal leading-5 mt-1.5 font-abeezee'>
          {desc}
        </p>
        {/* <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 mt-6 font-abeezee'>
          Written by: {author}
        </p> */}
      </div>
    </div>
  );
};

export default StoryCard;
