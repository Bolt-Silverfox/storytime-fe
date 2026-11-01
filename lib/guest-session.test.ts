import { AxiosError, type AxiosResponse } from 'axios';
import Cookies from 'js-cookie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '@/lib/axios';
import {
  getGuestStoryService,
  getStoryQuotaService,
  startGuestStoryAudioBatchService,
} from '@/lib/services';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const axiosErr = (status: number, message: string) =>
  new AxiosError(message, String(status), undefined, undefined, {
    status,
    data: { message, status },
  } as AxiosResponse);

const STALE = 'x-guest-session-id header is required';
const story = { data: { id: 's1', title: 'T' } };
const session = { data: { sessionId: 'new-id', expiresIn: 86400 } };

const sessionCalls = () =>
  post.mock.calls.filter(([url]) => url === 'guest/session');

beforeEach(() => {
  vi.resetAllMocks();
  Cookies.remove('guestSessionId');
});

describe('guest session before guest reads', () => {
  it('creates a session first when there is no cookie, then reads', async () => {
    post.mockResolvedValueOnce(session);
    get.mockImplementation(async () => {
      expect(Cookies.get('guestSessionId')).toBe('new-id');
      return story;
    });
    await expect(getGuestStoryService('s1')).resolves.toEqual(story.data);
    expect(sessionCalls()).toHaveLength(1);
  });

  it('does not create a session when a cookie exists', async () => {
    Cookies.set('guestSessionId', 'old');
    get.mockResolvedValueOnce(story);
    await getGuestStoryService('s1');
    expect(sessionCalls()).toHaveLength(0);
  });

  it('on stale-cookie 400 recreates once and retries once', async () => {
    Cookies.set('guestSessionId', 'stale');
    get
      .mockRejectedValueOnce(axiosErr(400, STALE))
      .mockResolvedValueOnce(story);
    post.mockResolvedValueOnce(session);
    await expect(getGuestStoryService('s1')).resolves.toEqual(story.data);
    expect(sessionCalls()).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(Cookies.get('guestSessionId')).toBe('new-id');
  });

  it('does not loop when the retry also fails', async () => {
    Cookies.set('guestSessionId', 'stale');
    get.mockRejectedValue(axiosErr(400, STALE));
    post.mockResolvedValue(session);
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      status: 400,
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(sessionCalls()).toHaveLength(1);
  });

  it('retries on 401 but not on an unrelated 404', async () => {
    Cookies.set('guestSessionId', 'stale');
    get
      .mockRejectedValueOnce(axiosErr(401, 'Unauthorized'))
      .mockResolvedValueOnce(story);
    post.mockResolvedValueOnce(session);
    await getGuestStoryService('s1');
    expect(get).toHaveBeenCalledTimes(2);

    get.mockReset();
    post.mockClear();
    get.mockRejectedValueOnce(axiosErr(404, 'Story not found'));
    await expect(getGuestStoryService('nope')).rejects.toMatchObject({
      status: 404,
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(sessionCalls()).toHaveLength(0);
  });

  it('surfaces a clear error when session creation fails, with no retry loop', async () => {
    post.mockRejectedValue(axiosErr(429, 'Too many requests'));
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      message: "We couldn't start a guest session, try again in a minute",
      status: 429,
    });
    expect(sessionCalls()).toHaveLength(1);
    expect(get).not.toHaveBeenCalled();
  });

  it('a later call retries creation after a failure', async () => {
    post
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(session);
    get.mockResolvedValue(story);
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      status: null,
    });
    await expect(getGuestStoryService('s1')).resolves.toEqual(story.data);
    expect(sessionCalls()).toHaveLength(2);
  });

  it('concurrent calls share one session creation', async () => {
    let resolve!: (v: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }) as never
    );
    get.mockResolvedValue(story);
    const all = Promise.all([
      getGuestStoryService('a'),
      getGuestStoryService('b'),
      getStoryQuotaService(),
    ]);
    await vi.waitFor(() => expect(sessionCalls()).toHaveLength(1));
    resolve(session);
    await all;
    expect(sessionCalls()).toHaveLength(1);
  });

  it('guest audio start also ensures a session and recovers from stale', async () => {
    Cookies.set('guestSessionId', 'stale');
    post
      .mockRejectedValueOnce(axiosErr(400, STALE))
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ data: { batchJobId: 'b1', status: 'running' } });
    await startGuestStoryAudioBatchService('s1');
    expect(sessionCalls()).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('treats "Invalid session ID format" 400 (corrupt cookie) as stale', async () => {
    Cookies.set('guestSessionId', 'garbage');
    get
      .mockRejectedValueOnce(axiosErr(400, 'Invalid session ID format'))
      .mockResolvedValueOnce(story);
    post.mockResolvedValueOnce(session);
    await expect(getGuestStoryService('s1')).resolves.toEqual(story.data);
    expect(Cookies.get('guestSessionId')).toBe('new-id');
  });

  it('does not retry an unrelated 400 or a 500, and keeps the cookie', async () => {
    Cookies.set('guestSessionId', 'good');
    get.mockRejectedValueOnce(axiosErr(400, 'Bad story id'));
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      status: 400,
    });
    get.mockRejectedValueOnce(axiosErr(500, 'boom'));
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      status: 500,
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(sessionCalls()).toHaveLength(0);
    expect(Cookies.get('guestSessionId')).toBe('good');
  });

  it('does not delete a cookie a concurrent retry already replaced', async () => {
    Cookies.set('guestSessionId', 'stale');
    get.mockImplementationOnce(async () => {
      Cookies.set('guestSessionId', 'replaced-by-other');
      throw axiosErr(401, 'Unauthorized');
    });
    get.mockResolvedValueOnce(story);
    await getGuestStoryService('s1');
    expect(sessionCalls()).toHaveLength(0);
    expect(Cookies.get('guestSessionId')).toBe('replaced-by-other');
  });

  it('exposes a userMessage on thrown errors', async () => {
    post.mockRejectedValue(axiosErr(429, 'Too many requests'));
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      userMessage: "We couldn't start a guest session, try again in a minute",
    });
    get.mockRejectedValueOnce(axiosErr(500, 'boom'));
    Cookies.set('guestSessionId', 'good');
    await expect(getGuestStoryService('s1')).rejects.toMatchObject({
      userMessage: 'Failed to load story',
    });
  });
});
