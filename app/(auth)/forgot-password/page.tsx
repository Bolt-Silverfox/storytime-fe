'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageLoader } from '@/components/page-loader';
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
import { useAuth } from '@/context/auth-context';
import { requestPasswordResetService } from '@/lib/services';
import { StepBackButton } from '../register/components/step-back';

const FormSchema = z.object({
  email: z
    .string({ error: 'Email address is required.' })
    .email({ message: 'Invalid email address' }),
});

const Page = () => {
  const router = useRouter();
  const { registrationData, setRegistrationData } = useAuth();

  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      email: registrationData?.email || '',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);
    try {
      const res = await requestPasswordResetService(data.email);
      setRegistrationData({
        ...registrationData,
        email: data.email,
      });

      toast.success('Success', {
        description: res?.message || 'Password reset email sent.',
      });

      router.push('/forgot-password/verify');
      // biome-ignore lint/suspicious/noExplicitAny: the caught value is untyped; only .message is read below
    } catch (error: any) {
      toast.error('Something went wrong', {
        description: error?.message || 'Failed to send password reset email.',
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
          <StepBackButton onClick={() => router.push('/login')} />
          <p className='text-strong text-[34px] font-bold font-qilka'>
            Reset password
          </p>
          <p className='text-body font-abeezee'>Change your password</p>
        </div>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='max-w-[539px] mx-auto space-y-10'
        >
          <FormField
            control={form.control}
            name='email'
            render={({ field }) => (
              <FormItem className='px-1'>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input
                    type='email'
                    placeholder='Enter your email address'
                    aria-required='true'
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
            disabled={!form.formState.isValid}
            className='w-full py-[15px] h-auto'
          >
            Proceed
          </Button>
          <p className='font-abeezee text-strong text-center space-x-3'>
            If you already have an account{' '}
            <Link href='/login' className='text-link hover:underline'>
              Login
            </Link>
          </p>
        </form>
      </Form>
    </div>
  );
};

export default Page;
