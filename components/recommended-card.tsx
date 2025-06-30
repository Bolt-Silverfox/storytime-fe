'use client';

import Image, { StaticImageData } from 'next/image';
import heart from '@/public/heart-plain.svg';
import heartFilled from '@/public/heart-filled.svg';
import { useState } from 'react';

interface RecommendedCardProps {
  title: string;
  description: string;
  image: string | StaticImageData;
  author: string;
  favorite?: boolean;
  setModal?: (modal: boolean) => void;
  mode?: string;
}

const RecommendedCard = ({
  title,
  description,
  image,
  author,
  favorite,
  setModal,
  mode,
}: RecommendedCardProps) => {
  const [isFavorite, setIsFavorite] = useState(favorite);

  const handleClick = () => {
    if (setModal) {
      setModal(true);
    }
  };

  return (
    <div
      className='border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)]  pr-6 rounded-3xl border-[0.5px] border-solid hover:scale-105 transition-all duration-300 cursor-pointer'
      onClick={handleClick}
    >
      <div className='flex gap-4 h-full'>
        <div className=''>
          <Image
            src={image}
            alt='image'
            width={224}
            height={224}
            //   fill
            className='w-[12rem] h-full rounded-l-3xl'
            //   sizes='(max-width: 768px) 100vw, 176px'
          />
        </div>
        <div className='flex flex-col py-3'>
          <div className='flex flex-row justify-between items-center'>
            <h3 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
              {title}
            </h3>
            <Image
              src={isFavorite ? heartFilled : heart}
              alt='heart'
              width={20}
              height={20}
              onClick={(e) => {
                e.stopPropagation();
                setIsFavorite(!isFavorite);
              }}
            />
          </div>
          <p className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-[0.37rem] w-[85%]'>
            {description}
          </p>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 mt-6 font-abeezee'>
            Written by: {author}
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecommendedCard;
