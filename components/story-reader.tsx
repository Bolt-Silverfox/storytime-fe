import {
  getStoryAudioBatchStatusService,
  getStoryByIdService,
  startStoryAudioBatchService,
} from '@/lib/services';
import edit from '@/public/edit.svg';
import movementSmall from '@/public/movement-small.png';
import movement from '@/public/movement.png';
import play from '@/public/play.svg';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Switch } from './ui/switch';

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
}: {
  img: string;
  title: string;
  description: string;
  voice: string;
  setStep: (step: number) => void;
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

  useEffect(() => {
    const fetchStory = async () => {
      if (!storyId) {
        return;
      }

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

  useEffect(() => {
    let cancelled = false;

    const buildPlaylist = (paras: { index: number; audioUrl: string }[]) =>
      [...paras].sort((a, b) => a.index - b.index).map((p) => p.audioUrl);

    const fetchAudio = async () => {
      if (!storyId) {
        return;
      }

      setAudioLoading(true);
      setAudioError(null);
      try {
        let batch = await startStoryAudioBatchService(storyId);
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

        const playlist = buildPlaylist(batch.completedParagraphs);
        if (playlist.length === 0) {
          setAudioError(
            'Audio is still being prepared. Please try again shortly.'
          );
          return;
        }
        playlistRef.current = playlist;
        clipIndexRef.current = 0;
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
  }, [storyId]);

  // Keep a ref of isPlaying so the audio-element listeners (mounted once) can
  // read the latest value without stale closures.
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
        setAudioUrl(playlistRef.current[next]);
      } else {
        setIsPlaying(false);
        clipIndexRef.current = 0;
        setAudioUrl(playlistRef.current[0] ?? null);
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // When the current clip changes (next paragraph), resume playback if we were
  // already playing.
  useEffect(() => {
    if (audioUrl && isPlayingRef.current && audioRef.current) {
      audioRef.current.play().catch(() => {
        setAudioError('Failed to play audio');
      });
    }
  }, [audioUrl]);

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
              {audioError
                ? 'Audio unavailable'
                : audioLoading
                  ? 'Loading audio...'
                  : `${formatTime(currentTime)} / ${formatTime(duration)}`}
            </small>
          </div>
        ) : (
          <div className='flex items-center gap-4 justify-between w-full'>
            <div className='flex items-center gap-4'>
              <Image src={movementSmall} alt='movement' className='' />
              <small className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mt-2'>
                {audioError
                  ? 'Audio unavailable'
                  : audioLoading
                    ? 'Loading audio...'
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
                      type='button'
                      key={`option-${option}`}
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
              <p className='text-[#221D1D] text-base not-italic font-normal leading-5 font-abeezee'>
                {displayContent}
              </p>
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
      </div>
    </div>
  );
};

export default StoryReader;
