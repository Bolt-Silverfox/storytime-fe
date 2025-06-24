'use client';

import Header from '@/components/header';
import arrow from '@/public/arrow-left.svg';
import Image from 'next/image';
import kid from '@/public/kid-1.png';
import search from '@/public/search.svg';
import RecommendedCard from '@/components/recommended-card';
import StoryCard from '@/components/story-card';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Modal from '@/components/ui/modal';
import VoiceSelector from '@/components/voice-selector';
import ModeSelector from '@/components/mode-selector';
import StoryReader from '@/components/story-reader';
import story2 from '@/public/story-2.png';

interface ThemePageClientProps {
  story: any;
  recommended: any[];
  storyCategory: any[];
}

const ThemePageClient = ({
  story,
  recommended,
  storyCategory,
}: ThemePageClientProps) => {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1);
  const [expand, setExpand] = useState(false);
  return (
    <div>
      <div
        style={{
          backgroundImage: `linear-gradient(to bottom, #00000040, #00000040), url(${story?.img.src})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
        className='bg-[#00000080] relative rounded-t-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-10 pt-[2.125rem] pb-[3.75rem] max-w-[85vw] mx-auto mt-12'
      >
        <Header white={true} />
        <div className='flex justify-between'>
          <div className='flex items-center gap-4 mt-10'>
            <Image src={arrow} alt='arrow' onClick={() => router.back()} />
            <Image
              src={story?.img || ''}
              alt={story?.title || ''}
              width={50}
              height={70}
              className='rounded-full object-cover border-[0.5px] border-solid border-[#FAF4F2]'
            />
            <h1 className='text-2xl font-bold text-white'>
              {story?.title} stories
            </h1>
          </div>
          <div className='flex items-center gap-2'>
            <Image src={kid} alt='kid' />
            <p className='text-white text-base not-italic font-normal leading-5 font-abeezee'>
              Simon Okoronkwo
            </p>
          </div>
        </div>
      </div>
      <div className='bg-white rounded-b-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto font-qilka'>
        <div className='flex items-center gap-2 border-[0.5px] border-solid border-[#4A413F] rounded-[5.125rem] px-4 py-2 w-[20.625rem]'>
          <Image src={search} alt='search' />
          <input
            type='text'
            placeholder='Search story'
            className='bg-transparent outline-none text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee'
          />
        </div>
        <div className='mt-10'>
          <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
            BEDTIME STORIES TOP PICKS FOR SIMON
          </h2>
          <div className='grid grid-cols-2 gap-12'>
            {recommended.map((item) => (
              <RecommendedCard key={item.id} {...item} setModal={setModal} />
            ))}
          </div>
        </div>
        <div className='mt-20'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-4'>
            {storyCategory.map((category) => (
              <StoryCard
                key={category.id}
                img={category.img}
                title={category.title}
                desc={category.description}
                author='John Doe'
                dynamic={true}
                setModal={setModal}
              />
            ))}
          </div>
        </div>
      </div>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={step === 1 ? 'Select preferred AI voice' : 'Choose story mode'}
        expandable={true}
        setExpand={setExpand}
        expand={expand}
      >
        {step === 1 && <VoiceSelector setStep={setStep} expand={expand} />}
        {step === 2 && <ModeSelector setStep={setStep} expand={expand} />}
        {step === 3 && (
          <StoryReader
            description='A boy and a dog are best friends. They go on an adventure together and have a lot of fun. The boy is a superhero and the dog is a superhero too.'
            title='A boy and a dog'
            voice='Nimbus'
            img={story2.src}
            setStep={setStep}
            expand={expand}
          />
        )}
      </Modal>
    </div>
  );
};

export default ThemePageClient;
