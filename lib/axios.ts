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

const api = axios.create({
  baseURL:
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/` ||
    'https://dev.api.storytime.it.com/api/v1/',
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
  (response) => response,
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
        // Blue's POST /auth/refresh takes { token } (RefreshTokenDto) and
        // returns { user, jwt } — it does NOT issue a new refresh token, so the
        // existing refreshToken cookie is preserved as-is.
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
          { token: refreshToken }
        );

        const newAccessToken = data.jwt;

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
