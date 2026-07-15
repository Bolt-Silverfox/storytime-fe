import api from '@/lib/axios';
import { AxiosError } from 'axios';
import Cookies from 'js-cookie';

interface RegisterPayload {
  email: string;
  password: string;
  title: string;
  fullName: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface KidsPayload {
  name: string;
  ageRange: string;
  // Backend avatar id (from the avatar module). The old avatar/avatarUrl fields
  // are not whitelisted by CreateKidDto and are stripped before sending.
  avatarId?: string;
  avatar?: string;
  avatarUrl?: string;
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
  state: Record<string, unknown>;
  verification_failures: unknown[];
  verification_attempts_count: number;
  manual_verification_requested: boolean;
  language: string | null;
  progress: Record<string, unknown>;
  message: Record<string, unknown>;
  dataset_duration_seconds: number | null;
  verification_attempts: unknown;
  slice_ids: unknown;
  manual_verification: unknown;
  max_verification_attempts: number | null;
  next_max_verification_attempts_reset_unix_ms: number | null;
}

interface VoiceVerification {
  requires_verification: boolean;
  is_verified: boolean;
  verification_failures: unknown[];
  verification_attempts_count: number;
  language: string | null;
  verification_attempts: unknown;
}

interface Voice {
  voice_id: string;
  name: string;
  samples: unknown;
  category: string;
  fine_tuning: VoiceFineTuning;
  labels: VoiceLabels;
  description: string | null;
  preview_url: string;
  available_for_tiers: unknown[];
  settings: unknown;
  sharing: unknown;
  high_quality_base_model_ids: string[];
  verified_languages: unknown[];
  safety_control: unknown;
  voice_verification: VoiceVerification;
  permission_on_resource: unknown;
  is_owner: boolean;
  is_legacy: boolean;
  is_mixed: boolean;
  created_at_unix: number | null;
}

const setTokens = (jwt: string, refreshToken: string, userData?: unknown) => {
  Cookies.set('accessToken', jwt, { expires: 1 / 24 });
  Cookies.set('refreshToken', refreshToken, { expires: 7 });

  // Store user data in local storage if provided
  if (userData) {
    localStorage.setItem('user', JSON.stringify(userData));
  }
};

export const registerService = async (payload: RegisterPayload) => {
  try {
    const response = await api.post('auth/register', payload);
    const { jwt, refreshToken, user } = response.data;
    setTokens(jwt, refreshToken, user);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const loginService = async (payload: LoginPayload) => {
  try {
    const response = await api.post('auth/login', payload);
    const { jwt, refreshToken, user } = response.data;
    setTokens(jwt, refreshToken, user);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const verifyEmailService = async (token: string) => {
  try {
    const response = await api.post('auth/verify-email', { token });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const sendVerificationEmailService = async (email: string) => {
  try {
    const response = await api.post('auth/send-verification', { email });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const requestPasswordResetService = async (email: string) => {
  try {
    const response = await api.post('auth/request-password-reset', { email });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
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
    const response = await api.post('auth/validate-reset-token', {
      token,
      email,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
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
    const response = await api.post('auth/reset-password', {
      token,
      email,
      newPassword,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export interface SystemAvatar {
  id: string;
  name?: string | null;
  displayName?: string | null;
  url: string;
}

// Public list of selectable system avatars (GET /avatars/system).
export const getSystemAvatarsService = async (): Promise<SystemAvatar[]> => {
  try {
    const response = await api.get('avatars/system');
    return Array.isArray(response.data) ? response.data : [];
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch avatars',
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const addKidsService = async (kids: KidsPayload[]) => {
  try {
    // CreateKidDto only whitelists name/ageRange/avatarId (forbidNonWhitelisted
    // rejects avatar/avatarUrl). Strip to the accepted fields.
    const payload = kids.map(({ name, ageRange, avatarId }) => ({
      name,
      ageRange,
      ...(avatarId ? { avatarId } : {}),
    }));
    const response = await api.post('auth/kids', payload);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getKidsService = async () => {
  try {
    const response = await api.get('auth/kids');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getAvailableVoicesService = async (): Promise<Voice[]> => {
  try {
    const response = await api.get('voice/available');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const setPreferredVoiceService = async (voiceId: string) => {
  try {
    const response = await api.patch('voice/preferred', {
      voiceId: voiceId,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

// Utility functions for managing user data in local storage
export const getUserFromStorage = (): User | null => {
  try {
    const userData =
      typeof window !== 'undefined' ? localStorage.getItem('user') : null;
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
    const response = await api.get(`stories?kidId=${kidId}`);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getStoryCategoriesService = async () => {
  try {
    const response = await api.get('stories/categories');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getStoryThemesService = async () => {
  try {
    const response = await api.get('stories/themes');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message:
            error.response.data?.message || 'Failed to fetch story themes',
          status: error.response.status,
          data: error.response.data,
        };
      }
      if (error.request) {
        throw { message: 'No response from server', status: null };
      }
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getStoryByIdService = async (storyId: string) => {
  try {
    const response = await api.get(`stories/${storyId}`);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getDailyChallengesService = async (kidId: string) => {
  try {
    const response = await api.get(`stories/daily-challenge/kid/${kidId}`);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const getStoriesByThemeAndKidService = async (
  theme: string,
  kidId: string
) => {
  try {
    const response = await api.get(
      `stories?theme=${encodeURIComponent(theme)}&kidId=${kidId}`
    );
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

export const setKidPreferredVoiceService = async (
  kidId: string,
  preferredVoiceId: string
) => {
  try {
    // Kid voice preference is updated via the kid-update endpoint.
    const response = await api.put(`auth/kids/${kidId}`, {
      preferredVoiceId,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
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
  audioUrl: string;
}

export interface StoryAudioBatch {
  // e.g. 'queued' | 'processing' | 'completed' | 'partial' | 'failed'
  status: string;
  completedParagraphs: StoryAudioParagraph[];
  totalQueued?: number;
  // Present when there is more audio still generating in the background.
  batchJobId?: string;
}

const normalizeAudioBatch = (raw: unknown): StoryAudioBatch => {
  const data = (raw ?? {}) as Partial<StoryAudioBatch>;
  return {
    status: data.status ?? 'unknown',
    completedParagraphs: Array.isArray(data.completedParagraphs)
      ? data.completedParagraphs
      : [],
    totalQueued: data.totalQueued,
    batchJobId: data.batchJobId,
  };
};

// Kick off background TTS for a whole story. Returns any paragraphs that were
// generated eagerly plus a batchJobId to poll for the rest.
export const startStoryAudioBatchService = async (
  storyId: string,
  voiceId?: string
): Promise<StoryAudioBatch> => {
  try {
    const response = await api.post('voice/story/audio/batch', {
      storyId,
      ...(voiceId ? { voiceId } : {}),
    });
    return normalizeAudioBatch(response.data);
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response) {
      throw {
        message: error.response.data?.message || 'Failed to start story audio',
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};

// Poll a running batch for newly completed paragraphs.
export const getStoryAudioBatchStatusService = async (
  batchJobId: string
): Promise<StoryAudioBatch> => {
  try {
    const response = await api.get(
      `voice/story/audio/batch/status/${batchJobId}`
    );
    return normalizeAudioBatch(response.data);
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response) {
      throw {
        message: error.response.data?.message || 'Failed to fetch audio status',
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    };
  }
};
