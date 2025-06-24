'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ageRangesOptions } from '@/lib/utils';
import { KidsAvatarSheet } from './kids-avatar-sheet';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  FormField,
  FormItem,
  FormControl,
} from '@/components/ui/form';

type KidsInformationCardProps = {
  index: number;
};

export const KidsInformationCard = ({ index }: KidsInformationCardProps) => {
  const { setValue, control } = useFormContext();

  const avatar = useWatch({
    control,
    name: `kidsInfo.${index}.avatar`,
  });

  return (
    <div className='p-6 rounded-[23px] border-[#F5F5F4] space-y-5 bg-white shadow-[0_0_17px_0_#221D29]/5'>
      <KidsAvatarSheet
        avatar={avatar}
        setAvatar={(newAvatar) =>
          setValue(`kidsInfo.${index}.avatar`, newAvatar, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          })
        }
      />
      <div className='flex gap-4 items-center'>
        <FormField
          name={`kidsInfo.${index}.ageRange`}
          render={({ field }) => (
            <FormItem>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className='!h-auto py-2.5'>
                    <SelectValue placeholder='Select age group' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ageRangesOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          name={`kidsInfo.${index}.name`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  className='h-auto py-2.5'
                  placeholder="Kid's name"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
