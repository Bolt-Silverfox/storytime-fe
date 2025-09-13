'use client';

import heart from '@/public/heart.svg';
import avatar from '@/public/avatar.svg';
import arrow_down from '@/public/arrow-down.svg';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import ProfileDropdown from './ui/profile-dropdown';
import { getUserFromStorage } from '@/lib/services';

const Header = ({ white = false }: { white?: boolean }) => {
  const user = getUserFromStorage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  return (
    <header>
      <div className='flex items-center justify-between relative'>
        <Image
          src='/logo-light.svg'
          alt='Logo'
          width={140}
          height={24}
          priority
          draggable={false}
        />
        <h1
          className={cn(
            ' text-center text-xl not-italic font-bold leading-6 font-qilka',
            white ? 'text-white' : 'text-[#4A413F]'
          )}
        >
          Good day! {user?.name}
        </h1>
        <div className='flex items-center'>
          <Image src={heart} alt='heart' />
          <div className='relative'>
            <div
              className='border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] p-1.5 rounded-[2.25rem] border-[0.5px] border-solid flex items-center justify-between w-[11rem] cursor-pointer'
              onClick={() => {
                if (!dropdownOpen) setDropdownOpen(true);
              }}
            >
              <div className='flex items-center gap-2'>
                <Image
                  src={user?.avatarUrl || avatar}
                  alt='avatar'
                  width={40}
                  height={40}
                  className='rounded-full'
                />
                <h3
                  className={cn(
                    'text-[#4A413F] text-center text-sm not-italic font-medium leading-6 font-abeezee'
                  )}
                >
                  {user?.name}
                </h3>
              </div>
              <Image
                src={arrow_down}
                alt='arrow-down'
                className={`${
                  dropdownOpen ? 'rotate-180' : ''
                } transition-all duration-300`}
              />
            </div>
            <ProfileDropdown
              open={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
