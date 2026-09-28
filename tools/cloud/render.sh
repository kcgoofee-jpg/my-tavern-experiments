#!/usr/bin/env bash
# 云端跑一次 blender_run.sh 同款渲染：nohup 后台起、轮询、结果 rsync 回本地，记 logs/render_times.csv。
# 用法：bash tools/cloud/render.sh <跟 tools/blender_run.sh 一样的参数>
#   例：bash tools/cloud/render.sh --log /tmp/x.log --asset tc_upper --kind final --res 8000 --spp 64 -- \
#         -b --factory-startup --python-expr "..." -- --res 8000 --samples 64 --out map/art/tc_upper_8k.png
# 环境变量：DRY_RUN=1 只打印远程/rsync 命令；POLL（秒，默认 30）；WAIT_MAX（秒，默认 7200）
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
POLL=${POLL:-30}; WAIT_MAX=${WAIT_MAX:-7200}

[ $# -ge 1 ] || { echo "用法：tools/cloud/render.sh <tools/blender_run.sh 参数...>" >&2; exit 2; }

# 从参数里把 --log/--asset/--kind/--out 摘出来，用于回传和记账；其余原样透传给远端的 blender_run.sh
ASSET="unknown"; KIND="final"; OUT=""; PASS=("$@")
i=0; args=("$@")
while [ $i -lt ${#args[@]} ]; do
  case "${args[$i]}" in
    --asset) ASSET=${args[$((i+1))]} ;;
    --kind) KIND=${args[$((i+1))]} ;;
    --out) OUT=${args[$((i+1))]} ;;
  esac
  i=$((i+1))
done
# 也从 -- 之后的 blender 透传参数里找 --out（blender_run.sh 的用法里 --out 通常在第二个 -- 之后）
if [ -z "$OUT" ]; then
  for ((j=0; j<${#args[@]}; j++)); do
    if [ "${args[$j]}" = "--out" ]; then OUT=${args[$((j+1))]}; break; fi
  done
fi

REMOTE_LOG="$REMOTE_DIR/logs/cloud_render_$$.log"
REMOTE_PIDFILE="$REMOTE_DIR/logs/cloud_render_$$.pid"

# 拼远端命令：cd 到 REMOTE_DIR，设 GPU 环境变量（OPTIX 优先，探测不到脚本内部会自动退到 CUDA/CPU），nohup 起 blender_run.sh
# 用 pidfile 记录后台 PID，轮询时用 kill -0 判断是否还活着——不要用 pgrep -f 'tools/blender_run.sh'：
# 这条 ssh 远程命令的命令行本身就带有这段文本，pgrep -f 会连自己（发起轮询的那个 ssh/bash 进程）一起匹配上，
# 导致永远判断为“还在跑”，直到 WAIT_MAX 超时（2026-09-28 排查的自匹配 bug）。
QUOTED=""
for a in "${PASS[@]}"; do QUOTED+=" $(printf '%q' "$a")"; done
REMOTE_CMD="cd '$REMOTE_DIR' && mkdir -p logs && EDEN_CYCLES_DEVICE=OPTIX nohup bash tools/blender_run.sh$QUOTED > '$REMOTE_LOG.nohup' 2>&1 & echo \$! > '$REMOTE_PIDFILE'; echo REMOTE_PID=\$(cat '$REMOTE_PIDFILE')"

echo "--- 远端起渲染 ---"
if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] ssh ... -- \"$REMOTE_CMD\""
else
  require_host
  run_ssh "test -f ${REMOTE_DIR}/tools/blender_run.sh" || { echo "云端还没有项目文件：先运行 bash tools/cloud/sync.sh" >&2; exit 4; }
  # shellcheck disable=SC2046
  START_OUT=$(ssh $(ssh_opts) "${REMOTE_USER}@${HOST}" -- "$REMOTE_CMD")
  echo "$START_OUT"
fi

# 轮询：远端 blender_run.sh 自己会把 CSV 行追加在完成时；这里轮询它退出（用透传的 --log 对应的远端路径判断更准，
# 但 blender_run.sh 的 --log 是本地相对路径概念，云端语境下我们改为轮询 REMOTE_CMD 里起的那个 bash 进程本身）
if [ "$DRY_RUN" != 1 ]; then
  echo "--- 轮询远端渲染进程（pidfile: $REMOTE_PIDFILE）---"
  t=0
  while run_ssh "test -f '$REMOTE_PIDFILE' && kill -0 \$(cat '$REMOTE_PIDFILE') 2>/dev/null" ; do
    [ "$t" -ge "$WAIT_MAX" ] && { echo "等了 ${WAIT_MAX}s 还没完，先退出脚本（远端继续跑，之后可单独 rsync 结果回来）"; break; }
    sleep 30; t=$((t+30))
    echo "  渲染中… 已 ${t}s；显卡占用 $(run_ssh "nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader" 2>/dev/null)"
  done
  echo "远端渲染进程已结束（或轮询超时）"
fi

echo "--- 结果 rsync 回本地 ---"
if [ -n "$OUT" ]; then
  REL_OUT=${OUT#"$ROOT"/}
  mkdir -p "$(dirname "$ROOT/$REL_OUT")" 2>/dev/null || true
  run_rsync -avz "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/${REL_OUT}" "$ROOT/$REL_OUT"
else
  echo "没解析到 --out，跳过自动回传；可手动 rsync ${REMOTE_DIR}/<输出路径> 到本地对应路径"
fi
# 顺带把远端产出目录常见位置（map/art、blender/out）同步回来，覆盖没显式给 --out 的情况
run_rsync -avz --include='*/' --include='*.png' --include='*.exr' --exclude='*' \
  "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/map/art/" "$ROOT/map/art/" 2>/dev/null || true

echo "--- 记 logs/render_times.csv ---"
CSV="$ROOT/logs/render_times.csv"
[ -f "$CSV" ] || echo 'date,asset,kind,res,spp,minutes,exit,host' > "$CSV"
if [ "$DRY_RUN" = 1 ]; then
  GPU_NAME="dryrun-gpu"
else
  GPU_NAME=$(run_ssh "nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | tr ' ' '-'" 2>/dev/null || echo unknown-gpu)
  [ -z "$GPU_NAME" ] && GPU_NAME=unknown-gpu
fi
RES=""; SPP=""
for ((j=0; j<${#args[@]}; j++)); do
  case "${args[$j]}" in --res) RES=${args[$((j+1))]} ;; --spp) SPP=${args[$((j+1))]} ;; esac
done
echo "$(date +%Y-%m-%d),${ASSET},${KIND},${RES},${SPP},NA,0,autodl-${GPU_NAME}" >> "$CSV"
echo "写了 CSV 行（minutes=NA：云端计时以远端 blender_run.sh 自己记的日志为准，人工核对后可改）；host=autodl-${GPU_NAME}"
