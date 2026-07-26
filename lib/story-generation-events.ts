import { getStoryJobStatusService } from '@/lib/services';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import Cookies from 'js-cookie';

/**
 * Real-time subscription to an async story-generation job.
 *
 * Blue exposes a NestJS @Sse stream at `GET /api/v1/events/jobs/:jobId` whose
 * guard reads the Authorization header ONLY. The browser-native `EventSource`
 * cannot set headers, so we use `@microsoft/fetch-event-source`, which lets us
 * attach `Authorization: Bearer <accessToken>`.
 *
 * Blue emits NAMED SSE events (`event: progress|completed|failed|heartbeat`)
 * and each `data` is JSON `{ type, progress, progressMessage?, result?, error? }`.
 * We parse `ev.data` and key off its `type`. If the stream errors we fall back
 * to polling `GET /stories/generate/jobs/:jobId`.
 */

export interface JobEventResult {
  storyId?: string;
  title?: string;
  audioUrl?: string;
}

export interface JobEventData {
  type: 'progress' | 'completed' | 'failed' | 'heartbeat';
  jobId?: string;
  jobType?: 'story' | 'voice';
  progress?: number;
  progressMessage?: string;
  result?: JobEventResult;
  error?: string;
  timestamp?: string;
}

export interface StoryJobSubscriptionHandlers {
  onProgress?: (progress: number, message?: string) => void;
  onCompleted?: (result: JobEventResult) => void;
  onFailed?: (error?: string) => void;
}

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/v1`;

/**
 * Subscribe to a story job's lifecycle. Returns a cleanup function that closes
 * the SSE connection and stops any polling fallback.
 */
export function subscribeToStoryJob(
  jobId: string,
  handlers: StoryJobSubscriptionHandlers
): () => void {
  const controller = new AbortController();
  let finished = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    finished = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    controller.abort();
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
        const status = await getStoryJobStatusService(jobId);
        handlers.onProgress?.(status.progress ?? 0, status.progressMessage);

        if (status.status === 'completed') {
          const result = status.result;
          handlers.onCompleted?.({
            storyId: result?.id,
            title: result?.title,
            audioUrl: result?.audioUrl,
          });
          stop();
          return;
        }
        if (status.status === 'failed') {
          handlers.onFailed?.(status.error);
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

  fetchEventSource(`${API_BASE}/events/jobs/${jobId}`, {
    signal: controller.signal,
    // Keep the stream alive when the tab is backgrounded.
    openWhenHidden: true,
    headers: {
      Authorization: `Bearer ${Cookies.get('accessToken')}`,
      Accept: 'text/event-stream',
    },
    onmessage(ev) {
      if (!ev.data) {
        return;
      }

      let payload: JobEventData;
      try {
        payload = JSON.parse(ev.data) as JobEventData;
      } catch {
        return;
      }

      switch (payload.type) {
        case 'heartbeat':
          return;
        case 'progress':
          handlers.onProgress?.(payload.progress ?? 0, payload.progressMessage);
          return;
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
    // The promise rejects on abort or when onerror throws; polling (if started)
    // and the terminal handlers cover delivery from here.
  });

  return stop;
}
