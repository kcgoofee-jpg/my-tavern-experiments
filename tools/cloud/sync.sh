#!/usr/bin/env bash
# 增量 rsync 仓库 + blender/data 素材（素材目录是符号链接，用 -L 展开真实文件）到云端。
# 用法：bash tools/cloud/sync.sh [--host <实例名>]
# 环境变量：DRY_RUN=1 只打印 rsync 命令（走 --dry-run，不真的传）
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"

cloud_lock_acquire "sync"

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
  --exclude docs/
  --exclude "map/tiles*"
  --exclude "*.jpg.bak"
)

# --info=progress2 是每个文件都刷新一整行；在非 TTY（Claude 桌面终端、日志文件、CI）下不会原地覆盖，
# 会把几千行进度全部打印出来刷屏。TTY 下保留原生单行滚动；非 TTY 下改成 rsync 自己按 --out-format
# 只在文件完成时打一行，外面再用 awk 节流成大约每 5 秒或 25/50/75/100% 打一条总结。
# docs/ 被排除，但云端渲染的产出（docs/drafts/*）就写在那里：--delete-excluded 会把它们删掉（2026-09-28 原域定稿主图被另一次 sync 删了）。
# 用 protect 过滤规则保护远端 docs/ 与 logs/ 不被删；过滤规则要放在 exclude 前面。
RSYNC_ARGS=(-azL --partial --delete-excluded --filter='P docs/' --filter='P logs/' "${EXCLUDES[@]}")

echo "--- 同步到 [$HOST_NAME] ${REMOTE_DIR}（第一次约 3GB @ ~8MB/s 约 3.5 分钟，之后只传改动） ---"

if [ -t 1 ]; then
  run_rsync "${RSYNC_ARGS[@]}" --info=progress2,stats1 "$ROOT/" "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/"
else
  # 非 TTY：先数总文件数做百分比分母，再用 --out-format 逐文件打点，awk 节流到 ~5s 或 25/50/75/100% 才输出一行
  echo "（非 TTY 输出：改成每 ~5 秒或 25/50/75/100% 打一条总结，不逐文件刷屏）"
  TOTAL=1
  if [ "$DRY_RUN" != 1 ]; then
    TOTAL=$(run_rsync "${RSYNC_ARGS[@]}" --dry-run --out-format='%n' "$ROOT/" "${REMOTE_USER}@${HOST}:${REMOTE_DIR}/" 2>/dev/null | grep -c . || echo 1)
    [ "$TOTAL" -le 0 ] 2>/dev/null && TOTAL=1
  fi
  # macOS 自带 awk（非 gawk）没有 systime()，所以节流放在 bash 里用 `date +%s` 做，不依赖 awk 的时间函数
  n=0; bytes=0; last_t=$(date +%s); last_pct=-1
  while IFS= read -r line; do
    case "$line" in
      "FILE "*)
        n=$((n+1))
        sz=${line##* }
        [[ "$sz" =~ ^[0-9]+$ ]] && bytes=$((bytes+sz))
        pct=0; [ "$TOTAL" -gt 0 ] 2>/dev/null && pct=$((n*100/TOTAL))
        now=$(date +%s)
        milestone=0
        for m in 25 50 75 100; do [ "$pct" -ge "$m" ] && [ "$last_pct" -lt "$m" ] && milestone=1; done
        if [ $((now-last_t)) -ge 5 ] || [ "$milestone" = 1 ]; then
          mb=$(awk -v b="$bytes" 'BEGIN{printf "%.1f", b/1048576}')
          echo "  进度：${n}/${TOTAL} 文件（${pct}%），约 ${mb} MB"
          last_t=$now; last_pct=$pct
        fi
        ;;
      *) echo "$line" ;;
    esac
  done < <(run_rsync "${RSYNC_ARGS[@]}" --out-format='FILE %n %l' "$ROOT/" "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/" 2>&1)
  mb=$(awk -v b="$bytes" 'BEGIN{printf "%.1f", b/1048576}')
  echo "  完成：${n} 文件，约 ${mb} MB"
fi
