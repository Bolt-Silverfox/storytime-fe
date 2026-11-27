import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <main
      id='main'
      className='flex min-h-screen flex-col items-center justify-center gap-6 px-5 text-center'
    >
      <h1 className='font-qilka text-[44px] font-bold leading-[50px] text-strong'>
        Page not found
      </h1>
      <p className='max-w-[556px] font-abeezee text-lg text-body'>
        We could not find the page you were looking for.
      </p>
      <Link
        href='/'
        className={cn(
          buttonVariants({ variant: 'primary' }),
          'h-auto gap-2.5 rounded-[50px] px-[50px] py-4 text-white'
        )}
      >
        Back to home
      </Link>
    </main>
  );
}
