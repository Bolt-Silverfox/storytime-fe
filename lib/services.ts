import api from '@/lib/axios';
import Cookies from 'js-cookie';

interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

// Mirrors blue's CreateKidDto. Blue's ValidationPipe is `forbidNonWhitelisted`,
// so ANY extra property (e.g. `avatar`, `avatarUrl`) causes a 400. Callers may
// pass richer objects; `addKidsService` maps them down to only these fields.
interface KidsPayload {
  name: string;
  ageRange: string;
  avatarId?: string;
  preferredCategoryIds?: string[];
}

// The shape web callers currently build (setup wizard, kid-picker) — avatar is a
// local asset path / blob URL / display value, not a backend avatar id.
interface KidInput {
  name: string;
  ageRange: string;
  avatarId?: string;
  // Non-whitelisted display-only values that MUST be stripped before sending.
  avatar?: string;
  avatarUrl?: string;
  preferredCategoryIds?: string[];
}

interface UserProfile {
  id: string;
  explicitContent: boolean;
  maxScreenTimeMins: number | null;
  language: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  profile: UserProfile;
}

interface VoiceLabels {
  accent: string;
  description: string;
  age: string;
  gender: string;
  use_case: string;
}

interface VoiceFineTuning {
  is_allowed_to_fine_tune: boolean;
  state: Record<string, any>;
  verification_failures: any[];
  verification_attempts_count: number;
  manual_verification_requested: boolean;
  language: string | null;
  progress: Record<string, any>;
  message: Record<string, any>;
  dataset_duration_seconds: number | null;
  verification_attempts: any;
  slice_ids: any;
  manual_verification: any;
  max_verification_attempts: number | null;
  next_max_verification_attempts_reset_unix_ms: number | null;
}

interface VoiceVerification {
  requires_verification: boolean;
  is_verified: boolean;
  verification_failures: any[];
  verification_attempts_count: number;
  language: string | null;
  verification_attempts: any;
}

interface Voice {
  voice_id: string;
  name: string;
  samples: any;
  category: string;
  fine_tuning: VoiceFineTuning;
  labels: VoiceLabels;
  description: string | null;
  preview_url: string;
  available_for_tiers: any[];
  settings: any;
  sharing: any;
  high_quality_base_model_ids: string[];
  verified_languages: any[];
  safety_control: any;
  voice_verification: VoiceVerification;
  permission_on_resource: any;
  is_owner: boolean;
  is_legacy: boolean;
  is_mixed: boolean;
  created_at_unix: number | null;
}

const setTokens = (jwt: string, refreshToken: string, userData?: any) => {
  Cookies.set('accessToken', jwt, { expires: 1 / 24 });
  Cookies.set('refreshToken', refreshToken, { expires: 7 });

  // Store user data in local storage if provided
  if (userData) {
    localStorage.setItem('user', JSON.stringify(userData));
  }
};

export const registerService = async (payload: RegisterPayload) => {
  try {
    const response = await api.post('/auth/register', payload);
    const { jwt, refreshToken, user } = response.data;
    setTokens(jwt, refreshToken, user);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Registration failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }

    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const loginService = async (payload: LoginPayload) => {
  try {
    const response = await api.post('/auth/login', payload);
    const { jwt, refreshToken, user } = response.data;
    setTokens(jwt, refreshToken, user);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Login failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const verifyEmailService = async (token: string) => {
  try {
    const response = await api.post('/auth/verify-email', { token });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Verification failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const sendVerificationEmailService = async (email: string) => {
  try {
    const response = await api.post('/auth/send-verification', { email });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to send verification email',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const requestPasswordResetService = async (email: string) => {
  try {
    const response = await api.post('/auth/request-password-reset', { email });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to request password reset',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const validateResetTokenService = async ({
  token,
  email,
}: {
  token: string;
  email: string;
}) => {
  try {
    const response = await api.post('/auth/validate-reset-token', {
      token,
      email,
    });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Reset token validation failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const resetPasswordService = async ({
  token,
  email,
  newPassword,
}: {
  token: string;
  email: string;
  newPassword: string;
}) => {
  try {
    // Blue's ResetPasswordDto = { token, email, newPassword } — all required.
    const response = await api.post('/auth/reset-password', {
      token,
      email,
      newPassword,
    });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to reset password',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const addKidsService = async (kids: KidInput[]) => {
  try {
    // Whitelist to blue's CreateKidDto fields only. `avatar`/`avatarUrl` in the
    // web flows are local asset paths or blob URLs (not backend avatar ids), so
    // they are dropped entirely — only a genuine `avatarId` is forwarded.
    const payload: KidsPayload[] = kids.map((kid) => {
      const mapped: KidsPayload = {
        name: kid.name,
        ageRange: kid.ageRange,
      };
      if (kid.avatarId) {
        mapped.avatarId = kid.avatarId;
      }
      if (kid.preferredCategoryIds?.length) {
        mapped.preferredCategoryIds = kid.preferredCategoryIds;
      }
      return mapped;
    });

    const response = await api.post('/auth/kids', payload);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to add kids',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getKidsService = async () => {
  try {
    const response = await api.get('/auth/kids');
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch kids',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getAvailableVoicesService = async (): Promise<Voice[]> => {
  try {
    const response = await api.get('/voice/available');
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to fetch available voices',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const setPreferredVoiceService = async (voiceId: string) => {
  try {
    const response = await api.patch('/voice/preferred', {
      voiceId: voiceId,
    });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to set preferred voice',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

// Utility functions for managing user data in local storage
export const getUserFromStorage = (): User | null => {
  try {
    const userData =
      typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error parsing user data from localStorage:', error);
    return null;
  }
};

export const clearUserFromStorage = () => {
  localStorage.removeItem('user');
  Cookies.remove('accessToken');
  Cookies.remove('refreshToken');
};

export const isUserLoggedIn = () => {
  const user = getUserFromStorage();
  const accessToken = Cookies.get('accessToken');
  return !!(user && accessToken);
};

export const getStoriesByKidIdService = async (kidId: string) => {
  try {
    const response = await api.get(`/stories?kidId=${kidId}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch stories',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getStoryCategoriesService = async () => {
  try {
    const response = await api.get('/stories/categories');
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to fetch story categories',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getStoryThemesService = async () => {
  try {
    const response = await api.get('/stories/themes');
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch story themes',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getStoryByIdService = async (storyId: string) => {
  try {
    const response = await api.get(`/stories/${storyId}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch story',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getDailyChallengesService = async (kidId: string) => {
  try {
    const response = await api.get(`/stories/daily-challenge/kid/${kidId}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to fetch daily challenges',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getStoriesByThemeAndKidService = async (
  theme: string,
  kidId: string
) => {
  try {
    const response = await api.get(
      `/stories?theme=${encodeURIComponent(theme)}&kidId=${kidId}`
    );
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to fetch stories by theme',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

// Blue exposes no per-kid voice endpoint; preferred voice is user-scoped.
// Repointed from the removed `PATCH /user/kids/:kidId/voice` to
// `PATCH /voice/preferred` (SetPreferredVoiceDto = { voiceId }).
export const setKidPreferredVoiceService = async (voiceId: string) => {
  try {
    const response = await api.patch('/voice/preferred', {
      voiceId,
    });
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to set kid preferred voice',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

// Utility functions for managing mode selection
export const getSelectedModeFromStorage = (): string | null => {
  try {
    return typeof window !== 'undefined'
      ? localStorage.getItem('selectedMode')
      : null;
  } catch (error) {
    console.error('Error getting selected mode from localStorage:', error);
    return null;
  }
};

export const setSelectedModeToStorage = (mode: string) => {
  try {
    localStorage.setItem('selectedMode', mode);
  } catch (error) {
    console.error('Error setting selected mode to localStorage:', error);
  }
};

export const clearSelectedModeFromStorage = () => {
  try {
    localStorage.removeItem('selectedMode');
  } catch (error) {
    console.error('Error clearing selected mode from localStorage:', error);
  }
};

export interface StoryAudioParagraph {
  index: number;
  text?: string;
  audioUrl: string | null;
}

export interface StoryAudioResponse {
  message: string;
  audioUrl: string;
  voiceType: string;
  statusCode: number;
  paragraphs: StoryAudioParagraph[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Blue serves story audio asynchronously only. There is no
 * `GET /stories/story/audio/:id` endpoint anymore.
 *
 * Flow:
 *  1. Enqueue with `POST /voice/story/audio/batch { storyId, voiceId }`. Blue
 *     returns the first few paragraphs EAGERLY (already carrying `audioUrl`),
 *     plus an optional `batchJobId` for the remaining paragraphs generated in
 *     the background.
 *  2. If no eager paragraph has audio yet but a `batchJobId` exists, poll
 *     `GET /voice/story/audio/batch/status/:batchJobId` until a completed
 *     paragraph appears or the batch finishes.
 *
 * The reader plays a single audio element, so we surface the first available
 * paragraph's `audioUrl` while also returning the full paragraph list.
 */
export const getStoryAudioService = async (
  storyId: string,
  voiceId?: string
): Promise<StoryAudioResponse> => {
  try {
    const { data } = await api.post('/voice/story/audio/batch', {
      storyId,
      ...(voiceId ? { voiceId } : {}),
    });

    const paragraphs: StoryAudioParagraph[] = Array.isArray(data.paragraphs)
      ? data.paragraphs
      : [];

    const firstReady = paragraphs.find((p) => !!p.audioUrl);

    // Poll the background batch if the eager response has no audio yet.
    if (!firstReady && data.batchJobId) {
      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await sleep(2000);
        const { data: status } = await api.get(
          `/voice/story/audio/batch/status/${data.batchJobId}`
        );

        const completed: StoryAudioParagraph[] = (
          status.completedParagraphs ?? []
        ).map((p: { index: number; audioUrl: string }) => ({
          index: p.index,
          audioUrl: p.audioUrl,
        }));

        if (completed.length > 0) {
          const ready = [...completed].sort((a, b) => a.index - b.index)[0];
          return {
            message: data.message || 'Story audio ready',
            audioUrl: ready.audioUrl as string,
            voiceType: data.voiceId ?? voiceId ?? '',
            statusCode: 200,
            paragraphs: completed,
          };
        }

        if (status.status === 'completed' || status.status === 'failed') {
          break;
        }
      }
    }

    return {
      message: data.message || 'Story audio',
      audioUrl: firstReady?.audioUrl ?? '',
      voiceType: data.voiceId ?? voiceId ?? '',
      statusCode: data.statusCode ?? 200,
      paragraphs,
    };
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch story audio',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

// ---------------------------------------------------------------------------
// Async, queue-based story generation (blue: POST /stories/generate/async)
// ---------------------------------------------------------------------------

// Mirrors blue's StoryJobStatus enum.
export type StoryJobStatus =
  | 'queued'
  | 'processing'
  | 'generating_content'
  | 'generating_image'
  | 'generating_audio'
  | 'persisting'
  | 'completed'
  | 'failed';

// GenerateStoryDto — every field is optional (blue mirrors the sync defaults).
export interface GenerateStoryPayload {
  kidId?: string;
  kidName?: string;
  themes?: string[];
  categories?: string[];
  seasonIds?: string[];
  ageMin?: number;
  ageMax?: number;
  language?: string;
  additionalContext?: string;
}

export interface EnqueueStoryJobResponse {
  queued: boolean;
  jobId: string;
  estimatedWaitTime?: number;
  error?: string;
}

export interface StoryJobResultData {
  id: string;
  title: string;
  description: string;
  language: string;
  coverImageUrl: string;
  audioUrl: string;
  textContent: string | null;
  ageMin: number;
  ageMax: number;
  // biome-ignore lint/suspicious/noExplicitAny: partial Story shape from blue
  [key: string]: any;
}

export interface StoryJobStatusResponse {
  jobId: string;
  status: StoryJobStatus;
  progress: number;
  progressMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: StoryJobResultData;
  error?: string;
  estimatedTimeRemaining?: number;
}

export interface CancelStoryJobResponse {
  cancelled: boolean;
  reason?: string;
}

export const generateStoryAsyncService = async (
  payload: GenerateStoryPayload
): Promise<EnqueueStoryJobResponse> => {
  try {
    const response = await api.post('/stories/generate/async', payload);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to start story generation',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getStoryJobStatusService = async (
  jobId: string
): Promise<StoryJobStatusResponse> => {
  try {
    const response = await api.get(`/stories/generate/jobs/${jobId}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch job status',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const getStoryJobResultService = async (
  jobId: string
): Promise<
  StoryJobResultData | { jobId: string; ready: false; status: StoryJobStatus }
> => {
  try {
    const response = await api.get(`/stories/generate/jobs/${jobId}/result`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch job result',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const cancelStoryJobService = async (
  jobId: string
): Promise<CancelStoryJobResponse> => {
  try {
    const response = await api.delete(`/stories/generate/jobs/${jobId}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to cancel job',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};
