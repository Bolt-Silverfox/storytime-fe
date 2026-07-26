'use client';

import { PageLoader } from '@/components/page-loader';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropZoneArea,
  Dropzone,
  DropzoneMessage,
  DropzoneTrigger,
  useDropzone,
} from '@/components/ui/dropzone';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Icons } from '@/components/ui/icons';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  type SystemAvatar,
  getSystemAvatarsService,
  uploadAvatarService,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const FormSchema = z.object({
  // The selected avatar's backend id (system avatar or freshly-uploaded one).
  avatarId: z.string({ required_error: 'Please select an avatar.' }),
});

export const KidsAvatarSheet = ({
  avatar,
  avatarId,
  setAvatar,
}: {
  avatar: string;
  avatarId?: string;
  setAvatar: (avatar: string, avatarId?: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Predefined avatars from the backend + any the user uploads this session.
  const [systemAvatars, setSystemAvatars] = useState<SystemAvatar[]>([]);
  const [uploadedAvatars, setUploadedAvatars] = useState<SystemAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [avatarsError, setAvatarsError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: { avatarId: avatarId ?? '' },
  });

  const allAvatars = [...systemAvatars, ...uploadedAvatars];

  const dropzone = useDropzone({
    onDropFile: async (file: File) => {
      try {
        const uploaded = await uploadAvatarService(file, file.name);
        setUploadedAvatars((prev) =>
          prev.some((a) => a.id === uploaded.id) ? prev : [...prev, uploaded]
        );
        // Auto-select the just-uploaded avatar.
        form.setValue('avatarId', uploaded.id, {
          shouldValidate: true,
          shouldDirty: true,
        });
        return { status: 'success' as const, result: uploaded.url };
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'Failed to upload image';
        toast.error(message);
        return { status: 'error' as const, error: message };
      }
    },
    validation: {
      accept: {
        'image/*': ['.png', '.jpg', '.jpeg'],
      },
      maxSize: 5 * 1024 * 1024,
      maxFiles: 1,
    },
  });

  // Load system avatars the first time the sheet opens.
  useEffect(() => {
    if (!open || systemAvatars.length > 0) {
      return;
    }

    let cancelled = false;
    setAvatarsLoading(true);
    setAvatarsError(null);
    getSystemAvatarsService()
      .then((avatars) => {
        if (!cancelled) {
          setSystemAvatars(avatars);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAvatarsError(
            err?.message || 'Could not load avatars. Please try again.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAvatarsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, systemAvatars.length]);

  // Keep the selection in sync if the parent already has an avatarId.
  useEffect(() => {
    if (avatarId) {
      form.setValue('avatarId', avatarId);
    }
  }, [avatarId, form]);

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const selected = allAvatars.find((a) => a.id === data.avatarId);
    if (!selected) {
      toast.error('Please select an avatar.');
      return;
    }

    setLoading(true);
    try {
      setOpen(false);
      // Push both the display URL and the persisted id up to the kid form.
      setAvatar(selected.url, selected.id);
      toast.success('🎉 Avatar selected!', {
        description: 'Your kid’s profile now looks even cooler 😎',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className='relative w-max'>
        <Image
          src={avatar}
          height={60}
          width={60}
          className='rounded-full size-[60px] border border-[#FAF4F2] shadow-[0_0_17px_0_#221D29]/5'
          alt=''
        />
        <SheetTrigger
          className={cn(
            buttonVariants({ size: 'icon', variant: 'ghost' }),
            'rounded-full p-1.5 bg-white shadow-[0_0_17px_0_#EC4007]/10 absolute -right-2.5 -bottom-2.5'
          )}
        >
          <Icons.edit />
        </SheetTrigger>
      </div>
      <SheetContent className='py-8 overflow-auto'>
        <SheetTitle className='text-[#221D1D] px-8 font-normal font-abeezee'>
          Choose your kid’s avatar
        </SheetTitle>

        <Separator className='mb-2' />
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-6 h-full'
          >
            <div className='space-y-0.5 px-8'>
              <h2 className='text-lg font-bold font-qilka'>Select avatar</h2>
              <p className='text-[#4A413F] text-xs font-abeezee'>
                Select a customized avatar to save time
              </p>
            </div>
            <FormField
              control={form.control}
              name='avatarId'
              render={({ field }) => (
                <FormItem className='px-8'>
                  {avatarsLoading ? (
                    <p className='text-[#4A413F] text-sm font-abeezee py-4'>
                      Loading avatars…
                    </p>
                  ) : avatarsError ? (
                    <p className='text-destructive text-sm font-abeezee py-4'>
                      {avatarsError}
                    </p>
                  ) : allAvatars.length === 0 ? (
                    <p className='text-[#4A413F] text-sm font-abeezee py-4'>
                      No avatars available — upload one below.
                    </p>
                  ) : (
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className='grid grid-cols-2 gap-4 mt-4'
                      >
                        {allAvatars.map((option) => (
                          <FormItem key={option.id}>
                            <FormLabel className='w-full cursor-pointer flex items-center justify-between gap-3 rounded-2xl border border-[#FAF4F2] bg-white p-6 shadow-[0_0_17px_0_#221D29]/5 [&:has(>button[data-state=checked])]:border-[#FB9583] [&:has(>button[data-state=checked])]:ring-2 [&:has(>button[data-state=checked])]:ring-[#FB9583]/50'>
                              <div className='flex items-center gap-2.5 min-w-0'>
                                <Image
                                  src={option.url}
                                  className='rounded-full size-10 object-cover'
                                  height={40}
                                  width={40}
                                  alt={option.name ?? 'avatar'}
                                />
                                <span
                                  title={option.name}
                                  className='text-[#221D1D] truncate font-abeezee'
                                >
                                  {option.name ?? 'Avatar'}
                                </span>
                              </div>
                              <FormControl>
                                <RadioGroupItem value={option.id} />
                              </FormControl>
                            </FormLabel>
                          </FormItem>
                        ))}
                      </RadioGroup>
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='flex items-center gap-[5px]'>
              <Icons.dashLine />
              <span className='uppercase text-[10px] text-[#F5F5F4] font-abeezee'>
                OR
              </span>
              <Icons.dashLine />
            </div>
            <div className='px-8 space-y-4'>
              <div className='space-y-0.5'>
                <h2 className='text-lg font-bold font-qilka'>Upload image</h2>
                <p className='text-[#4A413F] text-xs font-abeezee'>
                  Upload your child’s image instead
                </p>
              </div>
              <div className='not-prose flex flex-col gap-4'>
                <Dropzone {...dropzone}>
                  <div className='space-y-1.5'>
                    <DropZoneArea className='rounded-[34px] bg-[#FAF4F2] custom-border border-0'>
                      <DropzoneTrigger className='flex items-center gap-3 bg-transparent py-10 px-2.5 text-center'>
                        <Icons.upload />
                        <p className='font-semibold text-[#221D1D] font-abeezee'>
                          Upload image
                        </p>
                      </DropzoneTrigger>
                    </DropZoneArea>

                    <DropzoneMessage
                      className={cn(
                        'text-[#4A413F] ',
                        dropzone.rootError && 'text-destructive'
                      )}
                    >
                      Accepted files: PNG, JPEG, JPG not more than 5MB
                    </DropzoneMessage>
                  </div>
                </Dropzone>
              </div>
            </div>
            <SheetFooter>
              <Button
                variant='primary'
                type='submit'
                disabled={!form.formState.isValid}
                className='flex-1 py-[15px] px-[50px] w-max h-auto ml-auto'
              >
                Save avatar
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};
