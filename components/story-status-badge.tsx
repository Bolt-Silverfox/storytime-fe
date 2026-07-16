'use client';

import { useStoryStatus } from '@/lib/progress-store';

const StoryStatusBadge = ({
  storyId,
  className,
}: {
  storyId: string;
  className?: string;
}) => {
  const status = useStoryStatus(storyId);

  if (!status) {
    return null;
  }

  const isDone = status === 'done';
  const label = isDone ? 'Done' : 'Reading';
  const colors = isDone
    ? 'bg-green-100 text-green-700'
    : 'bg-[#FFEFB8] text-[#8A5A00]';

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
