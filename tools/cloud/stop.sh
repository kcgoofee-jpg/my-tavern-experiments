#!/usr/bin/env bash
# 只杀我们自己起的远端 blender 任务（tools/blender_run.sh 及其子进程 /opt/blender/blender），
# 不碰同机其他用户/容器的进程；用来解掉「卡死渲染占住终端」的场景。
# 用法：bash tools/cloud/stop.sh [--host <实例名>] [--yes]
# 环境变量：DRY_RUN=1 本地演练
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"

YES=0
while [ $# -gt 0 ]; do case "$1" in --yes) YES=1; shift ;; *) echo "未知参数 $1" >&2; exit 2 ;; esac; done

echo "== 实例 ${HOST_NAME}：查找我们的 blender 任务 =="
if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] 会 ssh pgrep -fal '[t]ools/blender_run.sh|/opt/[b]lender/blender' 并 kill 匹配 PID"
  exit 0
fi
require_host

PIDS=$(run_ssh "pgrep -f '[t]ools/blender_run.sh|/opt/[b]lender/blender' || true")
if [ -z "$PIDS" ]; then
  echo "没有我们的 blender 任务在跑，什么都不用做"
  exit 0
fi
echo "找到 PID：${PIDS//$'\n'/ }"
run_ssh "pgrep -fal '[t]ools/blender_run.sh|/opt/[b]lender/blender'" | sed 's/^/  /'

if [ "$YES" != 1 ]; then
  read -r -p "确认只 kill 上面这些 PID？[y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "取消"; exit 1; }
fi

run_ssh "kill $(tr '\n' ' ' <<<"$PIDS") 2>/dev/null; sleep 2; kill -9 $(tr '\n' ' ' <<<"$PIDS") 2>/dev/null; echo done"
echo "已发 kill；再跑一次 doctor.sh 或 status.sh 确认云端空闲"
