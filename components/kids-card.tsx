'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useState } from 'react';
import edit from '@/public/edit-icon.svg';

interface KidsCardProps {
  img: string;
  name: string;
  age: string;
  cstories: string;
  active?: boolean;
  edit?: boolean;
  handleEdit?: () => void;
  stories?: boolean;
}

const KidsCard = ({
  img,
  name,
  age,
  cstories,
  active: initialActive = false,
  edit: initialEdit = false,
  handleEdit,
  stories = false,
}: KidsCardProps) => {
  const [isActive, setIsActive] = useState(initialActive);

  const handleClick = () => {
    setIsActive(!isActive);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] px-4 py-3 rounded-3xl border-[0.5px] border-solid flex items-center justify-between gap-3 cursor-pointer transition-all duration-200 w-full',
        isActive &&
          'bg-[#EC4007] shadow-[0px_0px_0px_4px_rgba(236,64,7,0.15)] rounded-3xl border-[0.5px] border-solid border-[#F84020]'
      )}
    >
      <div className='flex items-center gap-3'>
        <Image src={img} alt={name} />
        <div className=''>
          {stories && (
            <p
              className={cn(
                'text-[#EC4007] text-xs not-italic font-normal leading-4 mb-2',
                isActive && 'text-[#FEEAE6]'
              )}
            >
              {cstories}
            </p>
          )}
          <h3
            className={cn(
              'text-[#221D1D] text-base not-italic font-normal leading-5',
              isActive && 'text-white'
            )}
          >
            {name}
          </h3>
          <p
            className={cn(
              'text-[#4A413F] text-xs not-italic font-normal leading-4',
              isActive && 'text-[#FB9583]'
            )}
          >
            {age}
          </p>
        </div>
      </div>
      {edit && (
        <Image
          src={edit}
          alt='edit'
          onClick={handleEdit}
          className='cursor-pointer'
        />
      )}
    </div>
  );
};

export default KidsCard;
