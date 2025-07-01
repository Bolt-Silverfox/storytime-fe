import React from 'react';
import { Logo } from './logo';
import { footerLinks } from '@/lib/data';
import Link from 'next/link';
import Image from 'next/image';

export const Footer = () => {
  return (
    <footer className='flex md:flex-row flex-col justify-between gap-2.5 px-4 md:px-[150px] py-20 w-full bg-[#221D1D]'>
      <div className='flex flex-col w-full md:w-[196px] items-start gap-3'>
        <Logo />
        <p className='text-[#F5F5F4] font-abeezee'>
          Magical stories.
          <br />
          Safe voices and
          <br />
          Big imaginations.
        </p>
      </div>
      <div className='flex flex-col items-start gap-5'>
        {footerLinks.slice(0, 3).map((link, index) => (
          <Link
            key={`footer-link-1-${index}`}
            href={link.url}
            className='w-full font-abeezee text-[#F5F5F4] hover:underline'
          >
            {link.title}
          </Link>
        ))}
      </div>
      <div className='flex flex-col md:items-start items-center w-full gap-5'>
        {footerLinks.slice(3).map((link, index) => (
          <Link
            key={`footer-link-1-${index}`}
            href={link.url}
            className='w-full font-abeezee text-[#F5F5F4] hover:underline'
          >
            {link.title}
          </Link>
        ))}
      </div>
      <Image
        src='/bolt.svg'
        height={103}
        width={103}
        alt='Digital storybook illustration'
      />
    </footer>
  );
};
