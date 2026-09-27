#!/usr/bin/env bash
# 等安静期锁（tools/quiet.sh）过去再返回；没有锁或锁已过期时立即返回 0。
# 用法：bash tools/quiet_wait.sh [--check] [--max 秒]
#   --check：不等，只判断（0 = 可以开工，1 = 安静中）
#   --max N：最多等 N 秒，超时退出码 3
set -euo pipefail
F=${EDEN_QUIET_FILE:-/tmp/eden-quiet-until}; CHECK=0; MAX=0; STEP=${EDEN_QUIET_POLL:-20}
while [ $# -gt 0 ]; do case "$1" in --check) CHECK=1; shift ;; --max) MAX=$2; shift 2 ;; *) echo "未知参数 $1" >&2; exit 2 ;; esac; done
until_ts() { [ -f "$F" ] && read -r T _ < "$F" && [[ "$T" =~ ^[0-9]+$ ]] && echo "$T" || echo 0; }
T=$(until_ts); NOW=$(date +%s)
[ "$T" -le "$NOW" ] && exit 0
[ "$CHECK" = 1 ] && { echo "安静中：到 $(cut -d' ' -f2- "$F")" >&2; exit 1; }
echo "安静期：等到 $(cut -d' ' -f2- "$F")（约 $(( (T - NOW + 59) / 60 )) 分钟；bash tools/quiet.sh off 可提前解除）" >&2
START=$NOW
while :; do
  T=$(until_ts); NOW=$(date +%s)
  [ "$T" -le "$NOW" ] && { echo "安静期结束，继续" >&2; exit 0; }
  [ "$MAX" -gt 0 ] && [ $((NOW - START)) -ge "$MAX" ] && { echo "等待超时（$MAX 秒）" >&2; exit 3; }
  S=$((T - NOW)); [ "$S" -gt "$STEP" ] && S=$STEP; sleep "$S"
done
