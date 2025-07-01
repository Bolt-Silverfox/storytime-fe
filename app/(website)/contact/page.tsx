'use client';

import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Users } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const contactSchema = z.object({
  fullname: z.string({ required_error: 'Full name is required' }).min(2, ''),
  email: z
    .string({ required_error: 'email address is required' })
    .email('Invalid email address'),
  subject: z.string({ required_error: 'Subject is required' }),
  message: z.string({
    required_error: 'Message must be at least 5 characters',
  }),
});

type ContactFormType = z.infer<typeof contactSchema>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const Page = () => {
  const form = useForm<ContactFormType>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      fullname: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  async function onSubmit() {
    await sleep(2000);

    toast.success('Form submitted successfully!');
  }
  return (
    <main className='space-y-16 '>
      <section className='relative pt-40 md:pb-40 pb-0 space-y-10'>
        <InteractiveGridPattern width={150} height={150} />
        <section className='relative px-2'>
          <div className='flex flex-col items-center gap-5 w-full'>
            <h1 className='font-qilka font-bold text-[#221D1D] md:text-[60px] text-[44px] max-w-[926px] mx-auto text-center md:leading-[68px] leading-[50px]'>
              We’d love to hear from you
            </h1>
            <p className='w-full max-w-[556px] text-lg text-[#4A413F] font-abeezee text-center'>
              Have a question, a suggestion, or just want to say hello? The
              Storytime team is here to help. Whether you're a parent, teacher,
              storyteller, or a fan we're listening
            </p>
          </div>
        </section>
      </section>{' '}
      <section className='md:p-[42px] p-6 mx-5 relative bg-white rounded-[51px] max-w-[1056px] md:mx-auto grid md:grid-cols-2 gap-10'>
        <div className='space-y-12'>
          <div>
            <h3 className='text-xl font-semibold text-[#4a413f] mb-2'>
              Email us
            </h3>
            <p className='text-[#808080] mb-6'>
              We will get back to you within 24-48 hours.
            </p>
            <div className='flex items-center space-x-3'>
              <div className='w-12 h-12 bg-[#5e20f8] rounded-lg flex items-center justify-center'>
                <Mail className='w-6 h-6 text-white' />
              </div>
              <a
                href='mailto:support@storytimeapp.me'
                className='text-[#4a413f] font-medium hover:underline'
              >
                support@storytimeapp.me
              </a>
            </div>
          </div>

          <div>
            <h3 className='text-xl font-semibold text-[#4a413f] mb-2'>
              Partnership opportunities
            </h3>
            <p className='text-[#808080] mb-6'>
              Interested in collaborating, contributing stories, or educational
              content? We'd love to connect.
            </p>
            <div className='flex items-center space-x-3'>
              <div className='w-12 h-12 bg-[#f820a5] rounded-lg flex items-center justify-center'>
                <Users className='w-6 h-6 text-white' />
              </div>
              <a
                href='mailto:partners@storytimeapp.me'
                className='text-[#4a413f] font-medium hover:underline'
              >
                partners@storytimeapp.me
              </a>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <FormField
              control={form.control}
              name='fullname'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-[#4a413f] font-medium'>
                    Full name
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='Enter your full name'
                      className='mt-2 bg-white border-[#f5f5f4] focus:border-[#f84020] focus:ring-[#f84020]'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-[#4a413f] font-medium'>
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='email'
                      placeholder='Enter your email'
                      className='mt-2 bg-white border-[#f5f5f4] focus:border-[#f84020] focus:ring-[#f84020]'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='subject'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-[#4a413f] font-medium'>
                    Subject
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='Enter message subject'
                      className='mt-2 bg-white border-[#f5f5f4] focus:border-[#f84020] focus:ring-[#f84020]'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='message'
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder='Type your message'
                      className='bg-white border-[#f5f5f4] focus:border-[#f84020] focus:ring-[#f84020] min-h-[120px]'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              variant='primary'
              disabled={!form.formState.isValid}
              type='submit'
              className='ml-auto block h-auto py-3 px-[60px] w-max'
            >
              Submit
            </Button>
          </form>
        </Form>
      </section>
      <section className='md:pb-[160px] pb-[60px] px-5'>
        <Card className='w-full max-w-[1140px] mx-auto bg-[#EC4007] rounded-[51px] border-[0.5px] border-solid border-[#f84020] md:p-[62px] p-6'>
          <CardContent className='p-0'>
            <div className='flex md:flex-row flex-col items-center gap-[70px] w-full'>
              <div className='flex flex-col items-start gap-8 flex-1 max-w-[473px]'>
                <div className='space-y-3'>
                  <h2 className='font-qilka md:text-[60px] text-[40px]  font-bold text-white leading-[103.333%]'>
                    Want to join the movement
                  </h2>

                  <p className='text-[#FEEAE6] font-abeezee text-xl max-w-[500px]'>
                    Let’s build a world where stories still matter.
                  </p>
                </div>

                <Link
                  href='/register'
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'rounded-full bg-transparent text-white px-[54px] border h-auto py-2.5'
                  )}
                >
                  Create an account today
                </Link>
              </div>

              <Image
                src='/about-d.png'
                height={473}
                width={366}
                className='rounded-[37px] w-full max-w-[473px]'
                alt='Digital storybook illustration'
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Page;
