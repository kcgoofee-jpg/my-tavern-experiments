#!/usr/bin/env bash
# 装一个可选的远端看门狗：GPU 连续空闲 N 分钟就 shutdown（AutoDL 关机后停止按小时计费的算力费，
# 数据盘不受影响，见 docs/cloud-render.md「关机保留数据盘」一节）。默认不装；显式给 --idle-shutdown 才装。
# 用法：
#   bash tools/cloud/idle_guard.sh --idle-shutdown 30 [--host <实例名>]   # 装/更新看门狗，30 分钟空闲后关机
#   bash tools/cloud/idle_guard.sh --off [--host <实例名>]                # 卸掉看门狗
# 环境变量：DRY_RUN=1 本地演练
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"

MINUTES=""; OFF=0
while [ $# -gt 0 ]; do
  case "$1" in
    --idle-shutdown) MINUTES=$2; shift 2 ;;
    --off) OFF=1; shift ;;
    *) echo "未知参数 $1" >&2; exit 2 ;;
  esac
done

if [ "$OFF" = 1 ]; then
  echo "== 实例 $HOST_NAME：卸掉空闲看门狗 =="
  run_ssh "pkill -f eden_idle_guard.sh 2>/dev/null; rm -f /root/eden_idle_guard.sh; (crontab -l 2>/dev/null | grep -v eden_idle_guard) | crontab - 2>/dev/null; echo 已卸载"
  exit $?
fi

[ -n "$MINUTES" ] || { echo "用法：--idle-shutdown <分钟>（装）或 --off（卸）。默认不装看门狗。" >&2; exit 2; }

echo "== 实例 $HOST_NAME：装空闲看门狗（GPU 连续空闲 ${MINUTES} 分钟后 shutdown） =="
REMOTE_CMD=$(cat <<EOF
set -eu
cat > /root/eden_idle_guard.sh <<'SH'
#!/bin/bash
# 每分钟检查一次 GPU 利用率，连续 IDLE_MIN 分钟利用率为 0 就 shutdown。
IDLE_MIN=${MINUTES}
count=0
while true; do
  util=\$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1)
  if [ -n "\$util" ] && [ "\$util" -gt 0 ] 2>/dev/null; then
    count=0
  else
    count=\$((count+1))
  fi
  if [ "\$count" -ge "\$IDLE_MIN" ]; then
    echo "\$(date) GPU 空闲 \${IDLE_MIN} 分钟，shutdown" >> /root/eden_idle_guard.log
    shutdown -h now
    exit 0
  fi
  sleep 60
done
SH
chmod +x /root/eden_idle_guard.sh
pkill -f eden_idle_guard.sh 2>/dev/null || true
nohup /root/eden_idle_guard.sh > /root/eden_idle_guard.nohup 2>&1 &
disown
echo "看门狗已启动（PID \$!），日志见 /root/eden_idle_guard.log"
EOF
)

if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] 会通过 ssh 部署并启动看门狗脚本："
  echo "$REMOTE_CMD"
  exit 0
fi
require_host
run_ssh "$REMOTE_CMD"
echo "关机后 AutoDL 按小时计费的算力费停止，数据盘（${REMOTE_DIR}）保留，见 docs/cloud-render.md"
