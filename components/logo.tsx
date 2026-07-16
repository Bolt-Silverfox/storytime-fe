'use client';

import { useTheme } from 'next-themes';
import Image from 'next/image';
import Link from 'next/link';

export const Logo = () => {
  const { resolvedTheme } = useTheme();

  return (
    <Link href='/' className='flex items-center justify-center gap-2'>
      <Image
        src={resolvedTheme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg'}
        alt='Logo'
        width={140}
        height={24}
        priority
        draggable={false}
      />
      <span className='sr-only'>storytime logo</span>
    </Link>
  );
};
