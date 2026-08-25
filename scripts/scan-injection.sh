#!/usr/bin/env bash
#
# scan-injection.sh — structural detector for build-time config-injection worms.
#
# Detects the self-propagating worm family that appends an obfuscated RCE payload
# to auto-run config files (postcss/eslint/jest/next/babel/…) and executes it on
# every lint/build. Unlike the old check, this does NOT enumerate config
# filenames and does NOT depend on a single marker string — the worm has evaded
# both by picking an unlisted filename (eslint.config.mjs) and mutating its
# marker. Instead it scans every git-TRACKED text file for structural hallmarks.
#
# Canonical source: Bolt-Silverfox/storytime_be:scripts/scan-injection.sh
# Vendored copies in other repos are hash-verified against this one in CI.
#
# Usage:
#   scan-injection.sh            # scan all tracked files (CI)
#   scan-injection.sh --staged   # scan only staged files (pre-commit hook)
#
# Exit 0 = clean, 1 = indicator(s) found, 2 = usage/environment error.

set -uo pipefail

MAX_LINE=500                      # obfuscated blobs are always one absurd line
ALLOW_FILE=".ci-scan-allow.txt"   # "sha256␠␠path" per line: reviewed minified/vendored files

mode="all"
case "${1:-}" in
  --staged) mode="staged" ;;
  ""|--all) mode="all" ;;
  -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unknown arg: $1" >&2; exit 2 ;;
esac

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "::error::scan-injection.sh must run inside a git work tree" >&2
  exit 2
fi

# Tracked files only → node_modules and build output are excluded for free, and
# we inspect exactly what is (or is about to be) committed.
if [ "$mode" = "staged" ]; then
  mapfile -t files < <(git diff --cached --name-only --diff-filter=ACM)
else
  mapfile -t files < <(git ls-files)
fi

# Text files worth scanning: code + config + data. Broad on purpose (no filename list).
is_scan_target() {
  case "$1" in
    *.js|*.mjs|*.cjs|*.ts|*.tsx|*.jsx|*.cts|*.mts|*.json|*.vue|*.svelte) return 0 ;;
    *.config.*|*rc.js|*rc.cjs|*rc.mjs|*rc.ts) return 0 ;;
    *) return 1 ;;
  esac
}

# Executable code (the worm's actual target). The overlong-line rule applies
# ONLY here: a long line in an executable module is an obfuscated code blob. It
# does NOT apply to .json/data, which is legitimately minified onto one line and
# is inert (not executed by build tooling). Code-injection SIGNATURES are still
# grepped in every scan target, so a payload disguised in data is caught too.
is_executable_code() {
  case "$1" in
    *.js|*.mjs|*.cjs|*.ts|*.tsx|*.jsx|*.cts|*.mts|*.vue|*.svelte) return 0 ;;
    *.config.js|*.config.mjs|*.config.cjs|*.config.ts) return 0 ;;
    *rc.js|*rc.cjs|*rc.mjs|*rc.ts) return 0 ;;
    *) return 1 ;;
  esac
}

is_allowed() {
  [ -f "$ALLOW_FILE" ] || return 1
  local h
  h=$(sha256sum "$1" 2>/dev/null | awk '{print $1}')
  [ -n "$h" ] && grep -qE "^${h}[[:space:]]" "$ALLOW_FILE"
}

bad=""
for f in "${files[@]}"; do
  [ -f "$f" ] || continue           # deleted/renamed away
  is_scan_target "$f" || continue
  is_allowed "$f" && continue        # reviewed known-good minified/vendored file

  # (1) Obfuscated CODE blob: an overlong line that ALSO carries obfuscation /
  # dynamic-exec hallmarks. Overlong ALONE is legit in real source (SVG path
  # data in icon components, long className strings, data URIs), so we require a
  # malicious signature ON the long line. The worm's payload line is packed with
  # _0x… hex identifiers and =require(, so it is caught; a shadcn icon's long
  # SVG line is not. JSON/data is inert and excluded from this rule entirely.
  if is_executable_code "$f" \
     && awk -v m="$MAX_LINE" 'length($0) > m' "$f" \
        | grep -qaE "_0x[0-9a-fA-F]{4,}|=[[:space:]]*require\(|String\.fromCharCode\(|eval\(|atob\(|Function\("; then
    bad+="${f}: overlong obfuscated code line (blob payload)\n"
    continue
  fi

  # (2) Require-hijack / char-code obfuscation hallmarks anywhere (line length
  # independent — the stager's require shim/hijack may sit on short lines too).
  if grep -qE "global\[[^]]+\][[:space:]]*=[[:space:]]*require|global\.[A-Za-z_\$][A-Za-z0-9_\$]*[[:space:]]*=[[:space:]]*require|String\.fromCharCode\([^)]*,[^)]*,[^)]*,|(_0x[0-9a-fA-F]{4,}[^_]*){4,}" "$f"; then
    bad+="${f}: require-hijack / char-code / hex-identifier obfuscation\n"
    continue
  fi

  # (3) Known marker families — cheap fast-path for the two observed waves.
  if grep -qE "global\['!'\]|A8-2503" "$f"; then
    bad+="${f}: known worm marker family\n"
    continue
  fi
done

if [ -n "$bad" ]; then
  echo "::error::Config-injection indicators found ($([ "$mode" = staged ] && echo staged || echo tracked) scan):" >&2
  printf '%b' "$bad" >&2
  echo "If a flagged file is a legitimate minified/vendored asset, add its 'sha256  path' to ${ALLOW_FILE} after review." >&2
  exit 1
fi

echo "scan-injection: clean — no indicators in $([ "$mode" = staged ] && echo 'staged' || echo 'tracked') files."
exit 0
