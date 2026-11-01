// Pure session helpers (no cookie access, safe for the edge middleware).
//
// "Signed in" means: a usable (unexpired) access token, OR a refresh token
// (the axios interceptor refreshes an expired access token transparently).
// An expired access token with no refresh token is a dead session: signed out.

// Treat tokens expiring within this window as expired (client/server clock skew).
export const CLOCK_SKEW_MS = 30_000;

const decodePayload = (token: string): Record<string, unknown> | null => {
  try {
    const part = token.split('.')[1];
    if (!part) {
      return null;
    }
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
};

// Expiry in epoch ms from the `exp` (JWT standard) or `expiry` claim; seconds
// or ms numbers and date strings are accepted. null when absent/unreadable.
const expiryMs = (payload: Record<string, unknown>): number | null => {
  const raw = payload.exp ?? payload.expiry;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string') {
    const asNumber = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(asNumber)) {
      return asNumber < 1e12 ? asNumber * 1000 : asNumber;
    }
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

// A token is usable if it decodes and has not expired. Malformed tokens, or
// ones with no readable expiry, are unusable (treated as no session).
export const isAccessTokenUsable = (
  token: string | undefined | null,
  now: number = Date.now()
): boolean => {
  if (!token) {
    return false;
  }
  const payload = decodePayload(token);
  if (!payload) {
    return false;
  }
  const exp = expiryMs(payload);
  return exp !== null && exp - CLOCK_SKEW_MS > now;
};

export const hasUsableSession = (
  tokens: { accessToken?: string | null; refreshToken?: string | null },
  now: number = Date.now()
): boolean =>
  !!tokens.refreshToken || isAccessTokenUsable(tokens.accessToken, now);
