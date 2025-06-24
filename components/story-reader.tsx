import movement from '@/public/movement.png';
import movementSmall from '@/public/movement-small.png';
import edit from '@/public/edit.svg';
import play from '@/public/play.svg';
import Image from 'next/image';
import { Switch } from './ui/switch';
import { useState } from 'react';

const StoryReader = ({
  img,
  title,
  description,
  voice,
  setStep,
  expand,
}: {
  img: string;
  title: string;
  description: string;
  voice: string;
  setStep: (step: number) => void;
  expand: boolean;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  return (
    <div>
      <div className='mb-16'>
        <img src={img} alt={title} />
        <h3 className='text-[#221D1D] text-[1.625rem] not-italic font-bold leading-[1.875rem] font-qilka mt-4 mb-0.5'>
          {title}
        </h3>
        <p className='text-[#4A413F] not-italic font-normal leading-4'>
          {description}
        </p>
      </div>
      <div className='flex flex-col items-center'>
        {!isChecked ? (
          <div className='flex flex-col items-center'>
            <Image
              src={movement}
              alt='movement'
              className='h-[9rem] rounded-[3xl] mb-4 object-cover'
            />
            <div className='bg-white flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2]'>
              <h5 className='text-[#221D1D] text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <Image
                src={edit}
                alt='edit'
                className='cursor-pointer'
                onClick={() => setStep(1)}
              />
            </div>
            <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
              {' '}
              00:00 / 04:10
            </small>
          </div>
        ) : (
          <div className='flex items-center gap-4 justify-between w-full'>
            <div className='flex items-center gap-4'>
              <Image src={movementSmall} alt='movement' className='' />
              <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
                {' '}
                00:00 / 04:10
              </small>
            </div>
            <div className='bg-white flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2] font-qilka'>
              <h5 className='text-[#221D1D] text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <Image
                src={edit}
                alt='edit'
                className='cursor-pointer'
                onClick={() => setStep(1)}
              />
            </div>
          </div>
        )}
        <div className='bg-[#E6FBFE] rounded-2xl border-[0.5px] border-solid border-[#83E9FB] px-6 py-4 flex justify-between items-center w-full my-12'>
          <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee'>
            Read story along with Nimbus
          </p>
          <Switch
            checked={isChecked}
            onCheckedChange={() => setIsChecked(!isChecked)}
            className='data-[state=checked]:bg-[#83E9FB] data-[state=unchecked]:bg-[#000] cursor-pointer'
          />
        </div>
        {isChecked && (
          <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee w-[75%] mx-auto'>
            The King and Ben rode to the city Where all the girls were nice and
            pretty. The streets were full of maidens fair; Potential queens were
            everywhere. Said Ben, “It shouldn’t take too long To find a queen
            among this throng”
          </p>
        )}
        <Image src={play} alt='play' className='cursor-pointer mt-12' />
      </div>
    </div>
  );
};

export default StoryReader;
