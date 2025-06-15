import Image, { StaticImageData } from 'next/image';
import React from 'react';

interface StoryCardProps {
  img: string | StaticImageData;
  title: string;
  desc: string;
}

const StoryCard = ({ img, title, desc }: StoryCardProps) => {
  return (
    <div className='border border-stone-100 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] rounded-3xl border-solid hover:scale-105 transition-all duration-300 cursor-pointer'>
      <Image
        src={img}
        alt={title}
        className='w-full h-[14.25rem] rounded-t-3xl object-cover'
      />
      <div className='p-6'>
        <h3 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
          {title}
        </h3>
        <p className='text-[#4A413F] text-base not-italic font-normal leading-5 mt-1.5'>
          {desc}
        </p>
      </div>
    </div>
  );
};

export default StoryCard;
