import Image from 'next/image';
import Link from 'next/link';

/**
 * Both artworks are rendered and switched with CSS (`dark` class on <html>), so
 * the correct logo shows on first paint with no dependency on hydration.
 */
export const Logo = ({ href = '/' }: { href?: string }) => {
  return (
    <Link href={href} className='flex items-center justify-center gap-2'>
      <Image
        src='/logo-light.svg'
        alt='Logo'
        width={140}
        height={24}
        priority
        draggable={false}
        className='dark:hidden'
      />
      <Image
        src='/logo-dark.svg'
        alt=''
        aria-hidden='true'
        width={140}
        height={24}
        priority
        draggable={false}
        className='hidden dark:block'
      />
      <span className='sr-only'>storytime logo</span>
    </Link>
  );
};
