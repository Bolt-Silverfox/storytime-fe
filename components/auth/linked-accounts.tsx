'use client';

import {
  type LinkedAccount,
  getLinkedAccountsService,
  linkAppleService,
  linkGoogleService,
  unlinkProviderService,
} from '@/lib/services';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// window.google / window.AppleID and their types are declared globally in
// components/auth/oauth-buttons.tsx — reused here for account linking.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const APPLE_SERVICE_ID = process.env.NEXT_PUBLIC_APPLE_SERVICE_ID;
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

const GoogleGlyph = () => (
  <svg width='20' height='20' viewBox='0 0 48 48' aria-hidden='true'>
    <path
      fill='#EA4335'
      d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'
    />
    <path
      fill='#4285F4'
      d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'
    />
    <path
      fill='#FBBC05'
      d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'
    />
    <path
      fill='#34A853'
      d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'
    />
  </svg>
);

const AppleGlyph = () => (
  <svg
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='currentColor'
    aria-hidden='true'
  >
    <path d='M17.05 12.53c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.68 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.18-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.69.71 2.85.69 1.18-.02 1.92-1.08 2.64-2.15.83-1.23 1.17-2.42 1.19-2.48-.03-.01-2.28-.87-2.3-3.49zM14.88 5.9c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.55.64-1.04 1.68-.91 2.67.97.08 1.96-.49 2.55-1.22z' />
  </svg>
);

const Row = ({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) => (
  <div className='flex items-center justify-between gap-4 py-4'>
    <div className='flex min-w-0 items-center gap-3'>
      <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-50 text-[#221D1D]'>
        {icon}
      </span>
      <div className='min-w-0'>
        <p className='truncate font-abeezee text-base text-[#221D1D]'>
          {title}
        </p>
        <p className='truncate font-abeezee text-sm text-[#4A413F]'>
          {subtitle}
        </p>
      </div>
    </div>
    <div className='shrink-0'>{action}</div>
  </div>
);

export const LinkedAccounts = () => {
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setAccounts(await getLinkedAccountsService());
    } catch {
      // Fail soft — the section just shows nothing linked rather than blocking
      // the whole security page.
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const linked = new Set((accounts ?? []).map((a) => a.provider));
  const linkedCount = accounts?.length ?? 0;
  const isLastMethod = linkedCount <= 1;
  const googleLinked = linked.has('google');
  const appleLinked = linked.has('apple');
  const emailAccount = accounts?.find((a) => a.provider === 'email');
  const googleEmail = accounts?.find((a) => a.provider === 'google')?.email;
  const appleEmail = accounts?.find((a) => a.provider === 'apple')?.email;

  const onGoogleCredential = useCallback(
    async (res: { credential?: string }) => {
      if (!res.credential) {
        return;
      }
      setBusy('google');
      try {
        await linkGoogleService(res.credential);
        toast.success('Google account linked');
        await refresh();
      } catch (err) {
        toast.error('Could not link Google', {
          description: (err as { message?: string })?.message,
        });
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );
  // Render the official Google button into the row while Google isn't linked.
  // onGoogleCredential is stable (depends only on the stable `refresh`), so
  // passing it directly keeps the effect pure — no ref-mutation-in-render.
  // googleReady is a re-trigger only (body reads window.google directly).
  // biome-ignore lint/correctness/useExhaustiveDependencies: googleReady re-triggers render after the GSI script loads
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleLinked) {
      return;
    }
    const gsi = window.google?.accounts?.id;
    if (!(gsi && googleBtnRef.current)) {
      return;
    }
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      auto_select: false,
    });
    googleBtnRef.current.replaceChildren();
    gsi.renderButton(googleBtnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 200,
    });
  }, [googleReady, googleLinked, loading, onGoogleCredential]);

  const linkApple = useCallback(async () => {
    if (!(APPLE_SERVICE_ID && APPLE_REDIRECT_URI && appleReady)) {
      return;
    }
    setBusy('apple');
    try {
      window.AppleID?.auth.init({
        clientId: APPLE_SERVICE_ID,
        scope: 'name email',
        redirectURI: APPLE_REDIRECT_URI,
        usePopup: true,
      });
      const data = await window.AppleID?.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) {
        throw { message: 'No identity token returned from Apple.' };
      }
      await linkAppleService(idToken);
      toast.success('Apple account linked');
      await refresh();
    } catch (err) {
      const code = (err as { error?: string })?.error;
      if (
        code === 'popup_closed_by_user' ||
        code === 'user_cancelled_authorize'
      ) {
        setBusy(null);
        return;
      }
      toast.error('Could not link Apple', {
        description: (err as { message?: string })?.message,
      });
    } finally {
      setBusy(null);
    }
  }, [appleReady, refresh]);

  const unlink = useCallback(
    async (provider: 'google' | 'apple') => {
      if (isLastMethod) {
        toast.error('Keep at least one sign-in method', {
          description: 'Add another method before removing this one.',
        });
        return;
      }
      setBusy(provider);
      try {
        await unlinkProviderService(provider);
        toast.success(
          `${provider === 'google' ? 'Google' : 'Apple'} account unlinked`
        );
        await refresh();
      } catch (err) {
        toast.error('Could not unlink', {
          description: (err as { message?: string })?.message,
        });
      } finally {
        setBusy(null);
      }
    },
    [isLastMethod, refresh]
  );

  const unlinkBtn = (provider: 'google' | 'apple') => (
    <button
      type='button'
      onClick={() => unlink(provider)}
      disabled={busy !== null || isLastMethod}
      title={
        isLastMethod ? 'You must keep at least one sign-in method' : undefined
      }
      className='rounded-full border border-stone-200 px-5 py-2 font-abeezee text-sm text-[#221D1D] transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'
    >
      {busy === provider ? 'Removing…' : 'Unlink'}
    </button>
  );

  return (
    <section className='mt-10 max-w-md'>
      {GOOGLE_CLIENT_ID && (
        <Script
          src={GSI_SRC}
          strategy='afterInteractive'
          onReady={() => setGoogleReady(true)}
        />
      )}
      {APPLE_SERVICE_ID && (
        <Script
          src={APPLE_SRC}
          strategy='afterInteractive'
          onReady={() => setAppleReady(true)}
        />
      )}

      <h2 className='mb-1 font-qilka text-2xl font-bold leading-7 text-[#221D1D]'>
        Linked accounts
      </h2>
      <p className='mb-2 font-abeezee text-sm text-[#4A413F]'>
        Connect Google or Apple to sign in faster. You must keep at least one
        sign-in method.
      </p>

      {loading ? (
        <div className='space-y-3 py-4'>
          <div className='h-12 animate-pulse rounded-2xl bg-stone-100' />
          <div className='h-12 animate-pulse rounded-2xl bg-stone-100' />
        </div>
      ) : (
        <div className='divide-y divide-stone-100'>
          {emailAccount && (
            <Row
              icon={<span className='text-lg'>✉️</span>}
              title='Email & password'
              subtitle={emailAccount.email ?? 'Connected'}
              action={
                <span className='font-abeezee text-sm text-[#4A413F]'>
                  Primary
                </span>
              }
            />
          )}

          {GOOGLE_CLIENT_ID && (
            <Row
              icon={<GoogleGlyph />}
              title='Google'
              subtitle={
                googleLinked ? (googleEmail ?? 'Connected') : 'Not connected'
              }
              action={
                googleLinked ? (
                  unlinkBtn('google')
                ) : (
                  <div
                    ref={googleBtnRef}
                    className={
                      busy !== null ? 'pointer-events-none opacity-60' : ''
                    }
                  />
                )
              }
            />
          )}

          {APPLE_SERVICE_ID && (
            <Row
              icon={<AppleGlyph />}
              title='Apple'
              subtitle={
                appleLinked ? (appleEmail ?? 'Connected') : 'Not connected'
              }
              action={
                appleLinked ? (
                  unlinkBtn('apple')
                ) : (
                  <button
                    type='button'
                    onClick={linkApple}
                    disabled={
                      busy !== null || !appleReady || !APPLE_REDIRECT_URI
                    }
                    className='flex items-center gap-2 rounded-full bg-black px-5 py-2 font-abeezee text-sm text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    {busy === 'apple' ? 'Linking…' : 'Continue with Apple'}
                  </button>
                )
              }
            />
          )}
        </div>
      )}
    </section>
  );
};
