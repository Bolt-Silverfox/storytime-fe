'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main
      id='main'
      className='flex min-h-screen flex-col items-center justify-center gap-6 px-5 text-center'
    >
      <h1 className='font-qilka text-[44px] font-bold leading-[50px] text-strong'>
        Something went wrong
      </h1>
      <p className='max-w-[556px] font-abeezee text-lg text-body'>
        An unexpected error occurred. Please try again.
      </p>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <Button
          type='button'
          variant='primary'
          onClick={reset}
          className='h-auto rounded-[50px] px-[50px] py-4 text-white'
        >
          Try again
        </Button>
        <Link
          href='/'
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-auto rounded-[50px] px-[50px] py-4'
          )}
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
