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
import { EyeIcon, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { registerService } from '@/lib/services';
import { PageLoader } from '@/components/page-loader';

const FormSchema = z
  .object({
    email: z
      .string({ required_error: 'Email address is required.' })
      .email({ message: 'Invalid email address' })
      .max(100, { message: 'Email address is too long' }),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, {
        message: 'Password has to be 8 characters long',
      })
      .max(50, {
        message: 'Password must be at most 50 characters long',
      }),
    confirm_password: z.string({ required_error: 'Please confirm password' }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

export const CredentialsStep = () => {
  const {
    registrationData,
    setRegistrationData,
    handleRegistrationStepForward,
  } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [passwordType, setPasswordType] = useState(true);
  const EyeComponent = passwordType ? EyeOff : EyeIcon;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      email: registrationData?.email || '',
      password: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    setIsLoading(true);
    try {
      const response = await registerService({
        email: data.email,
        password: data.password,
        fullName: registrationData?.name ?? '',
        title: registrationData?.title ?? '',
      });

      console.log(response);
      setRegistrationData({
        ...registrationData,
        email: data.email,
      });

      toast.success('Registration successful. Check your email to verify.');
      handleRegistrationStepForward('verify');
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (error: any) {
      toast.error(error?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='max-w-[539px] mx-auto space-y-10'
      >
        <div className='space-y-6'>
          <h1 className='text-center font-qilka font-bold text-[26px] text-[#221D1D] dark:text-white'>
            Provide your email and password
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
              <FormItem className='bg-background dark:bg-background z-[1] relative px-1'>
                <FormControl>
                  <div className='relative group'>
                    <Input
                      type={passwordType ? 'password' : 'text'}
                      placeholder='Enter your password'
                      autoComplete='new-password'
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
          <FormField
            control={form.control}
            name='confirm_password'
            render={({ field }) => (
              <FormItem className='px-1'>
                <FormControl>
                  <div className='relative group'>
                    <Input
                      type={passwordType ? 'password' : 'text'}
                      placeholder='Confirm your password'
                      className={cn(
                        'transition-[translate] duration-500',
                        !(
                          form.watch('password') &&
                          !form.formState.errors.password &&
                          form.watch('password').length >= 8
                        ) && 'translate-y-[-200%]'
                      )}
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
                    'transition-[translate] duration-500',
                    !(
                      form.watch('password') &&
                      !form.formState.errors.password &&
                      form.watch('password').length >= 8
                    ) && 'translate-y-[-700%]'
                  )}
                />
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
          {!form.formState.isValid ? 'Proceed' : 'Verify email'}
        </Button>
      </form>
    </Form>
  );
};
