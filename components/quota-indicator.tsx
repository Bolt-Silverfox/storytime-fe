'use client';

import { useStoryQuota } from '@/lib/hooks/use-story-quota';
import { isUserLoggedIn } from '@/lib/services';
import Link from 'next/link';

// Subscriptions are only sold in the mobile app, so free users on the web are
// pointed there to upgrade; guests are pointed at sign-up (which raises their
// per-session limit).
const APP_STORE_URL = 'https://apps.apple.com/app/id6756060805';

interface QuotaIndicatorProps {
  // 'banner' — full-width callout for list/browse pages.
  // 'compact' — small inline pill (e.g. near a "Read" button).
  variant?: 'banner' | 'compact';
  className?: string;
}

// Proactively shows guests / free users how many free stories they have left so
// they aren't surprised by the quota wall. Renders nothing for premium /
// unlimited users, while loading, or when the quota can't be determined.
export default function QuotaIndicator({
  variant = 'banner',
  className = '',
}: QuotaIndicatorProps) {
  const { quota } = useStoryQuota();

  if (!quota || quota.unlimited) {
    return null;
  }

  const loggedIn = isUserLoggedIn();
  const { remaining, totalAllowed } = quota;
  const noneLeft = remaining <= 0;

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
          noneLeft
            ? 'bg-[#EC4007]/10 text-[#EC4007]'
            : 'bg-[#4807EC]/10 text-[#4807EC]'
        } ${className}`}
      >
        {noneLeft
          ? 'No free stories left'
          : `${remaining} of ${totalAllowed} free stories left`}
      </span>
    );
  }

  const cta = loggedIn
    ? { href: APP_STORE_URL, label: 'Upgrade in the app', external: true }
    : { href: '/register', label: 'Sign up to read more', external: false };

  const message = noneLeft
    ? loggedIn
      ? "You've read all your free stories. Upgrade to premium in the Storytime app for unlimited access."
      : "You've read all your free stories. Sign up to keep reading more."
    : 'Each new story you open uses one. Re-reading a story is always free.';

  return (
    <div
      className={`flex flex-col items-start gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
        noneLeft
          ? 'border-[#EC4007]/30 bg-[#EC4007]/5'
          : 'border-[#4807EC]/20 bg-[#4807EC]/5'
      } ${className}`}
    >
      <div className='flex items-center gap-3'>
        <span className='text-2xl' aria-hidden>
          {noneLeft ? '🔒' : '📖'}
        </span>
        <div>
          <p className='font-qilka text-base font-bold text-[#221D1D]'>
            {noneLeft
              ? "You've used all your free stories"
              : `${remaining} of ${totalAllowed} free ${
                  totalAllowed === 1 ? 'story' : 'stories'
                } left`}
          </p>
          <p className='font-abeezee text-sm text-[#4A413F]'>{message}</p>
        </div>
      </div>
      {cta.external ? (
        <a
          href={cta.href}
          target='_blank'
          rel='noopener noreferrer'
          className='shrink-0 rounded-full bg-[#EC4007] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90'
        >
          {cta.label}
        </a>
      ) : (
        <Link
          href={cta.href}
          className='shrink-0 rounded-full bg-[#EC4007] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90'
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
