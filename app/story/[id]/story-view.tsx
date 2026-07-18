'use client';

import ModeSelector from '@/components/mode-selector';
import QuotaIndicator from '@/components/quota-indicator';
import StoryReader from '@/components/story-reader';
import Modal from '@/components/ui/modal';
import VoiceSelector, { type SelectedVoice } from '@/components/voice-selector';
import { useStoryQuota } from '@/lib/hooks/use-story-quota';
import {
  addFavoriteService,
  getPreferredVoiceService,
  getStoryByIdService,
  isUserLoggedIn,
  listFavoritesService,
  removeFavoriteService,
} from '@/lib/services';
import { useEffect, useState } from 'react';

interface StoryDetail {
  id: string;
  title?: string;
  description?: string;
  coverImageUrl?: string;
  isInteractive?: boolean;
  questions?: unknown[];
  [key: string]: unknown;
}

export default function StoryView({ storyId }: { storyId: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [expand, setExpand] = useState(false);
  const [step, setStep] = useState(1);
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [isGuest, setIsGuest] = useState(false);
  const [showInteractive, setShowInteractive] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<SelectedVoice | null>(
    null
  );
  const [storyDetail, setStoryDetail] = useState<StoryDetail | null>(null);

  // Guests / free users: surface remaining quota and block opening a new story
  // once it's exhausted (the backend 403s anyway, but gating here means they
  // aren't sent into a reader that immediately walls them).
  const { quota } = useStoryQuota();
  const outOfQuota = !!quota && !quota.unlimited && quota.remaining <= 0;

  // Favorites (auth-only). Reflect current saved state and allow toggling.
  const [canFavorite, setCanFavorite] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    if (!isUserLoggedIn()) {
      return;
    }
    setCanFavorite(true);
    let active = true;
    listFavoritesService().then((list) => {
      if (active) {
        setIsFavorite(list.some((f) => f.storyId === storyId));
      }
    });
    return () => {
      active = false;
    };
  }, [storyId]);

  const toggleFavorite = async () => {
    setFavoriteBusy(true);
    try {
      if (isFavorite) {
        await removeFavoriteService(storyId);
        setIsFavorite(false);
      } else {
        await addFavoriteService(storyId);
        setIsFavorite(true);
      }
    } catch (err) {
      console.error('Failed to update favorite:', err);
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleStart = async () => {
    setPreparing(true);
    setStartError(null);
    const guest = !isUserLoggedIn();
    setIsGuest(guest);
    setSelectedMode(null);

    try {
      if (guest) {
        // Guests can browse + preview voices (but not switch), mirroring
        // mobile — so show the voice step first. They read via the guest
        // endpoint (default voice); interactive mode needs questions the guest
        // endpoint omits, so it's hidden.
        setShowInteractive(false);
        setSelectedVoice(null);
        setStoryDetail(null);
        setStep(1);
        setModalOpen(true);
        return;
      }

      const [detail, preferred] = await Promise.all([
        getStoryByIdService(storyId),
        getPreferredVoiceService(),
      ]);
      setStoryDetail(detail);

      const hasQuestions =
        Array.isArray(detail?.questions) && detail.questions.length > 0;
      setShowInteractive(!!detail?.isInteractive && hasQuestions);

      if (preferred?.id) {
        setSelectedVoice({
          id: preferred.id,
          name: preferred.name,
        });
        setStep(2);
      } else {
        setSelectedVoice(null);
        setStep(1);
      }
      setModalOpen(true);
    } catch (err) {
      console.error('Failed to prepare story:', err);
      setStartError('We couldn’t open this story. Please try again.');
    } finally {
      setPreparing(false);
    }
  };

  const voiceName = selectedVoice?.name ?? 'Storyteller';
  const voiceId = isGuest ? null : (selectedVoice?.id ?? null);

  const modalTitle =
    step === 1
      ? 'Select preferred AI voice'
      : step === 2
        ? 'Choose story mode'
        : 'Read story';

  return (
    <div className='flex flex-col items-center gap-3'>
      {outOfQuota ? (
        <QuotaIndicator variant='banner' className='w-full max-w-md' />
      ) : (
        <>
          <button
            type='button'
            onClick={handleStart}
            disabled={preparing}
            className='rounded-2xl bg-[#EC4007] px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-60'
          >
            {preparing ? 'Opening…' : 'Read this story'}
          </button>
          <QuotaIndicator variant='compact' />
        </>
      )}
      {canFavorite && (
        <button
          type='button'
          onClick={toggleFavorite}
          disabled={favoriteBusy}
          className='flex items-center gap-2 rounded-2xl border border-stone-200 px-5 py-2.5 text-sm font-semibold text-[#4A413F] transition hover:bg-[#FFF8ED] disabled:opacity-60'
        >
          <span>{isFavorite ? '❤️' : '🤍'}</span>
          {isFavorite ? 'Saved to favorites' : 'Save to favorites'}
        </button>
      )}
      {startError && <p className='text-sm text-red-600'>{startError}</p>}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        expandable={true}
        setExpand={setExpand}
        expand={expand}
      >
        {step === 1 && (
          <VoiceSelector
            setStep={setStep}
            expand={expand}
            isGuest={isGuest}
            onVoiceSelected={(voice) => setSelectedVoice(voice)}
          />
        )}
        {step === 2 && (
          <ModeSelector
            setStep={setStep}
            expand={expand}
            onModeSelect={(mode) => setSelectedMode(mode)}
            showInteractive={showInteractive}
          />
        )}
        {step === 3 && (
          <StoryReader
            img={storyDetail?.coverImageUrl ?? ''}
            title={storyDetail?.title ?? ''}
            description={storyDetail?.description ?? ''}
            voice={voiceName}
            voiceId={voiceId}
            isGuest={isGuest}
            setStep={setStep}
            mode={selectedMode}
            storyId={storyId}
          />
        )}
      </Modal>
    </div>
  );
}
