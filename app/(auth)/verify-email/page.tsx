'use client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  sendVerificationEmailService,
  verifyEmailService,
} from '@/lib/services';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const EmailSchema = z.object({
  email: z
    .string({ required_error: 'Email address is required.' })
    .min(1, 'Email address is required.')
    .email({ message: 'Enter a valid email address' }),
});

const OTP_SLOTS = ['s0', 's1', 's2', 's3', 's4', 's5'];

const VerifyEmailPage = () => {
  const router = useRouter();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const form = useForm<z.infer<typeof EmailSchema>>({
    resolver: zodResolver(EmailSchema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  // Pre-fill from ?email= (passed by the login page) without pulling in
  // useSearchParams (which would force a Suspense boundary).
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('email');
    if (fromQuery) {
      form.setValue('email', fromQuery, { shouldValidate: true });
    }
  }, [form]);

  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }
    const timer = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const sendCode = async (targetEmail: string) => {
    setSending(true);
    try {
      const res = await sendVerificationEmailService(targetEmail);
      toast.success(res?.message || 'Verification code sent');
      setEmail(targetEmail);
      setPhase('code');
      setTimeLeft(60);
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ||
          'Could not send verification code'
      );
    } finally {
      setSending(false);
    }
  };

  const onSendSubmit = form.handleSubmit((data) => sendCode(data.email));

  const verify = async () => {
    if (otp.length < 6) {
      return;
    }
    setVerifying(true);
    try {
      await verifyEmailService(otp);
      toast.success('Email verified! You can now log in.');
      router.push('/login');
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message || 'Verification failed'
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className='max-w-[440px] mx-auto space-y-8'>
      <div className='space-y-1.5 text-center'>
        <h1 className='font-qilka font-bold text-[26px] text-[#221D1D] dark:text-white'>
          Verify your email
        </h1>
        <p className='text-[#4A413F] dark:text-white font-abeezee text-sm'>
          {phase === 'email'
            ? 'Enter your email and we’ll send you a verification code.'
            : email
              ? `Enter the 6-digit code we sent to ${email}.`
              : 'Enter your 6-digit verification code.'}
        </p>
      </div>

      {phase === 'email' ? (
        <Form {...form}>
          <form onSubmit={onSendSubmit} className='space-y-6'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      autoComplete='email'
                      placeholder='Enter your email address'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              variant='primary'
              type='submit'
              disabled={!form.formState.isValid || sending}
              className='w-full py-[15px] h-auto'
            >
              {sending ? 'Sending…' : 'Send verification code'}
            </Button>
            <button
              type='button'
              onClick={() => setPhase('code')}
              className='block mx-auto text-sm font-abeezee text-[#0731EC] hover:underline'
            >
              Already have a code? Enter it
            </button>
          </form>
        </Form>
      ) : (
        <div className='space-y-6 flex flex-col items-center'>
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup className='gap-[9px] justify-center items-center'>
              {OTP_SLOTS.map((slot, i) => (
                <InputOTPSlot key={slot} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button
            variant='secondary'
            type='button'
            onClick={() => email && sendCode(email)}
            disabled={timeLeft > 0 || sending || !email}
            className='py-2.5 px-6 rounded-[50px] mx-auto max-w-max bg-white border-[#FAF4F2] shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] border dark:bg-neutral-950 text-[#221D1D] dark:text-white'
          >
            {timeLeft > 0
              ? `Resend in 0:${String(timeLeft).padStart(2, '0')}`
              : 'Resend code'}
          </Button>
          <Button
            variant='primary'
            type='button'
            onClick={verify}
            disabled={otp.length < 6 || verifying}
            className='w-full py-[15px] h-auto'
          >
            {verifying ? 'Verifying…' : 'Verify email'}
          </Button>
          <button
            type='button'
            onClick={() => setPhase('email')}
            className='block mx-auto text-sm font-abeezee text-[#0731EC] hover:underline'
          >
            Use a different email
          </button>
        </div>
      )}

      <p className='text-center text-sm font-abeezee text-[#4A413F] dark:text-white'>
        <Link href='/login' className='text-[#0731EC] hover:underline'>
          Back to login
        </Link>
      </p>
    </div>
  );
};

export default VerifyEmailPage;
