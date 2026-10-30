'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';

export const Logo = ({
  href = '/',
  onDark = false,
}: {
  href?: string;
  /** Force the light-on-dark artwork (for surfaces that are dark in both themes). */
  onDark?: boolean;
}) => {
  const { resolvedTheme } = useTheme();

  return (
    <Link href={href} className='flex items-center justify-center gap-2'>
      <Image
        src={
          onDark || resolvedTheme === 'dark'
            ? '/logo-dark.svg'
            : '/logo-light.svg'
        }
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
