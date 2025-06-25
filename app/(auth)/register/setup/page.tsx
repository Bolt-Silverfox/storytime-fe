'use client';

import { useAuth } from '@/context/auth-context';
import {
  cn,
  countryOptions,
  getFirstName,
  kidsOptions,
  languageOptions,
} from '@/lib/utils';
import { StepProgress } from '../components/step-progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { KidsInformationLoader } from './components/kids-information-loader';
import { KidsInformationContent } from './components/kids-information-content';
import { addKidsService } from '@/lib/services';
import { PageLoader } from '@/components/page-loader';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const KidsFormSchema = z.object({
  name: z
    .string({ required_error: 'Name is required.' })
    .min(1, 'Name is required.'),
  ageRange: z
    .string({ required_error: 'Age range is required' })
    .min(1, 'Age range is required.'),
  avatar: z.string({ required_error: 'Avatar is required' }),
});

const FormSchema = z.object({
  language: z.string({ required_error: 'Language is required.' }),
  country: z.string({ required_error: 'Country is required.' }),
  kids: z.string({ required_error: 'Kids is required.' }),
  kidsInfo: z.array(KidsFormSchema).nonempty('At least one kid is required'),
});

const Page = () => {
  const router = useRouter();

  const { registrationData } = useAuth();

  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      language: '',
      country: '',
      kids: '',
      kidsInfo: [],
    },
  });

  const {
    getValues,
    formState: { errors },
  } = form;

  const isPartialFormValid =
    !!getValues('language') &&
    !!getValues('country') &&
    !!getValues('kids') &&
    !errors.language &&
    !errors.country &&
    !errors.kids;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);

    try {
      const response = await addKidsService(data.kidsInfo);

      toast.success(response.message || 'Kids successfully added!');
      router.push('/register/setup/success');
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong while adding kids');
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='space-y-8 relative'
      >
        <div className='space-y-[26px] flex flex-col items-center'>
          <div className='space-y-[26px] flex flex-col items-center'>
            <div className='space-y-1.5 text-center w-full'>
              <p className="text-[26px] [font-feature-settings:'liga'_off,_'clig'_off] text-[#221D1D] text-center dark:text-white font-abeezee">
                Almost there {getFirstName(registrationData?.name)} 👏 🥳
              </p>

              <p className='text-[#221D1D] dark:text-white text-[34px] font-bold font-qilka'>
                Finalize your profile
              </p>
              <p className='text-[#4A413F] dark:text-white font-abeezee'>
                Complete setting up your profile information
              </p>
            </div>
            <StepProgress />
          </div>
        </div>
        <div className='flex items-start gap-12'>
          <div className='space-y-6 max-w-[458px] w-full'>
            <div className='space-y-1.5'>
              <h2 className='text-[26px] font-bold font-qilka'>
                Complete your account
              </h2>
              <p className='text-[#4A413F] font-abeezee'>
                We would love to learn more about you
              </p>
            </div>

            <div className='space-y-6'>
              <FormField
                control={form.control}
                name='language'
                render={({ field }) => (
                  <FormItem>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Select your preferred language' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='en'>English</SelectItem>
                        <Separator />
                        {languageOptions.slice(1).map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='country'
                render={({ field }) => (
                  <FormItem>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Select your country' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='US'>United States</SelectItem>
                        <Separator />
                        {countryOptions.slice(1).map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='kids'
                render={({ field }) => (
                  <FormItem>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Number of kids' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {kidsOptions.map((kid) => (
                          <SelectItem key={kid.value} value={kid.value}>
                            {kid.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage
                      className={cn(
                        'text-[#4A413F] ',
                        form.formState.errors.kids && 'text-destructive'
                      )}
                    >
                      Please specify the number of kids you’d like to add e.g
                      1,2,3,4 etc
                    </FormMessage>
                  </FormItem>
                )}
              />
              <div className='flex gap-2.5 items-center'>
                <Link
                  href='/dashboard'
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'w-full py-[15px] max-w-[115px] h-auto rounded-full border-[#EC4007] text-[#EC4007]'
                  )}
                  type='button'
                >
                  Skip
                </Link>
                {!form.formState.isValid}
                <Button
                  variant='primary'
                  // type='submit'
                  disabled={!isPartialFormValid}
                  className='flex-1 py-[15px] h-auto'
                >
                  {!form.formState.isValid
                    ? 'Finalize profiles'
                    : 'Go to dashboard'}
                </Button>
              </div>
            </div>
          </div>
          <div className='p-[42px] border-[#FAF4F2] border bg-white rounded-[29px] w-full'>
            {/* todo: fix logic */}

            {!isPartialFormValid ? (
              <KidsInformationLoader />
            ) : (
              <KidsInformationContent />
            )}
          </div>
        </div>
      </form>{' '}
    </Form>
  );
};

export default Page;
