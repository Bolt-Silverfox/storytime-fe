'use client';

import BackButton from '@/components/back-button';
import Header from '@/components/header';
import { Button } from '@/components/ui/button';
import VoiceCard from '@/components/voice-card';
import {
  type Voice,
  getAvailableVoicesService,
  getPreferredVoiceService,
  getVoiceAccessService,
  isUserLoggedIn,
  setPreferredVoiceService,
} from '@/lib/services';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const AiVoicePage = () => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);
  const [saving, setSaving] = useState(false);
  // Only premium (paid) users may change the reading voice. Free logged-in
  // users can preview but not save (mirrors the backend /voice/access gate).
  const [isPremium, setIsPremium] = useState(false);
  // The voice that currently reads this user's stories — shown as "Current" so
  // free users (who can't switch) still know which voice is active.
  const [currentVoiceId, setCurrentVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canSwitchVoice = isPremium;

  useEffect(() => {
    if (!isUserLoggedIn()) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [available, preferred, access] = await Promise.all([
          getAvailableVoicesService(),
          getPreferredVoiceService(),
          getVoiceAccessService(),
        ]);
        if (!active) {
          return;
        }
        setVoices(Array.isArray(available) ? available : []);
        setIsPremium(access.isPremium);
        setCurrentVoiceId(
          preferred?.id ?? access.lockedVoiceId ?? access.defaultVoice ?? null
        );
        if (preferred?.id) {
          setSelectedId(preferred.id);
        }
      } catch (error) {
        console.error('Failed to load voices:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  // Tear down the shared audio instance on unmount.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleListen = (voice: Voice) => {
    if (!voice.previewUrl) {
      toast('No preview available for this voice');
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const audio = audioRef.current ?? new Audio();
    audio.src = voice.previewUrl;
    audioRef.current = audio;
    audio.play().catch((error) => {
      console.error('Failed to play voice preview:', error);
    });
  };

  const handleSave = async () => {
    // Free users can't change the reading voice — the Save action is hidden for
    // them, but guard here too so we never call setPreferredVoiceService.
    if (!canSwitchVoice) {
      return;
    }
    if (!selectedId) {
      toast('Select a voice first');
      return;
    }
    setSaving(true);
    try {
      await setPreferredVoiceService(selectedId);
      toast.success('Voice updated');
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 403) {
        toast('Changing voices is a premium feature');
      } else {
        toast.error(
          (error as { message?: string })?.message || 'Could not update voice'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const currentVoice = voices.find((v) => v.id === currentVoiceId);
  const currentVoiceName = currentVoice
    ? currentVoice.displayName || currentVoice.name
    : null;

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-4 sm:px-6 md:px-10 py-6 md:py-[2.125rem] w-full max-w-6xl mx-auto my-6 md:my-12'>
      <Header white={false} />

      <section className='mt-12'>
        <div className='mb-4 flex items-center gap-3'>
          <BackButton />
          <span className='font-abeezee text-sm text-[#4A413F]'>Back</span>
        </div>
        <h2 className='mb-1 text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka'>
          AI voice
        </h2>
        <p className='mb-6 text-[#4A413F] text-sm not-italic font-normal leading-5 font-abeezee'>
          Choose the voice that reads stories aloud.
        </p>

        {!loggedIn ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              Log in to choose a narration voice.
            </p>
            <Link
              href='/login'
              className='mt-4 inline-block rounded-2xl bg-[#EC4007] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
            >
              Log in
            </Link>
          </div>
        ) : loading ? (
          <div className='grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4'>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className='h-[12rem] animate-pulse rounded-3xl bg-stone-100'
              />
            ))}
          </div>
        ) : voices.length === 0 ? (
          <div className='rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-10 text-center'>
            <p className='text-[#4A413F] font-abeezee'>
              No voices are available right now.
            </p>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4'>
              {voices.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  name={voice.displayName || voice.name}
                  description={voice.type ? `${voice.type} voice` : 'AI voice'}
                  avatar={voice.voiceAvatar ?? ''}
                  selectable={canSwitchVoice}
                  active={selectedId === voice.id}
                  current={!canSwitchVoice && voice.id === currentVoiceId}
                  onClick={() => setSelectedId(voice.id)}
                  onListen={() => handleListen(voice)}
                />
              ))}
            </div>
            {canSwitchVoice ? (
              <div className='mt-8 flex justify-end'>
                <Button
                  type='button'
                  variant='primary'
                  className='px-12'
                  disabled={saving || !selectedId}
                  onClick={handleSave}
                >
                  {saving ? 'Saving…' : 'Save voice'}
                </Button>
              </div>
            ) : (
              <div className='mt-8 rounded-3xl border border-stone-100 bg-[#FFF8ED] px-6 py-6 text-center'>
                <p className='text-[#4A413F] font-abeezee'>
                  {currentVoiceName ? (
                    <>
                      <span className='font-semibold'>{currentVoiceName}</span>{' '}
                      reads your stories.{' '}
                    </>
                  ) : (
                    <>
                      Preview any voice with{' '}
                      <span className='font-semibold'>Listen</span>.{' '}
                    </>
                  )}
                  Upgrade to premium to change the reading voice.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default AiVoicePage;
