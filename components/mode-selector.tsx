import { useState } from 'react';
import ModeCard from './mode-card';

const ModeSelector = ({
  setStep,
  expand,
}: {
  setStep: (step: number) => void;
  expand: boolean;
}) => {
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  return (
    <div className='flex flex-col justify-between h-[90%]'>
      <div className=''>
        <h3 className='text-[#221D1D] text-xl not-italic font-normal leading-5 font-qilka'>
          Choose story mode
        </h3>
        <p className='text-[#4A413F] text-xs not-italic font-normal leading-4'>
          Select the type of story you want to read
        </p>
        <div className={`grid grid-cols-2 gap-4 mb-8 mt-4`}>
          <ModeCard
            title='Plain story mode'
            description='Just sit back and listen! The story is told from start to finish no interruptions, just imagination and fun.'
            active={selectedMode === 'plain'}
            onClick={() => setSelectedMode('plain')}
          />
          <ModeCard
            title='Interactive story mode'
            description={`Get ready to join the adventure! You'll be asked questions, make choices, and help shape how the story goes.`}
            active={selectedMode === 'interactive'}
            onClick={() => setSelectedMode('interactive')}
          />
        </div>
      </div>
      <button
        className={`w-full justify-self-end py-4 cursor-pointer hover:scale-105 transition-all duration-300 rounded-[3.125rem] font-semibold ${
          selectedMode
            ? 'bg-[#EC4007] text-white'
            : 'bg-[#FEEAE6] text-[#FB9583]'
        }`}
        disabled={!selectedMode}
        onClick={() => setStep(3)}
      >
        Set-up story mode
      </button>
    </div>
  );
};

export default ModeSelector;
