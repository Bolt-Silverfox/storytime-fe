import { Icons } from './ui/icons';

export const PageLoader = () => {
  return (
    <div className='h-screen w-screen bg-[#221D1DB3] gap-3 flex items-center justify-center absolute top-0 left-0 z-20 flex-col backdrop-blur-[5px]'>
      <Icons.spinner className='animate-spin' />
      <span className=' font-qilka font-bold text-white text-xl'>
        Loading...
      </span>
    </div>
  );
};
