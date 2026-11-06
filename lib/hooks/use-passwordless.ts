'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type PasswordlessSignInResult,
  passwordlessConsumeService,
  passwordlessRequestService,
  passwordlessVerifyService,
} from '@/lib/services';
import { GUEST_HISTORY_QUERY_KEY } from './use-guest-history';
import { STORY_QUOTA_QUERY_KEY } from './use-story-quota';

const SIGN_IN_INVALIDATED_KEYS = [
  ['user'],
  ['library'],
  STORY_QUOTA_QUERY_KEY,
  GUEST_HISTORY_QUERY_KEY,
] as const;

function useRefreshAfterSignIn() {
  const queryClient = useQueryClient();
  return (_result: PasswordlessSignInResult) => {
    for (const queryKey of SIGN_IN_INVALIDATED_KEYS) {
      queryClient.invalidateQueries({ queryKey });
    }
  };
}

export function usePasswordlessRequest() {
  return useMutation({ mutationFn: passwordlessRequestService });
}

export function usePasswordlessVerify() {
  const refresh = useRefreshAfterSignIn();
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      passwordlessVerifyService(email, code),
    onSuccess: refresh,
  });
}

export function usePasswordlessConsume() {
  const refresh = useRefreshAfterSignIn();
  return useMutation({
    mutationFn: (token: string) => passwordlessConsumeService(token),
    onSuccess: refresh,
  });
}
