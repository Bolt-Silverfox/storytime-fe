import * as Sentry from '@sentry/nextjs';

// DSN is a public client identifier, injected at build time per environment.
// Without it (local dev, CI) the SDK stays disabled.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
  // Errors only for now — no tracing or replay, to keep the bundle and quota
  // small. Revisit once there's a baseline of error traffic.
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
