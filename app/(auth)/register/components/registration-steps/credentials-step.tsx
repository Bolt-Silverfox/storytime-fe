'use client';

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
import { PasswordInputToggle } from '@/components/ui/password-input-toggle';
import { useAuth } from '@/context/auth-context';
import { registerService } from '@/lib/services';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
        (value) => /[^A-Za-z0-9\s]/.test(value),
        'Password must contain at least one special character'
      ),
    confirm_password: z
      .string({ required_error: 'Please confirm password' })
      .min(8, {
        message: 'Password has to be 8 characters long',
      }),
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
      // todo: set user to global context
      // NOTE: `title` is collected in the details step for UI purposes only.
      // The backend RegisterDto does not whitelist it and the API gateway runs
      // ValidationPipe with forbidNonWhitelisted, so sending `title` returns
      // 400 "property title should not exist". Only send fields the DTO accepts.
      const _response = await registerService({
        email: data.email,
        password: data.password,
        fullName: registrationData?.name ?? '',
      });

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

          <FormField
            control={form.control}
            name='password'
            render={({ field }) => (
              <FormItem className='bg-background dark:bg-background z-[1] relative px-1'>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className='relative'>
                    <Input
                      type={passwordType ? 'password' : 'text'}
                      placeholder='Enter your password'
                      autoComplete='new-password'
                      aria-required='true'
                      {...field}
                    />
                    <PasswordInputToggle
                      visible={!passwordType}
                      onToggle={() => setPasswordType((prev) => !prev)}
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
                  <div className='relative'>
                    <Input
                      type={passwordType ? 'password' : 'text'}
                      placeholder='Confirm your password'
                      aria-label='Confirm password'
                      aria-required='true'
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
                    <PasswordInputToggle
                      visible={!passwordType}
                      onToggle={() => setPasswordType((prev) => !prev)}
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
