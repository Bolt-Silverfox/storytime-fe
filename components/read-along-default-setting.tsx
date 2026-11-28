'use client';

import { useId } from 'react';
import {
  setReadAlongDefault,
  useReadAlongDefault,
} from '@/lib/reader/read-along-preference';
import { Switch } from './ui/switch';

export default function ReadAlongDefaultSetting() {
  const id = useId();
  const checked = useReadAlongDefault();
  return (
    <div className='flex items-center justify-between gap-4 max-w-md'>
      <label
        htmlFor={id}
        className='text-strong text-base not-italic font-normal leading-5 font-abeezee'
      >
        Read along by default
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={setReadAlongDefault}
        className='data-[state=checked]:bg-[#83E9FB] data-[state=unchecked]:bg-black dark:data-[state=unchecked]:bg-line cursor-pointer'
      />
    </div>
  );
}
