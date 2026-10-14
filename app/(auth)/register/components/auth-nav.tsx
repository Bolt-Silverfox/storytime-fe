import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Icons } from '@/components/ui/icons';

export const AuthNav = () => {
  return (
    <div className='flex items-center justify-between'>
      <Logo />
      <Link href='/' className='flex items-center gap-3'>
        <Icons.home />
        <span className='font-abeezee'>Back to website</span>
      </Link>
    </div>
  );
};
