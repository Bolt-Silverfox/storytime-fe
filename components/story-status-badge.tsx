'use client';

import { useGuestHistory } from '@/lib/hooks/use-guest-history';
import { useStoryStatus } from '@/lib/progress-store';

const StoryStatusBadge = ({
  storyId,
  className,
}: {
  storyId: string;
  className?: string;
}) => {
  const status = useStoryStatus(storyId);
  const guestRead = useGuestHistory().some((s) => s.storyId === storyId);

  if (!(status || guestRead)) {
    return null;
  }

  const isDone = status === 'done';
  let label = 'Read';
  if (status) {
    label = isDone ? 'Done' : 'Reading';
  }
  const colors = isDone
    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-[#FFEFB8] text-[#8A5A00] dark:bg-reader-hl dark:text-[#E8C26A]';

  return (
    <span
      className={`pointer-events-none inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold font-abeezee ${colors} ${
        className ?? ''
      }`}
    >
      {label}
    </span>
  );
};

export default StoryStatusBadge;
