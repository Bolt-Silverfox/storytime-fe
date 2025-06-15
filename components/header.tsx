import { Logo } from './logo';
import heart from '@/public/heart.svg';
import avatar from '@/public/avatar.svg';
import arrow_down from '@/public/arrow-down.svg';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const Header = () => {
  return (
    <header>
      <div className='flex items-center justify-between'>
        <Logo />
        <h1 className='text-[#4A413F] text-center text-xl not-italic font-bold leading-6 font-qilka'>
          Good day! Felicia
        </h1>
        <div className='flex items-center'>
          <Image src={heart} alt='heart' />
          <div className='border-stone-100 bg-white shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] p-1.5 rounded-[2.25rem] border-[0.5px] border-solid flex items-center justify-between w-[11rem]'>
            <div className='flex items-center gap-2'>
              <Image src={avatar} alt='avatar' />
              <h3
                className={cn(
                  'text-[#4A413F] text-center text-sm not-italic font-medium leading-6 font-abeezee'
                )}
              >
                Felicia
              </h3>
            </div>
            <Image src={arrow_down} alt='arrow-down' />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
