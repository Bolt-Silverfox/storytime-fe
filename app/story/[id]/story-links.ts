// Shared constants for the public story share/landing page.

/** Canonical public host for shareable story links (must match the app's
 *  associatedDomains / assetlinks host for Universal / App Links to verify). */
export const SITE_URL = 'https://web.storytimeapp.me';

/** App Store listing (App ID from App Store Connect). */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6756060805';

/** Google Play listing. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=net.emerj.storytime';

/** Deep link that opens the story directly in the installed app. */
export const makeStoryDeepLink = (storyId: string) =>
  `storytime://story/${storyId}`;

/**
 * Build an OG-friendly share image URL from a story cover. Cloudinary covers are
 * transformed to a 1200×630 JPEG (WhatsApp/Facebook prefer jpg/png over webp);
 * other URLs are returned unchanged. Returns undefined when there's no cover.
 */
export const ogImageUrl = (cover: string | null): string | undefined => {
  if (!cover) {
    return undefined;
  }
  if (cover.includes('res.cloudinary.com') && cover.includes('/upload/')) {
    return cover.replace('/upload/', '/upload/f_jpg,w_1200,h_630,c_fill/');
  }
  return cover;
};
