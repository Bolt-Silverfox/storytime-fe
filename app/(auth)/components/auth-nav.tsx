import { Logo } from '@/components/logo';
import { Icons } from '@/components/ui/icons';
import Link from 'next/link';

export const AuthNav = () => {
  return (
    <div className='flex items-center justify-between'>
      <Logo />
      <Link href='/' className='flex items-center gap-3'>
        <Icons.home />
        <span className=''>Back to website</span>
      </Link>
    </div>
  );
};
