'use client';

import { getUserFromStorage } from '@/lib/services';
import { cn } from '@/lib/utils';
import arrow_down from '@/public/arrow-down.svg';
import avatar from '@/public/avatar.svg';
import heart from '@/public/heart.svg';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import ProfileDropdown from './ui/profile-dropdown';

const Header = ({ white = false }: { white?: boolean }) => {
  const user = getUserFromStorage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  return (
    <header>
      <div className='flex items-center justify-between relative'>
        <Link href='/dashboard' aria-label='Go to stories home'>
          <Image
            src='/logo-light.svg'
            alt='Logo'
            width={140}
            height={24}
            priority
            draggable={false}
          />
        </Link>
        <h1
          className={cn(
            'hidden md:block text-center text-base md:text-xl not-italic font-bold leading-6 font-qilka truncate max-w-[40%] px-2',
            white ? 'text-white' : 'text-[#4A413F]'
          )}
        >
          Good day! {user?.name}
        </h1>
        <div className='flex items-center'>
          <Link
            href='/favorites'
            aria-label='Favorites'
            className='mr-3 transition-transform hover:scale-110'
          >
            <Image src={heart} alt='heart' />
          </Link>
          <div className='relative'>
            <button
              type='button'
              aria-haspopup='menu'
              aria-expanded={dropdownOpen}
              className='border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] p-1.5 rounded-[2.25rem] border-[0.5px] border-solid flex items-center justify-between gap-2 w-auto md:w-[11rem] cursor-pointer'
              onClick={() => {
                if (!dropdownOpen) {
                  setDropdownOpen(true);
                }
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
                    'max-w-[5rem] sm:max-w-[7.5rem] truncate text-[#4A413F] text-center text-sm not-italic font-medium leading-6 font-abeezee'
                  )}
                >
                  {user?.name?.split(' ')[0]}
                </h3>
              </div>
              <Image
                src={arrow_down}
                alt='arrow-down'
                className={`${
                  dropdownOpen ? 'rotate-180' : ''
                } transition-all duration-300`}
              />
            </button>
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
