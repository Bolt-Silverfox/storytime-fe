'use client';

import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  makeStoryDeepLink,
} from './story-links';

// Tries to open the story in the installed app via the custom scheme, and if
// nothing handles it (app not installed) falls back to the right store after a
// short delay. If the app DID open, the page is backgrounded first, so the
// visibilitychange handler cancels the store redirect.
export default function OpenInAppButton({ storyId }: { storyId: string }) {
  const handleOpen = () => {
    const deepLink = makeStoryDeepLink(storyId);
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    let store: string | null = null;
    if (isIOS) {
      store = APP_STORE_URL;
    } else if (isAndroid) {
      store = PLAY_STORE_URL;
    }

    let fellBack = false;
    const timer = window.setTimeout(() => {
      if (!fellBack && store && !document.hidden) {
        window.location.href = store;
      }
    }, 1500);

    const onVisibility = () => {
      if (document.hidden) {
        fellBack = true;
        window.clearTimeout(timer);
      }
    };
    document.addEventListener('visibilitychange', onVisibility, { once: true });

    window.location.href = deepLink;
  };

  return (
    <button
      type='button'
      onClick={handleOpen}
      className='flex items-center justify-center rounded-2xl border border-[#EC4007]/40 px-6 py-4 text-center text-base font-semibold text-[#EC4007] transition hover:bg-[#EC4007]/5 sm:col-span-2'
    >
      Open in the Storytime app
    </button>
  );
}
