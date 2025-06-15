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
import { StepBackButton } from '../register/components/step-back';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';

const FormSchema = z.object({
  email: z
    .string({ required_error: 'Email address is required.' })
    .email({ message: 'Invalid email address' }),
});

const Page = () => {
  const router = useRouter();
  const { registrationData, setRegistrationData } = useAuth();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      email: registrationData?.email || '',
    },
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    setRegistrationData({
      ...registrationData,
      email: data.email,
    });
    toast('You submitted the following values', {
      description: (
        <pre className='mt-2 w-[320px] rounded-md bg-neutral-950 p-4'>
          <code className='text-white'>{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    });

    router.push('/forgot-password/verify');
  }
  return (
    <div className='md:space-y-[103px]'>
      <div className='space-y-[26px] flex flex-col items-center'>
        <div className='space-y-1.5 text-center w-full'>
          <StepBackButton onClick={() => router.push('/login')} />
          <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
            Reset password
          </p>
          <p className='text-[#4A413F] dark:text-white font-abeezee'>
            Change your password
          </p>
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
                <FormControl>
                  <Input placeholder='Enter your email address' {...field} />
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
