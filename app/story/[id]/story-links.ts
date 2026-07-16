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
