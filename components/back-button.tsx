'use client';

import { useRouter } from 'next/navigation';

// A small back-arrow control. Goes to the previous page in history when there
// is one, otherwise falls back to the stories home.
const BackButton = ({ className }: { className?: string }) => {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/stories');
    }
  };

  return (
    <button
      type='button'
      onClick={handleBack}
      aria-label='Go back'
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-[#221D1D] transition hover:bg-[#FFF8ED] ${
        className ?? ''
      }`}
    >
      <svg
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
      >
        <path d='M19 12H5' />
        <path d='M12 19l-7-7 7-7' />
      </svg>
    </button>
  );
};

export default BackButton;
