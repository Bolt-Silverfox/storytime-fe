const KEY = 'storytime.resetSession';

export type ResetSession = { token: string; email: string };

export function saveResetSession(session: ResetSession): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
}

export function readResetSession(): ResetSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ResetSession).token === 'string' &&
      typeof (parsed as ResetSession).email === 'string'
    ) {
      const { token, email } = parsed as ResetSession;
      return { token, email };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearResetSession(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {}
}
