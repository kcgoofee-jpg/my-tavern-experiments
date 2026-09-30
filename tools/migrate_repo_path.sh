#!/bin/bash
# Move the repo from /Users/davidzhao/dev1/cctest1/性能/threejs to
# /Users/davidzhao/dev1/cctest1/eden-map. Write-only helper: does NOT move
# the directory itself (that's a plain `mv` the user runs by hand), it
# rewrites everything else that hardcodes the old path.
#
# Usage:
#   DRY_RUN=1 bash tools/migrate_repo_path.sh   # print what would happen
#   bash tools/migrate_repo_path.sh             # actually rewrite + repair
#
# Run this AFTER the directory has already been moved/renamed on disk
# (性能/threejs -> eden-map), and after other agents/worktrees are idle.
set -euo pipefail

OLD_PATH="/Users/davidzhao/dev1/cctest1/性能/threejs"
NEW_PATH="/Users/davidzhao/dev1/cctest1/eden-map"
DRY_RUN="${DRY_RUN:-0}"

# Claude Code's project-memory dirname scheme: every character that is not
# [A-Za-z0-9] (this includes '/', non-ASCII CJK, and literal '-') becomes '-'.
encode_claude_dirname() {
  printf '%s' "$1" | perl -CS -pe 's/[^A-Za-z0-9]/-/g'
}

OLD_MEMDIR_NAME="$(encode_claude_dirname "$OLD_PATH")"
NEW_MEMDIR_NAME="$(encode_claude_dirname "$NEW_PATH")"
CLAUDE_PROJECTS_DIR="$HOME/.claude/projects"
OLD_MEMDIR="$CLAUDE_PROJECTS_DIR/$OLD_MEMDIR_NAME/memory"
NEW_MEMDIR="$CLAUDE_PROJECTS_DIR/$NEW_MEMDIR_NAME/memory"

log() { echo "[migrate] $*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

if [ ! -d "$NEW_PATH" ]; then
  echo "[migrate] ERROR: $NEW_PATH does not exist yet." >&2
  echo "[migrate] Move/rename the directory first (性能/threejs -> eden-map), then re-run this script from inside $NEW_PATH." >&2
  exit 1
fi

cd "$NEW_PATH"

log "1) Rewriting occurrences of the old absolute path in repo files"
# NUL-delimited to survive filenames/paths with spaces or non-ASCII.
HIT_FILES=()
while IFS= read -r -d '' f; do HIT_FILES+=("$f"); done < <(
  grep -rlZ --binary-files=without-match -F "$OLD_PATH" . \
    --exclude-dir=.git 2>/dev/null || true
)
log "   found ${#HIT_FILES[@]} file(s) containing the old path"
for f in ${HIT_FILES[@]+"${HIT_FILES[@]}"}; do
  log "   - $f"
  if [ "$DRY_RUN" != "1" ]; then
    perl -pi -e "s{\Q$OLD_PATH\E}{$NEW_PATH}g" "$f"
  fi
done

log "2) Rewriting .claude/settings.local.json (repo + home, if present)"
for f in "$NEW_PATH/.claude/settings.local.json" "$HOME/.claude/settings.local.json"; do
  if [ -f "$f" ] && grep -qF "$OLD_PATH" "$f" 2>/dev/null; then
    log "   - $f"
    if [ "$DRY_RUN" != "1" ]; then
      perl -pi -e "s{\Q$OLD_PATH\E}{$NEW_PATH}g" "$f"
    fi
  fi
done

log "3) Worktrees to re-attach with 'git worktree repair' (run from $NEW_PATH):"
log "   These live under a scratchpad dir outside the repo and still point at the old repo path internally."
command cat <<EOF
   git worktree repair /path/to/scratchpad/wt-mid
   git worktree repair /path/to/scratchpad/wt18
   git worktree repair /path/to/scratchpad/wtw
EOF
log "   (Replace /path/to/scratchpad with the actual scratchpad dir shown by 'git worktree list' before the move.)"
if [ "$DRY_RUN" != "1" ]; then
  log "   Attempting repair for any wt-mid / wt18 / wtw dirs found under \$TMPDIR and /private/tmp ..."
  while IFS= read -r -d '' d; do
    log "   repairing $d"
    git worktree repair "$d" || log "   WARN: repair failed for $d"
  done < <(find /private/tmp /tmp "${TMPDIR:-/tmp}" -maxdepth 6 -type d \( -name wt-mid -o -name wt18 -o -name wtw \) -print0 2>/dev/null)
  git worktree repair || true
fi

log "4) Copying Claude memory dir"
log "   $OLD_MEMDIR"
log "-> $NEW_MEMDIR"
if [ -d "$OLD_MEMDIR" ]; then
  run mkdir -p "$(dirname "$NEW_MEMDIR")"
  run mkdir -p "$NEW_MEMDIR"
  run cp -Rn "$OLD_MEMDIR/." "$NEW_MEMDIR/"
else
  log "   WARN: old memory dir not found, skipping copy"
fi

log "5) Running tools/cloud/doctor.sh"
run bash tools/cloud/doctor.sh

log "Done. DRY_RUN=$DRY_RUN"
