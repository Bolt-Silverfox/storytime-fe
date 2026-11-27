import { ensureGuestSession } from './services';

// Kept for existing imports; the implementation lives with the guest services
// so every guest call shares one session-creation path.
export { ensureGuestSession };
