#!/usr/bin/env bash
# 安静期锁：用户在真机上测试、录屏或跑基准时，让渲染和浏览器测试先别开（它们会抢 CPU / GPU）。
# 用法：bash tools/quiet.sh <分钟>   # 从现在起安静 N 分钟（写 /tmp/eden-quiet-until：epoch 秒 + 可读时间）
#       bash tools/quiet.sh off       # 解除
#       bash tools/quiet.sh status    # 查看（退出码 0 = 安静中，1 = 没有锁）
# 遵守方：tools/quiet_wait.sh（render_all.sh、crops.sh、tools/browser/ 的测试开始前都会调用它等待）。
# 锁文件位置可用 EDEN_QUIET_FILE 覆盖（测试用）。
set -euo pipefail
F=${EDEN_QUIET_FILE:-/tmp/eden-quiet-until}
case "${1:-status}" in
  off) rm -f "$F"; echo "安静期已解除" ;;
  status)
    if [ -f "$F" ]; then read -r T REST < "$F" || true
      NOW=$(date +%s)
      if [[ "$T" =~ ^[0-9]+$ ]] && [ "$T" -gt "$NOW" ]; then echo "安静中：到 ${REST}（还剩 $(( (T - NOW + 59) / 60 )) 分钟）"; exit 0; fi
      echo "锁已过期（${REST}），视为没有锁"; exit 1
    fi
    echo "没有安静期锁"; exit 1 ;;
  *)
    [[ "$1" =~ ^[0-9]+$ ]] || { echo "用法：quiet.sh <分钟>|off|status" >&2; exit 2; }
    T=$(( $(date +%s) + $1 * 60 ))
    echo "$T $(date -r "$T" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date -d "@$T" '+%Y-%m-%d %H:%M:%S %Z')" > "$F"
    echo "安静期到 $(cut -d' ' -f2- "$F")（${F}）" ;;
esac
