#!/usr/bin/env bash
# 看一眼云实例现状：远端 blender 任务、GPU 占用、磁盘、开机时长、按 PRICE_PER_HOUR 估算已花的钱。只读。
# 用法：bash tools/cloud/status.sh [--host <实例名>]
# 环境变量：DRY_RUN=1 本地演练，不连接
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"
BUSY_ONLY=0
for a in "$@"; do [ "$a" = "--busy-check" ] && BUSY_ONLY=1; done

if [ "$BUSY_ONLY" != 1 ]; then echo "== 实例 ${HOST_NAME}（${HOST:-<未配置>}）=="; fi

if [ "$DRY_RUN" = 1 ]; then
  [ "$BUSY_ONLY" = 1 ] && { echo IDLE; exit 0; }
  echo "[DRY_RUN] 会 ssh 查询 blender 进程 / nvidia-smi / df / uptime"
  exit 0
fi
require_host

if [ "$BUSY_ONLY" = 1 ]; then
  # 给 tools/render_queue.sh 用：只输出 IDLE 或 BUSY，不带其它文字，方便脚本解析
  if run_ssh "pgrep -f '[t]ools/blender_run.sh|/opt/[b]lender/blender' >/dev/null" 2>/dev/null; then echo BUSY; else echo IDLE; fi
  exit 0
fi

R=$(run_ssh "
  echo '--jobs--'; pgrep -fal '[t]ools/blender_run.sh|/opt/[b]lender/blender' || echo '（空闲，没有 blender 在跑）'
  echo '--gpu--'; nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader 2>&1
  echo '--disk--'; df -h ${REMOTE_DIR%/*} | awk 'NR==2{print \$3,\"/\",\$2,\"(\"\$5\" 已用)\"}'
  echo '--uptime--'; ps -o etimes= -p 1 | tr -d ' '
")

jobs=$(sed -n '/--jobs--/,/--gpu--/p' <<<"$R" | sed '1d;$d')
gpu=$(sed -n '/--gpu--/,/--disk--/p' <<<"$R" | sed '1d;$d')
disk=$(sed -n '/--disk--/,/--uptime--/p' <<<"$R" | sed '1d;$d')
uptime_s=$(sed -n '/--uptime--/,$p' <<<"$R" | sed '1d' | head -1)

echo "-- 远端任务 --"; echo "$jobs" | sed 's/^/  /'
echo "-- GPU 占用（利用率%,已用显存MiB,总显存MiB,温度C）--"; echo "$gpu" | sed 's/^/  /'
echo "-- 磁盘（${REMOTE_DIR%/*}）--"; echo "$disk" | sed 's/^/  /'

if [[ "$uptime_s" =~ ^[0-9.]+$ ]]; then
  hours=$(awk -v s="$uptime_s" 'BEGIN{printf "%.2f", s/3600}')
  cost=$(awk -v h="$hours" -v p="$PRICE_PER_HOUR" 'BEGIN{printf "%.2f", h*p}')
  mins=$(awk -v s="$uptime_s" 'BEGIN{printf "%d", s/60}')
  echo "-- 开机时长 --"
  echo "  约 ${mins} 分钟（${hours} 小时）；按 ${PRICE_PER_HOUR} 元/小时估算，本次开机已花约 ¥${cost}（不含关机后的存储费）"
else
  echo "-- 开机时长 -- 取不到 uptime（${uptime_s}）"
fi
