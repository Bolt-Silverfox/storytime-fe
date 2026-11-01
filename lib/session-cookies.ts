import Cookies from 'js-cookie';
import { hasUsableSession } from '@/lib/session';

// Client-side session check shared by isUserLoggedIn, useAuthState, the axios
// interceptor and the guest/auth decision. Lives apart from services.ts so
// axios.ts can use it without an import cycle.
//
// A dead session (access token present but expired/unreadable, no refresh
// token) is cleared as a side effect: cookie and stored user. Idempotent.
//
// Caveat: cookies are shared per host, not per port, so other local apps on
// localhost (another dev server on a different port) share this cookie jar;
// an expired accessToken left by one of them is cleared here as well.
export const isSessionActive = (): boolean => {
  const accessToken = Cookies.get('accessToken');
  const refreshToken = Cookies.get('refreshToken');
  if (hasUsableSession({ accessToken, refreshToken })) {
    return true;
  }
  if (accessToken) {
    Cookies.remove('accessToken');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('user');
    }
  }
  return false;
};
