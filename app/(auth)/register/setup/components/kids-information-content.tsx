'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { KidsInformationCard } from './kids-information-card';
import { useEffect, useRef } from 'react';

export const KidsInformationContent = () => {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'kidsInfo',
  });

  const kidsAmount = useWatch({ name: 'kids', control });
  const prevSyncedCountRef = useRef(0); 

  useEffect(() => {
    const parsedAmount = Number.parseInt(kidsAmount || '0', 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount < 0) {
      return;
    }

    const currentLength = fields.length;
    const prevSyncedCount = prevSyncedCountRef.current;

    if (parsedAmount === prevSyncedCount) {
      return;
    }

    if (parsedAmount > currentLength) {
      const toAdd = Array(parsedAmount - currentLength).fill(null);
      for (const _ of toAdd) {
        append({
          name: '',
          ageRange: '',
          avatar: '/avatar.svg',
        });
      }
    } else if (parsedAmount < currentLength) {
      for (let i = currentLength - 1; i >= parsedAmount; i--) {
        remove(i);
      }
    }

    prevSyncedCountRef.current = parsedAmount;
  }, [kidsAmount, append, remove, fields.length]);

  return (
    <div className='space-y-6 overflow-auto max-h-[500px]'>
      <p className='font-abeezee text-[#221D1D]'>
        Complete your kids information
      </p>
      <div className='space-y-6 '>
        {fields.map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <KidsInformationCard key={index} index={index} />
        ))}
      </div>
    </div>
  );
};
