import { Button } from '@/components/ui/button';
import React from 'react';

const EmptyStatesWrapper = ({ children }: { children: React.ReactElement }) => {
  return (
    <div className='mx-auto flex max-w-[212px] flex-col items-center gap-9 md:max-w-[246px] md:gap-[42px]'>
      {children}
    </div>
  );
};

const EmptyIcon = ({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) => (
  <div className='flex flex-col items-center gap-4 md:gap-5'>
    <Icon size='78' color='#4D4D4D' className='size-[57px] md:size-auto' />
    <p className='md:max-w-auto max-w-[182px] text-center text-sm text-[#B3B3B3] md:text-xl'>
      {children}
    </p>
  </div>
);

// Define the EmptyButton component
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ElementType;
  children: React.ReactNode;
}

const EmptyButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ icon: Icon, children, ...props }, ref) => (
    <Button
      variant='primary'
      className='h-auto gap-[5px] rounded-full px-4 py-2 text-xs font-bold md:px-[18px] md:py-[10px]'
      ref={ref}
      {...props}
    >
      {Icon && <Icon size='15' />}
      {children}
    </Button>
  )
);

const EmptyStates = Object.assign(EmptyStatesWrapper, {
  Icon: EmptyIcon,
  Button: EmptyButton,
});

export { EmptyStates };
