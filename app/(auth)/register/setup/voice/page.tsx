'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageLoader } from '@/components/page-loader';
import { Button } from '@/components/ui/button';
import {
  getAvailableVoicesService,
  setPreferredVoiceService,
  type Voice,
} from '@/lib/services';

const VoiceSetupPage = () => {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await getAvailableVoicesService();
        setVoices(list);
        setSelectedId(list[0]?.id ?? null);
      } catch {
        toast.error('Could not load voices. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handlePreview = (voice: Voice) => {
    if (!voice.previewUrl) {
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.previewUrl);
    audioRef.current = audio;
    audio.play().catch(() => {
      toast.error('Could not play the preview.');
    });
  };

  const handleContinue = async () => {
    if (!selectedId) {
      return;
    }
    setSaving(true);
    try {
      await setPreferredVoiceService(selectedId);
    } catch (err) {
      // A free user who has already locked a voice gets a 403 — that's fine,
      // they keep their existing voice; anything else is a real failure.
      const status = (err as { status?: number | null })?.status;
      if (status !== 403) {
        toast.error('Could not save your voice. Please try again.');
        setSaving(false);
        return;
      }
    }
    router.push('/register/setup/success');
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className='max-w-[440px] mx-auto space-y-8'>
      <div className='space-y-1.5 text-center'>
        <p className='text-strong text-[28px] font-bold font-qilka'>
          Choose your story voice
        </p>
        <p className='text-body font-abeezee text-sm'>
          Pick the voice that reads stories to your kids. You can change it any
          time in Settings.
        </p>
      </div>

      <fieldset className='grid grid-cols-1 gap-3'>
        <legend className='sr-only'>Story voice</legend>
        {voices.map((voice) => {
          const active = selectedId === voice.id;
          const label = voice.displayName || voice.name;
          return (
            <div key={voice.id} className='flex items-center gap-2'>
              <button
                type='button'
                aria-pressed={active}
                onClick={() => setSelectedId(voice.id)}
                className={`flex flex-1 items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active
                    ? 'border-brand ring-2 ring-brand/40'
                    : 'border-field-warm'
                }`}
              >
                {voice.voiceAvatar ? (
                  <Image
                    src={voice.voiceAvatar}
                    alt=''
                    width={44}
                    height={44}
                    className='rounded-full'
                  />
                ) : (
                  <span
                    aria-hidden='true'
                    className='h-11 w-11 shrink-0 rounded-full bg-tint'
                  />
                )}
                <span className='flex-1 font-abeezee text-strong'>{label}</span>
                <span
                  aria-hidden='true'
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                    active ? 'border-brand bg-brand' : 'border-field-light'
                  }`}
                />
              </button>
              {voice.previewUrl && (
                <button
                  type='button'
                  aria-label={`Preview ${label}`}
                  onClick={() => handlePreview(voice)}
                  className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-warm text-brand-text transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
                >
                  <svg
                    width='16'
                    height='16'
                    viewBox='0 0 16 16'
                    fill='none'
                    xmlns='http://www.w3.org/2000/svg'
                    aria-hidden='true'
                  >
                    <title>Preview</title>
                    <path d='M4 2.5v11l9-5.5-9-5.5Z' fill='currentColor' />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </fieldset>

      <Button
        type='button'
        onClick={handleContinue}
        disabled={!selectedId || saving}
        className='w-full py-[15px] h-auto rounded-full'
      >
        {saving ? 'Saving…' : 'Continue'}
      </Button>

      {voices.length === 0 && (
        <button
          type='button'
          onClick={() => router.push('/register/setup/success')}
          className='block mx-auto text-sm font-abeezee text-body underline'
        >
          Skip for now
        </button>
      )}
    </div>
  );
};

export default VoiceSetupPage;
