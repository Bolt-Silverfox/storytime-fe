import { ensureGuestSession } from '@/lib/guest';
import {
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
import play from '@/public/play.svg';
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
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Story audio is generated per-paragraph; we play the clips in sequence.
  const playlistRef = useRef<string[]>([]);
  const clipIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  // Per-paragraph text (aligned with the audio clips) + which one is playing,
  // to render a read-along highlight that tracks the narration.
  const [audioParagraphs, setAudioParagraphs] = useState<StoryAudioParagraph[]>(
    []
  );
  const [currentClip, setCurrentClip] = useState(0);

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
  }, [storyId, isGuest]);

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

      setAudioLoading(true);
      setAudioError(null);
      try {
        let batch = await startStoryAudioBatchService(
          storyId,
          voiceId ?? undefined
        );
        // Only the POST response carries paragraph `text` (the status endpoint
        // drops it). Capture it now so the read-along highlight has text even
        // when the audio is generated asynchronously.
        const textByIndex = new Map<number, string>();
        for (const p of batch.allParagraphs) {
          if (p.text) {
            textByIndex.set(p.index, p.text);
          }
        }
        // Poll until background generation finishes (or we hit the cap).
        let attempts = 0;
        while (
          !cancelled &&
          batch.batchJobId &&
          batch.status !== 'completed' &&
          batch.status !== 'failed' &&
          attempts < 30
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts += 1;
          batch = await getStoryAudioBatchStatusService(batch.batchJobId);
        }
        if (cancelled) {
          return;
        }

        const sortedParas = [...batch.completedParagraphs].sort(
          (a, b) => a.index - b.index
        );
        const playlist = sortedParas.map((p) => p.audioUrl);
        if (playlist.length === 0) {
          setAudioError(
            'Audio is still being prepared. Please try again shortly.'
          );
          return;
        }
        // Merge the captured text onto the audio-ready paragraphs so each clip
        // has its text for the highlight.
        const merged = sortedParas.map((p) => ({
          index: p.index,
          audioUrl: p.audioUrl,
          text: p.text ?? textByIndex.get(p.index),
        }));
        playlistRef.current = playlist;
        clipIndexRef.current = 0;
        setCurrentClip(0);
        setAudioParagraphs(merged);
        setAudioUrl(playlist[0]);
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
  }, [storyId, isGuest, voiceId, guestAudioUrl]);

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
    // At clip end, advance to the next paragraph; stop (and reset) at the end.
    const handleEnded = () => {
      const next = clipIndexRef.current + 1;
      if (next < playlistRef.current.length) {
        clipIndexRef.current = next;
        setCurrentClip(next);
        setAudioUrl(playlistRef.current[next]);
      } else {
        // Reached the end of the narration — the story has been read through.
        setIsPlaying(false);
        setStoryFinished(true);
        clipIndexRef.current = 0;
        setCurrentClip(0);
        setAudioUrl(playlistRef.current[0] ?? null);
      }
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
    if (!storyFinished || isGuest || !storyId) {
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
    const hasAudioParas =
      audioParagraphs.length > 0 && audioParagraphs.every((p) => !!p.text);
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
  // Prefer the audio-aligned paragraphs (each carries its own text) so the
  // read-along highlight tracks the narration exactly; fall back to sentence
  // grouping when per-paragraph text isn't available (e.g. the guest clip).
  const audioParaTexts = audioParagraphs
    .map((p) => p.text)
    .filter((t): t is string => !!t);
  const useAudioParagraphs =
    audioParaTexts.length > 0 &&
    audioParaTexts.length === audioParagraphs.length;
  const readingParagraphs = useAudioParagraphs ? audioParaTexts : paragraphs;

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-[#4A413F]'>Loading story...</div>
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
            className='w-full rounded-2xl object-cover'
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
              alt='movement'
              className='h-[9rem] rounded-[3xl] mb-4 object-cover'
            />
            <div className='bg-white flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2]'>
              <h5 className='text-[#221D1D] text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <Image
                src={edit}
                alt='edit'
                className='cursor-pointer'
                onClick={() => setStep(1)}
              />
            </div>
            <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
              {audioLoading
                ? 'Preparing narration…'
                : audioError
                  ? audioError
                  : `${formatTime(currentTime)} / ${formatTime(duration)}`}
            </small>
          </div>
        ) : (
          <div className='flex items-center gap-4 justify-between w-full'>
            <div className='flex items-center gap-4'>
              <Image src={movementSmall} alt='movement' className='' />
              <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
                {audioLoading
                  ? 'Preparing narration…'
                  : audioError
                    ? audioError
                    : `${formatTime(currentTime)} / ${formatTime(duration)}`}
              </small>
            </div>
            <div className='bg-white flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2] font-qilka'>
              <h5 className='text-[#221D1D] text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <Image
                src={edit}
                alt='edit'
                className='cursor-pointer'
                onClick={() => setStep(1)}
              />
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
        {isChecked && (
          <div className='w-[75%] mx-auto'>
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
                {readingParagraphs.map((para, i) => {
                  const active = useAudioParagraphs && i === currentClip;
                  return (
                    <p
                      key={`para-${i}-${para.slice(0, 12)}`}
                      id={`reading-para-${i}`}
                      className={`text-lg not-italic font-normal leading-8 font-abeezee -mx-2 rounded-md px-2 transition-colors duration-300 ${
                        active
                          ? 'bg-[#FFEFB8] font-medium text-[#221D1D]'
                          : 'text-[#221D1D]'
                      }`}
                    >
                      {para}
                    </p>
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
          disabled={!audioUrl || audioLoading || !!audioError}
          className={`mt-12 ${
            !audioUrl || audioLoading || !!audioError
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }`}
        >
          <Image
            src={play}
            alt={isPlaying ? 'pause' : 'play'}
            className={isPlaying ? 'animate-pulse' : ''}
          />
        </button>
        {audioError && (
          <p className='text-red-500 text-sm mt-2 text-center'>{audioError}</p>
        )}
        {!isGuest && isChecked && (
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
