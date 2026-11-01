import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ensureGuestSession } from '@/lib/guest';
import { STORY_QUOTA_QUERY_KEY } from '@/lib/hooks/use-story-quota';
import {
  clearReadingPosition,
  getReadingPosition,
  markDone,
  markReading,
  saveReadingPosition,
} from '@/lib/progress-store';
import { pagesSignature, resolvePages } from '@/lib/reader/paginate';
import {
  alignClip,
  clipEndAction,
  clipForPage,
  initialReaderState,
  readerReducer,
} from '@/lib/reader/reader-state';
import {
  getGuestStoryAudioBatchStatusService,
  getGuestStoryService,
  getStoryAudioBatchStatusService,
  getStoryByIdService,
  recordUserProgressService,
  type StoryAudioBatch,
  type StoryAudioParagraph,
  startGuestStoryAudioBatchService,
  startStoryAudioBatchService,
} from '@/lib/services';
import edit from '@/public/edit.svg';
import movement from '@/public/movement.png';
import movementSmall from '@/public/movement-small.png';
import pause from '@/public/pause.svg';
import play from '@/public/play.svg';
import PageView from './reader/page-view';
import { Switch } from './ui/switch';

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
  // Backend >= v1.7.0 sends the page split; older backends don't.
  pages?: string[];
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
  // True once the guest story GET succeeded. That call records the guest's
  // access, which is what authorizes per-paragraph audio generation, so the
  // guest audio batch must not start before it.
  const [guestStoryReady, setGuestStoryReady] = useState(false);
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
  // True only while the <audio> element is actually producing sound (driven by
  // its own events, not the Play button), so the synth image never animates
  // over silence (buffering, paused, ended, errored, switching clips).
  const [audioSounding, setAudioSounding] = useState(false);
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
  // Paged reading: which page is showing. Pages come from the API when present,
  // else we paginate the story text with the same rule.
  const [reader, dispatch] = useReducer(readerReducer, initialReaderState);
  const readerRef = useRef(reader);
  readerRef.current = reader;
  const pages = useMemo(
    () => resolvePages(story?.pages, story?.textContent),
    [story]
  );
  const pagesSig = useMemo(() => pagesSignature(pages), [pages]);
  // The page is only "visible" (and only worth persisting / following the
  // narration) while read-along is on.
  const isCheckedRef = useRef(false);
  isCheckedRef.current = isChecked;
  // A guest story with one stored narration file: a single clip for the whole
  // story, so pages are not mapped to clips and the file ending ends the story.
  const singleFileRef = useRef(false);
  singleFileRef.current = isGuest && !!guestAudioUrl;

  // Resume where the reader left off once the pages are known.
  useEffect(() => {
    if (!(storyId && pages.length > 0)) {
      return;
    }
    dispatch({
      type: 'init',
      count: pages.length,
      page: getReadingPosition(storyId, pages.length, pagesSig) ?? 0,
    });
  }, [storyId, pages, pagesSig]);

  // Remember the position (per story) as pages turn. Only while the page is
  // visible, so narration playing with the text hidden can't overwrite it.
  useEffect(() => {
    if (storyId && reader.count > 0 && isChecked) {
      saveReadingPosition(storyId, reader.page, reader.count, pagesSig);
    }
  }, [storyId, reader.page, reader.count, pagesSig, isChecked]);

  // Revealing the text while narration is playing shows the narrated page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to the read-along switch; the rest is read via refs.
  useEffect(() => {
    // A single stored file has no per-page clips: nothing to follow.
    if (isChecked && isPlayingRef.current && !singleFileRef.current) {
      dispatch({ type: 'go', page: clipIndexRef.current });
    }
  }, [isChecked]);

  useEffect(() => {
    const fetchStory = async () => {
      if (!storyId) {
        return;
      }

      setLoading(true);
      setError(null);
      setQuotaReached(false);
      setGuestStoryReady(false);
      setStoryFinished(false);
      setCompletion('idle');
      try {
        if (isGuest) {
          await ensureGuestSession();
          const guestStory = await getGuestStoryService(storyId);
          setStory(guestStory as unknown as Story);
          setGuestAudioUrl(guestStory.audioUrl ?? null);
          setGuestStoryReady(true);
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

      // A story with a stored narration file keeps the single-clip path for
      // guests, so nothing regresses where `audioUrl` is populated.
      if (isGuest && guestAudioUrl) {
        setAudioError(null);
        playlistRef.current = [guestAudioUrl];
        clipIndexRef.current = 0;
        setAudioUrl(guestAudioUrl);
        return;
      }

      // Otherwise guests use the same per-paragraph batch flow as signed-in
      // users, via the guest endpoints (default voice only, enforced by the
      // backend). Wait until the guest story has loaded (access recorded).
      if (isGuest && !guestStoryReady) {
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
      // Latest paragraph list built by applyBatch, so a failed poll can mark
      // the still-pending paragraphs as failed (retryable) without discarding
      // the ones that already have playable audio.
      let latestParagraphs: StoryAudioParagraph[] = [];

      // Release an auto-advance that was waiting for a clip that will never
      // arrive, so playback doesn't sit "playing" with nothing to play.
      const releaseWaiting = () => {
        if (waitingForNextRef.current) {
          waitingForNextRef.current = false;
          setIsPlaying(false);
        }
      };

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
        latestParagraphs = paras;
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
          if (isCheckedRef.current) {
            dispatch({ type: 'clip', clip: next, from: next - 1 });
          }
        }

        // Still waiting, but the paragraph we're waiting on has failed: it will
        // never arrive, so surface the retry instead of stalling.
        if (waitingForNextRef.current && failed.has(clipIndexRef.current + 1)) {
          releaseWaiting();
          setAudioError('Some of the audio couldn’t be prepared.');
        }

        const stillGenerating = accounted < total;
        setAudioGenerating(stillGenerating);
        return { playlist, accounted, total, failedSize: failed.size };
      };

      try {
        const initial = isGuest
          ? await startGuestStoryAudioBatchService(storyId)
          : await startStoryAudioBatchService(storyId, voiceId ?? undefined);
        if (cancelled) {
          return;
        }
        let snap = applyBatch(initial);

        // Keep polling in the background for the remaining paragraphs. Playback
        // is already possible off the eager clips while this runs.
        let attempts = 0;
        let terminal =
          initial.status === 'failed' || initial.status === 'completed';
        while (
          !(cancelled || terminal) &&
          initial.batchJobId &&
          snap.accounted < snap.total &&
          attempts < 60
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts += 1;
          const batch = isGuest
            ? await getGuestStoryAudioBatchStatusService(
                storyId,
                initial.batchJobId
              )
            : await getStoryAudioBatchStatusService(initial.batchJobId);
          if (cancelled) {
            return;
          }
          snap = applyBatch(batch);
          if (batch.status === 'failed' || batch.status === 'completed') {
            terminal = true;
          }
        }
        if (cancelled) {
          return;
        }

        // Real failure ONLY when nothing at all is playable AND something failed.
        if (snap.playlist.length === 0 && snap.failedSize > 0) {
          setAudioError('We couldn’t prepare the audio for this story.');
          releaseWaiting();
          setAudioGenerating(false);
        } else if (snap.accounted < snap.total) {
          // The poll loop has exited (terminal status, poll limit reached or no
          // batch to poll) with paragraphs never delivered: nothing more will
          // arrive, so mark them failed (ref first — handleEnded
          // reads it), release any waiting auto-advance and offer a retry.
          const missing = new Set(
            latestParagraphs.filter((p) => !p.audioUrl).map((p) => p.index)
          );
          failedIndicesRef.current = missing;
          setFailedIndices(missing);
          releaseWaiting();
          setAudioError('Some of the audio couldn’t be prepared.');
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
        // A failed start/poll (e.g. a guest 429) must not leave the calm
        // "Preparing audio…" indicator spinning forever next to the error.
        setAudioGenerating(false);
        const failedOnError = new Set(
          latestParagraphs.filter((p) => !p.audioUrl).map((p) => p.index)
        );
        // Keep the ref in sync: handleEnded reads it, not the state.
        failedIndicesRef.current = failedOnError;
        setFailedIndices(failedOnError);
        releaseWaiting();
        setAudioError(
          isGuest && (error as { status?: number | null })?.status === 429
            ? 'Audio is busy right now. Please try again in a minute.'
            : 'Failed to load audio'
        );
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
  }, [storyId, isGuest, voiceId, guestAudioUrl, guestStoryReady, audioRetry]);

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
      const current = clipIndexRef.current;
      const next = current + 1;
      const action = clipEndAction({
        current,
        readyCount: playlistRef.current.length,
        clipTotal: totalCountRef.current,
        nextFailed: failedIndicesRef.current.has(next),
        pageCount: readerRef.current.count,
        textVisible: isCheckedRef.current,
        singleFile: singleFileRef.current,
      });
      if (action === 'advance') {
        clipIndexRef.current = next;
        setCurrentClip(next);
        setAudioUrl(playlistRef.current[next]);
        // Turn the page with the narration (only if the reader is on it).
        if (isCheckedRef.current) {
          dispatch({ type: 'clip', clip: next, from: current });
        }
        return;
      }
      // The next clip is still generating: hold and resume when polling
      // delivers it — don't error and don't mark the story finished.
      if (action === 'wait') {
        waitingForNextRef.current = true;
        setAudioGenerating(true);
        return;
      }
      // The next paragraph failed — surface a retry rather than a silent finish.
      if (action === 'failed') {
        setIsPlaying(false);
        waitingForNextRef.current = false;
        setAudioError('Some of the audio couldn’t be prepared.');
        return;
      }
      setIsPlaying(false);
      // Clips cover only the first pages of a long story: stop on the next
      // page, the story isn't finished.
      if (action === 'stop') {
        dispatch({ type: 'clip', clip: next, from: current });
        return;
      }
      // The narration has played through: finish the story and rewind the
      // narration (and the page, if it was following) so a replay starts over.
      setStoryFinished(true);
      clipIndexRef.current = 0;
      setCurrentClip(0);
      setAudioUrl(playlistRef.current[0] ?? null);
      if (isCheckedRef.current && !singleFileRef.current) {
        dispatch({ type: 'clip', clip: 0, from: current });
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
    if (!(storyFinished && storyId)) {
      return;
    }
    // Reflect completion on story cards immediately (works for guests too).
    markDone(storyId);
    // Finished: the next visit starts from page one.
    clearReadingPosition(storyId);
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

  // Point the narration at the clip that belongs to `page` (clip N is page N).
  // 'switched' → the clip changed (the <audio> src updates on the next render);
  // 'ok' → already there; 'unavailable' → that clip isn't generated yet;
  // 'none' → the page has no narration (beyond the capped clips).
  const alignAudioToPage = (
    page: number
  ): 'switched' | 'ok' | 'unavailable' | 'none' => {
    const list = playlistRef.current;
    const { kind, target } = alignClip({
      page,
      currentClip: clipIndexRef.current,
      clipTotal: totalCountRef.current,
      readyCount: list.length,
      singleFile: singleFileRef.current,
    });
    if (kind !== 'switch') {
      return kind;
    }
    clipIndexRef.current = target;
    waitingForNextRef.current = false;
    setCurrentClip(target);
    setAudioUrl(list[target]);
    return 'switched';
  };

  // Manual page turn: keep the narration on the page being read when its clip
  // is ready. If it isn't, the narration carries on where it was and the
  // reader keeps the page they chose (the narration never drags them back).
  const turnPage = (action: 'next' | 'prev') => {
    const target = readerReducer(readerRef.current, { type: action }).page;
    dispatch({ type: action });
    alignAudioToPage(target);
  };

  const handlePlayPause = () => {
    if (!(audioRef.current && audioUrl)) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // With the text hidden there is no visible page to start from: continue
    // from the current clip. Otherwise read the page on screen; if its clip
    // isn't ready yet, show the page that is being narrated instead.
    let aligned: ReturnType<typeof alignAudioToPage> = 'ok';
    if (isChecked) {
      aligned = alignAudioToPage(readerRef.current.page);
      if (aligned === 'none') {
        return;
      }
      if (aligned === 'unavailable') {
        dispatch({ type: 'go', page: clipIndexRef.current });
      }
    }
    if (aligned === 'switched') {
      // The new clip starts playing once the <audio> src updates.
      setIsPlaying(true);
      return;
    }
    audioRef.current.play().catch((error) => {
      console.error('Failed to play audio:', error);
      setAudioError('Failed to play audio');
    });
    setIsPlaying(true);
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
  // The narration is generated per page (backend TTS paragraphs == pages), so
  // the read-along highlight marks the page whose clip is playing. Guests on a
  // single stored narration file have no per-page clips → no highlight.
  const useAudioParagraphs = audioParagraphs.length > 0;
  const clipCount = audioParagraphs.length;
  // Clip N is page N, so the narrated page is simply the current clip.
  const narratedPage = currentClip;
  const pageClip = clipForPage(reader.page, clipCount);
  // Long stories only narrate their first clips; later pages have no audio.
  const pageNoAudio = useAudioParagraphs && pageClip === null && !audioLoading;

  const playBlocked = isChecked && pageNoAudio && !isPlaying;

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <output className='text-body'>Loading story...</output>
      </div>
    );
  }

  if (quotaReached) {
    return (
      <div className='flex flex-col items-center justify-center h-64 text-center px-4'>
        <h3 className='text-strong text-2xl not-italic font-bold leading-7 font-qilka mb-2'>
          You've enjoyed your free stories!
        </h3>
        <p className='text-body text-base not-italic font-normal leading-5 font-abeezee mb-6 max-w-md'>
          Sign up to keep reading unlimited stories with audio narration.
        </p>
        <Link
          href='/register'
          className='rounded-[3.125rem] bg-brand px-8 py-4 text-base font-semibold text-white transition hover:opacity-90'
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
  const synthMoving = audioSounding && !audioLoading && !audioGenerating;

  return (
    <div>
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload='metadata'
          onPlay={() => setAudioSounding(true)}
          onPlaying={() => setAudioSounding(true)}
          onPause={() => setAudioSounding(false)}
          onWaiting={() => setAudioSounding(false)}
          onEmptied={() => setAudioSounding(false)}
          onEnded={() => setAudioSounding(false)}
          onError={() => {
            setAudioSounding(false);
            setAudioError('Failed to load audio');
          }}
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
        <h3 className='text-strong text-[1.625rem] not-italic font-bold leading-[1.875rem] font-qilka mt-4 mb-0.5'>
          {displayTitle}
        </h3>
        <p className='text-body not-italic font-normal leading-4'>
          {displayDescription}
        </p>
        {mode && (
          <div className='mt-4 p-3 bg-page rounded-lg'>
            <p className='text-body text-sm not-italic font-normal leading-4 font-abeezee'>
              <strong>Mode:</strong> {getModeDescription()}
            </p>
          </div>
        )}
      </div>
      <div className='flex flex-col items-center'>
        {!isChecked ? (
          <div className='flex flex-col items-center'>
            <div className='synth-wave mb-4' data-playing={synthMoving}>
              <Image
                src={movement}
                alt=''
                className='h-[9rem] max-w-full rounded-[3xl] object-cover'
              />
            </div>
            <div className='bg-surface flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-hairline-warm'>
              <h5 className='text-strong text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <button
                type='button'
                aria-label='Change voice'
                onClick={() => setStep(1)}
                className='cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'
              >
                <Image
                  src={edit}
                  alt=''
                  className='dark:brightness-0 dark:invert'
                />
              </button>
            </div>
            <small className='text-body text-base not-italic font-normal leading-5 font-abeezee mt-2'>
              {audioLoading || audioGenerating
                ? 'Preparing audio…'
                : `${formatTime(currentTime)} / ${formatTime(duration)}`}
            </small>
          </div>
        ) : (
          <div className='flex flex-wrap items-center gap-4 justify-between w-full'>
            <div className='flex items-center gap-4'>
              <div className='synth-wave' data-playing={synthMoving}>
                <Image src={movementSmall} alt='' className='' />
              </div>
              <small className='text-body text-base not-italic font-normal leading-5 font-abeezee mt-2'>
                {audioLoading || audioGenerating
                  ? 'Preparing audio…'
                  : `${formatTime(currentTime)} / ${formatTime(duration)}`}
              </small>
            </div>
            <div className='bg-surface flex justify-center items-center gap-3 shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2] font-qilka'>
              <h5 className='text-strong text-right text-xl not-italic font-bold leading-6'>
                {voice}
              </h5>
              <button
                type='button'
                aria-label='Change voice'
                onClick={() => setStep(1)}
                className='cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'
              >
                <Image
                  src={edit}
                  alt=''
                  className='dark:brightness-0 dark:invert'
                />
              </button>
            </div>
          </div>
        )}
        <div className='bg-reader-panel rounded-2xl border-[0.5px] border-solid border-reader-panel-border px-6 py-4 flex justify-between items-center w-full my-12'>
          <p className='text-strong text-base not-italic font-normal leading-5 font-abeezee'>
            Read story along with {voice}
          </p>
          <Switch
            checked={isChecked}
            onCheckedChange={() => setIsChecked(!isChecked)}
            className='data-[state=checked]:bg-[#83E9FB] data-[state=unchecked]:bg-black dark:data-[state=unchecked]:bg-line cursor-pointer'
          />
        </div>
        {isChecked && (
          <div className='w-full sm:w-[75%] mx-auto'>
            {mode === 'interactive' &&
            story?.questions &&
            story.questions.length > 0 &&
            storyFinished ? (
              <div className='space-y-6'>
                <div className='text-center mb-6'>
                  <h4 className='text-strong text-lg font-bold mb-2'>
                    Question {currentQuestionIndex + 1} of{' '}
                    {story.questions.length}
                  </h4>
                  <p className='text-body text-base font-abeezee'>
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
                              ? 'border-green-500 bg-green-50 dark:bg-green-950/50'
                              : 'border-red-500 bg-red-50 dark:bg-red-950/50'
                            : 'border-reader-panel-border bg-reader-panel'
                          : 'border-gray-200 dark:border-line-mid hover:border-gray-300 dark:hover:border-line-hover'
                      } ${showAnswer ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className='text-strong font-abeezee'>{option}</span>
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
                    <p className='text-body font-abeezee mb-4'>
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
                        <div className='text-body font-abeezee'>
                          🎉 You've completed all questions!
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <PageView
                pages={pages}
                page={reader.page}
                highlighted={
                  isPlaying &&
                  useAudioParagraphs &&
                  reader.page === narratedPage
                }
                onNext={() => turnPage('next')}
                onPrev={() => turnPage('prev')}
                pageStatus={
                  pageNoAudio ? (
                    <span className='mt-1 block px-2 text-sm text-body font-abeezee'>
                      No narration for this page. Go back to listen to the
                      narrated part of the story.
                    </span>
                  ) : useAudioParagraphs &&
                    pageClip !== null &&
                    failedIndices.has(pageClip) ? (
                    <span className='mt-1 flex items-center gap-2 px-2 text-sm text-red-500 font-abeezee'>
                      Audio unavailable
                      <button
                        type='button'
                        onClick={() => {
                          setAudioError(null);
                          setAudioRetry((n) => n + 1);
                        }}
                        className='rounded-full border border-brand px-3 py-1 text-xs font-semibold text-brand-text transition hover:bg-brand/5'
                      >
                        Retry
                      </button>
                    </span>
                  ) : useAudioParagraphs &&
                    pageClip !== null &&
                    !audioParagraphs[pageClip]?.audioUrl ? (
                    <span className='mt-1 flex items-center gap-2 px-2 text-sm text-body font-abeezee'>
                      <span className='inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#83E9FB] border-t-transparent motion-reduce:animate-none' />
                      Preparing audio…
                    </span>
                  ) : null
                }
                endActions={
                  <div className='flex flex-col items-center gap-4'>
                    {mode === 'interactive' &&
                      story?.questions &&
                      story.questions.length > 0 && (
                        <button
                          type='button'
                          onClick={() => setStoryFinished(true)}
                          className='rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90'
                        >
                          Finished reading — Take the quiz
                        </button>
                      )}
                  </div>
                }
              />
            )}
          </div>
        )}
        <button
          type='button'
          onClick={handlePlayPause}
          disabled={!audioUrl || audioLoading || playBlocked}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          className={`mt-12 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
            !audioUrl || audioLoading || playBlocked
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
              className='rounded-full border border-brand px-5 py-2 font-abeezee text-sm font-semibold text-brand-text transition hover:bg-brand/5'
            >
              Try again
            </button>
          </div>
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
                className='rounded-full border border-brand px-6 py-3 font-abeezee text-sm font-semibold text-brand-text transition hover:bg-brand/5 disabled:opacity-60'
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
