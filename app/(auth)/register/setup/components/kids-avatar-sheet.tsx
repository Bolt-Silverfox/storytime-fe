'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import Image from 'next/image';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { avatarOptions, cn } from '@/lib/utils';
import {
  Dropzone,
  DropZoneArea,
  DropzoneFileList,
  DropzoneFileListItem,
  DropzoneTrigger,
  DropzoneMessage,
  DropzoneRemoveFile,
  useDropzone,
} from '@/components/ui/dropzone';
import { Trash2Icon } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useState } from 'react';
import { PageLoader } from '@/components/page-loader';

const FormSchema = z.object({
  avatar: z.string({
    required_error: 'You need to select a notification type.',
  }),
});

export const KidsAvatarSheet = ({
  avatar,
  setAvatar,
}: {
  avatar: string;
  setAvatar: (avatar: string) => void;
}) => {
  const dropzone = useDropzone({
    onDropFile: async (file: File) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const url = URL.createObjectURL(file);
      form.setValue('avatar', url, {
        shouldValidate: true,
        shouldDirty: true,
      });
      return {
        status: 'success',
        result: URL.createObjectURL(file),
      };
    },
    validation: {
      accept: {
        'image/*': ['.png', '.jpg', '.jpeg'],
      },
      maxSize: 10 * 1024 * 1024,
      maxFiles: 2,
    },
  });

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const handleResetDropzone = async () => {
    await Promise.all(
      dropzone.fileStatuses.map((file) => dropzone.onRemoveFile(file.id))
    );
  };

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setOpen(false);
      setAvatar(data.avatar);
      form.reset();
      handleResetDropzone();

      toast.success('🎉 Avatar uploaded!', {
        description: 'Your kid’s profile now looks even cooler 😎',
        duration: 4000,
      });
    } finally {
      setLoading(false); // End loading
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
          Upload your kids avatar
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
                Select customized avatar to save time
              </p>
            </div>
            <FormField
              control={form.control}
              name='avatar'
              render={({ field }) => (
                <FormItem className='px-8'>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className='grid grid-cols-2 gap-4 mt-4'
                    >
                      {avatarOptions.map((option) => (
                        <FormItem key={Math.random()}>
                          <FormLabel className='w-full cursor-pointer flex items-center justify-between gap-3 rounded-2xl border border-[#FAF4F2] bg-white p-6 shadow-[0_0_17px_0_#221D29]/5 [&:has(>button[data-state=checked])]:border-[#FB9583] [&:has(>button[data-state=checked])]:ring-2 [&:has(>button[data-state=checked])]:ring-[#FB9583]/50'>
                            <div className='flex items-center gap-2.5'>
                              <Image
                                src={option.avatar}
                                className='rounded-full'
                                height={40}
                                width={40}
                                alt=''
                              />
                              <span
                                title={option.name}
                                className='text-[#221D1D] truncate font-abeezee'
                              >
                                {option.name}
                              </span>
                            </div>
                            <FormControl>
                              <RadioGroupItem value={option.avatar} />
                            </FormControl>
                          </FormLabel>
                        </FormItem>
                      ))}

                      <Dropzone {...dropzone}>
                        <DropzoneFileList className='col-span-2'>
                          {dropzone.fileStatuses.map((file) => (
                            <DropzoneFileListItem
                              className='w-full !p-0'
                              key={file.id}
                              file={file}
                            >
                              <FormItem key={Math.random()}>
                                <FormLabel
                                  htmlFor={file.id}
                                  className='w-full cursor-pointer flex items-center justify-between gap-3 rounded-2xl border border-[#FAF4F2] bg-white p-6 shadow-[0_0_17px_0_#221D29]/5 [&:has(>button[data-state=checked])]:border-[#FB9583] [&:has(>button[data-state=checked])]:ring-2 [&:has(>button[data-state=checked])]:ring-[#FB9583]/50'
                                >
                                  <div className='flex items-center gap-2.5'>
                                    {file.status === 'pending' && (
                                      <div className='size-10 rounded-full bg-black/20' />
                                    )}
                                    {file.status === 'success' && (
                                      <Image
                                        height={40}
                                        width={40}
                                        src={file.result}
                                        alt={`uploaded-${file.fileName}`}
                                        className='rounded-full !size-10'
                                      />
                                    )}
                                    <div className='min-w-0'>
                                      {/* <p className='truncate text-sm'>{file.fileName}</p> */}
                                      <p className='text-xs text-muted-foreground'>
                                        {(
                                          file.file.size /
                                          (1024 * 1024)
                                        ).toFixed(2)}{' '}
                                        MB
                                      </p>
                                    </div>
                                  </div>

                                  <DropzoneRemoveFile className='shrink-0 hover:outline'>
                                    <Trash2Icon className='size-4' />
                                  </DropzoneRemoveFile>
                                  <RadioGroupItem
                                    className='hidden'
                                    value={file.result ?? ''}
                                    id={file.id}
                                  />
                                </FormLabel>
                              </FormItem>
                            </DropzoneFileListItem>
                          ))}
                        </DropzoneFileList>
                      </Dropzone>
                    </RadioGroup>
                  </FormControl>
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
                  Upload your child image instead
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
                Upload avatar
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};
