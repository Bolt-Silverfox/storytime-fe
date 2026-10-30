import Image from 'next/image';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
            <p className='text-strong text-[34px] font-bold font-qilka'>
              Account created successfully
            </p>
            <p className='text-body font-abeezee'>
              Glad to have you on-board. You can now give your kids their
              favorite memorable moments any time. below
            </p>
          </div>
        </div>
      </div>
      <Link
        href='/dashboard'
        className={cn(
          buttonVariants({ variant: 'primary' }),
          'w-full py-[15px] h-auto'
        )}
      >
        Take me home
      </Link>
    </div>
  );
};

export default Page;
