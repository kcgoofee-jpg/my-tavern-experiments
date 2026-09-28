#!/usr/bin/env bash
# 增量 rsync 仓库 + blender/data 素材（素材目录是符号链接，用 -L 展开真实文件）到云端。
# 用法：bash tools/cloud/sync.sh
# 环境变量：DRY_RUN=1 只打印 rsync 命令（走 --dry-run，不真的传）
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"

EXCLUDES=(
  --exclude .git
  --exclude tiles/
  --exclude node_modules/
  --exclude tools/browser/node_modules/
  --exclude blender/data/osm/raw/
  --exclude blender/data/real3d/raw/
  --exclude __pycache__/
  --exclude '*.blend1'
  --exclude .DS_Store
)

RSYNC_ARGS=(-avzL --delete-excluded "${EXCLUDES[@]}")

echo "--- 同步仓库到 ${REMOTE_DIR} ---"
run_rsync "${RSYNC_ARGS[@]}" "$ROOT/" "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/"
