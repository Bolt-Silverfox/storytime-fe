import Cookies from 'js-cookie';
import { createGuestSessionService } from './services';

const GUEST_COOKIE = 'guestSessionId';

// Ensure a guest session exists (creating one on first use) and return its id.
// The id is stored in a cookie so the axios interceptor forwards it as
// X-Guest-Session-Id, letting the backend track quota/history — same as mobile.
export async function ensureGuestSession(): Promise<string> {
  const existing = Cookies.get(GUEST_COOKIE);
  if (existing) {
    return existing;
  }
  const session = await createGuestSessionService();
  const expiresDays = session.expiresIn ? session.expiresIn / 86400 : 7;
  Cookies.set(GUEST_COOKIE, session.sessionId, { expires: expiresDays });
  return session.sessionId;
}
