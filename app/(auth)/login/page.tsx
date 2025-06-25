'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { useState } from 'react';
import { EyeIcon, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginService } from '@/lib/services';
import { PageLoader } from '@/components/page-loader';

const FormSchema = z.object({
  email: z
    .string({ required_error: 'Email address is required.' })
    .email({ message: 'Invalid email address' }),
  password: z.string({ required_error: 'Password is required' }),
});

const Page = () => {
  const router = useRouter();
  const { registrationData } = useAuth();
  const [passwordType, setPasswordType] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const EyeComponent = passwordType ? EyeOff : EyeIcon;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      email: registrationData?.email || '',
      password: '',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);
    try {
      // todo: set user to global context
      const response = await loginService(data);

      toast.success('Login successful!');

      router.push('/dashboard');
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (error: any) {
      toast.error('Login failed', {
        description: error.message,
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
          <div className='relative'>
            <p className="text-[26px] [font-feature-settings:'liga'_off,_'clig'_off] text-[#221D1D] text-center dark:text-white font-abeezee">
              Hello! 👋 🥰
            </p>
            <div />
          </div>
          <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
            Welcome back
          </p>
          <p className='text-[#4A413F] dark:text-white font-abeezee'>
            Glad to have you back
          </p>
        </div>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='max-w-[539px] mx-auto space-y-10'
        >
          <div className='space-y-6'>
            <h1 className='text-center font-qilka font-bold text-[26px] text-[#221D1D] dark:text-white'>
              Provide your details
            </h1>

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

            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem className='relative px-1'>
                  <FormControl>
                    <div className='relative group'>
                      <Input
                        type={passwordType ? 'password' : 'text'}
                        placeholder='Enter your password'
                        {...field}
                      />
                      <EyeComponent
                        className='absolute z-10 right-[15px] -translate-y-1/2 top-1/2 cursor-pointer hidden group-hover:block'
                        size={20}
                        onClick={() => {
                          setPasswordType((prev) => !prev);
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage
                    className={cn(
                      'text-[#4A413F]',
                      form.formState.errors.password && 'text-destructive'
                    )}
                  >
                    Password has to be 8 characters long
                  </FormMessage>
                </FormItem>
              )}
            />
            <Link
              href='/forgot-password'
              className='text-[#0731EC] hover:underline text-end block font-abeezee'
            >
              Forgot password?
            </Link>
          </div>
          <Button
            variant='primary'
            type='submit'
            disabled={!form.formState.isValid}
            className='w-full py-[15px] h-auto'
          >
            Login
          </Button>
          <p className='font-abeezee text-[#221D1D] dark:text-white text-center space-x-3'>
            Don't have an account?{' '}
            <Link href='/register' className='text-[#0731EC] hover:underline'>
              Register
            </Link>
          </p>
        </form>
      </Form>
    </div>
  );
};

export default Page;
