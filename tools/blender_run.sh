#!/usr/bin/env bash
# 共用 GPU 的 Blender 启动器（原 skills/card-map/blender_run.sh，现全仓库统一用这一个）。
# - 先等别人的 Blender 退出（pgrep -x Blender 为空），再拿一把锁文件（防止两个启动器同时闯过 pgrep 检查的竞态）。
# - 用 ASCII 的 TMPDIR（/private/tmp/bl_tmp），避开中文仓库路径「性能/」触发的 Metal 内核缓存崩溃。
# - 崩溃（非零退出）重试一次；仍失败才返回失败。
# - 把自己的 PID 写进 <日志>.pid；要中止时只 kill 这个 PID，绝不 pkill / killall Blender（别的代理可能正在渲）。
# - 追加一行到 logs/render_times.csv：date,asset,kind,res,spp,minutes,exit
#
# 用法：bash tools/blender_run.sh --log <日志> --asset <名字> [--kind draft|final|patch] [--res N] [--spp N] -- <blender 参数...>
#   例：bash tools/blender_run.sh --log /tmp/x.log --asset tc_upper --kind final --res 8000 --spp 64 -- \
#         -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tiancheng_upper.py', run_name='__main__')" -- --res 8000 --samples 64 --out /tmp/x.png
#   旧参数形式（仅日志 + 透传，不记 CSV 资产信息）仍兼容：bash tools/blender_run.sh <日志> <blender 参数...>
# 环境变量：WAIT_MAX（秒，默认 7200）、POLL（秒，默认 30）、EDEN_GPU_LOCK（默认 /tmp/eden_gpu.lock）、DRY_RUN=1（不真的起 Blender，只演练锁 / 日志 / CSV，供测试用）
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BL=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
WAIT_MAX=${WAIT_MAX:-7200}; POLL=${POLL:-30}
LOCK=${EDEN_GPU_LOCK:-/tmp/eden_gpu.lock}
DRY_RUN=${DRY_RUN:-0}

LOG=""; ASSET=""; KIND="final"; RES=""; SPP=""; ARGS=()
if [ "${1:-}" != "--log" ] && [ $# -ge 1 ]; then
  # 旧用法：blender_run.sh <日志> <blender 参数...>
  LOG=$1; shift; ARGS=("$@")
else
  while [ $# -gt 0 ]; do
    case "$1" in
      --log) LOG=$2; shift 2 ;;
      --asset) ASSET=$2; shift 2 ;;
      --kind) KIND=$2; shift 2 ;;
      --res) RES=$2; shift 2 ;;
      --spp) SPP=$2; shift 2 ;;
      --) shift; ARGS=("$@"); break ;;
      *) echo "未知参数 $1" >&2; exit 2 ;;
    esac
  done
fi
[ -n "$LOG" ] || { echo "用法：tools/blender_run.sh --log <日志> --asset <名字> [--kind draft|final|patch] [--res N] [--spp N] -- <blender 参数...>" >&2; exit 2; }

mkdir -p "$(dirname "$LOG")" "$ROOT/logs"
export TMPDIR=/private/tmp/bl_tmp
mkdir -p "$TMPDIR"

t=0
while pgrep -x Blender >/dev/null || pgrep -x blender >/dev/null; do
  [ "$t" -ge "$WAIT_MAX" ] && { echo "等了 ${WAIT_MAX}s Blender 仍在跑，放弃（没有动别人的进程）"; exit 3; }
  [ $((t % 300)) -eq 0 ] && echo "GPU 忙（$(pgrep -x Blender | tr '\n' ' ')），等待…"
  sleep "$POLL"; t=$((t + POLL))
done
[ -f "$ROOT/tools/quiet_wait.sh" ] && bash "$ROOT/tools/quiet_wait.sh" --max "$WAIT_MAX"

# 锁文件：短暂持有，防止两个启动器同时通过上面的 pgrep 检查后一起起 Blender。
LOCK_WAIT=0
while ! ( set -o noclobber; echo $$ > "$LOCK" ) 2>/dev/null; do
  [ "$LOCK_WAIT" -ge "$WAIT_MAX" ] && { echo "等锁 ${LOCK}（$(cat "$LOCK" 2>/dev/null)）超时"; exit 3; }
  sleep 2; LOCK_WAIT=$((LOCK_WAIT + 2))
done
release_lock() { [ "$(cat "$LOCK" 2>/dev/null)" = "$$" ] && rm -f "$LOCK"; }
trap release_lock EXIT

cd "$ROOT"
run_once() {
  local t0=$SECONDS
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN] 会执行：$BL ${ARGS[*]}" | tee "$LOG"
    echo "DRY_RUN" > "$LOG.pid"
    rc=0
  else
    "$BL" "${ARGS[@]}" >"$LOG" 2>&1 &
    PID=$!; echo "$PID" >"$LOG.pid"; echo "Blender PID $PID（只 kill 这个），日志 $LOG"
    wait "$PID"; rc=$?
  fi
  echo $((SECONDS - t0))
  return $rc
}

MIN0=$SECONDS
run_once; rc=$?
MINUTES=$(( (SECONDS - MIN0 + 30) / 60 ))
if [ $rc -ne 0 ] && [ "$DRY_RUN" != 1 ]; then
  echo "第一次崩溃（退出码 $rc），重试一次…" >&2
  MIN0=$SECONDS
  run_once; rc=$?
  MINUTES=$(( (SECONDS - MIN0 + 30) / 60 ))
fi
release_lock; trap - EXIT

if [ "$DRY_RUN" != 1 ]; then grep -E '^WROTE|Error|Traceback' "$LOG" | tail -5; fi

CSV="$ROOT/logs/render_times.csv"
[ -f "$CSV" ] || echo 'date,asset,kind,res,spp,minutes,exit' > "$CSV"
echo "$(date +%Y-%m-%d),${ASSET:-unknown},$KIND,${RES:-},${SPP:-},$MINUTES,$rc" >> "$CSV"
exit $rc
