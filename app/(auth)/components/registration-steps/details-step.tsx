'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registrationTitles } from '@/lib/data';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const FormSchema = z.object({
  title: z
    .string({ required_error: 'Your title is required.' })
    .refine((val) => registrationTitles.includes(val), {
      message: 'Please select a valid title.',
    }),
  name: z
    .string({ required_error: 'Your full name is required.' })
    .min(3, 'Your name is too short.')
    .regex(
      /^[A-Za-z\s'-]+$/,
      'Name can only contain letters, spaces, apostrophes and hyphens.'
    )
    .refine((val) => val.trim().split(/\s+/).length >= 2, {
      message: 'Please enter your full name (first and last).',
    }),
});

export const DetailsStep = () => {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
  });

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
        className='max-w-[539px] mx-auto space-y-10'
      >
        <div className='space-y-6'>
          <h1 className='text-center font-qilka font-bold text-[26px] text-[#221D1D] dark:text-white'>
            Provide your details
          </h1>

          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Select title' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {registrationTitles.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage
                  className={cn(
                    'text-[#4A413F] ',
                    form.formState.errors.title && 'text-destructive'
                  )}
                >
                  Example Mr, Ms, Mrs, Sir or Dr
                </FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder='Enter your full name' {...field} />
                </FormControl>
                <FormMessage />
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
  );
};
