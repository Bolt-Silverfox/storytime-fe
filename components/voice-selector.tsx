'use client';

import {
  getAvailableVoicesService,
  getPreferredVoiceService,
  getVoiceAccessService,
  setPreferredVoiceService,
} from '@/lib/services';
import { useEffect, useRef, useState } from 'react';
import VoiceCard from './voice-card';

export interface SelectedVoice {
  id: string;
  name: string;
}

interface VoiceSelectorProps {
  setStep: (step: number) => void;
  expand: boolean;
  // Reports the effective narration voice once chosen. `null` means the change
  // was locked (free tier / guest) and the default voice should be used.
  onVoiceSelected?: (voice: SelectedVoice | null) => void;
  // Guests can browse + preview voices but can't set a preferred voice
  // (/voice/preferred is auth-only). They continue with the default voice.
  isGuest?: boolean;
}

interface VoiceOption {
  name: string;
  description: string;
  id: string;
  previewUrl: string;
  avatar: string;
}

const VoiceSelector = ({
  setStep,
  expand,
  onVoiceSelected,
  isGuest = false,
}: VoiceSelectorProps) => {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingVoice, setSettingVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  // Only premium (paid) users may switch the reading voice. Guests are always
  // non-premium; free logged-in users can preview but not change (mirrors the
  // backend /voice/access gate and the mobile voice picker).
  const [isPremium, setIsPremium] = useState(false);
  // The voice that currently reads this user's stories. For locked (guest/free)
  // users this is the backend's lockedVoiceId/default so they can see which
  // voice is active even though they can't switch.
  const [currentVoiceId, setCurrentVoiceId] = useState<string | null>(null);
  const canSwitchVoice = isPremium;
  // A single shared preview player so tapping Listen on several voices doesn't
  // stack overlapping audio (mirrors the mobile single-player behaviour).
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        // /voice/available and /voice/access are guest-accessible (OptionalAuth);
        // /voice/preferred is auth-only, so guests skip only that one.
        const [voicesData, preferred, access] = await Promise.all([
          getAvailableVoicesService(),
          isGuest ? Promise.resolve(null) : getPreferredVoiceService(),
          getVoiceAccessService(),
        ]);
        const mappedVoices = voicesData.map((voice) => ({
          name: voice.displayName || voice.name,
          description: voice.type ? `${voice.type} voice` : 'AI voice',
          id: voice.id,
          previewUrl: voice.previewUrl ?? '',
          avatar: voice.voiceAvatar ?? '',
        }));
        setVoices(mappedVoices);
        setIsPremium(access.isPremium);
        // The voice that actually reads stories for a locked user — preferred
        // if they have one, otherwise the backend's locked/default voice.
        setCurrentVoiceId(
          preferred?.id ?? access.lockedVoiceId ?? access.defaultVoice ?? null
        );
        if (preferred?.id) {
          setSelectedVoiceId(preferred.id);
        }
      } catch (err) {
        console.error('Failed to fetch voices:', err);
        setVoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVoices();
  }, [isGuest]);

  // Stop any preview when the selector unmounts (e.g. modal closed).
  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  const handleListen = (voice: VoiceOption, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!voice.previewUrl) {
      return;
    }
    // Stop any preview already playing before starting the new one.
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    const audio = new Audio(voice.previewUrl);
    previewAudioRef.current = audio;
    audio.play().catch((playError) => {
      console.error('Error playing audio:', playError);
    });
  };

  const handleSetVoice = async () => {
    // Guests and free (non-premium) users can't change the reading voice —
    // continue with the default voice (guests read the endpoint's pre-generated
    // clip; free users keep their locked/default voice). Never call
    // setPreferredVoiceService in this case.
    if (!canSwitchVoice) {
      onVoiceSelected?.(null);
      setStep(2);
      return;
    }

    if (!selectedVoiceId) {
      return;
    }
    const selected = voices.find((v) => v.id === selectedVoiceId);
    if (!selected) {
      return;
    }

    setSettingVoice(true);
    setError(null);
    setLockedMessage(null);
    try {
      await setPreferredVoiceService(selected.id);
      onVoiceSelected?.({ id: selected.id, name: selected.name });
      setStep(2);
    } catch (err) {
      const status = (err as { status?: number | null })?.status;
      if (status === 403) {
        // Free tier can't change the voice — fall back to the default voice.
        setLockedMessage(
          'Changing voices is a premium feature. Using the default voice.'
        );
        onVoiceSelected?.(null);
        setStep(2);
      } else {
        setError('Failed to set preferred voice. Please try again.');
      }
    } finally {
      setSettingVoice(false);
    }
  };

  const currentVoiceName =
    voices.find((v) => v.id === currentVoiceId)?.name ?? null;

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
          className={`grid gap-3 sm:gap-4 mb-8 mt-4 ${
            expand ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2'
          }`}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className='animate-pulse'>
              <div className='border-stone-100 bg-gray-200 px-4 py-3 rounded-3xl border-[0.5px] border-solid h-24' />
            </div>
          ))}
        </div>
        <button
          type='button'
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
            key={voice.id}
            name={voice.name}
            description={voice.description}
            avatar={voice.avatar}
            selectable={canSwitchVoice}
            active={selectedVoiceId === voice.id}
            current={!canSwitchVoice && voice.id === currentVoiceId}
            onClick={() => setSelectedVoiceId(voice.id)}
            onListen={(e) => handleListen(voice, e)}
          />
        ))}
      </div>
      {!canSwitchVoice && (
        <p className='mb-4 text-sm text-[#4A413F] font-abeezee'>
          {currentVoiceName ? (
            <>
              <span className='font-semibold'>{currentVoiceName}</span> reads
              your stories.{' '}
            </>
          ) : (
            <>
              Preview any voice with{' '}
              <span className='font-semibold'>Listen</span>.{' '}
            </>
          )}
          {isGuest
            ? 'Sign up to change the reading voice.'
            : 'Upgrade to premium to change the reading voice.'}
        </p>
      )}
      {lockedMessage && (
        <p className='mb-4 text-sm text-[#EC4007] font-abeezee'>
          {lockedMessage}
        </p>
      )}
      {error && (
        <p className='mb-4 text-sm text-red-500 font-abeezee'>{error}</p>
      )}
      <button
        type='button'
        className={`w-full py-4 cursor-pointer hover:scale-105 transition-all duration-300 rounded-[3.125rem] font-semibold ${
          !canSwitchVoice || selectedVoiceId
            ? 'bg-[#EC4007] text-white'
            : 'bg-[#FEEAE6] text-[#FB9583]'
        }`}
        disabled={settingVoice || !(!canSwitchVoice || selectedVoiceId)}
        onClick={handleSetVoice}
      >
        {settingVoice
          ? 'Setting up...'
          : !canSwitchVoice
            ? 'Continue'
            : 'Set-up AI voice'}
      </button>
    </div>
  );
};

export default VoiceSelector;
