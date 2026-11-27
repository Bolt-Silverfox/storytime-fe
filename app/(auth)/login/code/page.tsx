'use client';

import { REGEXP_ONLY_DIGITS } from 'input-otp';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  usePasswordlessRequest,
  usePasswordlessVerify,
} from '@/lib/hooks/use-passwordless';
import {
  classifyPasswordlessError,
  FAILURE_MESSAGES,
  isPasswordlessUnavailable,
  markPasswordlessUnavailable,
  NEW_USER_NOTICE,
  needsAccountSetup,
  type PasswordlessFailure,
  SETUP_ROUTE,
  SIGN_IN_ROUTE,
} from '@/lib/passwordless';
import { isUserLoggedIn } from '@/lib/services';

const EmailSchema = z.string().trim().email();
const DEFAULT_RESEND_SECONDS = 60;
const stripNonDigits = (text: string) => text.replace(/\D/g, '');
const OTP_SLOTS = [0, 1, 2, 3, 4, 5];

const subscribeNever = () => () => {};

const positiveSeconds = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

const Page = () => {
  const router = useRouter();
  const requestCode = usePasswordlessRequest();
  const verifyCode = usePasswordlessVerify();
  const unavailable = useSyncExternalStore(
    subscribeNever,
    isPasswordlessUnavailable,
    () => false
  );
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<PasswordlessFailure | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sendingRef = useRef(false);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = expiresAt !== null && now >= expiresAt;
  const counting = secondsLeft > 0 || (expiresAt !== null && !expired);

  useEffect(() => {
    if (isUserLoggedIn()) {
      router.replace(SIGN_IN_ROUTE);
    }
  }, [router]);

  useEffect(() => {
    if (!counting) {
      return;
    }
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
      window.removeEventListener('focus', tick);
    };
  }, [counting]);

  const emailValid = EmailSchema.safeParse(email).success;

  const send = async () => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    const target = email.trim();
    setFailure(null);
    setCode('');
    try {
      const result = await requestCode.mutateAsync(target);
      const sentAt = Date.now();
      const resendAfter =
        positiveSeconds(result.resendAfterSeconds) ?? DEFAULT_RESEND_SECONDS;
      const expiresIn = positiveSeconds(result.expiresInSeconds);
      setSentEmail(target);
      setNow(sentAt);
      setResendAt(sentAt + resendAfter * 1000);
      setExpiresAt(expiresIn === null ? null : sentAt + expiresIn * 1000);
      setPhase('code');
    } catch (error) {
      const kind = classifyPasswordlessError(error);
      if (kind === 'unavailable') {
        markPasswordlessUnavailable();
      }
      setFailure(kind === 'invalid' ? 'invalidEmail' : kind);
    } finally {
      sendingRef.current = false;
    }
  };

  const submitCode = async (value: string) => {
    if (!/^\d{6}$/.test(value)) {
      return;
    }
    if (expiresAt !== null && Date.now() >= expiresAt) {
      setNow(Date.now());
      return;
    }
    setFailure(null);
    try {
      const result = await verifyCode.mutateAsync({
        email: sentEmail,
        code: value,
      });
      if (needsAccountSetup(result)) {
        toast.success(NEW_USER_NOTICE);
        router.push(SETUP_ROUTE);
      } else {
        toast.success('Signed in');
        router.push(SIGN_IN_ROUTE);
      }
    } catch (error) {
      setCode('');
      setFailure(classifyPasswordlessError(error));
    }
  };

  if (unavailable || failure === 'unavailable') {
    return (
      <div className='max-w-[440px] mx-auto space-y-6 text-center'>
        <h1 className='font-qilka font-bold text-[26px] text-strong'>
          Email codes are unavailable
        </h1>
        <p className='text-body font-abeezee'>{FAILURE_MESSAGES.unavailable}</p>
        <Link href='/login' className='text-link hover:underline font-abeezee'>
          Sign in with your password
        </Link>
      </div>
    );
  }

  const sending = requestCode.isPending;
  const locked = sending || verifyCode.isPending || verifyCode.isSuccess;
  const codeLocked = locked || expired;
  const failureText =
    failure && !(expired && failure === 'invalid')
      ? FAILURE_MESSAGES[failure]
      : null;
  const offerNewCode = expired || failure === 'invalid';

  return (
    <div className='max-w-[440px] mx-auto space-y-8'>
      <div className='space-y-1.5 text-center'>
        <h1 className='font-qilka font-bold text-[26px] text-strong'>
          Email me a code
        </h1>
        <p className='text-body font-abeezee text-sm'>
          {phase === 'email'
            ? "We'll email you a 6-digit code and a sign-in link."
            : `Enter the 6-digit code we sent to ${sentEmail}.`}
        </p>
      </div>

      {(failureText || expired) && (
        <div
          role='alert'
          className='text-center text-destructive font-abeezee text-sm space-y-2'
        >
          {failureText && <p>{failureText}</p>}
          {expired ? (
            <>
              <p>That code has expired.</p>
              <p className='text-body'>Request a new code below.</p>
            </>
          ) : (
            failure === 'invalid' && (
              <p className='text-body'>
                It may have expired or been used too many times. You can request
                a new code below.
              </p>
            )
          )}
        </div>
      )}

      {phase === 'email' ? (
        <form
          className='space-y-6'
          onSubmit={(e) => {
            e.preventDefault();
            if (emailValid && !sending) {
              send();
            }
          }}
        >
          <div className='space-y-2'>
            <label htmlFor='passwordless-email' className='text-sm font-medium'>
              Email address
            </label>
            <Input
              id='passwordless-email'
              type='email'
              autoComplete='email'
              placeholder='Enter your email address'
              value={email}
              disabled={sending}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button
            variant='primary'
            type='submit'
            disabled={!emailValid || sending}
            className='w-full py-[15px] h-auto'
          >
            Email me a code
          </Button>
          <p className='text-center text-xs font-abeezee'>
            By continuing you agree to the{' '}
            <Link
              href='/terms-and-conditions'
              className='text-link hover:underline'
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link href='/privacy-policy' className='text-link hover:underline'>
              Privacy Policy
            </Link>
          </p>
        </form>
      ) : (
        <div className='space-y-6'>
          <div className='flex justify-center'>
            <InputOTP
              data-testid='otp-input'
              maxLength={6}
              value={code}
              onChange={setCode}
              onComplete={submitCode}
              pattern={REGEXP_ONLY_DIGITS}
              pasteTransformer={stripNonDigits}
              inputMode='numeric'
              autoComplete='one-time-code'
              disabled={codeLocked}
              aria-label='6-digit sign-in code'
            >
              <InputOTPGroup className='gap-2'>
                {OTP_SLOTS.map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className='min-w-10 w-10 sm:min-w-12 sm:w-12 !px-0'
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            variant='primary'
            type='button'
            onClick={() => submitCode(code)}
            disabled={code.length !== 6 || codeLocked}
            className='w-full py-[15px] h-auto'
          >
            Sign in
          </Button>
          <div className='flex flex-col items-center gap-2 font-abeezee text-sm'>
            <Button
              variant='link'
              type='button'
              onClick={send}
              disabled={secondsLeft > 0 || locked}
            >
              {secondsLeft > 0
                ? `Resend code in ${secondsLeft}s`
                : offerNewCode
                  ? 'Email me a new code'
                  : 'Resend code'}
            </Button>
            <Button
              variant='link'
              type='button'
              disabled={locked}
              onClick={() => {
                setPhase('email');
                setExpiresAt(null);
                setCode('');
                setFailure(null);
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      )}

      <p className='text-center font-abeezee text-sm'>
        <Link href='/login' className='text-link hover:underline'>
          Sign in with your password instead
        </Link>
      </p>
    </div>
  );
};

export default Page;
