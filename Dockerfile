# syntax=docker/dockerfile:1.7
#
# Production image for the parent-facing web app ("web"), built for a single
# arm64 EC2 host (t4g) running every service in Docker behind Caddy, which
# terminates TLS and reverse-proxies to this container on port 3000.
#
# Build (arm64 is mandatory - the host is Graviton):
#   docker buildx build --platform linux/arm64 \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.storytimeapp.me \
#     -t storytime-web:local .
#
# NEXT_PUBLIC_API_URL is an ORIGIN, not a base path. Both consumers append the
# prefix themselves - lib/axios.ts:34 builds `${API_ORIGIN}/api/v1/` and
# app/story/[id]/get-story.ts:47 fetches `${base}/api/v1/stories/...`. Passing
# a value that already ends in /api/v1 yields /api/v1/api/v1/ and every
# request 404s.
#
# ---------------------------------------------------------------------------
# ONE IMAGE PER ENVIRONMENT - this is the single most important thing to know.
#
# Every NEXT_PUBLIC_* value is INLINED INTO THE JAVASCRIPT BUNDLE by `next
# build`. It is a compile-time text substitution, not a runtime lookup, so
# passing these as `docker run -e` does nothing: the bundle already contains
# whatever was baked in at build time (or an empty string). They must therefore
# be Docker BUILD ARGS.
#
# The consequence: a dev image CANNOT be promoted to prod by swapping env vars.
# Each environment needs its own build with its own --build-arg set.
#
# These values are public by definition - they ship to every browser that loads
# the site - so baking them in leaks nothing. Note that build args are also
# visible in `docker history`; that is acceptable here for exactly the same
# reason, and is why NOTHING ELSE may be passed as a build arg.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=24.21.0
# package.json has engines.node ">=24" and no `packageManager` field, so
# corepack cannot infer a pnpm version and must be told one explicitly.
# 9.15.9 is the latest 9.x, matching CI (pnpm/action-setup with version: 9)
# and the lockfileVersion '9.0' in pnpm-lock.yaml.
ARG PNPM_VERSION=9.15.9


# --------------------------------- deps ------------------------------------
# Dependencies are installed INSIDE a linux/arm64 container, never copied from
# the build host. pnpm resolves optional platform packages by the install
# host's platform, and this tree has several: @next/swc, @tailwindcss/oxide,
# lightningcss and sharp 0.34.5 (@img/sharp-*, an optional dependency of next
# itself). Installing on any other arch/libc yields binaries this image cannot
# load.
FROM node:${NODE_VERSION}-alpine AS deps
ARG PNPM_VERSION
WORKDIR /app

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY package.json pnpm-lock.yaml ./

# --ignore-scripts mirrors CI. The `prepare` script only runs `git config
# core.hooksPath`, and git is absent from a slim image. Nothing here is a
# node-gyp build - sharp and the other platform packages ship prebuilt
# binaries - so skipping lifecycle scripts does not skip any compilation.
#
# NOT `--no-optional`: the platform packages above are optional dependencies,
# and omitting @next/swc / @tailwindcss/oxide / lightningcss breaks the build.
RUN pnpm install --frozen-lockfile --ignore-scripts


# -------------------------------- builder ----------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
ARG PNPM_VERSION
WORKDIR /app

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

# Dev dependencies are intentionally still present, and stay present until
# after `next build`. next.config.ts is TypeScript, so Next needs the
# `typescript` devDependency to load it at all; tailwindcss/postcss are
# likewise build-time. Pruning before the build fails; pruning after is
# pointless because the runtime stage copies only the standalone bundle.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --- Build-time public configuration (see the header note) -----------------
# Declared WITHOUT `ENV` on purpose. An ARG that the caller does not pass is
# genuinely absent from the build environment, whereas `ENV FOO=${FOO}` would
# materialise it as an empty string. That distinction matters: several of these
# have in-code fallbacks, and `process.env.NEXT_PUBLIC_SENTRY_DSN ?? '<default>'`
# keeps an empty string (?? only tests null/undefined), which would silently
# disable Sentry. Leaving the ARG unset lets the code default win.
#
# Vary per environment - pass these on every build:
ARG NEXT_PUBLIC_API_URL
# Declared for completeness but deliberately NOT passed on production builds.
# Nothing validates X-API-Key any more: the nginx gateway the key was added for
# is gone, the backend only lists the header in CORS allowedHeaders
# (storytime_be src/main.ts:165), and the Caddyfile has no gate. Both call
# sites (lib/axios.ts, get-story.ts) are conditional on it, so leaving it unset
# keeps a would-be secret out of a public JS bundle.
ARG NEXT_PUBLIC_API_KEY
ARG NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID
ARG NEXT_PUBLIC_APPLE_SERVICE_ID
ARG NEXT_PUBLIC_APPLE_REDIRECT_URI
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
# Optional - lib/firebase-messaging.ts carries committed public defaults for
# all of these (the Firebase web config and VAPID key are public by design).
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# FAIL THE BUILD if NEXT_PUBLIC_API_URL was not passed. Docker happily omits an
# ARG, and lib/axios.ts:27 falls back to `https://dev.api.storytimeapp.me` — so
# without this the build SUCCEEDS and produces an image whose browser traffic
# goes to the dev API. Nothing downstream catches it: the container starts,
# pages render, and only the network tab shows the wrong origin.
#
# Read indirectly via printenv rather than interpolating ${NEXT_PUBLIC_API_URL}
# into the RUN line: buildx expands a set ARG into the printed step name, which
# would put the value into build logs. Not secret here, but this guard gets
# copied to args that are.
RUN if [ -z "$(printenv NEXT_PUBLIC_API_URL)" ]; then \
      echo "ERROR: --build-arg NEXT_PUBLIC_API_URL=... is required." >&2; \
      echo "It is inlined into the bundle at build time and cannot be set at runtime." >&2; \
      echo "Omitting it silently falls back to the dev API (lib/axios.ts:27)." >&2; \
      exit 1; \
    fi

# The build never needs to reach the STORYTIME API: there is no
# generateStaticParams and the only fetch runs at request time. It does still
# need general outbound network, because app/layout.tsx imports ABeeZee from
# next/font/google, which downloads the font CSS and woff2 from
# fonts.googleapis.com / fonts.gstatic.com at build time. A build host with
# egress locked down will fail here.
#
# next.config.ts sets output: 'standalone', so this emits .next/standalone with
# a self-contained server.js plus a traced, minimal node_modules.
#
# sharp is NOT required at runtime and is deliberately absent from the runner
# stage: the tracer does not pull it into the standalone bundle, and Next 16.2
# optimises images without it. Verified on the deployed image - `require
# ('sharp')` throws inside the container, yet /_next/image still answers with
# Content-Type: image/webp (912 KB PNG -> 31 KB) and logs no fallback warning.
RUN pnpm build


# --------------------------------- runner ----------------------------------
# Minimal runtime: alpine + the standalone bundle only. No pnpm, no source, no
# dev dependencies, no full node_modules.
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Bind all interfaces so Caddy can reach the container. Next 16.2.10's
# generated standalone server already defaults to this
# (`const hostname = process.env.HOSTNAME || '0.0.0.0'`, verified in the built
# server.js), so this line is belt-and-braces rather than load-bearing: it is
# here to pin the behaviour against a Next upgrade and to stop anyone
# "helpfully" setting HOSTNAME=localhost, which would bind loopback inside the
# container's own netns and make every proxied request connection-refused.
ENV HOSTNAME=0.0.0.0

# V8 does NOT read the cgroup memory limit. Measured on this exact base image
# (node:24.21.0-alpine, linux/arm64): a container capped at 224 MiB still
# reports v8.getHeapStatistics().heap_size_limit === 259 MiB. So the default
# heap ceiling sits ABOVE the container cap, and under memory pressure the
# kernel OOM-kills the container instead of V8 running a GC and staying alive.
# The flag is therefore not redundant with the orchestrator's cap - it is what
# makes the cap survivable.
#
# Sized at ~75% of the container's memory cap, leaving the remainder for the
# non-heap side (Node/V8 overhead and native allocations, which live OUTSIDE
# the JS heap). 240 MiB was sized against the 320 MiB cap in force when it was
# measured. The deployed cap for this service is 256 MiB, which puts this
# ceiling at ~94% of the cap rather than ~75%; measured usage stays well under
# it (below), but if the cap is re-cut, re-size this with it or override at
# run time: `-e NODE_OPTIONS=--max-old-space-size=<75% of new cap>`.
#
# Observed footprint (measured under a 320 MiB cap): 175 MiB idle, 193 MiB
# after 12 image optimisations plus 20 page loads. Both figures sit inside the
# 256 MiB cap the service now runs with.
ENV NODE_OPTIONS=--max-old-space-size=240

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

# Layout required by the standalone server, per Next.js docs: the contents of
# .next/standalone at the app root, with .next/static and public/ placed back
# alongside it (the tracer deliberately excludes both).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# public/ carries .well-known/{apple-app-site-association,assetlinks.json};
# copying the directory wholesale (never a glob) keeps the dotted subdirectory.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# There is no dedicated health route in this app - it has no app/api directory
# and no /health handler - so `/` is used. It is a safe choice here: the root
# route is app/(website)/page.tsx, it is prerendered at build time, and
# middleware.ts does not match `/` (its matcher covers /login, /register,
# /stories, /dashboard, /library, /favorites), so it returns 200 rather than a
# redirect and does not touch the backend API.
#
# Uses node's built-in fetch rather than curl/wget so the check depends on
# nothing beyond the runtime that is already here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
