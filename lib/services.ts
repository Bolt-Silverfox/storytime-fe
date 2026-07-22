import api from '@/lib/axios';
import { AxiosError } from 'axios';
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

// Shape returned by the backend voice endpoints (/voice/available,
// /voice/preferred). `id` is the VoiceType key (e.g. "NIMBUS") and is also the
// value accepted by set-preferred and batch TTS. When no voice is set,
// /voice/preferred returns a placeholder with id === 'default'.
export interface Voice {
  id: string;
  name: string;
  displayName?: string;
  type?: string;
  previewUrl?: string | null;
  voiceAvatar?: string | null;
  elevenLabsVoiceId?: string | null;
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

// Set the parent's avatar to a system avatar (POST /user/me/avatar).
export const updateParentAvatarService = async (avatarId: string) => {
  try {
    const response = await api.post('user/me/avatar', { avatarId });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message: error.response.data?.message || 'Failed to update avatar',
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

// Upload a custom parent avatar (POST /user/me/upload-avatar, multipart `file`).
export const uploadParentAvatarService = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    // Let axios set Content-Type (incl. the multipart boundary) from the
    // FormData — manually setting 'multipart/form-data' drops the boundary and
    // the server can't parse the upload.
    const response = await api.post('user/me/upload-avatar', formData);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message: error.response.data?.message || 'Failed to upload avatar',
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

// Delete the signed-in user's account (DELETE /user/me, soft delete by default).
export const deleteAccountService = async () => {
  try {
    const response = await api.delete('user/me');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message: error.response.data?.message || 'Failed to delete account',
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

// Update the parent's own profile (PATCH /user/me).
export const updateParentProfileService = async (payload: {
  name?: string;
  language?: string;
  country?: string;
  biometricsEnabled?: boolean;
  preferredCategoryIds?: string[];
}) => {
  const response = await api.patch('user/me', payload);
  return response.data;
};

// Update a kid (PUT /auth/kids/:id).
export const updateKidService = async (
  kidId: string,
  payload: {
    name?: string;
    ageRange?: string;
    avatarId?: string;
    preferredVoiceId?: string;
  }
) => {
  const response = await api.put(`auth/kids/${kidId}`, payload);
  return response.data;
};

// Delete a kid (DELETE /auth/kids/:id).
export const deleteKidService = async (kidId: string) => {
  const response = await api.delete(`auth/kids/${kidId}`);
  return response.data;
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

// The user's globally-preferred narration voice (GET /voice/preferred).
// Backend returns a "default" placeholder when none is set; normalize to null.
export const getPreferredVoiceService = async (): Promise<Voice | null> => {
  try {
    const response = await api.get('voice/preferred');
    const data = response.data;
    if (!data || data.id === 'default') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

// GET /voice/access — the backend's voice entitlement for the current user.
// `isPremium` mirrors SubscriptionService.isPremiumUser() (active subscription,
// coupon access, or admin) and is the exact rule used to gate voice switching.
// The route is @OptionalAuth, so guests receive `isPremium: false`. Defaults to
// non-premium on any error so voice switching stays locked unless the server
// explicitly grants it.
export const getVoiceAccessService = async (): Promise<{
  isPremium: boolean;
  // The voice a locked (guest/free) user is restricted to — i.e. the one that
  // actually reads their stories. Null for premium users (who can switch).
  lockedVoiceId: string | null;
  defaultVoice: string | null;
}> => {
  try {
    const response = await api.get('voice/access');
    return {
      isPremium: !!response.data?.isPremium,
      lockedVoiceId: response.data?.lockedVoiceId ?? null,
      defaultVoice: response.data?.defaultVoice ?? null,
    };
  } catch {
    return { isPremium: false, lockedVoiceId: null, defaultVoice: null };
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

// Change the signed-in user's password (POST /auth/change-password).
export const changePasswordService = async (
  oldPassword: string,
  newPassword: string
) => {
  try {
    const response = await api.post('auth/change-password', {
      oldPassword,
      newPassword,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message: error.response.data?.message || 'Failed to change password',
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

export interface NotificationItem {
  id?: string;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  isRead?: boolean;
  read?: boolean;
  createdAt?: string | null;
}

// GET /notifications — the signed-in user's notifications. Returns [] on error.
export const listNotificationsService = async (): Promise<
  NotificationItem[]
> => {
  try {
    const response = await api.get('notifications');
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
  } catch {
    return [];
  }
};

// PATCH /notifications/mark-all-read — mark every notification as read.
export const markAllNotificationsReadService = async () => {
  try {
    const response = await api.patch('notifications/mark-all-read');
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message:
            error.response.data?.message ||
            'Failed to mark notifications as read',
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

export interface NotificationPreference {
  id: string;
  type: string;
  category: string;
  enabled: boolean;
}

// GET /notification-preferences/users/:userId — the user's raw preference
// records. Returns [] on error.
export const getNotificationPreferencesService = async (
  userId: string
): Promise<NotificationPreference[]> => {
  try {
    const response = await api.get(`notification-preferences/users/${userId}`);
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch {
    return [];
  }
};

// PATCH /notification-preferences/:id — toggle a single preference on/off.
export const updateNotificationPreferenceService = async (
  id: string,
  enabled: boolean
) => {
  try {
    const response = await api.patch(`notification-preferences/${id}`, {
      enabled,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message:
            error.response.data?.message ||
            'Failed to update notification preference',
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

// ----- Web push device registration (FCM tokens) -----

// POST /devices/register — register the browser's FCM token so the backend can
// deliver web push notifications. Auth + X-API-Key are added by the axios
// interceptor.
export const registerWebPushTokenService = async (token: string) => {
  try {
    // Backend DTO field is `deviceName` (and it rejects unknown props), so send
    // the user agent under that key.
    const deviceName =
      typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
    const response = await api.post('devices/register', {
      token,
      platform: 'web',
      ...(deviceName ? { deviceName } : {}),
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message: error.response.data?.message || 'Failed to register device',
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

// DELETE /devices — unregister the browser's FCM token.
export const unregisterWebPushTokenService = async (token: string) => {
  try {
    const response = await api.delete('devices', { data: { token } });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response) {
        throw {
          message:
            error.response.data?.message || 'Failed to unregister device',
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
  // The access token cookie expires after ~1h, but the refresh token lasts 7
  // days and the axios interceptor transparently refreshes on the next API
  // call. Treat either token as "still signed in" so the UI (favorites heart,
  // save-to-favorites, etc.) doesn't disappear the moment the access token
  // lapses.
  const accessToken = Cookies.get('accessToken');
  const refreshToken = Cookies.get('refreshToken');
  return !!(user && (accessToken || refreshToken));
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

// ----- Guest reading (public, mirrors the mobile guest flow) -----

export interface GuestSession {
  sessionId: string;
  expiresIn: number;
}

export interface GuestStory {
  id: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  audioUrl?: string | null;
  textContent?: string | null;
  isInteractive?: boolean;
  ageMin?: number | null;
  ageMax?: number | null;
}

export interface StoryListItem {
  id: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
}

// Thrown by the guest reader so callers can detect the quota wall (403).
export interface ServiceError {
  message: string;
  status: number | null;
}

export const createGuestSessionService = async (): Promise<GuestSession> => {
  const response = await api.post('guest/session');
  return response.data;
};

// Reads a story as a guest. Consumes a quota slot for a new story, free for an
// already-read one. Throws { message, status } — status 403 means quota reached.
export const getGuestStoryService = async (
  storyId: string
): Promise<GuestStory> => {
  try {
    const response = await api.get(`guest/stories/${storyId}`);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw {
        message: error.response?.data?.message || 'Failed to load story',
        status: error.response?.status ?? null,
      } satisfies ServiceError;
    }
    throw {
      message: error instanceof Error ? error.message : 'Unexpected error',
      status: null,
    } satisfies ServiceError;
  }
};

// Unified story-read quota for the active audience. Premium/unlimited users
// report `unlimited: true`; free users and guests report how many unique new
// stories they can still read.
export interface StoryQuota {
  isPremium: boolean;
  unlimited: boolean;
  used: number;
  totalAllowed: number;
  remaining: number;
}

interface RawQuota {
  isPremium?: boolean;
  unlimited?: boolean;
  used?: number;
  totalAllowed?: number;
  remaining?: number;
}

const normalizeQuota = (d: RawQuota): StoryQuota => {
  const unlimited = !!(d?.unlimited || d?.isPremium);
  const totalAllowed = Number(d?.totalAllowed ?? 0);
  const used = Number(d?.used ?? 0);
  const remaining = Number(d?.remaining ?? Math.max(0, totalAllowed - used));
  return {
    isPremium: !!d?.isPremium,
    unlimited,
    used,
    totalAllowed,
    remaining,
  };
};

// Fetches the current story-read quota for the active user type:
//  - logged-in: GET stories/user/quota (free-tier lifetime limit + weekly bonus)
//  - guest: GET guest/quota (unique stories per session; needs a guest session)
// Returns null on any error so callers hide the indicator rather than show a
// wrong number (the backend 403 wall remains the hard backstop).
export const getStoryQuotaService = async (): Promise<StoryQuota | null> => {
  try {
    if (isUserLoggedIn()) {
      const { data } = await api.get('stories/user/quota');
      return normalizeQuota(data);
    }
    // Guest: ensure a session exists so the backend can track/read the quota.
    let sessionId = Cookies.get('guestSessionId');
    if (!sessionId) {
      const session = await createGuestSessionService();
      const expiresDays = session.expiresIn ? session.expiresIn / 86400 : 7;
      Cookies.set('guestSessionId', session.sessionId, {
        expires: expiresDays,
      });
      sessionId = session.sessionId;
    }
    const { data } = await api.get('guest/quota');
    return normalizeQuota(data);
  } catch {
    return null;
  }
};

export interface StoryCategory {
  id: string;
  name: string;
  image?: string | null;
  description?: string | null;
  storyCount?: number;
}

// Query flags accepted by GET /stories (mirrors the mobile home carousels).
// `category` matches the category **id**, not its name.
export interface StoryQuery {
  category?: string;
  minAge?: number;
  maxAge?: number;
  isSeasonal?: boolean;
  isMostLiked?: boolean;
  topPicksFromUs?: boolean;
  shuffle?: boolean;
  limit?: number;
}

const buildStoryQuery = (params: StoryQuery = {}): string => {
  const search = new URLSearchParams();
  if (params.category) {
    search.set('category', params.category);
  }
  if (typeof params.minAge === 'number') {
    search.set('minAge', String(params.minAge));
  }
  if (typeof params.maxAge === 'number') {
    search.set('maxAge', String(params.maxAge));
  }
  if (params.isSeasonal) {
    search.set('isSeasonal', 'true');
  }
  if (params.isMostLiked) {
    search.set('isMostLiked', 'true');
  }
  if (params.topPicksFromUs) {
    search.set('topPicksFromUs', 'true');
  }
  if (params.shuffle) {
    search.set('shuffle', 'true');
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  const qs = search.toString();
  return qs ? `stories?${qs}` : 'stories';
};

// Public list of stories for browsing (GET /stories is @OptionalAuth).
// Accepts either a bare category id (legacy) or a full query object.
export const listStoriesService = async (
  params?: string | StoryQuery
): Promise<StoryListItem[]> => {
  try {
    const query: StoryQuery =
      typeof params === 'string' ? { category: params } : (params ?? {});
    const response = await api.get(buildStoryQuery(query));
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    return data?.data ?? data?.stories ?? data?.items ?? [];
  } catch {
    return [];
  }
};

export interface StoriesPage {
  items: StoryListItem[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

// Paginated list of stories for the browse / "View all" infinite scroll.
// Unlike listStoriesService (bare array, used by the home carousels), this
// returns page metadata so useInfiniteQuery can advance the cursor. Do NOT
// pass shuffle here — reordering between pages would duplicate items.
export const listStoriesPageService = async (
  params: StoryQuery & { page?: number } = {}
): Promise<StoriesPage> => {
  try {
    const search = new URLSearchParams();
    if (params.category) {
      search.set('category', params.category);
    }
    if (typeof params.minAge === 'number') {
      search.set('minAge', String(params.minAge));
    }
    if (typeof params.maxAge === 'number') {
      search.set('maxAge', String(params.maxAge));
    }
    if (params.isSeasonal) {
      search.set('isSeasonal', 'true');
    }
    if (params.isMostLiked) {
      search.set('isMostLiked', 'true');
    }
    if (params.topPicksFromUs) {
      search.set('topPicksFromUs', 'true');
    }
    search.set('page', String(params.page ?? 1));
    search.set('limit', String(params.limit ?? 24));
    const response = await api.get(`stories?${search.toString()}`);
    const data = response.data;
    const pagination = data?.pagination;
    return {
      items: data?.data ?? [],
      currentPage: pagination?.currentPage ?? 1,
      totalPages: pagination?.totalPages ?? 1,
      totalCount: pagination?.totalCount ?? 0,
    };
  } catch {
    return { items: [], currentPage: 1, totalPages: 1, totalCount: 0 };
  }
};

// Public list of story categories (GET /stories/categories is @Public).
export const listCategoriesService = async (): Promise<StoryCategory[]> => {
  try {
    const response = await api.get('stories/categories');
    const data = response.data;
    const arr = Array.isArray(data)
      ? data
      : (data?.data ?? data?.categories ?? []);
    return arr
      .map(
        (c: {
          id?: string;
          name?: string;
          image?: string | null;
          imageUrl?: string | null;
          description?: string | null;
          storyCount?: number;
        }) => ({
          id: c.id ?? c.name ?? '',
          name: c.name ?? '',
          image: c.image ?? c.imageUrl ?? null,
          description: c.description ?? null,
          storyCount: c.storyCount,
        })
      )
      .filter((c: StoryCategory) => c.name);
  } catch {
    return [];
  }
};

// ----- Story progress / library (auth-only, user-level — no kid, mirrors the
// mobile "ongoing" / "completed" library) -----

// Record reading progress for the signed-in user. `progress` is 0-100;
// `completed: true` marks the story done (adds it to the completed library).
export const recordUserProgressService = async (
  storyId: string,
  progress: number,
  completed?: boolean
) => {
  const response = await api.post('stories/user/progress', {
    storyId,
    progress,
    ...(completed !== undefined ? { completed } : {}),
  });
  return response.data;
};

// GET /stories/user/library/continue-reading — the user's ongoing stories.
// (The backend route is `continue-reading`, not `in-progress`.)
export const getInProgressStoriesService = async (): Promise<
  StoryListItem[]
> => {
  try {
    const response = await api.get('stories/user/library/continue-reading');
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? data?.stories ?? []);
  } catch {
    return [];
  }
};

// GET /stories/user/library/completed — the user's completed stories.
export const getCompletedStoriesService = async (): Promise<
  StoryListItem[]
> => {
  try {
    const response = await api.get('stories/user/library/completed');
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? data?.stories ?? []);
  } catch {
    return [];
  }
};

// Contact / feedback form (public — POST /help-support/feedback).
export const submitFeedbackService = async (payload: {
  fullname: string;
  email: string;
  category: string;
  message: string;
}) => {
  const response = await api.post('help-support/feedback', payload);
  return response.data;
};

// ----- Parent favorites (auth-only, flat/parent-level — mirrors mobile) -----

export interface FavoriteStory {
  id: string;
  storyId: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  ageRange?: string | null;
  durationSeconds?: number | null;
}

// GET /parent-favorites — the authenticated parent's favorited stories.
export const listFavoritesService = async (): Promise<FavoriteStory[]> => {
  try {
    const response = await api.get('parent-favorites');
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    return data?.data ?? data?.items ?? [];
  } catch {
    return [];
  }
};

// POST /parent-favorites { storyId }
export const addFavoriteService = async (storyId: string) => {
  const response = await api.post('parent-favorites', { storyId });
  return response.data;
};

// DELETE /parent-favorites/:storyId
export const removeFavoriteService = async (storyId: string) => {
  const response = await api.delete(`parent-favorites/${storyId}`);
  return response.data;
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
  // The paragraph text for this clip, used to render a read-along highlight
  // that stays in sync with the audio.
  text?: string;
}

export interface StoryAudioBatch {
  // e.g. 'queued' | 'processing' | 'completed' | 'partial' | 'failed'
  status: string;
  completedParagraphs: StoryAudioParagraph[];
  // Every paragraph (with `text`), regardless of whether its audio is ready.
  // Only the POST response carries text; the status endpoint drops it, so the
  // reader captures this from the initial POST for the read-along highlight.
  allParagraphs: StoryAudioParagraph[];
  // Indices of paragraphs whose TTS generation failed (from the status
  // endpoint's `failedParagraphs`). These need a retry, not a loading spinner.
  failedParagraphs: number[];
  // How many paragraphs are still generating in the background (0 when done).
  pendingParagraphs: number;
  totalQueued?: number;
  // Present when there is more audio still generating in the background.
  batchJobId?: string;
}

interface RawAudioParagraph {
  index?: number;
  audioUrl?: string | null;
  text?: string;
}

interface RawAudioBatch {
  status?: string;
  // The POST /voice/story/audio/batch response uses `paragraphs`; the
  // GET .../status/:jobId response uses `completedParagraphs`.
  paragraphs?: RawAudioParagraph[];
  completedParagraphs?: RawAudioParagraph[];
  failedParagraphs?: number[];
  pendingParagraphs?: number;
  totalParagraphs?: number;
  totalQueued?: number;
  batchJobId?: string;
}

// The two audio endpoints return different shapes; unify them here.
// A paragraph counts as playable only once its `audioUrl` is populated.
const normalizeAudioBatch = (raw: unknown): StoryAudioBatch => {
  const data = (raw ?? {}) as RawAudioBatch;
  const source = Array.isArray(data.completedParagraphs)
    ? data.completedParagraphs
    : Array.isArray(data.paragraphs)
      ? data.paragraphs
      : [];
  const completedParagraphs: StoryAudioParagraph[] = source
    .filter(
      (p): p is { index: number; audioUrl: string; text?: string } =>
        typeof p?.index === 'number' && !!p?.audioUrl
    )
    .map((p) => ({ index: p.index, audioUrl: p.audioUrl, text: p.text }));

  // Full paragraph list (with text) from the POST `paragraphs` field, even
  // paragraphs whose audio isn't ready yet.
  const allSource = Array.isArray(data.paragraphs)
    ? data.paragraphs
    : Array.isArray(data.completedParagraphs)
      ? data.completedParagraphs
      : [];
  const allParagraphs: StoryAudioParagraph[] = allSource
    .filter(
      (p): p is RawAudioParagraph & { index: number } =>
        typeof p?.index === 'number'
    )
    .map((p) => ({ index: p.index, audioUrl: p.audioUrl ?? '', text: p.text }));

  const pendingParagraphs =
    typeof data.pendingParagraphs === 'number' ? data.pendingParagraphs : 0;

  // The POST response omits `status`; infer it from the pending count so the
  // reader knows whether to keep polling the batch job.
  let status = data.status;
  if (!status) {
    status = pendingParagraphs > 0 ? 'processing' : 'completed';
  }

  const failedParagraphs = Array.isArray(data.failedParagraphs)
    ? data.failedParagraphs.filter((n): n is number => typeof n === 'number')
    : [];

  return {
    status,
    completedParagraphs,
    allParagraphs,
    failedParagraphs,
    pendingParagraphs,
    totalQueued: data.totalQueued ?? data.totalParagraphs,
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
