import { ensureGuestSession } from '@/lib/guest';
import { STORY_QUOTA_QUERY_KEY } from '@/lib/hooks/use-story-quota';
import { markDone, markReading } from '@/lib/progress-store';
import {
  type StoryAudioBatch,
  type StoryAudioParagraph,
  getGuestStoryService,
  getStoryAudioBatchStatusService,
  getStoryByIdService,
  recordUserProgressService,
  startStoryAudioBatchService,
} from '@/lib/services';
import edit from '@/public/edit.svg';
import movementSmall from '@/public/movement-small.png';
import movement from '@/public/movement.png';
import pause from '@/public/pause.svg';
import play from '@/public/play.svg';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Switch } from './ui/switch';

// Turn the story text into readable paragraphs for read-along. Prefer explicit
// newline breaks; when the backend sends one continuous block (common), group
// sentences into small paragraphs so it isn't a wall of text.
const splitIntoParagraphs = (text: string): string[] => {
  const byNewline = text
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byNewline.length > 1) {
    return byNewline;
  }
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*/g) ?? [text];
  const perParagraph = 3;
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += perParagraph) {
    const group = sentences
      .slice(i, i + perParagraph)
      .join(' ')
      .trim();
    if (group) {
      groups.push(group);
    }
  }
  return groups.length > 0 ? groups : [text];
};

interface Question {
  id: string;
  storyId: string;
  question: string;
  options: string[];
  // 0-based index into `options`; the backend field is `correctOption`.
  correctOption: number;
}

interface Story {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string;
  textContent?: string;
  isInteractive?: boolean;
  questions?: Question[];
  [key: string]: unknown;
}

const StoryReader = ({
  img,
  title,
  description,
  voice,
  setStep,
  mode,
  storyId,
  voiceId,
  isGuest = false,
}: {
  img: string;
  title: string;
  description: string;
  voice: string;
  setStep: (step: number) => void;
  mode?: string | null;
  storyId?: string | null;
  // The selected global preferred voice id, forwarded to batch TTS. Null/omitted
  // falls back to the account default voice.
  voiceId?: string | null;
  // When true, read via the guest endpoint (quota-limited) instead of the
  // authenticated one.
  isGuest?: boolean;
  // Accepted for compatibility with blue's modal callers (create-story / theme
  // reader), which pass the modal's expanded state. The share-page reader lays
  // itself out full-width regardless, so it's currently unused.
  expand?: boolean;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaReached, setQuotaReached] = useState(false);
  const [guestAudioUrl, setGuestAudioUrl] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  // Interactive mode shows the story text first; the quiz only appears once the
  // story has been read through (audio finished) or the reader opts in.
  const [storyFinished, setStoryFinished] = useState(false);
  // Records completion to the user's library ("completed") — auth-only.
  const [completion, setCompletion] = useState<
    'idle' | 'saving' | 'done' | 'error'
  >('idle');

  // Audio states
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // True only while the initial batch request is in flight (before any clip is
  // playable). Once the first paragraph has audio, playback is enabled.
  const [audioLoading, setAudioLoading] = useState(false);
  // True while more paragraphs are still generating in the background (pending,
  // none failed). Drives a calm "Preparing audio…" indicator, never an error.
  const [audioGenerating, setAudioGenerating] = useState(false);
  // Set only on a real failure (batch FAILED with nothing playable, the initial
  // request threw, a needed paragraph failed, or playback itself failed) — this
  // is what gates the "Try again" retry affordance.
  const [audioError, setAudioError] = useState<string | null>(null);
  // Indices of paragraphs whose audio generation failed (per-paragraph retry).
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());
  // Bumped by the "Try again" button to re-run audio generation on failure.
  const [audioRetry, setAudioRetry] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Story audio is generated per-paragraph; we play the clips in sequence.
  const playlistRef = useRef<string[]>([]);
  const clipIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  // Total paragraphs expected + which failed, read inside the (once-mounted)
  // audio listeners to decide whether to wait for more audio or finish.
  const totalCountRef = useRef(0);
  const failedIndicesRef = useRef<Set<number>>(new Set());
  // True when auto-advance reached the end of the ready clips but more are still
  // generating — we hold here and resume once the next clip arrives.
  const waitingForNextRef = useRef(false);
  // Guards the one-time "enable playback off the first eager clip" assignment so
  // background polls don't reset the current playhead.
  const hasSetInitialAudioRef = useRef(false);
  // Per-paragraph text (aligned with the audio clips) + which one is playing,
  // to render a read-along highlight that tracks the narration.
  const [audioParagraphs, setAudioParagraphs] = useState<StoryAudioParagraph[]>(
    []
  );
  const [currentClip, setCurrentClip] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchStory = async () => {
      if (!storyId) {
        return;
      }

      setLoading(true);
      setError(null);
      setQuotaReached(false);
      setStoryFinished(false);
      setCompletion('idle');
      try {
        if (isGuest) {
          await ensureGuestSession();
          const guestStory = await getGuestStoryService(storyId);
          setStory(guestStory as unknown as Story);
          setGuestAudioUrl(guestStory.audioUrl ?? null);
        } else {
          const storyData = await getStoryByIdService(storyId);
          setStory(storyData);
        }
        // Story loaded successfully — mark it as being read. Opening a new
        // story may have consumed a quota slot, so refresh the quota indicator.
        markReading(storyId);
        queryClient.invalidateQueries({ queryKey: STORY_QUOTA_QUERY_KEY });
      } catch (err) {
        const status = (err as { status?: number | null })?.status;
        if (status === 403) {
          setQuotaReached(true);
        } else {
          console.error('Failed to fetch story:', err);
          setError('Failed to load story');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStory();
  }, [storyId, isGuest, queryClient]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: audioRetry is a deliberate trigger so the "Try again" button re-runs audio generation; it isn't read in the body.
  useEffect(() => {
    let cancelled = false;

    const fetchAudio = async () => {
      if (!storyId) {
        return;
      }

      // Guests get a single pre-generated narration clip from the guest story
      // endpoint; the authenticated batch TTS endpoint is not available to them.
      if (isGuest) {
        if (guestAudioUrl) {
          setAudioError(null);
          playlistRef.current = [guestAudioUrl];
          clipIndexRef.current = 0;
          setAudioUrl(guestAudioUrl);
        } else {
          setAudioError(
            'Audio is still being prepared. Please try again shortly.'
          );
        }
        return;
      }

      // Fresh start for this story / voice / retry.
      setAudioLoading(true);
      setAudioError(null);
      setAudioGenerating(false);
      setFailedIndices(new Set());
      setAudioParagraphs([]);
      setAudioUrl(null);
      setCurrentClip(0);
      setIsPlaying(false);
      playlistRef.current = [];
      clipIndexRef.current = 0;
      totalCountRef.current = 0;
      failedIndicesRef.current = new Set();
      waitingForNextRef.current = false;
      hasSetInitialAudioRef.current = false;

      // Accumulated across polls: paragraph text (only the POST carries it) and
      // ready audio URLs (the status endpoint reports these cumulatively).
      const textByIndex = new Map<number, string>();
      const readyByIndex = new Map<number, string>();

      // Fold a batch snapshot into playable state. Enables playback as soon as
      // the first paragraph is ready and, if auto-advance is waiting, resumes.
      const applyBatch = (batch: StoryAudioBatch) => {
        for (const p of batch.allParagraphs) {
          if (p.text) {
            textByIndex.set(p.index, p.text);
          }
        }
        for (const p of batch.completedParagraphs) {
          if (p.audioUrl) {
            readyByIndex.set(p.index, p.audioUrl);
          }
        }
        const failed = new Set<number>(batch.failedParagraphs);
        failedIndicesRef.current = failed;

        const accounted = readyByIndex.size + failed.size;
        const total = Math.max(
          totalCountRef.current,
          batch.completedParagraphs.length +
            batch.pendingParagraphs +
            failed.size,
          batch.totalQueued ?? 0,
          batch.allParagraphs.length,
          accounted
        );
        totalCountRef.current = total;

        // Only the contiguous run of ready clips from index 0 is playable in
        // order; a gap means we wait for that paragraph before playing past it.
        const playlist: string[] = [];
        for (let i = 0; readyByIndex.has(i); i += 1) {
          playlist.push(readyByIndex.get(i) as string);
        }
        playlistRef.current = playlist;

        // Full ordered paragraph list (text + audio state) for the read-along.
        const known = [
          ...Array.from(readyByIndex.keys()),
          ...Array.from(textByIndex.keys()),
        ];
        const maxIndex = Math.max(total - 1, ...known);
        const paras: StoryAudioParagraph[] = [];
        for (let i = 0; i <= maxIndex; i += 1) {
          paras.push({
            index: i,
            audioUrl: readyByIndex.get(i) ?? '',
            text: textByIndex.get(i),
          });
        }
        setAudioParagraphs(paras);
        setFailedIndices(failed);

        // Enable playback the moment the first clip is ready (bug 1).
        if (playlist.length > 0 && !hasSetInitialAudioRef.current) {
          hasSetInitialAudioRef.current = true;
          setAudioLoading(false);
          clipIndexRef.current = 0;
          setCurrentClip(0);
          setAudioUrl(playlist[0]);
        }

        // Auto-advance was waiting for the next clip and it just arrived.
        if (
          waitingForNextRef.current &&
          playlist.length > clipIndexRef.current + 1
        ) {
          waitingForNextRef.current = false;
          const next = clipIndexRef.current + 1;
          clipIndexRef.current = next;
          setCurrentClip(next);
          setAudioUrl(playlist[next]);
        }

        const stillGenerating = accounted < total;
        setAudioGenerating(stillGenerating);
        return { playlist, accounted, total, failedSize: failed.size };
      };

      try {
        const initial = await startStoryAudioBatchService(
          storyId,
          voiceId ?? undefined
        );
        if (cancelled) {
          return;
        }
        let snap = applyBatch(initial);

        // Keep polling in the background for the remaining paragraphs. Playback
        // is already possible off the eager clips while this runs.
        let attempts = 0;
        while (
          !cancelled &&
          initial.batchJobId &&
          snap.accounted < snap.total &&
          attempts < 60
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts += 1;
          const batch = await getStoryAudioBatchStatusService(
            initial.batchJobId
          );
          if (cancelled) {
            return;
          }
          snap = applyBatch(batch);
          if (batch.status === 'failed' || batch.status === 'completed') {
            break;
          }
        }
        if (cancelled) {
          return;
        }

        // Real failure ONLY when nothing at all is playable AND something failed.
        if (snap.playlist.length === 0 && snap.failedSize > 0) {
          setAudioError('We couldn’t prepare the audio for this story.');
          setAudioGenerating(false);
        } else if (snap.accounted >= snap.total) {
          // Everything accounted for (ready and/or failed) — stop the spinner.
          setAudioGenerating(false);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('Failed to fetch audio:', error);
        setAudioError('Failed to load audio');
      } finally {
        if (!cancelled) {
          setAudioLoading(false);
        }
      }
    };

    fetchAudio();
    return () => {
      cancelled = true;
    };
  }, [storyId, isGuest, voiceId, guestAudioUrl, audioRetry]);

  // Keep a ref of isPlaying so the audio-element listeners (mounted once) can
  // read the latest value without stale closures.
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: audioUrl is a deliberate trigger so listeners attach when the <audio> element (re)mounts on a new clip; the body reads the element via ref, not audioUrl directly.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    // At clip end, advance to the next paragraph; wait if it isn't ready yet;
    // stop (and reset) once the whole story has been read through.
    const handleEnded = () => {
      const next = clipIndexRef.current + 1;
      if (next < playlistRef.current.length) {
        clipIndexRef.current = next;
        setCurrentClip(next);
        setAudioUrl(playlistRef.current[next]);
        return;
      }
      // The next clip isn't in the playlist yet. If that paragraph is still
      // generating (not failed), hold and resume when polling delivers it —
      // don't error and don't mark the story finished (bug 3).
      if (next < totalCountRef.current && !failedIndicesRef.current.has(next)) {
        waitingForNextRef.current = true;
        setAudioGenerating(true);
        return;
      }
      // The next paragraph failed — surface a retry rather than a silent finish.
      if (failedIndicesRef.current.has(next)) {
        setIsPlaying(false);
        waitingForNextRef.current = false;
        setAudioError('Some of the audio couldn’t be prepared.');
        return;
      }
      // Reached the end of the narration — the story has been read through.
      setIsPlaying(false);
      setStoryFinished(true);
      clipIndexRef.current = 0;
      setCurrentClip(0);
      setAudioUrl(playlistRef.current[0] ?? null);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    // The element may already have metadata (e.g. when the src was set before
    // this effect re-ran on a new clip); sync immediately so the counter shows.
    if (!Number.isNaN(audio.duration)) {
      setDuration(audio.duration);
    }
    setCurrentTime(audio.currentTime);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
    // Re-run when the audio element (re)mounts on a new clip URL, so the
    // listeners attach to the element that actually exists. With [] the effect
    // ran once before any <audio> was rendered and never attached anything.
  }, [audioUrl]);

  // When the current clip changes (next paragraph), resume playback if we were
  // already playing.
  useEffect(() => {
    if (audioUrl && isPlayingRef.current && audioRef.current) {
      audioRef.current.play().catch(() => {
        setAudioError('Failed to play audio');
      });
    }
  }, [audioUrl]);

  // When the story is read through (or the reader taps Finish), record it as
  // completed in the user's library. Auth-only; guests can't track progress.
  useEffect(() => {
    if (!(storyFinished && storyId)) {
      return;
    }
    // Reflect completion on story cards immediately (works for guests too).
    markDone(storyId);
    if (isGuest) {
      return;
    }
    let active = true;
    setCompletion((c) => (c === 'idle' ? 'saving' : c));
    recordUserProgressService(storyId, 100, true)
      .then(() => {
        if (active) {
          setCompletion('done');
        }
      })
      .catch(() => {
        if (active) {
          setCompletion('error');
        }
      });
    return () => {
      active = false;
    };
  }, [storyFinished, isGuest, storyId]);

  // Keep the highlighted paragraph in view as the narration advances.
  useEffect(() => {
    const hasAudioParas = audioParagraphs.length > 0;
    if (!(hasAudioParas && isChecked) || typeof document === 'undefined') {
      return;
    }
    const el = document.getElementById(`reading-para-${currentClip}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentClip, audioParagraphs, isChecked]);

  const getModeDescription = () => {
    switch (mode) {
      case 'plain':
        return 'Plain story mode - Just sit back and listen!';
      case 'interactive':
        return 'Interactive story mode - Get ready to join the adventure!';
      default:
        return 'Story mode not selected';
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    setSelectedAnswer(answerIndex);
    setShowAnswer(true);
  };

  const handleNextQuestion = () => {
    if (story?.questions && currentQuestionIndex < story.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
    }
  };

  const handlePlayPause = () => {
    if (!(audioRef.current && audioUrl)) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((error) => {
        console.error('Failed to play audio:', error);
        setAudioError('Failed to play audio');
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

  // Use fetched story data if available, otherwise fall back to props
  const displayTitle = story?.title || title;
  const displayDescription = story?.description || description;
  const displayImage = story?.coverImageUrl || img;
  const displayContent = story?.textContent || 'Story content not available';
  // Break the story into readable paragraphs for read-along.
  const paragraphs = splitIntoParagraphs(displayContent);
  // The read-along highlight follows the audio clips. The batch endpoint only
  // returns paragraph text for the eager (first-generated) clips; later clips
  // arrive from the status poll with an audioUrl but no text, so requiring every
  // clip to carry text would keep the highlight off for the whole story while
  // paragraphs are still generating. The backend also splits paragraphs by a
  // different algorithm than splitIntoParagraphs, so per-index text can't be
  // guaranteed to match; drive the highlight off the audio-aligned list whenever
  // there's a playlist (i === currentClip), and fill any missing display text
  // from the story's own paragraph split by index so nothing renders blank.
  // Guests (no batch, single clip) leave audioParagraphs empty → plain fallback,
  // no highlight.
  const useAudioParagraphs = audioParagraphs.length > 0;
  const readingParagraphs = useAudioParagraphs
    ? audioParagraphs.map((p, i) => p.text || paragraphs[i] || '')
    : paragraphs;

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <output className='text-[#4A413F]'>Loading story...</output>
      </div>
    );
  }

  if (quotaReached) {
    return (
      <div className='flex flex-col items-center justify-center h-64 text-center px-4'>
        <h3 className='text-[#221D1D] text-2xl not-italic font-bold leading-7 font-qilka mb-2'>
          You've enjoyed your free stories!
        </h3>
        <p className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-6 max-w-md'>
          Sign up to keep reading unlimited stories with audio narration.
        </p>
        <Link
          href='/register'
          className='rounded-[3.125rem] bg-[#EC4007] px-8 py-4 text-base font-semibold text-white transition hover:opacity-90'
        >
          Sign up to read more
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-red-500'>{error}</div>
      </div>
    );
  }

  const currentQuestion = story?.questions?.[currentQuestionIndex];

  return (
    <div>
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload='metadata'
          onError={() => setAudioError('Failed to load audio')}
        >
          <track kind='captions' />
        </audio>
      )}

      <div className='mb-16'>
        {displayImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host
          <img
            src={displayImage}
            alt={displayTitle}
            className='w-full max-w-full rounded-2xl object-cover'
          />
        ) : null}
        <h3 className='text-[#221D1D] text-[1.625rem] not-italic font-bold leading-[1.875rem] font-qilka mt-4 mb-0.5'>
          {displayTitle}
        </h3>
        <p className='text-[#4A413F] not-italic font-normal leading-4'>
          {displayDescription}
        </p>
        {mode && (
          <div className='mt-4 p-3 bg-[#FAF4F2] rounded-lg'>
            <p className='text-[#4A413F] text-sm not-italic font-normal leading-4 font-abeezee'>
              <strong>Mode:</strong> {getModeDescription()}
            </p>
          </div>
        )}
      </div>
      <div className='flex flex-col items-center'>
        {!isChecked ? (
          <div className='flex flex-col items-center'>
            <Image
              src={movement}
              alt=''
              className='h-[9rem] max-w-full rounded-[3xl] mb-4 object-cover'
            />
            <div className='bg-white flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2]'>
              <h5 className='text-[#221D1D] text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <button
                type='button'
                aria-label='Change voice'
                onClick={() => setStep(1)}
                className='cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC4007] focus-visible:ring-offset-2'
              >
                <Image src={edit} alt='' />
              </button>
            </div>
            <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
              {audioLoading || audioGenerating
                ? 'Preparing audio…'
                : `${formatTime(currentTime)} / ${formatTime(duration)}`}
            </small>
          </div>
        ) : (
          <div className='flex flex-wrap items-center gap-4 justify-between w-full'>
            <div className='flex items-center gap-4'>
              <Image src={movementSmall} alt='' className='' />
              <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
                {audioLoading || audioGenerating
                  ? 'Preparing audio…'
                  : `${formatTime(currentTime)} / ${formatTime(duration)}`}
              </small>
            </div>
            <div className='bg-white flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2] font-qilka'>
              <h5 className='text-[#221D1D] text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <button
                type='button'
                aria-label='Change voice'
                onClick={() => setStep(1)}
                className='cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC4007] focus-visible:ring-offset-2'
              >
                <Image src={edit} alt='' />
              </button>
            </div>
          </div>
        )}
        <div className='bg-[#E6FBFE] rounded-2xl border-[0.5px] border-solid border-[#83E9FB] px-6 py-4 flex justify-between items-center w-full my-12'>
          <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee'>
            Read story along with {voice}
          </p>
          <Switch
            checked={isChecked}
            onCheckedChange={() => setIsChecked(!isChecked)}
            className='data-[state=checked]:bg-[#83E9FB] data-[state=unchecked]:bg-[#000] cursor-pointer'
          />
        </div>
        {(isChecked ||
          (mode === 'interactive' &&
            story?.questions &&
            story.questions.length > 0)) && (
          <div className='w-full sm:w-[75%] mx-auto'>
            {mode === 'interactive' &&
            story?.questions &&
            story.questions.length > 0 &&
            storyFinished ? (
              <div className='space-y-6'>
                <div className='text-center mb-6'>
                  <h4 className='text-[#221D1D] text-lg font-bold mb-2'>
                    Question {currentQuestionIndex + 1} of{' '}
                    {story.questions.length}
                  </h4>
                  <p className='text-[#4A413F] text-base font-abeezee'>
                    {currentQuestion?.question}
                  </p>
                </div>
                <div className='space-y-3'>
                  {currentQuestion?.options.map((option, index) => (
                    <button
                      type='button'
                      key={`option-${option}`}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={showAnswer}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                        selectedAnswer === index
                          ? showAnswer
                            ? index === currentQuestion.correctOption
                              ? 'border-green-500 bg-green-50'
                              : 'border-red-500 bg-red-50'
                            : 'border-[#83E9FB] bg-[#E6FBFE]'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${showAnswer ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className='text-[#221D1D] font-abeezee'>
                        {option}
                      </span>
                      {showAnswer && selectedAnswer === index && (
                        <span className='ml-2 text-sm font-bold'>
                          {index === currentQuestion.correctOption
                            ? '✓ Correct!'
                            : '✗ Wrong'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {showAnswer && (
                  <div className='text-center mt-6'>
                    <p className='text-[#4A413F] font-abeezee mb-4'>
                      {selectedAnswer === currentQuestion?.correctOption
                        ? 'Great job! You got it right!'
                        : `The correct answer is: ${
                            currentQuestion?.options[
                              currentQuestion.correctOption
                            ]
                          }`}
                    </p>
                    <div className='flex justify-center gap-4'>
                      {currentQuestionIndex > 0 && (
                        <button
                          type='button'
                          onClick={handlePreviousQuestion}
                          className='px-4 py-2 bg-[#83E9FB] text-[#221D1D] rounded-lg font-abeezee'
                        >
                          Previous
                        </button>
                      )}
                      {currentQuestionIndex <
                      (story.questions?.length || 0) - 1 ? (
                        <button
                          type='button'
                          onClick={handleNextQuestion}
                          className='px-4 py-2 bg-[#83E9FB] text-[#221D1D] rounded-lg font-abeezee'
                        >
                          Next Question
                        </button>
                      ) : (
                        <div className='text-[#4A413F] font-abeezee'>
                          🎉 You've completed all questions!
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className='space-y-4 text-left'>
                {isChecked &&
                  readingParagraphs.map((para, i) => {
                    const active = useAudioParagraphs && i === currentClip;
                    // Per-paragraph audio state (only meaningful when the clips are
                    // text-aligned): ready → playable, failed → retry, else loading.
                    const paraFailed =
                      useAudioParagraphs && failedIndices.has(i);
                    const paraReady =
                      !useAudioParagraphs || !!audioParagraphs[i]?.audioUrl;
                    return (
                      <div key={`para-${i}-${para.slice(0, 12)}`}>
                        <p
                          id={`reading-para-${i}`}
                          className={`text-lg not-italic font-normal leading-8 font-abeezee -mx-2 rounded-md px-2 transition-colors duration-300 ${
                            active
                              ? 'bg-[#FFEFB8] font-medium text-[#221D1D]'
                              : 'text-[#221D1D]'
                          }`}
                        >
                          {para}
                        </p>
                        {paraFailed ? (
                          <span className='mt-1 flex items-center gap-2 px-2 text-sm text-red-500 font-abeezee'>
                            Audio unavailable
                            <button
                              type='button'
                              onClick={() => {
                                setAudioError(null);
                                setAudioRetry((n) => n + 1);
                              }}
                              className='rounded-full border border-[#EC4007] px-3 py-1 text-xs font-semibold text-[#EC4007] transition hover:bg-[#EC4007]/5'
                            >
                              Retry
                            </button>
                          </span>
                        ) : null}
                        {!(paraReady || paraFailed) ? (
                          <span className='mt-1 flex items-center gap-2 px-2 text-sm text-[#4A413F] font-abeezee'>
                            <span className='inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#83E9FB] border-t-transparent' />
                            Preparing audio…
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                {mode === 'interactive' &&
                  story?.questions &&
                  story.questions.length > 0 && (
                    <div className='pt-4 text-center'>
                      <button
                        type='button'
                        onClick={() => setStoryFinished(true)}
                        className='rounded-full bg-[#EC4007] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
                      >
                        Finished reading — Take the quiz
                      </button>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
        <button
          type='button'
          onClick={handlePlayPause}
          disabled={!audioUrl || audioLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          className={`mt-12 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC4007] focus-visible:ring-offset-2 ${
            !audioUrl || audioLoading
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }`}
        >
          <Image src={isPlaying ? pause : play} alt='' />
        </button>
        {audioError && (
          <div className='mt-2 flex flex-col items-center gap-2' role='alert'>
            <p className='text-red-500 text-sm text-center'>{audioError}</p>
            <button
              type='button'
              onClick={() => {
                setAudioError(null);
                setAudioRetry((n) => n + 1);
              }}
              className='rounded-full border border-[#EC4007] px-5 py-2 font-abeezee text-sm font-semibold text-[#EC4007] transition hover:bg-[#EC4007]/5'
            >
              Try again
            </button>
          </div>
        )}
        {!isGuest && (
          <div className='mt-8 text-center'>
            {completion === 'done' ? (
              <p className='font-abeezee text-sm font-semibold text-green-600'>
                ✓ Added to your completed stories
              </p>
            ) : (
              <button
                type='button'
                onClick={() => setStoryFinished(true)}
                disabled={completion === 'saving'}
                className='rounded-full border border-[#EC4007] px-6 py-3 font-abeezee text-sm font-semibold text-[#EC4007] transition hover:bg-[#EC4007]/5 disabled:opacity-60'
              >
                {completion === 'saving' ? 'Saving…' : 'Finish story'}
              </button>
            )}
            {completion === 'error' && (
              <p className='mt-2 font-abeezee text-sm text-red-500'>
                Couldn&apos;t save progress. Please try again.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StoryReader;
