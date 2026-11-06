'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePasswordlessConsume } from '@/lib/hooks/use-passwordless';
import {
  classifyPasswordlessError,
  FAILURE_MESSAGES,
  NEW_USER_NOTICE,
  needsAccountSetup,
  type PasswordlessFailure,
  SETUP_ROUTE,
  SIGN_IN_ROUTE,
} from '@/lib/passwordless';
import { isUserLoggedIn } from '@/lib/services';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type View = 'loading' | 'confirm' | 'invalid' | 'signedIn';

const readFragmentToken = () => {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
  return token && TOKEN_PATTERN.test(token) ? token : null;
};

const Page = () => {
  const router = useRouter();
  const consume = usePasswordlessConsume();
  const token = useRef<string | null>(null);
  const submitting = useRef(false);
  const read = useRef(false);
  const [view, setView] = useState<View>('loading');
  const [failure, setFailure] = useState<PasswordlessFailure | null>(null);

  useEffect(() => {
    if (read.current) {
      return;
    }
    read.current = true;
    token.current = readFragmentToken();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
    if (isUserLoggedIn()) {
      token.current = null;
      setView('signedIn');
    } else {
      setView(token.current ? 'confirm' : 'invalid');
    }
  }, []);

  const confirm = async () => {
    if (submitting.current || !token.current) {
      return;
    }
    submitting.current = true;
    setFailure(null);
    try {
      const result = await consume.mutateAsync(token.current);
      token.current = null;
      if (needsAccountSetup(result)) {
        toast.success(NEW_USER_NOTICE);
        router.push(SETUP_ROUTE);
      } else {
        toast.success('Signed in');
        router.push(SIGN_IN_ROUTE);
      }
    } catch (error) {
      const kind = classifyPasswordlessError(error);
      if (kind === 'invalid' || kind === 'unavailable') {
        token.current = null;
        setView('invalid');
      }
      setFailure(kind);
    } finally {
      submitting.current = false;
    }
  };

  if (view === 'loading') {
    return null;
  }

  if (view === 'signedIn') {
    return (
      <div className='max-w-[440px] mx-auto space-y-6 text-center'>
        <h1 className='font-qilka font-bold text-[26px] text-strong'>
          You're already signed in
        </h1>
        <Link href={SIGN_IN_ROUTE} className='text-link hover:underline'>
          Go to your home page
        </Link>
      </div>
    );
  }

  if (view === 'invalid') {
    return (
      <div className='max-w-[440px] mx-auto space-y-6 text-center'>
        <h1 className='font-qilka font-bold text-[26px] text-strong'>
          That sign-in link didn't work
        </h1>
        <p className='text-body font-abeezee'>
          It may have expired or already been used.
        </p>
        <Link href='/login/code' className='text-link hover:underline'>
          Request a new code
        </Link>
      </div>
    );
  }

  return (
    <div className='max-w-[440px] mx-auto space-y-6 text-center'>
      <h1 className='font-qilka font-bold text-[26px] text-strong'>
        Sign in to Storytime
      </h1>
      <p className='text-body font-abeezee'>
        You'll be signed in on this device.
      </p>
      {failure && (
        <p role='alert' className='text-destructive font-abeezee text-sm'>
          {FAILURE_MESSAGES[failure]}
        </p>
      )}
      <Button
        variant='primary'
        type='button'
        onClick={confirm}
        disabled={consume.isPending}
        className='w-full py-[15px] h-auto'
      >
        Continue
      </Button>
    </div>
  );
};

export default Page;
