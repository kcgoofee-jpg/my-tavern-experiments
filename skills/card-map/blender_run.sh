#!/usr/bin/env bash
# 共用 GPU 的 Blender 启动器：先等别人的 Blender 退出（pgrep -x Blender 为空）、再等安静期锁，然后后台起自己的 Blender，
# 把自己的 PID 写进 <日志>.pid；要中止时只 kill 这个 PID，绝不 pkill / killall Blender（别的代理可能正在渲）。
# 用法：bash skills/card-map/blender_run.sh <日志> <blender 参数...>
#   例：bash skills/card-map/blender_run.sh /tmp/x.log -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/foo/build.py', run_name='__main__')" -- --res 900 --out /tmp/x.jpg
# 环境变量：WAIT_MAX（秒，默认 7200）、POLL（秒，默认 30）
set -u
LOG=$1; shift
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BL=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
WAIT_MAX=${WAIT_MAX:-7200}; POLL=${POLL:-30}; t=0
while pgrep -x Blender >/dev/null || pgrep -x blender >/dev/null; do
  [ "$t" -ge "$WAIT_MAX" ] && { echo "等了 ${WAIT_MAX}s Blender 仍在跑，放弃（没有动别人的进程）"; exit 3; }
  [ $((t % 300)) -eq 0 ] && echo "GPU 忙（$(pgrep -x Blender | tr '\n' ' ')），等待…"
  sleep "$POLL"; t=$((t + POLL))
done
[ -f "$ROOT/tools/quiet_wait.sh" ] && bash "$ROOT/tools/quiet_wait.sh" --max "$WAIT_MAX"
cd "$ROOT"
"$BL" "$@" >"$LOG" 2>&1 &
PID=$!; echo "$PID" >"$LOG.pid"; echo "Blender PID $PID（只 kill 这个），日志 $LOG"
wait "$PID"; rc=$?
grep -E '^WROTE|Error|Traceback' "$LOG" | tail -5
exit $rc
