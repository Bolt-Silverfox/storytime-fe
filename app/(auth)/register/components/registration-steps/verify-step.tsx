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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { maskEmail } from '@/lib/utils';

const FormSchema = z.object({
  pin: z.string().min(6, {
    message: 'Your one-time password must be 6 characters.',
  }),
});

export const VerifyStep = () => {
  const { registrationData } = useAuth();
  const [timeLeft, setTimeLeft] = useState(60);

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

  function handleResend() {
    toast('A new OTP has been sent to your email.');
    setTimeLeft(60); // reset timer
  }

  function onSubmit(data: z.infer<typeof FormSchema>) {
    toast('You submitted the following values', {
      description: (
        <pre className='mt-2 w-[320px] rounded-md bg-neutral-950 p-4'>
          <code className='text-white'>{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='max-w-[539px] mx-auto space-y-10 flex-col flex items-center'
      >
        <div className='space-y-6'>
          <div className='space-y-1.5'>
            <h1 className='text-center font-qilka font-bold text-[26px] text-[#221D1D] dark:text-white'>
              Verify your email
            </h1>
            <p className='text-center text-[#4A413F] dark:text-white font-abeezee'>
              We have sent a special code to your registered email address
              {maskEmail(registrationData?.email || '')}.
            </p>
          </div>

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
        </div>
        <Button
          variant='secondary'
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
      </form>
    </Form>
  );
};
