import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';

export const StepBackButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <Button
      variant='ghost'
      onClick={onClick}
      className='flex items-center gap-3 -mb-10 h-auto'
    >
      <Icons.back />
      <span className='font-abeezee'>Back</span>
    </Button>
  );
};
