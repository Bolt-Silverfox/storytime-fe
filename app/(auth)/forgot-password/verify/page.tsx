'use client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/context/auth-context';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StepBackButton } from '../../register/components/step-back';
import { maskEmail } from '@/lib/utils';
import { useEffect, useState } from 'react';
import {
  sendVerificationEmailService,
  validateResetTokenService,
} from '@/lib/services';
import { PageLoader } from '@/components/page-loader';

const FormSchema = z.object({
  pin: z.string().min(6, {
    message: 'Your one-time password must be 6 characters.',
  }),
});

const Page = () => {
  const router = useRouter();
  const { registrationData } = useAuth();
  const [timeLeft, setTimeLeft] = useState(60);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    if (timeLeft === 0) {
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  async function handleResend() {
    try {
      const response = await sendVerificationEmailService(
        registrationData?.email ?? ''
      );
      toast.success(response.message);
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (error: any) {
      toast.error(error.message || 'Could not send verification email');
    } finally {
      setTimeLeft(60);
    }
  }

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const token = data.pin;
    const email = registrationData?.email;

    if (!email) {
      toast.error('Email is missing from context.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await validateResetTokenService({ token, email });

      toast.success(response.message);
      router.push(`/create-new-password?token=${data.pin}`);
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (error: any) {
      toast.error('OTP verification failed', {
        description: error?.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className='md:space-y-[103px]'>
      <div className='space-y-[26px] flex flex-col items-center'>
        <div className='space-y-1.5 text-center w-full'>
          <StepBackButton onClick={() => router.push('/forgot-password')} />
          <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
            Verify your email
          </p>
          <p className='text-[#4A413F] max-w-[539px] mx-auto dark:text-white font-abeezee'>
            We have sent a special code to your registered email address{' '}
            {maskEmail(registrationData?.email || '')}.
          </p>
        </div>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='max-w-[539px] mx-auto space-y-10 flex-col flex items-center'
        >
          <FormField
            control={form.control}
            name='pin'
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <InputOTP maxLength={6} {...field}>
                    <InputOTPGroup className='gap-[9px] justify-center items-center'>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot key={Math.random()} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <div className=''>
                  <FormMessage />
                  <p className='text-[#0731EC] font-abeezee text-end'>
                    {`0:${timeLeft < 10 ? `0${timeLeft}` : timeLeft}`}
                  </p>
                </div>
              </FormItem>
            )}
          />

          <Button
            variant='secondary'
            type='button'
            onClick={handleResend}
            disabled={timeLeft > 0}
            className='py-2.5 px-6 rounded-[50px] !mx-auto max-w-max bg-white border-[#FAF4F2] shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] border dark:bg-neutral-950 text-[#221D1D] dark:text-white'
          >
            Resend OTP
          </Button>
          <Button
            variant='primary'
            type='submit'
            disabled={!form.formState.isValid}
            className='w-full py-[15px] h-auto'
          >
            {!form.formState.isValid ? 'Proceed' : 'Verify email'}
          </Button>
          <p className='font-abeezee text-[#221D1D] dark:text-white text-center space-x-3'>
            If you already have an account{' '}
            <Link href='/login' className='text-[#0731EC] hover:underline'>
              Login
            </Link>
          </p>
        </form>
      </Form>
    </div>
  );
};

export default Page;
