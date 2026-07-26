import { getStoryAudioBatchStatus } from '@/lib/services';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import Cookies from 'js-cookie';

/**
 * Real-time subscription to a background story-audio (TTS) batch.
 *
 * Blue's TTS batch processor emits NAMED SSE events on the shared job stream
 * `GET /api/v1/events/jobs/:batchJobId` (the `batchJobId` from
 * `startStoryAudioBatch`). Events:
 *   - `progress`  → `result: { paragraphIndex, audioUrl }` — one paragraph ready
 *   - `completed` → `result: { totalParagraphs, completedParagraphs, failedParagraphs }`
 *   - `failed`    → `error` — the whole batch failed
 *   - `heartbeat` → keep-alive, ignored
 *
 * The browser-native `EventSource` cannot set an Authorization header, so we use
 * `@microsoft/fetch-event-source`. If the stream errors we fall back to polling
 * the batch-status endpoint, de-duplicating paragraphs already delivered.
 */

export interface StoryAudioBatchHandlers {
  /** A paragraph's audio is ready. `progress` is the batch-level percentage. */
  onParagraphReady?: (
    index: number,
    audioUrl: string,
    progress: number
  ) => void;
  /** The batch finished; `failedParagraphs` > 0 means partial narration. */
  onCompleted?: (summary: {
    totalParagraphs?: number;
    completedParagraphs?: number;
    failedParagraphs?: number;
  }) => void;
  /** The batch failed entirely (no usable audio). */
  onFailed?: (error?: string) => void;
}

interface AudioJobEventData {
  type: 'progress' | 'completed' | 'failed' | 'heartbeat';
  jobType?: 'story' | 'voice';
  progress?: number;
  result?: {
    paragraphIndex?: number;
    audioUrl?: string;
    totalParagraphs?: number;
    completedParagraphs?: number;
    failedParagraphs?: number;
  };
  error?: string;
}

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/v1`;

/**
 * Subscribe to a story-audio batch. Returns a cleanup function that closes the
 * SSE connection and stops any polling fallback.
 */
export function subscribeToStoryAudioBatch(
  batchJobId: string,
  handlers: StoryAudioBatchHandlers
): () => void {
  const controller = new AbortController();
  let finished = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  // Indices already surfaced to the caller — so the SSE→poll handoff (or a
  // reconnect) never delivers the same paragraph twice.
  const delivered = new Set<number>();

  const stop = () => {
    finished = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    controller.abort();
  };

  const deliverParagraph = (
    index: number,
    audioUrl: string,
    progress: number
  ) => {
    if (delivered.has(index)) {
      return;
    }
    delivered.add(index);
    handlers.onParagraphReady?.(index, audioUrl, progress);
  };

  // Polling fallback used when the SSE connection cannot be established.
  const startPolling = () => {
    if (finished) {
      return;
    }

    const poll = async () => {
      if (finished) {
        return;
      }
      try {
        const status = await getStoryAudioBatchStatus(batchJobId);
        // Re-check AFTER the await: stop() may have run while this request was
        // in flight, and we must not revive a torn-down subscription.
        if (finished) {
          return;
        }

        const completed = [...status.completedParagraphs].sort(
          (a, b) => a.index - b.index
        );
        const total = status.totalQueued ?? completed.length;
        for (const p of completed) {
          if (!p.audioUrl) {
            continue;
          }
          const progress =
            total > 0
              ? Math.min(99, Math.round((delivered.size / total) * 100))
              : 0;
          deliverParagraph(p.index, p.audioUrl, progress);
        }

        if (status.status === 'completed') {
          handlers.onCompleted?.({
            totalParagraphs: total,
            completedParagraphs: completed.length,
            failedParagraphs: status.failedParagraphs?.length,
          });
          stop();
          return;
        }
        if (status.status === 'failed') {
          handlers.onFailed?.('Audio generation failed.');
          stop();
          return;
        }
      } catch {
        // Swallow transient polling errors and keep trying until terminal.
      }
      if (!finished) {
        pollTimer = setTimeout(poll, 3000);
      }
    };

    poll();
  };

  fetchEventSource(`${API_BASE}/events/jobs/${batchJobId}`, {
    signal: controller.signal,
    openWhenHidden: true,
    headers: {
      Authorization: `Bearer ${Cookies.get('accessToken')}`,
      Accept: 'text/event-stream',
    },
    onmessage(ev) {
      if (!ev.data) {
        return;
      }

      let payload: AudioJobEventData;
      try {
        payload = JSON.parse(ev.data) as AudioJobEventData;
      } catch {
        return;
      }

      switch (payload.type) {
        case 'heartbeat':
          return;
        case 'progress': {
          const index = payload.result?.paragraphIndex;
          const audioUrl = payload.result?.audioUrl;
          if (typeof index === 'number' && typeof audioUrl === 'string') {
            deliverParagraph(index, audioUrl, payload.progress ?? 0);
          }
          return;
        }
        case 'completed':
          handlers.onCompleted?.(payload.result ?? {});
          stop();
          return;
        case 'failed':
          handlers.onFailed?.(payload.error);
          stop();
          return;
        default:
          return;
      }
    },
    onerror(err) {
      // Do not let fetch-event-source auto-retry; fall back to polling instead.
      if (!finished) {
        startPolling();
      }
      // Throwing stops the internal retry loop.
      throw err;
    },
  }).catch(() => {
    // Rejects on abort or when onerror throws; polling (if started) and the
    // terminal handlers cover delivery from here.
  });

  return stop;
}
