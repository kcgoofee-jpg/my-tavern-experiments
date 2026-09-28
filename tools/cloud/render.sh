#!/usr/bin/env bash
# 云端跑一次 blender_run.sh 同款渲染：nohup 后台起、轮询、结果 rsync 回本地，记 logs/render_times.csv。
# 用法：bash tools/cloud/render.sh <跟 tools/blender_run.sh 一样的参数>
#   例：bash tools/cloud/render.sh --log /tmp/x.log --asset tc_upper --kind final --res 8000 --spp 64 -- \
#         -b --factory-startup --python-expr "..." -- --res 8000 --samples 64 --out map/art/tc_upper_8k.png
# 环境变量：DRY_RUN=1 只打印远程/rsync 命令；POLL（秒，默认 30）；WAIT_MAX（秒，默认 0 = 一直等到远端结束——
#   远端看门狗保证任务一定会结束或被杀；设了上限且超时时本地记 status=unknown，远端继续跑）
#   EDEN_CYCLES_DEVICE（默认 OPTIX；=CPU 是测试用的强制 CPU）、EDEN_GUARD_NO_INPROC=1（测试：只让看门狗杀）会原样带到远端
# 渲染守卫（docs/cloud-render.md「渲染守卫」）：上传前本地跑 tools/render_preflight.py，不过就拒绝（记 CSV status=arg_error/no_device_helper）；
#   远端 blender_run.sh 带看门狗跑，结论写 <日志>.verdict；本地据此记 logs/render_times.csv（status、浪费分钟和钱），失败退出非零并打印原因和远端日志尾巴。
#   只杀本任务的 PID，绝不停实例；本地锁在退出时释放，队列继续。
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"
POLL=${POLL:-30}; WAIT_MAX=${WAIT_MAX:-0}

[ $# -ge 1 ] || { echo "用法：tools/cloud/render.sh [--host <实例名>] <tools/blender_run.sh 参数...>" >&2; exit 2; }

# 从参数里把 --log/--asset/--kind/--res/--spp/--out 摘出来，用于回传和记账；其余原样透传给远端的 blender_run.sh
ASSET="unknown"; KIND="final"; OUT=""; LOGARG=""; RES=""; SPP=""; PASS=("$@")
i=0; args=("$@")
while [ $i -lt ${#args[@]} ]; do
  case "${args[$i]}" in
    --) break ;;
    --log) LOGARG=${args[$((i+1))]:-} ;;
    --asset) ASSET=${args[$((i+1))]:-} ;;
    --kind) KIND=${args[$((i+1))]:-} ;;
    --res) RES=${args[$((i+1))]:-} ;;
    --spp) SPP=${args[$((i+1))]:-} ;;
  esac
  i=$((i+1))
done
CSV="$ROOT/logs/render_times.csv"
PY_LOCAL=$(command -v python3 || true)
# 本地记一行：$1=status $2=分钟 $3=退出码 $4=host
csv_row() {
  local st=$1 mins=$2 rc=$3 host=$4 wmin=0 wcny=0
  if [ "$st" != ok ]; then wmin=$mins; wcny=$(awk -v m="$mins" -v p="$PRICE_PER_HOUR" 'BEGIN{printf "%.2f", m/60*p}'); fi
  [ -f "$CSV" ] || echo 'date,asset,kind,res,spp,minutes,exit,host,status,wasted_min,wasted_cny' > "$CSV"
  echo "$(date +%Y-%m-%d),${ASSET},${KIND},${RES},${SPP},${mins},${rc},${host},${st},${wmin},${wcny}" >> "$CSV"
  WASTED_CNY=$wcny
}

# 静态检查：不过就不上传、不占锁
if [ -n "$PY_LOCAL" ]; then
  if ! PF=$("$PY_LOCAL" "$ROOT/tools/render_preflight.py" check -- "$@" 2>&1); then
    echo "$PF" >&2
    code=$(grep -o 'EDEN_PREFLIGHT=[a-z_]*' <<<"$PF" | cut -d= -f2)
    [ "$DRY_RUN" = 1 ] || csv_row "${code:-arg_error}" 0 2 "autodl-preflight"
    echo "没上传、没占锁、没花钱；改好参数 / 脚本后重新提交" >&2
    exit 2
  fi
  echo "$PF" | grep -v '^EDEN_PREFLIGHT=' | sed 's/^/  /'
fi
[ -n "$LOGARG" ] || { echo "要给 --log <日志>（远端看门狗和结论文件都挂在它上面）" >&2; exit 2; }
case "$LOGARG" in /*) RLOG=$LOGARG ;; *) RLOG="$REMOTE_DIR/$LOGARG" ;; esac
cloud_lock_acquire "render"
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
# sync.sh 排除了 docs/，远端没有 docs/drafts 等输出目录 → blender 写不出、rsync 回传报 dir missing；起渲染前先建好 --out 所在目录
OUT_DIR_REMOTE=""
if [ -n "$OUT" ]; then OUT_DIR_REMOTE=$(dirname "${OUT#"$ROOT"/}"); fi
MKDIR_OUT=""
[ -n "$OUT_DIR_REMOTE" ] && MKDIR_OUT=" && mkdir -p $(printf '%q' "$OUT_DIR_REMOTE")"
QUOTED=""
for a in "${PASS[@]}"; do QUOTED+=" $(printf '%q' "$a")"; done
if [ "$DRY_RUN" = 1 ]; then
  GPU_NAME="dryrun-gpu"
else
  GPU_NAME=$(run_ssh "nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | tr ' ' '-'" 2>/dev/null || echo unknown-gpu)
  [ -z "$GPU_NAME" ] && GPU_NAME=unknown-gpu
fi
HOST_TAG="autodl-${GPU_NAME}"
# 预计时长用本地的完整历史算好传过去（远端 logs/ 只有云端自己的行）
EST=""
if [ -n "$PY_LOCAL" ]; then
  EST=$("$PY_LOCAL" "$ROOT/tools/render_watchdog.py" estimate --asset "$ASSET" --kind "$KIND" --res "$RES" --spp "$SPP" --host "$HOST_TAG" --csv "$CSV" 2>/dev/null | cut -f1)
fi
ENVS="EDEN_CYCLES_DEVICE=$(printf '%q' "${EDEN_CYCLES_DEVICE:-OPTIX}") EDEN_PREFLIGHT_DONE=1 EDEN_PRICE_PER_HOUR=$PRICE_PER_HOUR EDEN_HOST_TAG=$(printf '%q' "$HOST_TAG")"
[ -n "$EST" ] && ENVS+=" EDEN_EST_MIN=$EST"
[ -n "${EDEN_GUARD_NO_INPROC:-}" ] && ENVS+=" EDEN_GUARD_NO_INPROC=$(printf '%q' "$EDEN_GUARD_NO_INPROC")"
[ -n "${EDEN_WD_ARGS:-}" ] && ENVS+=" EDEN_WD_ARGS=$(printf '%q' "$EDEN_WD_ARGS")"
REMOTE_CMD="cd '$REMOTE_DIR' && mkdir -p logs$MKDIR_OUT && rm -f '$RLOG.verdict' && $ENVS nohup bash tools/blender_run.sh$QUOTED > '$REMOTE_LOG.nohup' 2>&1 & echo \$! > '$REMOTE_PIDFILE'; echo REMOTE_PID=\$(command cat '$REMOTE_PIDFILE')"

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

# 轮询 REMOTE_CMD 里起的那个 bash 进程本身；每轮打印远端看门狗的一行状态（<日志>.wdstate）
TIMED_OUT=0
if [ "$DRY_RUN" != 1 ]; then
  echo "--- 轮询远端渲染进程（pidfile: ${REMOTE_PIDFILE}；看门狗状态：${RLOG}.wdstate）---"
  t=0
  while run_ssh "test -f '$REMOTE_PIDFILE' && kill -0 \$(command cat '$REMOTE_PIDFILE') 2>/dev/null" ; do
    if [ "$WAIT_MAX" -gt 0 ] && [ "$t" -ge "$WAIT_MAX" ]; then echo "等了 ${WAIT_MAX}s 还没完，先退出脚本（远端继续跑，看门狗仍在管它）"; TIMED_OUT=1; break; fi
    sleep "$POLL"; t=$((t+POLL))
    echo "  已 ${t}s：$(run_ssh "tail -1 '$RLOG.wdstate' 2>/dev/null | cut -d' ' -f2-" 2>/dev/null)"
  done
  echo "远端渲染进程已结束（或轮询超时）"
fi

echo "--- 远端结论（${RLOG}.verdict）---"
VERDICT=""
[ "$DRY_RUN" = 1 ] || VERDICT=$(run_ssh "command cat '$RLOG.verdict' 2>/dev/null" 2>/dev/null)
vget() { sed -n "s/^$1=//p" <<<"$VERDICT" | head -1; }
STATUS=$(vget status); REASON=$(vget reason); MINS=$(vget minutes); RRC=$(vget exit)
if [ "$DRY_RUN" = 1 ]; then STATUS=ok; MINS=0; RRC=0
elif [ -z "$STATUS" ]; then
  STATUS=unknown; MINS=$(awk -v s="${t:-0}" 'BEGIN{printf "%.1f", s/60}'); RRC=-1
  [ "$TIMED_OUT" = 1 ] && REASON="本地轮询超时，远端仍在跑" || REASON="远端没有写结论文件（blender_run.sh 被外力杀掉？）"
fi
echo "  status=${STATUS} minutes=${MINS} device=$(vget device) ${REASON}"

if [ "$STATUS" != ok ]; then
  [ "$DRY_RUN" = 1 ] || csv_row "$STATUS" "${MINS:-0}" "${RRC:-1}" "$HOST_TAG"
  {
    echo "云端渲染失败（${STATUS}）：${REASON}"
    echo "耗时 ${MINS} 分钟，按 ${PRICE_PER_HOUR} 元/小时计浪费约 ¥${WASTED_CNY:-?}；只杀了本任务的 PID，实例没停，本地锁随本脚本退出释放，队列继续。不会自动改用 CPU 重跑。"
    echo "--- 远端日志尾巴（${RLOG}）---"
    run_ssh "tail -20 '$RLOG' 2>/dev/null; echo '--- 看门狗 ---'; tail -5 '$RLOG.watchdog' 2>/dev/null"
  } >&2
  exit 70
fi

echo "--- 结果 rsync 回本地 ---"
if [ -n "$OUT" ]; then
  REL_OUT=${OUT#"$ROOT"/}
  mkdir -p "$(dirname "$ROOT/$REL_OUT")" 2>/dev/null || true
  run_rsync -avz "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/${REL_OUT}" "$ROOT/$REL_OUT"
  # 同前缀的副产物（<名>_summit.jpg、_anchors.json、_items.json 等）一起拉回
  OUT_STEM=$(basename "${REL_OUT%.*}")
  run_rsync -avz --include="${OUT_STEM}*" --exclude='*' \
    "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/$(dirname "$REL_OUT")/" "$ROOT/$(dirname "$REL_OUT")/" || true
else
  echo "没解析到 --out，跳过自动回传；可手动 rsync ${REMOTE_DIR}/<输出路径> 到本地对应路径"
fi
# 顺带把远端产出目录常见位置（map/art、blender/out）同步回来，覆盖没显式给 --out 的情况
run_rsync -avz --include='*/' --include='*.png' --include='*.exr' --exclude='*' \
  "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/map/art/" "$ROOT/map/art/" 2>/dev/null || true

echo "--- meta.json / 相机矩阵回传 ---"
# blender_run.sh 惯例：产出 <out>.meta.json（相机矩阵 / 分辨率等），跟 --out 同目录同前缀
if [ -n "$OUT" ]; then
  META_REL="${REL_OUT}.meta.json"
  run_rsync -avz "${REMOTE_USER}@${HOST:-<HOST>}:${REMOTE_DIR}/${META_REL}" "$ROOT/$META_REL" 2>/dev/null \
    && echo "  拉回 $META_REL" || echo "  没有 ${META_REL}（该资产可能不写 meta，正常）"
else
  echo "  没解析到 --out，跳过 meta.json 回传"
fi

echo "--- 记 logs/render_times.csv ---"
if [ "$DRY_RUN" = 1 ]; then echo "[DRY_RUN] 不写 CSV"
else csv_row ok "$MINS" 0 "$HOST_TAG"; echo "写了 CSV 行：${ASSET} ${MINS} 分钟 status=ok host=${HOST_TAG}"
fi
