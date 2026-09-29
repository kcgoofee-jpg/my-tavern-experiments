#!/usr/bin/env bash
# Push the work branch and its compatibility mirror together.
#
# Why two refs: the follow loader takes its branch name from *its own script URL* (`SCRIPT.ref` in
# `map/tavern/eden-map.js`), so scripts already imported by users keep fetching `cloud/tc-mid-low`.
# That ref is therefore kept as a mirror of `preview` and must be pushed in the same command — a
# mirror that lags means those users silently stay on an old build.
#
# The mirror is deprecated: nothing new should point at it. When the last old script is gone
# (users re-imported the preview script under the new name), delete it and this script's LEGACY part.
#
# Usage:
#   bash tools/push_preview.sh            # push preview + the mirror
#   bash tools/push_preview.sh --head     # …then bump the follow head pointer (head.json) and push again
set -euo pipefail
cd "$(dirname "$0")/.."

PRIMARY=${PRIMARY:-preview}
LEGACY=${LEGACY:-cloud/tc-mid-low}
REMOTE=${REMOTE:-origin}

git push "$REMOTE" "$PRIMARY" "$PRIMARY:$LEGACY"
echo "pushed $PRIMARY, mirrored $LEGACY at $(git rev-parse --short HEAD)"

if [ "${1:-}" = "--head" ]; then
  python3 tools/bump_head.py --push --branch "$PRIMARY"
  git push "$REMOTE" "$PRIMARY" "$PRIMARY:$LEGACY"
  echo "head pointer bumped and both refs re-pushed"
fi
