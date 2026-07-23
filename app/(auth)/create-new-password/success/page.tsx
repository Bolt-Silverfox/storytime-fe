import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';

const Page = () => {
  return (
    <div className='max-w-[339px] mx-auto space-y-[42px]'>
      <div className='gap-6 flex flex-col items-center'>
        <Image
          src='/check.svg'
          alt='Logo'
          width={149}
          height={149}
          priority
          draggable={false}
        />
        <div className='space-y-[26px] flex flex-col items-center'>
          <div className='space-y-1.5 text-center w-full'>
            <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
              Password reset successful
            </p>
            <p className='text-[#4A413F] dark:text-white font-abeezee'>
              You can now login with the new password by clicking on the button
              below
            </p>
          </div>
        </div>
      </div>
      <Link
        href='/login'
        type='submit'
        className={cn(
          buttonVariants({ variant: 'primary' }),
          'w-full py-[15px] h-auto'
        )}
      >
        Login with new password
      </Link>
    </div>
  );
};

export default Page;
