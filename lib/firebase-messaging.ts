// Firebase Cloud Messaging (web push) integration.
//
// Everything here is env-driven via NEXT_PUBLIC_FIREBASE_* vars (inlined at
// build time) and degrades gracefully: when config is missing or the browser
// does not support the Web Push / Notifications APIs, every helper returns
// null / false instead of throwing so the UI can render a disabled state.
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  type MessagePayload,
  type Messaging,
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';

// The Firebase web config is public by design (it ships in the client bundle
// and identifies the project; access is gated by Firebase rules + authorized
// domains, not by hiding these values). Likewise the VAPID key below is the
// PUBLIC web-push key. They're kept as defaults so web push works in every
// environment without ENV_FILE changes; NEXT_PUBLIC_FIREBASE_* still override.
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyD0palNuJyJX1xIMnYCL_vWMP5NS1CgDRE',
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'storytimeapp-29aea.firebaseapp.com',
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'storytimeapp-29aea',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'storytimeapp-29aea.firebasestorage.app',
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '601078972007',
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    '1:601078972007:web:ad94daca6d2d1cc4061ec2',
};

const VAPID_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
  'BNezYbRjNXIdWs6HAebYqepnOmJVj85JF0xxfrtD27OvUghzjpME6c3qku_7WFzbZckfC52AVC-J2aM5JRSerrM';

// True only when the values FCM cannot work without are all present. The web
// appId and VAPID key are the two that must come from the Firebase Console.
export const isPushConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.appId && VAPID_KEY
);

let app: FirebaseApp | null = null;

const getFirebaseApp = (): FirebaseApp => {
  if (app) {
    return app;
  }
  const existing = getApps();
  app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  return app;
};

// Lazily resolve a Messaging instance. Returns null when running on the server,
// when the browser is unsupported, or when config is incomplete.
export const getMessagingInstance = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined' || !isPushConfigured) {
    return null;
  }
  try {
    const supported = await isSupported();
    if (!supported) {
      return null;
    }
    return getMessaging(getFirebaseApp());
  } catch (error) {
    console.error('Failed to initialize Firebase messaging:', error);
    return null;
  }
};

// Register the FCM service worker with the config passed as query params so the
// worker (which has no env access) can initialize itself.
const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    const params = new URLSearchParams();
    if (firebaseConfig.apiKey) {
      params.set('apiKey', firebaseConfig.apiKey);
    }
    if (firebaseConfig.appId) {
      params.set('appId', firebaseConfig.appId);
    }
    if (firebaseConfig.projectId) {
      params.set('projectId', firebaseConfig.projectId);
    }
    if (firebaseConfig.messagingSenderId) {
      params.set('messagingSenderId', firebaseConfig.messagingSenderId);
    }
    if (firebaseConfig.authDomain) {
      params.set('authDomain', firebaseConfig.authDomain);
    }
    if (firebaseConfig.storageBucket) {
      params.set('storageBucket', firebaseConfig.storageBucket);
    }
    return navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${params.toString()}`
    );
  };

// Request notification permission, register the SW, and return an FCM token.
// Returns null (never throws) on denial, unsupported browsers, or any error.
export const requestPushPermissionAndToken = async (): Promise<
  string | null
> => {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging || typeof Notification === 'undefined') {
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return null;
    }
    const registration = await registerServiceWorker();
    if (!registration) {
      return null;
    }
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (error) {
    console.error('Failed to request push permission/token:', error);
    return null;
  }
};

// Subscribe to foreground push messages. Returns an unsubscribe function; a
// no-op unsubscribe when messaging is unavailable.
export const onForegroundPush = (
  cb: (payload: MessagePayload) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  getMessagingInstance()
    .then((messaging) => {
      if (!messaging || cancelled) {
        return;
      }
      unsubscribe = onMessage(messaging, cb);
    })
    .catch((error) => {
      console.error('Failed to subscribe to foreground push:', error);
    });
  return () => {
    cancelled = true;
    if (unsubscribe) {
      unsubscribe();
    }
  };
};

// Delete the current FCM token (used when disabling web push).
export const deletePushToken = async (): Promise<boolean> => {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) {
      return false;
    }
    return await deleteToken(messaging);
  } catch (error) {
    console.error('Failed to delete push token:', error);
    return false;
  }
};
