'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AUTH_PENDING, useAuthState } from '@/lib/use-auth-state';
import { cn } from '@/lib/utils';

type Props = {
  /** Guest destination (e.g. /register). */
  href: string;
  className?: string;
  children: ReactNode;
  /** Replacement label for signed-in users. Omit to keep the same label. */
  signedInChildren?: ReactNode;
  signedInHref?: string;
};

/**
 * Marketing CTA that never sends a signed-in visitor through /register or
 * /login. Same-label CTAs just swap the href; relabelled CTAs stay invisible
 * (keeping their size) until auth state is known, so there is no flash.
 */
export function AuthLink({
  href,
  className,
  children,
  signedInChildren,
  signedInHref = '/dashboard',
}: Props) {
  const auth = useAuthState();
  const relabel = signedInChildren !== undefined;
  const hide = relabel && auth === 'unknown';
  return (
    <Link
      href={auth === 'in' ? signedInHref : href}
      className={cn(className, hide && AUTH_PENDING)}
    >
      {auth === 'in' && relabel ? signedInChildren : children}
    </Link>
  );
}

/** Without JS auth state never resolves; show the guest links instead of
 * leaving them hidden forever. */
export function NoScriptAuthStyle() {
  return (
    <noscript>
      <style>{'.auth-pending{visibility:visible!important}'}</style>
    </noscript>
  );
}
