'use client';

import RecommendedCard from '@/components/recommended-card';
import Modal from '@/components/ui/modal';
import ModeSelector from '@/components/mode-selector';
import VoiceSelector from '@/components/voice-selector';
import { recommended } from '@/data/kids';
import { useState } from 'react';
import StoryReader from '@/components/story-reader';
import story2 from '@/public/story-2.png';

const Recommended = () => {
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1);
  const [expand, setExpand] = useState(false);
  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        RECOMMENDED STORIES FOR SIMON
      </h2>
      <div className='grid grid-cols-2 gap-12'>
        {recommended.map((item) => (
          <RecommendedCard key={item.id} {...item} setModal={setModal} />
        ))}
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

export default Recommended;
