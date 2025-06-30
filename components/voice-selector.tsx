'use client';

import {
  getAvailableVoicesService,
  setKidPreferredVoiceService,
} from '@/lib/services';
import VoiceCard from './voice-card';
import { useState, useEffect } from 'react';

interface VoiceSelectorProps {
  setStep: (step: number) => void;
  expand: boolean;
}

const VoiceSelector = ({ setStep, expand }: VoiceSelectorProps) => {
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingVoice, setSettingVoice] = useState(false);

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const voicesData = await getAvailableVoicesService();
        const mappedVoices = voicesData.map((voice) => ({
          name: voice.name,
          description:
            voice.labels.description ||
            `${voice.labels.age} ${voice.labels.gender} voice`,
          voice_id: voice.voice_id,
          preview_url: voice.preview_url,
          labels: voice.labels,
        }));
        setVoices(mappedVoices);
      } catch (error) {
        console.error('Failed to fetch voices:', error);
        setVoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVoices();
  }, []);

  const handleListen = (voice: any, e?: React.MouseEvent) => {
    // Stop propagation to prevent card selection when clicking listen
    if (e) {
      e.stopPropagation();
    }

    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
        alert(`Could not play sample for ${voice.name}`);
      });
    } else {
      alert(`No preview available for ${voice.name}`);
    }
  };

  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoice(voiceId);
  };

  const handleSetVoice = async () => {
    if (!selectedVoice) return;

    // Get the selected kid from localStorage
    const selectedKidData = localStorage.getItem('selectedKid');
    if (!selectedKidData) {
      alert('No kid selected. Please select a kid first.');
      return;
    }

    const selectedKid = JSON.parse(selectedKidData);
    const kidId = selectedKid.id;

    setSettingVoice(true);
    try {
      await setKidPreferredVoiceService(kidId, selectedVoice);
      // Voice set successfully, proceed to next step
      setStep(2);
    } catch (error) {
      console.error('Failed to set kid preferred voice:', error);
      alert('Failed to set preferred voice. Please try again.');
    } finally {
      setSettingVoice(false);
    }
  };

  if (loading) {
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
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className='animate-pulse'>
              <div className='border-stone-100 bg-gray-200 px-4 py-3 rounded-3xl border-[0.5px] border-solid h-24'></div>
            </div>
          ))}
        </div>
        <button
          className='w-full py-4 cursor-not-allowed bg-[#FEEAE6] text-[#FB9583] rounded-[3.125rem] font-semibold'
          disabled
        >
          Set-up AI voice
        </button>
      </div>
    );
  }

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
        {voices.map((voice) => (
          <VoiceCard
            key={voice.voice_id}
            name={voice.name}
            description={voice.description}
            active={selectedVoice === voice.name}
            onClick={() => handleVoiceSelect('Milo')}
            onListen={(e) => handleListen(voice, e)}
          />
        ))}
      </div>
      <button
        className={`w-full py-4 cursor-pointer hover:scale-105 transition-all duration-300 rounded-[3.125rem] font-semibold ${
          selectedVoice
            ? 'bg-[#EC4007] text-white'
            : 'bg-[#FEEAE6] text-[#FB9583]'
        }`}
        disabled={!selectedVoice || settingVoice}
        onClick={handleSetVoice}
      >
        {settingVoice ? 'Setting up...' : 'Set-up AI voice'}
      </button>
    </div>
  );
};

export default VoiceSelector;
