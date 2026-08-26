import * as Sentry from '@sentry/nextjs';

// Client-side-only Sentry. We deliberately do NOT add the server/edge
// instrumentation (instrumentation.ts + sentry.server/edge.config): under
// Next.js 16 + Turbopack the OpenTelemetry-based server hook fails to resolve
// `require-in-the-middle` and 500s every SSR request. Browser error + tracing
// capture is the gap for this frontend; server errors are covered by the
// storytime-be Sentry project.
Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    'https://45bcefe21ed944d0f799390f13187379@o4510959000616960.ingest.us.sentry.io/4511937209630725',
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // Only report from real deployments, not local dev.
  enabled: process.env.NODE_ENV === 'production',
  // Light performance sampling; errors are always captured.
  tracesSampleRate: 0.1,
});

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
