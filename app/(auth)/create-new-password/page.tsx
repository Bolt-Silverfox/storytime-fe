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
import { useState } from 'react';
import { EyeIcon, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPasswordService } from '@/lib/services';
import { PageLoader } from '@/components/page-loader';

const FormSchema = z
  .object({
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, {
        message: 'Password has to be 8 characters long',
      })
      .max(50, {
        message: 'Password must be at most 50 characters long',
      })
      .min(1, { message: 'Please enter a password' })
      .min(8, { message: 'Passwords must be at least 8 characters long' })
      .refine(
        (value) => /[a-z]/.test(value),
        'Password must contain at least one lowercase letter'
      )
      .refine(
        (value) => /[A-Z]/.test(value),
        'Password must contain at least one uppercase letter'
      )
      .refine(
        (value) => /\d/.test(value),
        'Password must contain at least one number'
      )
      .refine(
        (value) => /[!$%&*?@]/.test(value),
        'Password must contain at least one special character'
      ),
    confirm_password: z.string({ required_error: 'Please confirm password' }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

const Page = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [passwordType, setPasswordType] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const EyeComponent = passwordType ? EyeOff : EyeIcon;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!token) {
      toast.error('Token is missing from the URL');
      return;
    }
    setIsLoading(true);

    try {
      const response = await resetPasswordService({
        token,
        newPassword: data.password,
      });

      toast.success(response.message);
      router.push('/create-new-password/success');
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
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
          <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
            Create new password
          </p>
          <p className='text-[#4A413F] max-w-[539px] mx-auto dark:text-white font-abeezee'>
            Create a new password
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
              name='password'
              render={({ field }) => (
                <FormItem>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='confirm_password'
              render={({ field }) => (
                <FormItem>
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
                      form.formState.errors.confirm_password &&
                        'text-destructive'
                    )}
                  >
                    Password has to be 8 characters long
                  </FormMessage>
                </FormItem>
              )}
            />
          </div>
          <Button
            variant='primary'
            type='submit'
            disabled={!form.formState.isValid}
            className='w-full py-[15px] h-auto'
          >
            Change password
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default Page;
