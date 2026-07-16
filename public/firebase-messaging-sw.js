/* global importScripts, firebase */
// Firebase Cloud Messaging service worker (background notifications).
//
// This file runs OUTSIDE the Next.js bundle, so it has no access to
// process.env. The app registers it with the Firebase web config passed as URL
// query params (see lib/firebase-messaging.ts), which we read here so the
// worker stays fully env-driven and never hardcodes project config.
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

const params = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: params.get('apiKey') || undefined,
  authDomain: params.get('authDomain') || undefined,
  projectId: params.get('projectId') || undefined,
  storageBucket: params.get('storageBucket') || undefined,
  messagingSenderId: params.get('messagingSenderId') || undefined,
  appId: params.get('appId') || undefined,
};

// Only initialize when the essential config is present; otherwise the worker
// installs but stays inert (graceful degradation for unconfigured deploys).
if (firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const title = notification.title || 'Storytime';
    const options = {
      body: notification.body || '',
      icon: notification.icon || '/favicon.ico',
    };
    self.registration.showNotification(title, options);
  });
}
