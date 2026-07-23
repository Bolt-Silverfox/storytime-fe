'use client';

import { appleLoginService, googleLoginService } from '@/lib/services';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// Public web OAuth config, inlined at build time. Google uses the same web
// client id the mobile app registers (backend verifies the id_token audience
// against GOOGLE_WEB_CLIENT_ID). Apple needs a *Services ID* (not the app
// bundle id) plus a Return URL registered in the Apple Developer console — when
// that env is absent the Apple button simply doesn't render, so Google can ship
// on its own.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const APPLE_SERVICE_ID = process.env.NEXT_PUBLIC_APPLE_SERVICE_ID;
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

// Minimal shapes for the two first-party SDKs we load via <Script>.
interface GoogleCredentialResponse {
  credential?: string;
}
interface AppleAuthResponse {
  authorization?: { id_token?: string; code?: string };
  user?: { name?: { firstName?: string; lastName?: string } };
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: GoogleCredentialResponse) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<AppleAuthResponse>;
      };
    };
  }
}

interface OAuthButtonsProps {
  mode?: 'login' | 'register';
  /** Where to send the user after a successful sign-in. */
  redirectTo?: string;
}

// The backend returns 409 ACCOUNT_EXISTS_LINK_REQUIRED when the email already
// belongs to a password (or other-provider) account. We can't silently merge,
// so steer the user to the flow that works for them.
const handleAuthError = (
  err: unknown,
  provider: 'Google' | 'Apple',
  router: ReturnType<typeof useRouter>
) => {
  const e = err as { code?: string; status?: number; message?: string };
  if (e?.code === 'ACCOUNT_EXISTS_LINK_REQUIRED' || e?.status === 409) {
    toast.error('This email already has an account', {
      description: `Log in with your email and password, then link ${provider} from your security settings.`,
      action: {
        label: 'Go to login',
        onClick: () => router.push('/login'),
      },
    });
    return;
  }
  toast.error(`${provider} sign-in failed`, {
    description: e?.message || 'Please try again.',
  });
};

export const OAuthButtons = ({
  mode = 'login',
  redirectTo = '/dashboard',
}: OAuthButtonsProps) => {
  const router = useRouter();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<null | 'google' | 'apple'>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);

  const appleConfigured = Boolean(
    APPLE_SERVICE_ID && APPLE_REDIRECT_URI && appleReady
  );

  // Keep the credential handler in a ref so Google's init callback (captured
  // once) always calls the latest router/state without re-initialising.
  const onGoogleCredential = useCallback(
    async (res: GoogleCredentialResponse) => {
      if (!res.credential) {
        toast.error('Google sign-in failed', {
          description: 'No credential returned. Please try again.',
        });
        return;
      }
      setLoading('google');
      try {
        await googleLoginService(res.credential);
        toast.success('Signed in with Google');
        router.push(redirectTo);
      } catch (err) {
        handleAuthError(err, 'Google', router);
      } finally {
        setLoading(null);
      }
    },
    [router, redirectTo]
  );
  const credentialHandler = useRef(onGoogleCredential);
  credentialHandler.current = onGoogleCredential;

  // Initialise + render the official Google button once the GSI script is
  // ready. Runs on mount too (covers client-side nav where onLoad already
  // fired and won't fire again). googleReady is a re-trigger only — the body
  // reads window.google directly — hence the exhaustive-deps exception.
  // biome-ignore lint/correctness/useExhaustiveDependencies: googleReady re-triggers render after the script loads
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }
    const gsi = window.google?.accounts?.id;
    if (!(gsi && googleBtnRef.current)) {
      return;
    }
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (res) => credentialHandler.current(res),
      ux_mode: 'popup',
      auto_select: false,
    });
    googleBtnRef.current.replaceChildren();
    gsi.renderButton(googleBtnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: mode === 'register' ? 'signup_with' : 'signin_with',
      logo_alignment: 'center',
      width: 320,
    });
  }, [googleReady, mode]);

  const signInWithApple = useCallback(async () => {
    if (!(appleConfigured && APPLE_SERVICE_ID && APPLE_REDIRECT_URI)) {
      return;
    }
    setLoading('apple');
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
      await appleLoginService({
        idToken,
        firstName: data?.user?.name?.firstName,
        lastName: data?.user?.name?.lastName,
      });
      toast.success('Signed in with Apple');
      router.push(redirectTo);
    } catch (err) {
      // Apple throws { error: 'popup_closed_by_user' } when the user cancels —
      // don't surface that as a failure.
      const code = (err as { error?: string })?.error;
      if (
        code === 'popup_closed_by_user' ||
        code === 'user_cancelled_authorize'
      ) {
        setLoading(null);
        return;
      }
      handleAuthError(err, 'Apple', router);
    } finally {
      setLoading(null);
    }
  }, [appleConfigured, router, redirectTo]);

  // Nothing to render if neither provider is configured.
  if (!(GOOGLE_CLIENT_ID || APPLE_SERVICE_ID)) {
    return null;
  }

  const verb = mode === 'register' ? 'sign up' : 'continue';

  return (
    <div className='max-w-[539px] mx-auto space-y-4'>
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

      <div className='flex items-center gap-4' aria-hidden='true'>
        <span className='h-px flex-1 bg-stone-200 dark:bg-neutral-700' />
        <span className='text-sm font-abeezee text-[#4A413F] dark:text-neutral-300'>
          Or {verb} with
        </span>
        <span className='h-px flex-1 bg-stone-200 dark:bg-neutral-700' />
      </div>

      <div className='flex flex-col items-center gap-3'>
        {GOOGLE_CLIENT_ID && (
          <div className='relative flex min-h-[44px] w-full justify-center'>
            {!googleReady && (
              <div className='h-[44px] w-[320px] animate-pulse rounded-full bg-stone-100 dark:bg-neutral-800' />
            )}
            {/* Google renders its own compliant button into this element. */}
            <div
              ref={googleBtnRef}
              className={
                loading === 'google' ? 'pointer-events-none opacity-60' : ''
              }
            />
          </div>
        )}

        {appleConfigured && (
          <button
            type='button'
            onClick={signInWithApple}
            disabled={loading !== null}
            className='flex h-[44px] w-[320px] items-center justify-center gap-2 rounded-full bg-black px-6 font-abeezee text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60'
          >
            <svg
              width='16'
              height='16'
              viewBox='0 0 24 24'
              fill='currentColor'
              aria-hidden='true'
            >
              <path d='M17.05 12.53c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.68 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.18-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.69.71 2.85.69 1.18-.02 1.92-1.08 2.64-2.15.83-1.23 1.17-2.42 1.19-2.48-.03-.01-2.28-.87-2.3-3.49zM14.88 5.9c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.55.64-1.04 1.68-.91 2.67.97.08 1.96-.49 2.55-1.22z' />
            </svg>
            {mode === 'register' ? 'Sign up with Apple' : 'Continue with Apple'}
          </button>
        )}
      </div>
    </div>
  );
};
