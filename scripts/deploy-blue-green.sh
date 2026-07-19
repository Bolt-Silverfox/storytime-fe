#!/usr/bin/env bash
#
# Blue-green deploy for storytime-fe (Next.js standalone + PM2 + nginx).
#
# Model: green = current stable (develop-v1.2.0) at dev.storytimeapp.me,
# blue = candidate (develop-v1.3.0) at blue.dev.storytimeapp.me. Each color has
# its own build (NEXT_PUBLIC_API_URL is baked at BUILD time, so blue is built
# against the BLUE backend), its own PM2 app, its own port, and its own nginx
# server block. This script (re)builds + (re)starts ONE color and health-gates
# it. There is no traffic "flip" in the separate-subdomain model — promoting
# blue to green just means rebuilding green from the blue branch.
#
# Usage:
#   scripts/deploy-blue-green.sh blue      # build+deploy the blue color
#   scripts/deploy-blue-green.sh green     # build+deploy the green color
#
# Env overrides: BLUE_PORT (3010), GREEN_PORT (3000), HEALTH_TIMEOUT (120),
#   NEXT_PUBLIC_API_URL (defaults to .env.<color> value below).
set -euo pipefail

COLOR="${1:-}"
if [ "$COLOR" != "blue" ] && [ "$COLOR" != "green" ]; then
  echo "usage: $0 <blue|green>" >&2
  exit 2
fi

BLUE_PORT="${BLUE_PORT:-3010}"
GREEN_PORT="${GREEN_PORT:-3000}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

if [ "$COLOR" = "blue" ]; then
  PORT="$BLUE_PORT"
  DEFAULT_API="https://blue.dev.api.storytimeapp.me"
else
  PORT="$GREEN_PORT"
  DEFAULT_API="https://dev.api.storytimeapp.me"
fi

# Per-color API base (baked into the build). Priority: explicit env > .env.<color> > default.
if [ -z "${NEXT_PUBLIC_API_URL:-}" ] && [ -f ".env.$COLOR" ]; then
  # shellcheck disable=SC1090
  set -a; . "./.env.$COLOR"; set +a
fi
API_URL="${NEXT_PUBLIC_API_URL:-$DEFAULT_API}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

log() { printf '\033[1;34m[fe-deploy]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[fe-deploy]\033[0m %s\n' "$*" >&2; }

log "Deploying '$COLOR' on :$PORT — API=$API_URL sha=$GIT_SHA"

# --- 1. Build with the color's baked env ------------------------------------
log "Building (pnpm build)…"
NEXT_PUBLIC_API_URL="$API_URL" NEXT_PUBLIC_GIT_SHA="$GIT_SHA" pnpm build

# Next standalone needs static + public copied alongside server.js.
log "Assembling standalone bundle…"
cp -r public .next/standalone/ 2>/dev/null || true
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static

# --- 2. (Re)start this color via PM2 ----------------------------------------
pm2 delete "storytime-fe-${COLOR}" >/dev/null 2>&1 || true
PORT="$PORT" NODE_ENV=production HOSTNAME=0.0.0.0 \
  pm2 start .next/standalone/server.js --name "storytime-fe-${COLOR}" \
  --max-memory-restart 512M --update-env

# --- 3. Health-gate ----------------------------------------------------------
log "Health-gating http://127.0.0.1:${PORT}${HEALTH_PATH} (timeout ${HEALTH_TIMEOUT}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -fsS "http://127.0.0.1:${PORT}${HEALTH_PATH}" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    err "'$COLOR' did not become healthy in ${HEALTH_TIMEOUT}s — rolling back."
    pm2 logs "storytime-fe-${COLOR}" --lines 40 --nostream || true
    pm2 delete "storytime-fe-${COLOR}" >/dev/null 2>&1 || true
    exit 1
  fi
  sleep 3
done
pm2 save >/dev/null 2>&1 || true
log "'$COLOR' healthy on :${PORT}. Ensure its nginx server_name points here"
log "  blue  -> blue.dev.storytimeapp.me  ;  green -> dev.storytimeapp.me"
