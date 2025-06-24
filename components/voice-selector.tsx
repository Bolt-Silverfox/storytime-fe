'use client';

import { aiVoices } from '@/data/kids';
import VoiceCard from './voice-card';
import { useState } from 'react';

const VoiceSelector = ({
  setStep,
  expand,
}: {
  setStep: (step: number) => void;
  expand: boolean;
}) => {
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  return (
    <div className={`${expand ? 'h-[90%]' : ''}`}>
      <h3 className='text-[#221D1D] text-xl not-italic font-normal leading-5 font-qilka'>
        Select AI voice to read stories
      </h3>
      <p className='text-[#4A413F] text-xs not-italic font-normal leading-4'>
        Customize how you want this AI voice to sound
      </p>
      <div
        className={`grid gap-4 mb-8 mt-4 ${
          expand ? 'grid-cols-3' : 'grid-cols-2'
        }`}
      >
        {aiVoices.map((voice) => (
          <VoiceCard
            key={voice.name}
            name={voice.name}
            description={voice.description}
            active={selectedVoice === voice.name}
            onClick={() => setSelectedVoice(voice.name)}
            onListen={() => alert(`Playing sample for ${voice.name}`)}
          />
        ))}
      </div>
      <button
        className={`w-full py-4 cursor-pointer hover:scale-105 transition-all duration-300 rounded-[3.125rem] font-semibold ${
          selectedVoice
            ? 'bg-[#EC4007] text-white'
            : 'bg-[#FEEAE6] text-[#FB9583]'
        }`}
        disabled={!selectedVoice}
        onClick={() => setStep(2)}
      >
        Set-up AI voice
      </button>
    </div>
  );
};

export default VoiceSelector;
