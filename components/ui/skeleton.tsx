import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn(
        'bg-[linear-gradient(90deg,_#F6DCD3_0%,_#FAF4F2_100%)] animate-pulse rounded-md',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
