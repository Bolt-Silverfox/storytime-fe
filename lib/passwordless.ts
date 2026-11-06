import type { PasswordlessSignInResult } from '@/lib/services';

const UNAVAILABLE_KEY = 'passwordlessUnavailable';
const SETUP_STATUSES = ['account_created', 'email_verified', 'profile_setup'];

export const SIGN_IN_ROUTE = '/dashboard';
export const SETUP_ROUTE = '/register/setup';
export const NEW_USER_NOTICE = 'Welcome! Finish setting up your account';

export const markPasswordlessUnavailable = () => {
  try {
    sessionStorage.setItem(UNAVAILABLE_KEY, '1');
  } catch {
    return;
  }
};

export const isPasswordlessUnavailable = () => {
  try {
    return sessionStorage.getItem(UNAVAILABLE_KEY) === '1';
  } catch {
    return false;
  }
};

export const needsAccountSetup = (result: PasswordlessSignInResult) =>
  result.isNewUser === true ||
  SETUP_STATUSES.includes(result.user?.onboardingStatus ?? '');

export type PasswordlessFailure =
  | 'invalid'
  | 'rateLimited'
  | 'network'
  | 'unavailable'
  | 'other';

export const classifyPasswordlessError = (
  error: unknown
): PasswordlessFailure => {
  const status = (error as { status?: number | null } | null)?.status;
  if (status === 400) {
    return 'invalid';
  }
  if (status === 429) {
    return 'rateLimited';
  }
  if (status === 404) {
    return 'unavailable';
  }
  if (status === null || status === undefined) {
    return 'network';
  }
  return 'other';
};

export const FAILURE_MESSAGES: Record<PasswordlessFailure, string> = {
  invalid: "That code didn't work.",
  rateLimited: 'Too many attempts. Please wait a minute and try again.',
  network: "We couldn't reach Storytime. Check your connection and try again.",
  unavailable:
    "Email codes aren't available right now. Please sign in with your password.",
  other: 'Something went wrong. Please try again.',
};
