import { Skeleton } from '@/components/ui/skeleton';

export const KidsInformationLoader = () => {
  return (
    <div className='space-y-8'>
      <div className='space-y-[9px]'>
        <Skeleton className='w-full rounded-[10px] h-5' />
        <Skeleton className='w-1/2 rounded-[10px] h-5' />
      </div>
      <div className='space-y-3'>
        <Skeleton className='w-[72px] h-[62px] rounded-[10px]' />
        <Skeleton className='w-1/2 rounded-[10px] h-[46px]' />
      </div>
      <div className='space-y-3'>
        <Skeleton className='w-[72px] h-[62px] rounded-[10px]' />
        <Skeleton className='w-1/2 rounded-[10px] h-[46px]' />
      </div>
    </div>
  );
};
