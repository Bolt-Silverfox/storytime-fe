// lib/axios.ts
import axios from 'axios';
import Cookies from 'js-cookie';

let isRefreshing = false;
let failedQueue: {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  resolve: (value?: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  reject: (error: any) => void;
}[] = [];

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const processQueue = (error: any, token: string | null = null) => {
  for (const prom of failedQueue) {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  }

  failedQueue = [];
};

const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL || 'https://dev.api.storytimeapp.me';

const api = axios.create({
  baseURL: `${API_ORIGIN}/api/v1/`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers) {
    // Guest mode: forward the guest session so quota/history are tracked
    // (mirrors the mobile X-Guest-Session-Id header).
    const guestSessionId = Cookies.get('guestSessionId');
    if (guestSessionId) {
      config.headers['X-Guest-Session-Id'] = guestSessionId;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // The backend wraps every success in { statusCode, success, data, message }.
    // Unwrap it here so callers receive the actual payload as response.data.
    const body = response.data;
    if (
      body &&
      typeof body === 'object' &&
      'success' in body &&
      'data' in body
    ) {
      response.data = body.data;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject: (err) => reject(err),
          });
        });
      }

      isRefreshing = true;

      const refreshToken = Cookies.get('refreshToken');

      try {
        // Backend route is POST /auth/refresh with body { token }, and the
        // response is enveloped. It returns a new jwt only (no rotated refresh
        // token), so we keep the existing refreshToken cookie.
        const { data } = await axios.post(`${API_ORIGIN}/api/v1/auth/refresh`, {
          token: refreshToken,
        });

        const newAccessToken = data?.data?.jwt;
        if (!newAccessToken) {
          throw new Error('Refresh response missing jwt');
        }

        Cookies.set('accessToken', newAccessToken, { expires: 1 / 24 });

        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        Cookies.remove('accessToken');
        Cookies.remove('refreshToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
