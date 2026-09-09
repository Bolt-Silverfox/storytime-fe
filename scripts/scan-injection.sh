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
# It also covers the 2026-09 variant found on Bolt-Silverfox/storytime-devops,
# which hid nothing in a config file at all:
#   * the payload was 31,303 bytes of JavaScript committed as
#     public/fonts/fa-solid-400.woff2 — magic bytes "    " (spaces), not wOF2;
#   * the trigger was a hidden .vscode/tasks.json task (hide/reveal:never) with
#     runOn: folderOpen, so merely opening the folder in VS Code ran it, with
#     "task.allowAutomaticTasks": true in settings.json to suppress the prompt;
#   * its marker was global.i="A8-..." — the marker-string check greps
#     global['!'], so it matched nothing.
# Hence the three checks below: binary assets whose magic bytes contradict their
# extension, VS Code auto-execution config, and a marker check that matches the
# A8- family generically rather than one literal string.
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

# Worm marker families. Deliberately NOT one literal string: the 2026-08 wave
# used global['!'] / A8-2503, the 2026-09 wave used global.i="A8-*#new". The
# third alternative matches the A8- campaign tag generically, but only in the
# "assigned to a global" shape, so ordinary strings containing "A8-" don't fire.
MARKER_RE="global\['!'\]|A8-2503|global(\.[A-Za-z_\$][A-Za-z0-9_\$]*|\[[^]]{1,32}\])[[:space:]]*=[[:space:]]*[\"'][[:space:]]*A8-"

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
# NOTE: no `mapfile` — it is bash 4+, and stock macOS still ships bash 3.2, where
# the hook would abort (and under `set -u` the later "${files[@]}" expansion of an
# unset array aborts too). A plain read loop is portable.
files=()
while IFS= read -r _line; do
  files+=("$_line")
done < <(if [ "$mode" = "staged" ]; then
           git diff --cached --name-only --diff-filter=ACM
         else
           git ls-files
         fi)

# Guard the empty case explicitly: on bash < 4.4, "${files[@]}" on an empty array
# is an "unbound variable" error under `set -u`.
if [ "${#files[@]}" -eq 0 ]; then
  echo "scan-injection: clean — no $([ "$mode" = staged ] && echo 'staged' || echo 'tracked') files to scan."
  exit 0
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

# Binary assets that have a well-known file signature. A payload disguised as
# one of these is caught by the magic-byte mismatch alone, with no marker and no
# knowledge of the payload's contents. Values are the expected leading bytes as
# lowercase hex; multiple alternatives are separated by "|".
#   woff2 -> "wOF2"        woff -> "wOFF"
#   ttf   -> 00 01 00 00 (TrueType) | "true" | "ttcf" (collection)
#   otf   -> "OTTO"       | 00 01 00 00 (CFF outlines in a TrueType wrapper)
# .eot has no stable leading signature (it starts with length fields), so it gets
# the text/JavaScript check below but no magic comparison.
asset_magic() {
  case "$1" in
    *.woff2) echo '774f4632' ;;
    *.woff)  echo '774f4646' ;;
    *.ttf)   echo '00010000|74727565|74746366' ;;
    *.otf)   echo '4f54544f|00010000' ;;
    *.png)   echo '89504e47' ;;
    *.gif)   echo '47494638' ;;
    *.jpg|*.jpeg) echo 'ffd8ff' ;;
    *.ico)   echo '00000100|00000200' ;;
    *)       return 1 ;;
  esac
}

# Assets we inspect even when they carry no magic comparison.
is_binary_asset() {
  case "$1" in
    *.woff2|*.woff|*.ttf|*.otf|*.eot|*.png|*.gif|*.jpg|*.jpeg|*.ico) return 0 ;;
    *) return 1 ;;
  esac
}

# macOS has no sha256sum; it ships `shasum`. Without this the allowlist silently
# never matches on a Mac, so a reviewed false positive keeps blocking commits.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  else
    return 1
  fi
}

is_allowed() {
  [ -f "$ALLOW_FILE" ] || return 1
  local h
  h=$(sha256_of "$1") || return 1
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
  # `grep -c`, NOT `grep -q`: with `pipefail`, grep -q closes the pipe on its
  # first match, awk dies of SIGPIPE (141), and pipefail then makes the whole
  # pipeline non-zero — so a REAL detection is silently discarded as a miss.
  # Verified: on a large file with an early match the -q form returns 141.
  # (Dropping just the -q does not help — GNU grep optimises `>/dev/null` the
  # same way.) grep -c has to read every line to count, so it never early-exits.
  if is_executable_code "$f"; then
    long_hits=$(awk -v m="$MAX_LINE" 'length($0) > m' "$f" \
      | grep -caE "_0x[0-9a-fA-F]{4,}|=[[:space:]]*require\(|String\.fromCharCode\(|eval\(|atob\(|Function\(" || true)
    if [ "${long_hits:-0}" -gt 0 ]; then
      bad+="${f}: overlong obfuscated code line (blob payload)\n"
      continue
    fi
  fi

  # (2) Require-hijack / char-code obfuscation hallmarks anywhere (line length
  # independent — the stager's require shim/hijack may sit on short lines too).
  if grep -qE "global\[[^]]+\][[:space:]]*=[[:space:]]*require|global\.[A-Za-z_\$][A-Za-z0-9_\$]*[[:space:]]*=[[:space:]]*require|String\.fromCharCode\([^)]*,[^)]*,[^)]*,|(_0x[0-9a-fA-F]{4,}[^_]*){4,}" "$f"; then
    bad+="${f}: require-hijack / char-code / hex-identifier obfuscation\n"
    continue
  fi

  # (3) Known marker families — cheap fast-path for the observed waves. Not a
  # single literal: the 2026-09 variant mutated global['!'] into global.i="A8-…",
  # so the A8- campaign tag is matched generically wherever it is assigned to a
  # global (dot OR bracket form). Requiring the "global<assignment>'A8-" shape
  # keeps it from firing on an ordinary string that happens to contain "A8-"
  # (a colour, a hash, an AWS instance type).
  if grep -qaE "$MARKER_RE" "$f"; then
    bad+="${f}: known worm marker family\n"
    continue
  fi
done

# ---------------------------------------------------------------------------
# (4) Binary assets whose magic bytes contradict their extension.
#
# This is what catches a payload committed as a font: no marker, no filename
# list, no knowledge of the payload — a .woff2 that does not begin with "wOF2"
# is not a font, whatever it contains. file(1), when present, additionally
# rejects any such asset it reports as text/JavaScript (covering .eot and any
# format without a stable signature). Real fonts/images are untouched.
# ---------------------------------------------------------------------------
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  is_binary_asset "$f" || continue
  is_allowed "$f" && continue

  if magic=$(asset_magic "$f"); then
    head_hex=$(head -c 4 "$f" | od -An -tx1 -v | tr -d ' \n')
    matched=no
    while IFS= read -r want; do
      [ -n "$want" ] || continue
      case "$head_hex" in "$want"*) matched=yes; break ;; esac
    done < <(printf '%s\n' "$magic" | tr '|' '\n')
    if [ "$matched" = no ]; then
      bad+="${f}: extension/magic-byte mismatch — expected ${magic}, got ${head_hex} (payload disguised as an asset)\n"
      continue
    fi
  fi

  if command -v file >/dev/null 2>&1; then
    desc=$(file -b "$f" 2>/dev/null || true)
    case "$desc" in
      *JavaScript*|*"ASCII text"*|*"Unicode text"*|*"shell script"*|*"Python script"*|*"UTF-8 text"*)
        bad+="${f}: binary asset that file(1) reports as text/code — \"${desc}\" (payload disguised as an asset)\n"
        continue ;;
    esac
  fi

  # Keep the pre-existing content grep too: an asset with VALID magic bytes and
  # a payload appended after the real font data would pass both checks above.
  if grep -qaE "$MARKER_RE|=[[:space:]]*require\(" "$f"; then
    bad+="${f}: worm marker / require-hijack inside a binary asset\n"
    continue
  fi
done

# ---------------------------------------------------------------------------
# (5) VS Code auto-execution config.
#
# The delivery half of the 2026-09 variant: a hidden tasks.json task with
# runOn: folderOpen executed the disguised payload on folder open. Nothing in
# these repos legitimately needs a task to auto-run on folder open, or needs
# automatic tasks pre-approved, so both are hard failures. tasks.json is JSONC
# (comments + trailing commas — the live malicious file had one), so this is
# grep-based on purpose: jq cannot parse it.
# ---------------------------------------------------------------------------
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  case "$f" in
    .vscode/*.json|*/.vscode/*.json|*.code-workspace) ;;
    *) continue ;;
  esac

  # Escape-obfuscation guard, and it must come FIRST. JSON property names and
  # string values may carry \uXXXX escapes, and VS Code decodes them before use:
  # {"runOptions":{"run\u004fn":"folder\u004fpen"}} is a live folderOpen task
  # that no literal grep below can see. In JSON the ONLY way to write an ASCII
  # alphanumeric other than literally is \uXXXX, so rejecting \u in these files
  # closes the entire evasion class without needing a JSONC parser (which this
  # script cannot assume — it also runs as a pre-commit hook). Legitimate VS Code
  # config has no reason to \u-escape ASCII; note this does NOT match "\\" , so
  # Windows paths like "C:\\tools" are unaffected.
  if grep -qE '\\u[0-9a-fA-F]{4}' "$f"; then
    # NOTE: findings are emitted with printf '%b', so the message must not
    # contain a literal backslash-u — printf would try to expand it as a unicode
    # escape and warn "missing unicode digit". Spell it out in words instead.
    bad+="${f}: JSON unicode escape (backslash-u) in a VS Code config — unescape it so it can be reviewed literally (escapes can hide runOn/folderOpen from this scan)\n"
    continue
  fi

  if grep -qE '"runOn"[[:space:]]*:[[:space:]]*"folderOpen"' "$f"; then
    detail="auto-running task (runOn: folderOpen)"
    if grep -qE '"hide"[[:space:]]*:[[:space:]]*true' "$f"; then
      detail="$detail, hidden from the task list"
    fi
    if grep -qE '"reveal"[[:space:]]*:[[:space:]]*"never"' "$f"; then
      detail="$detail, output suppressed (reveal: never)"
    fi
    bad+="${f}: ${detail}\n"
    continue
  fi

  if grep -qE '"task\.allowAutomaticTasks"[[:space:]]*:[[:space:]]*"?(true|on)"?' "$f"; then
    bad+="${f}: automatic tasks pre-approved (task.allowAutomaticTasks) — removes VS Code's run-on-open prompt\n"
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
