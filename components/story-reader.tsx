import movement from '@/public/movement.png';
import movementSmall from '@/public/movement-small.png';
import edit from '@/public/edit.svg';
import play from '@/public/play.svg';
import Image from 'next/image';
import { Switch } from './ui/switch';
import { useState, useEffect, useRef } from 'react';
import {
  getStoryByIdService,
  startStoryAudioBatch,
  type StoryAudioOutlineItem,
} from '@/lib/services';
import { subscribeToStoryAudioBatch } from '@/lib/story-audio-events';

interface Question {
  id: string;
  storyId: string;
  question: string;
  options: string[];
  answer: number;
}

interface Story {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string;
  textContent?: string;
  isInteractive?: boolean;
  questions?: Question[];
  [key: string]: any;
}

const StoryReader = ({
  img,
  title,
  description,
  voice,
  setStep,
  expand,
  mode,
  storyId,
}: {
  img: string;
  title: string;
  description: string;
  voice: string;
  setStep: (step: number) => void;
  expand: boolean;
  mode?: string | null;
  storyId?: string | null;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Audio states — a per-paragraph playlist rather than one file.
  // `audioByIndex` fills in as paragraphs arrive (eager/cache up-front, the rest
  // streamed over SSE). `currentIndex` is the paragraph we want to be playing.
  const [outline, setOutline] = useState<StoryAudioOutlineItem[]>([]);
  const [audioByIndex, setAudioByIndex] = useState<Record<number, string>>({});
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  // True once every paragraph that will ever arrive has arrived (batch done).
  const [audioComplete, setAudioComplete] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentUrl = audioByIndex[currentIndex] ?? null;
  const readyCount = Object.keys(audioByIndex).length;
  // Whether we're stalled waiting on the current paragraph to finish generating
  // (as opposed to a hard failure). Drives a "still generating" hint, not an error.
  const waitingForCurrent =
    isPlaying && !currentUrl && !audioError && !audioComplete;

  useEffect(() => {
    const fetchStory = async () => {
      if (!storyId) return;

      setLoading(true);
      setError(null);
      try {
        const storyData = await getStoryByIdService(storyId);
        setStory(storyData);
      } catch (error) {
        console.error('Failed to fetch story:', error);
        setError('Failed to load story');
      } finally {
        setLoading(false);
      }
    };

    fetchStory();
  }, [storyId]);

  // Enqueue the audio batch, seed the ready paragraphs, then stream the rest in
  // over SSE (no polling). Returns a cleanup that tears down the subscription.
  useEffect(() => {
    if (!storyId) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // Reset per-story audio state so switching stories doesn't leak playback.
    setOutline([]);
    setAudioByIndex({});
    setTotalParagraphs(0);
    setCurrentIndex(0);
    setAudioComplete(false);
    setAudioError(null);
    setIsPlaying(false);
    setAudioLoading(true);

    (async () => {
      try {
        const batch = await startStoryAudioBatch(storyId);
        if (cancelled) return;

        setOutline(batch.outline);
        setTotalParagraphs(
          batch.totalParagraphs || batch.outline.length || batch.ready.length
        );

        const seeded: Record<number, string> = {};
        for (const p of batch.ready) {
          if (p.audioUrl) seeded[p.index] = p.audioUrl;
        }
        setAudioByIndex(seeded);

        if (batch.batchJobId) {
          // Paragraphs still generating — subscribe for the rest.
          unsubscribe = subscribeToStoryAudioBatch(batch.batchJobId, {
            onParagraphReady: (index, audioUrl) => {
              setAudioByIndex((prev) =>
                prev[index] ? prev : { ...prev, [index]: audioUrl }
              );
            },
            onCompleted: () => setAudioComplete(true),
            onFailed: (err) => {
              // A hard batch failure only strands us if we have no audio at all;
              // partial narration already played stays usable.
              setAudioError(err || 'Audio generation failed.');
              setAudioComplete(true);
            },
          });
        } else {
          // Nothing pending — every paragraph is already in `seeded`.
          setAudioComplete(true);
        }

        if (batch.ready.length === 0 && !batch.batchJobId) {
          setAudioError('No audio is available for this story yet.');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to start story audio:', error);
          setAudioError('Failed to load audio');
        }
      } finally {
        if (!cancelled) setAudioLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [storyId]);

  // Drive playback: whenever we intend to play and the desired paragraph's audio
  // is available, play it. If it isn't ready yet, do nothing — this effect
  // re-runs the moment SSE fills `currentUrl` in, resuming seamlessly.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || !currentUrl) return;

    const p = audio.play();
    if (p) {
      p.catch((err: unknown) => {
        // AbortError just means a newer paragraph's src interrupted this play()
        // (normal during auto-advance) — not a real playback failure.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to play audio:', err);
        setAudioError('Failed to play audio');
        setIsPlaying(false);
      });
    }
  }, [isPlaying, currentUrl]);

  // Auto-advance: when a paragraph ends, move to the next one. If it isn't ready
  // yet the playback effect above will wait for it; when we run past the last
  // paragraph, stop.
  const handleParagraphEnded = () => {
    setCurrentTime(0);
    setDuration(0);
    setCurrentIndex((idx) => {
      const next = idx + 1;
      if (totalParagraphs > 0 && next >= totalParagraphs) {
        setIsPlaying(false);
        return idx;
      }
      return next;
    });
  };

  // Jump to a specific paragraph (click-to-play), only if its audio is ready.
  const handleSelectParagraph = (index: number) => {
    if (!audioByIndex[index]) return;
    setCurrentTime(0);
    setDuration(0);
    setCurrentIndex(index);
    setIsPlaying(true);
  };

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

  // `isPlaying` is user intent; the playback effect turns it into actual play()
  // calls once audio is available. Pressing play while the first paragraph is
  // still generating simply buffers until it arrives.
  const handlePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
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

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-[#4A413F]'>Loading story...</div>
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

  // Definitively no audio (batch finished or failed with nothing playable).
  const noAudioEver = (audioComplete || !!audioError) && readyCount === 0;
  const playDisabled = audioLoading || noAudioEver;

  // Status line beneath the voice chip.
  const audioStatusText =
    audioError && readyCount === 0
      ? 'Audio unavailable'
      : audioLoading
        ? 'Loading audio...'
        : waitingForCurrent
          ? 'Generating audio...'
          : `${formatTime(currentTime)} / ${formatTime(duration)}`;

  return (
    <div>
      {/* Hidden audio element — one element, its src swaps per paragraph. */}
      <audio
        ref={audioRef}
        src={currentUrl ?? undefined}
        preload='metadata'
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleParagraphEnded}
        onError={() => {
          // Only surface an element-level load error if this paragraph has no
          // usable URL; a transient blip mid-playlist shouldn't nuke the reader.
          if (!currentUrl) setAudioError('Failed to load audio');
        }}
      />

      <div className='mb-16'>
        <img src={displayImage} alt={displayTitle} />
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
              {audioStatusText}
            </small>
          </div>
        ) : (
          <div className='flex items-center gap-4 justify-between w-full'>
            <div className='flex items-center gap-4'>
              <Image src={movementSmall} alt='movement' className='' />
              <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
                {audioStatusText}
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
            Read story along with Nimbus
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
            story.questions.length > 0 ? (
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
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={showAnswer}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                        selectedAnswer === index
                          ? showAnswer
                            ? index === currentQuestion.answer
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
                          {index === currentQuestion.answer
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
                      {selectedAnswer === currentQuestion?.answer
                        ? 'Great job! You got it right!'
                        : `The correct answer is: ${
                            currentQuestion?.options[currentQuestion.answer]
                          }`}
                    </p>
                    <div className='flex justify-center gap-4'>
                      {currentQuestionIndex > 0 && (
                        <button
                          onClick={handlePreviousQuestion}
                          className='px-4 py-2 bg-[#83E9FB] text-[#221D1D] rounded-lg font-abeezee'
                        >
                          Previous
                        </button>
                      )}
                      {currentQuestionIndex <
                      (story.questions?.length || 0) - 1 ? (
                        <button
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
            ) : outline.length > 0 ? (
              // Per-paragraph read-along: the playing paragraph is highlighted
              // and ready paragraphs are click-to-play. Audio arrives over SSE,
              // so a paragraph without audio yet reads dimmed until it lands.
              <div className='space-y-3'>
                {outline.map((para) => {
                  const isReady = !!audioByIndex[para.index];
                  const isActive = para.index === currentIndex;
                  return (
                    <p
                      key={para.index}
                      onClick={() => handleSelectParagraph(para.index)}
                      className={`text-base not-italic font-normal leading-5 font-abeezee rounded-lg px-2 py-1 transition-colors ${
                        isActive
                          ? 'bg-[#E6FBFE] text-[#221D1D] font-medium'
                          : 'text-[#221D1D]'
                      } ${
                        isReady
                          ? 'cursor-pointer hover:bg-[#FAF4F2]'
                          : 'opacity-60 cursor-default'
                      }`}
                    >
                      {para.text}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee'>
                {displayContent}
              </p>
            )}
          </div>
        )}
        <button
          onClick={handlePlayPause}
          disabled={playDisabled}
          className={`mt-12 ${
            playDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <Image
            src={play}
            alt={isPlaying ? 'pause' : 'play'}
            className={isPlaying ? 'animate-pulse' : ''}
          />
        </button>
        {totalParagraphs > 1 && !noAudioEver && (
          <p className='text-[#4A413F] text-xs mt-2 text-center font-abeezee'>
            Paragraph {Math.min(currentIndex + 1, totalParagraphs)} of{' '}
            {totalParagraphs}
            {readyCount < totalParagraphs && ` · ${readyCount} ready`}
          </p>
        )}
        {/* Only a hard failure with NO playable audio is an error; a batch that
            is still generating shows the "Generating audio..." status instead. */}
        {audioError && readyCount === 0 && (
          <p className='text-red-500 text-sm mt-2 text-center'>{audioError}</p>
        )}
      </div>
    </div>
  );
};

export default StoryReader;
