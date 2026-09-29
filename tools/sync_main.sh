#!/usr/bin/env bash
# Fast-forward `main` to the follow branch. See docs/branching.md.
#
# Usage: bash tools/sync_main.sh            # sync + push
#        DRY_RUN=1 bash tools/sync_main.sh  # show what would happen
#
# `main` is the release line: tags live there. While the project is pre-release the
# follow branch and `main` carry identical content, so the sync is a plain fast-forward.
# This script refuses to do anything else, and that refusal is the point: after the
# 2026-09 history rewrite `main` is an ancestor of the follow branch, so a forced update
# is never needed again. A `main` that is NOT an ancestor means someone committed to
# `main` directly — that is a decision to make by hand, not something a script should
# paper over by force-pushing.
set -euo pipefail
cd "$(dirname "$0")/.."
FOLLOW=${FOLLOW:-preview}
REMOTE=${REMOTE:-origin}
DRY_RUN=${DRY_RUN:-0}

git fetch -q "$REMOTE" "$FOLLOW" main 2>/dev/null || { echo "拉取 $REMOTE 失败" >&2; exit 3; }

follow_sha=$(git rev-parse "$REMOTE/$FOLLOW")
main_sha=$(git rev-parse "$REMOTE/main" 2>/dev/null || echo "")

if [ -n "$main_sha" ] && ! git merge-base --is-ancestor "$main_sha" "$follow_sha"; then
  echo "拒绝：$REMOTE/main 不是 $REMOTE/$FOLLOW 的祖先，不能快进。" >&2
  echo "  main 独有的提交（需要人工判断是否该保留）：" >&2
  git --no-pager log --oneline "$REMOTE/main" --not "$REMOTE/$FOLLOW" | head -10 >&2
  exit 2
fi

# 本地 main 也不能有远端跟随分支没有的提交，否则 update-ref 会悄悄丢掉它们
if git rev-parse --verify -q refs/heads/main >/dev/null; then
  if ! git merge-base --is-ancestor refs/heads/main "$REMOTE/$FOLLOW"; then
    echo "拒绝：本地 main 有 $FOLLOW 没有的提交（先用 git log main --not $REMOTE/$FOLLOW 看一眼）" >&2
    git --no-pager log --oneline refs/heads/main --not "$REMOTE/$FOLLOW" | head -10 >&2
    exit 2
  fi
fi

if [ "$main_sha" = "$follow_sha" ]; then
  echo "main 已与 $FOLLOW 一致（$(git rev-parse --short "$follow_sha")），无需同步"
  exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] main $(git rev-parse --short "$main_sha") → $(git rev-parse --short "$follow_sha")（快进，不推）"
  exit 0
fi

git update-ref refs/heads/main "$follow_sha"
git push "$REMOTE" refs/heads/main:refs/heads/main
echo "main 已快进到 $(git rev-parse --short "$follow_sha")（与 $FOLLOW 一致）"
