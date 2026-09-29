#!/usr/bin/env bash
# Push the work branch (default: preview). Two rails only: preview (integration)
# and main (release line, fast-forwarded by tools/sync_main.sh).
#
# The historical mirror `cloud/tc-mid-low` is DEPRECATED and no longer pushed by
# default (decided 2026-09-30). It existed because the follow loader takes its
# branch name from its own script URL (`SCRIPT.ref` in map/tavern/eden-map.js),
# so scripts already imported by users kept fetching the old ref.
#
# Retirement plan (docs/branching.md):
#   1. From now on the mirror moves only on demand: LEGACY=1 bash tools/push_preview.sh
#      (grace window while old imported scripts are still out there).
#   2. New imports always point at @preview (README) or a release tag.
#   3. A session still on the mirror can move in-session via Settings ->
#      Update & version -> Version branch (the in-app switch loads @preview).
#   4. After the 0.9.7 release window the mirror ref is deleted on origin and
#      the LEGACY block below is removed.
#
# Usage:
#   bash tools/push_preview.sh            # push preview
#   bash tools/push_preview.sh --head     # ...then bump the follow head pointer (head.json) and push again
#   LEGACY=1 bash tools/push_preview.sh   # grace window only: also move the deprecated mirror
set -euo pipefail
cd "$(dirname "$0")/.."

PRIMARY=${PRIMARY:-preview}
LEGACY_REF=${LEGACY_REF:-cloud/tc-mid-low}
REMOTE=${REMOTE:-origin}
LEGACY=${LEGACY:-0}

push_all () {
  if [ "$LEGACY" = "1" ]; then
    git push "$REMOTE" "$PRIMARY" "$PRIMARY:$LEGACY_REF"
    echo "pushed $PRIMARY, mirrored $LEGACY_REF at $(git rev-parse --short HEAD)"
  else
    git push "$REMOTE" "$PRIMARY"
    echo "pushed $PRIMARY at $(git rev-parse --short HEAD)"
  fi
}

push_all

if [ "${1:-}" = "--head" ]; then
  python3 tools/bump_head.py --push --branch "$PRIMARY"
  push_all
  echo "head pointer bumped and refs re-pushed"
fi
