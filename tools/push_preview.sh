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
# CDN warm-up (2026-09-30): after the push this runs `tools/warm_cdn.sh --diff --detach` —
# only the files this push changed plus the head pointers, in the background, so a small
# commit costs seconds instead of the 3–5 minutes a full ~2900-file sweep used to.
#   WARM=0 bash tools/push_preview.sh          # skip the warm-up entirely
#   bash tools/push_preview.sh --full          # force the full sweep (art/props changed)
#   (a --diff run escalates to --full by itself when map/art/, map/props/, *.dzi or *.glb moved)
#
# Usage:
#   bash tools/push_preview.sh            # push preview, then warm the diff in the background
#   bash tools/push_preview.sh --head     # ...then bump the follow head pointer (head.json) and push again
#   bash tools/push_preview.sh --no-warm  # push only
#   LEGACY=1 bash tools/push_preview.sh   # grace window only: also move the deprecated mirror
set -euo pipefail
cd "$(dirname "$0")/.."

PRIMARY=${PRIMARY:-preview}
LEGACY_REF=${LEGACY_REF:-cloud/tc-mid-low}
REMOTE=${REMOTE:-origin}
LEGACY=${LEGACY:-0}
WARM=${WARM:-1}
WARM_FULL=0
WARM_NOESC=0
HEADBUMP=0
for a in "$@"; do case "$a" in
  --head) HEADBUMP=1 ;;
  --no-warm) WARM=0 ;;
  --full) WARM_FULL=1 ;;
  --no-escalate) WARM_NOESC=1 ;;   # 增量里带了 map/art/ / *.glb 也不升级成全量（见 tools/warm_cdn.sh）
  *) echo "未知参数 $a" >&2; exit 2 ;; esac; done

# Pushes HEAD, not the local branch of that name: in a worktree (the required workflow, docs/agent-brief.md §3)
# a local `preview` is the main checkout's ref and may be stale, while HEAD is the work to publish.
push_all () {
  if [ "$LEGACY" = "1" ]; then
    git push "$REMOTE" "HEAD:refs/heads/$PRIMARY" "HEAD:refs/heads/$LEGACY_REF"
    echo "pushed $PRIMARY, mirrored $LEGACY_REF at $(git rev-parse --short HEAD)"
  else
    git push "$REMOTE" "HEAD:refs/heads/$PRIMARY"
    echo "pushed $PRIMARY at $(git rev-parse --short HEAD)"
  fi
}

# 预热基线：推送前远端的位置（已经预热过的东西不用再请求一遍）
BEFORE=$(git rev-parse -q --verify "refs/remotes/origin/$PRIMARY" || true)

push_all

if [ "$HEADBUMP" = 1 ]; then
  python3 tools/bump_head.py --push --branch "$PRIMARY"
  push_all
  echo "head pointer bumped and refs re-pushed"
fi

# 收尾预热：默认「本次改动 + 头指针」并后台脱离（日志 logs/warm_cdn.log）
if [ "$WARM" = "1" ]; then
  SHA=$(git rev-parse HEAD)
  if git log -1 --format=%s | grep -q '^head #'; then SHA=$(git rev-parse HEAD^); fi   # head.json 记的是父提交，预热它
  if [ "$WARM_FULL" = "1" ]; then WA=(--full)
  elif [ -n "$BEFORE" ]; then WA=(--diff "$BEFORE")
  else WA=(--diff); fi
  [ "$WARM_NOESC" = "1" ] && WA+=(--no-escalate)
  bash tools/warm_cdn.sh "$SHA" 16 "${WA[@]}" --purge-branch "$PRIMARY" --detach
fi
