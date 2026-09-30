#!/usr/bin/env bash
# 共用 GPU 的 Blender 启动器（原 skills/card-map/blender_run.sh，现全仓库统一用这一个）。
# - 先等别人的 Blender 退出（pgrep -x Blender 为空），再拿一把锁文件（防止两个启动器同时闯过 pgrep 检查的竞态）。
# - 用 ASCII 的 TMPDIR（/private/tmp/bl_tmp）：中文 TMPDIR 会触发 Metal 内核缓存崩溃（仓库目录已英文化，此处保留 ASCII 保险）。
# - 崩溃（非零退出）重试一次；仍失败才返回失败。
# - 把自己的 PID 写进 <日志>.pid；要中止时只 kill 这个 PID，绝不 pkill / killall Blender（别的代理可能正在渲）。
# - 追加一行到 logs/render_times.csv：date,asset,kind,res,spp,minutes,exit,host,status,wasted_min,wasted_cny
# - 渲染守卫（docs/cloud-render.md「渲染守卫」）：起 Blender 前跑 tools/render_preflight.py（参数语法 / 必须用设备 helper / 脚本参数表）；
#   在任何脚本之前注入 blender/eden_guard.install()（EDEN_PHASE / EDEN_DEVICE / EDEN_PROGRESS 自报 + 渲染开始时是 CPU 就中止）；
#   同时起 tools/render_watchdog.py 看门狗（按阶段判断：搭建超时 / 渲染时显卡空闲 / 进度停滞），只杀这次的 Blender PID。
#   结论写 <日志>.verdict（status/reason/minutes/wasted_min/wasted_cny），失败时退出非零并打印中文原因和日志尾巴。
#   退出码 0 也要过「真实性」检查（tools/render_truth.py，R2 T1）：日志里有 Python Traceback / 行首 "Error: "（script_error），
#   或脚本声明的 --out 产物不存在（no_output）/ 比本次启动还旧（stale_output）→ 记为失败、退出 70；EDEN_TRUTH=0 可关（仅调试）。
#   只有真正的崩溃（status=crash）才重试一次；看门狗终止 / CPU 中止 / 参数错误都不重试，也绝不自动改用 CPU 重跑。
#
# 用法：bash tools/blender_run.sh --log <日志> --asset <名字> [--kind draft|final|patch] [--res N] [--spp N] [--cache-blend <目录>] [--allow-cpu] -- <blender 参数...>
#   --allow-cpu：明确允许没有 GPU 时用 CPU 渲（设 EDEN_ALLOW_CPU=1）；默认不允许
#   例：bash tools/blender_run.sh --log /tmp/x.log --asset tc_upper --kind final --res 8000 --spp 64 -- \
#         -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tiancheng_upper.py', run_name='__main__')" -- --res 8000 --samples 64 --out /tmp/x.png
#   旧参数形式（仅日志 + 透传，不记 CSV 资产信息）仍兼容：bash tools/blender_run.sh <日志> <blender 参数...>
#
# --cache-blend <目录>：场景搭建（bpy 几何/贴图/BVH，纯 CPU）在 8K/16K 定稿里往往比 GPU 渲染本身还慢
#   （实测某次基准：搭建 59s、GPU 渲染只 7s），这个选项是给「重复渲同一场景只改机位/采样」这种场景提速用的基础设施：
#   - 会按 (透传参数 + git HEAD + `git diff --stat -- blender/` + runpy.run_path() 指向的构建脚本内容) 算一个哈希，
#     决定这次搭建跟上次是不是同一个场景；命中就把 <目录>/<asset>_<哈希前16位>.blend 的路径通过环境变量
#     EDEN_CACHE_BLEND_HIT=1、EDEN_CACHE_BLEND_PATH=<blend 路径> 告诉 python 构建脚本。
#   - 注意：这只是把「有没有命中缓存」告诉脚本，**脚本自己要检查这两个环境变量、自己决定要不要用
#     `bpy.ops.wm.open_mainfile(filepath=...)` 跳过搭建改成直接渲染**；本仓库目前的 tiancheng_*.py /
#     landmarks/*/build.py 都还没接这段判断逻辑，所以现在加 --cache-blend 本身不会自动提速，只是先把
#     哈希 / 环境变量 / 保存这套管子接好，脚本按 docs/cloud-render.md「场景缓存」一节的示例接进去才会生效。
#   - 不管命不命中，跑完都会在末尾追加一个 --python-expr 把当前场景存成该哈希对应的 .blend（供下次判断复用）。
# 环境变量：WAIT_MAX（秒，默认 7200）、POLL（秒，默认 30）、EDEN_GPU_LOCK（默认 /tmp/eden_gpu.lock）、DRY_RUN=1（不真的起 Blender，只演练锁 / 日志 / CSV，供测试用）
#   EDEN_PRICE_PER_HOUR（算浪费的钱，云端 render.sh 传 1.58，Mac 默认 0）、EDEN_HOST_TAG（CSV host 列）、EDEN_PREFLIGHT_DONE=1（提交端已查过）、
#   EDEN_WATCHDOG=0（关看门狗，仅调试）、EDEN_WD_ARGS（透传给看门狗的额外参数，测试用）、EDEN_PY（指定跑检查 / 看门狗的 python）、EDEN_TEST_NOWAIT=1（测试用：不等别的 Blender 进程 / 静默窗）、EDEN_TRUTH=0（关真实性检查）
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BL=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
WAIT_MAX=${WAIT_MAX:-7200}; POLL=${POLL:-30}
LOCK=${EDEN_GPU_LOCK:-/tmp/eden_gpu.lock}
DRY_RUN=${DRY_RUN:-0}

LOG=""; ASSET=""; KIND="final"; RES=""; SPP=""; CACHE_BLEND=""; ARGS=(); ALLOW_CPU=0; LEGACY=0
ORIG_ARGS=("$@")
if [ "${1:-}" != "--log" ] && [ $# -ge 1 ]; then
  # 旧用法：blender_run.sh <日志> <blender 参数...>
  LOG=$1; shift; ARGS=("$@"); LEGACY=1
else
  while [ $# -gt 0 ]; do
    case "$1" in
      --log) LOG=$2; shift 2 ;;
      --asset) ASSET=$2; shift 2 ;;
      --kind) KIND=$2; shift 2 ;;
      --res) RES=$2; shift 2 ;;
      --spp) SPP=$2; shift 2 ;;
      --cache-blend) CACHE_BLEND=$2; shift 2 ;;
      --allow-cpu) ALLOW_CPU=1; shift ;;
      --) shift; ARGS=("$@"); break ;;
      *) echo "未知参数 $1" >&2; exit 2 ;;
    esac
  done
fi
[ -n "$LOG" ] || { echo "用法：tools/blender_run.sh --log <日志> --asset <名字> [--kind draft|final|patch] [--res N] [--spp N] [--cache-blend <目录>] [--allow-cpu] -- <blender 参数...>" >&2; exit 2; }
[ "$ALLOW_CPU" = 1 ] && export EDEN_ALLOW_CPU=1
PRICE=${EDEN_PRICE_PER_HOUR:-0}
HOST_TAG=${EDEN_HOST_TAG:-$(uname -s | tr 'A-Z' 'a-z')}
CSV="$ROOT/logs/render_times.csv"
CSV_HEADER='date,asset,kind,res,spp,minutes,exit,host,status,wasted_min,wasted_cny'

# 跑检查 / 看门狗用的 python：云端没有系统 python3，用 Blender 自带的
eden_py() {
  if [ -n "${EDEN_PY:-}" ]; then echo "$EDEN_PY"; return; fi
  command -v python3 2>/dev/null && return
  local p
  for p in "$(dirname "$BL")"/*/python/bin/python3* /opt/blender/*/python/bin/python3*; do
    case "$p" in *-config) continue ;; esac
    [ -x "$p" ] && { echo "$p"; return; }
  done
}
PY=$(eden_py)

# 写结论：<日志>.verdict + CSV 一行。$1=status $2=reason $3=分钟（小数） $4=退出码
record() {
  local st=$1 reason=$2 mins=$3 rc=$4 wmin=0 wcny=0
  if [ "$st" != ok ]; then
    wmin=$mins; wcny=$(awk -v m="$mins" -v p="$PRICE" 'BEGIN{printf "%.2f", m/60*p}')
  fi
  mkdir -p "$(dirname "$LOG")" "$ROOT/logs"
  { echo "status=$st"; echo "reason=$reason"; echo "minutes=$mins"; echo "wasted_min=$wmin"; echo "wasted_cny=$wcny"; echo "exit=$rc"
    echo "device=$(grep -o '^EDEN_DEVICE=[A-Z_]*' "$LOG" 2>/dev/null | tail -1 | cut -d= -f2)"; echo "host=$HOST_TAG"; } > "$LOG.verdict"
  [ -f "$CSV" ] || echo "$CSV_HEADER" > "$CSV"
  echo "$(date +%Y-%m-%d),${ASSET:-unknown},$KIND,${RES:-},${SPP:-},$mins,$rc,$HOST_TAG,$st,$wmin,$wcny" >> "$CSV"
}

# 静态检查（提交端已查过就跳过；找不到 python 也跳过，由提交端负责）
if [ "$LEGACY" = 0 ] && [ -z "${EDEN_PREFLIGHT_DONE:-}" ] && [ -n "$PY" ]; then
  if ! PF=$("$PY" "$ROOT/tools/render_preflight.py" check -- "${ORIG_ARGS[@]}" 2>&1); then
    echo "$PF" >&2
    code=$(grep -o 'EDEN_PREFLIGHT=[a-z_]*' <<<"$PF" | cut -d= -f2)
    mkdir -p "$(dirname "$LOG")"; : > "$LOG"
    record "${code:-arg_error}" "$(grep '渲染提交被拒' <<<"$PF" | head -1)" 0 2
    exit 2
  fi
fi

# 注入守卫：在第一个 --python/-P/--python-expr 之前（没有就在第一个 -- 之前）加一段 eden_guard.install()，
# 让没调用 helper 的脚本也有阶段自报和「渲染开始时是 CPU 就中止」。
GUARD_EXPR="import sys; sys.path.insert(0, '$ROOT/blender'); import eden_guard; eden_guard.install()"
GI=-1
for idx in "${!ARGS[@]}"; do
  case "${ARGS[$idx]}" in -P|--python|--python-expr|--) GI=$idx; break ;; esac
done
if [ "$GI" -ge 0 ]; then
  NEW_ARGS=("${ARGS[@]:0:$GI}" --python-expr "$GUARD_EXPR" "${ARGS[@]:$GI}"); ARGS=("${NEW_ARGS[@]}")
else
  ARGS+=(--python-expr "$GUARD_EXPR")
fi

BLEND_CACHE_FILE=""
if [ -n "$CACHE_BLEND" ]; then
  mkdir -p "$CACHE_BLEND" 2>/dev/null || true
  # 提取 run_path('...') 的脚本路径并读进内容做缓存键。不用 [^'] 方括号表达式：
  # 这台 macOS 的 BSD grep（2.6.0-FreeBSD）对含引号的 [^'] 有 bug，整个模式永远不匹配
  # （2026-09-30 事故：SCRIPT_SRC 恒为空 → 缓存键不含 build.py 内容 → 改了建模脚本缓存照命中）。
  # 用 awk 按单引号切分取第 2 段，绕开方括号表达式。
  SCRIPT_PATH=$(printf '%s\n' "${ARGS[@]}" | awk -v q="'" '/run_path\(/ { n=split($0, parts, q); if (n >= 2 && parts[2] != "") { print parts[2]; exit } }')
  SCRIPT_SRC=""
  [ -n "$SCRIPT_PATH" ] && [ -f "$ROOT/$SCRIPT_PATH" ] && SCRIPT_SRC=$(command cat "$ROOT/$SCRIPT_PATH" 2>/dev/null)
  [ -n "$SCRIPT_SRC" ] || echo "警告：缓存键里没有 build.py 内容（提取失败），改脚本不会使缓存失效" >&2
  GIT_HEAD=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)
  GIT_DIRTY=$(git -C "$ROOT" diff --stat -- blender/ 2>/dev/null)
  HASH_INPUT="${ARGS[*]}|${GIT_HEAD}|${GIT_DIRTY}|${SCRIPT_SRC}"
  if command -v shasum >/dev/null 2>&1; then
    HASH=$(printf '%s' "$HASH_INPUT" | shasum -a 256 | cut -d' ' -f1)
  else
    HASH=$(printf '%s' "$HASH_INPUT" | sha256sum | cut -d' ' -f1)
  fi
  BLEND_CACHE_FILE="$CACHE_BLEND/${ASSET:-scene}_${HASH:0:16}.blend"
  if [ -f "$BLEND_CACHE_FILE" ]; then
    export EDEN_CACHE_BLEND_HIT=1 EDEN_CACHE_BLEND_PATH="$BLEND_CACHE_FILE"
    echo "缓存命中（脚本要自己接判断逻辑才会真的跳过搭建，见 docs/cloud-render.md）：$BLEND_CACHE_FILE"
  else
    export EDEN_CACHE_BLEND_HIT=0 EDEN_CACHE_BLEND_PATH="$BLEND_CACHE_FILE"
    echo "缓存未命中，跑完会存一份：$BLEND_CACHE_FILE"
  fi
  # 跑完后把场景存成缓存文件（哪怕这次是缓存命中重跑，也刷新一下，防止内容漂移）。
  # 注意：ARGS 里第一个裸 `--` 之后是传给场景脚本 sys.argv 的内容，不是 blender 的 CLI 参数了，
  # 新增的 --python-expr 必须插在那个 `--` 之前，直接 append 到末尾会被当成脚本参数，不会被执行。
  SEP_IDX=-1
  for idx in "${!ARGS[@]}"; do [ "${ARGS[$idx]}" = "--" ] && { SEP_IDX=$idx; break; }; done
  SAVE_EXPR="import bpy,os; p=os.environ.get('EDEN_CACHE_BLEND_PATH'); bpy.ops.wm.save_mainfile(filepath=p) if p else None"
  if [ "$SEP_IDX" -ge 0 ]; then
    NEW_ARGS=("${ARGS[@]:0:$SEP_IDX}" --python-expr "$SAVE_EXPR" "${ARGS[@]:$SEP_IDX}")
    ARGS=("${NEW_ARGS[@]}")
  else
    ARGS+=(--python-expr "$SAVE_EXPR")
  fi
fi

mkdir -p "$(dirname "$LOG")" "$ROOT/logs"
export TMPDIR=/private/tmp/bl_tmp
mkdir -p "$TMPDIR"

t=0
while [ -z "${EDEN_TEST_NOWAIT:-}" ] && { pgrep -x Blender >/dev/null || pgrep -x blender >/dev/null; }; do
  [ "$t" -ge "$WAIT_MAX" ] && { echo "等了 ${WAIT_MAX}s Blender 仍在跑，放弃（没有动别人的进程）"; exit 3; }
  [ $((t % 300)) -eq 0 ] && echo "GPU 忙（$(pgrep -x Blender | tr '\n' ' ')），等待…"
  sleep "$POLL"; t=$((t + POLL))
done
[ -z "${EDEN_TEST_NOWAIT:-}" ] && [ -f "$ROOT/tools/quiet_wait.sh" ] && bash "$ROOT/tools/quiet_wait.sh" --max "$WAIT_MAX"

# 锁文件：短暂持有，防止两个启动器同时通过上面的 pgrep 检查后一起起 Blender。
LOCK_WAIT=0
while ! ( set -o noclobber; echo $$ > "$LOCK" ) 2>/dev/null; do
  LP=$(command cat "$LOCK" 2>/dev/null)
  if [ -n "$LP" ] && ! kill -0 "$LP" 2>/dev/null; then echo "GPU 锁 ${LOCK} 的持有者 ${LP} 已不在，清掉残留锁"; rm -f "$LOCK"; continue; fi
  [ "$LOCK_WAIT" -ge "$WAIT_MAX" ] && { echo "等锁 ${LOCK}（${LP}）超时"; exit 3; }
  sleep 2; LOCK_WAIT=$((LOCK_WAIT + 2))
done
release_lock() { [ "$(command cat "$LOCK" 2>/dev/null)" = "$$" ] && rm -f "$LOCK"; }
PID=""; WD_PID=""; CANCELLED=0
on_cancel() {
  CANCELLED=1
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
  [ -n "$WD_PID" ] && kill "$WD_PID" 2>/dev/null
}
trap release_lock EXIT
trap on_cancel INT TERM

cd "$ROOT"
RUN_SECS=0
run_once() {
  local t0=$SECONDS
  T0_EPOCH=$(date +%s)
  rm -f "$LOG.wdkill" "$LOG.wdstate" "$LOG.verdict"
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN] 会执行：$BL ${ARGS[*]}" | tee "$LOG"
    echo "DRY_RUN" > "$LOG.pid"
    rc=0
  else
    "$BL" "${ARGS[@]}" >"$LOG" 2>&1 &
    PID=$!; echo "$PID" >"$LOG.pid"; echo "Blender PID ${PID}（只 kill 这个），日志 ${LOG}"
    WD_PID=""
    if [ -n "$PY" ] && [ "${EDEN_WATCHDOG:-1}" != 0 ]; then
      WDA=(watch --log "$LOG" --pid "$PID" --kind "$KIND" --host "$HOST_TAG" --csv "$CSV")
      [ -n "$ASSET" ] && WDA+=(--asset "$ASSET"); [ -n "$RES" ] && WDA+=(--res "$RES"); [ -n "$SPP" ] && WDA+=(--spp "$SPP")
      [ "$ALLOW_CPU" = 1 ] && WDA+=(--allow-cpu)
      # shellcheck disable=SC2206
      [ -n "${EDEN_WD_ARGS:-}" ] && WDA+=(${EDEN_WD_ARGS})
      "$PY" "$ROOT/tools/render_watchdog.py" "${WDA[@]}" &
      WD_PID=$!
    else
      echo "（没找到 python 或 EDEN_WATCHDOG=0：本次不起看门狗）"
    fi
    wait "$PID"; rc=$?
    # 被 Ctrl-C / TERM 打断的 wait 会提前返回：再等一次，退出码记 130
    if [ "$CANCELLED" = 1 ]; then wait "$PID" 2>/dev/null; rc=130; fi
    if [ -n "$WD_PID" ]; then kill "$WD_PID" 2>/dev/null; wait "$WD_PID" 2>/dev/null; fi
    PID=""; WD_PID=""
  fi
  RUN_SECS=$((RUN_SECS + SECONDS - t0))
  return $rc
}

# 退出码 0 不等于成功：日志里的脚本报错、缺失 / 过期的声明产物都算失败（tools/render_truth.py；DRY_RUN / 没 python / EDEN_TRUTH=0 时跳过）
truth_check() {
  [ "$DRY_RUN" = 1 ] || [ "${EDEN_TRUTH:-1}" = 0 ] || [ -z "$PY" ] && return 0
  local outs=() o line
  while IFS= read -r o; do [ -n "$o" ] && outs+=(--out "$o"); done < <("$PY" "$ROOT/tools/render_truth.py" outs -- "${ARGS[@]}")
  if line=$("$PY" "$ROOT/tools/render_truth.py" check --log "$LOG" --start "$T0_EPOCH" --root "$ROOT" ${outs[@]+"${outs[@]}"}); then return 0; fi
  STATUS=$(sed -n 's/^EDEN_TRUTH=\([a-z_]*\) .*/\1/p' <<<"$line"); STATUS=${STATUS:-script_error}
  REASON="真实性检查：$(sed 's/^EDEN_TRUTH=[a-z_]* //' <<<"$line")"
}

# 这次运行的结论：看门狗终止 > 进程内中止（EDEN_ABORT=）> 取消 > 成功 > 崩溃
classify() {
  local rc=$1 a
  if [ -s "$LOG.wdkill" ]; then STATUS=$(head -1 "$LOG.wdkill"); REASON="看门狗：$(sed -n 2p "$LOG.wdkill")"
  elif a=$(grep -m1 '^EDEN_ABORT=' "$LOG" 2>/dev/null); then STATUS=$(cut -d' ' -f1 <<<"$a" | cut -d= -f2); REASON="进程内守卫：$(cut -d' ' -f2- <<<"$a")"
  elif [ "$CANCELLED" = 1 ]; then STATUS=cancelled; REASON="被 Ctrl-C / TERM 取消"
  elif [ "$rc" = 0 ]; then STATUS=ok; REASON=""; truth_check
  else STATUS=crash; REASON="Blender 退出码 ${rc}"
  fi
}

run_once; rc=$?
classify "$rc"
if [ "$STATUS" = crash ] && [ "$DRY_RUN" != 1 ]; then
  echo "第一次崩溃（退出码 ${rc}），重试一次…" >&2
  run_once; rc=$?
  classify "$rc"
fi
release_lock; trap - EXIT INT TERM
# 失败不留缓存：搭建中途崩掉的场景（缺相机 / 缺组）被 SAVE_EXPR 存进缓存后，下次同键会命中
# 半成品直接渲染翻车（2026-09-30 事故）。退出码非 0 就把这次的缓存删掉。
if [ -n "$BLEND_CACHE_FILE" ] && { [ "$rc" != 0 ] || [ "$STATUS" != ok ]; } && [ "$DRY_RUN" != 1 ]; then
  rm -f "$BLEND_CACHE_FILE" "$BLEND_CACHE_FILE.blend1"
fi

if [ "$DRY_RUN" != 1 ]; then grep -E '^WROTE|Error|Traceback|^EDEN_DEVICE=' "$LOG" | tail -5; fi

MINUTES=$(awk -v s="$RUN_SECS" 'BEGIN{printf "%.1f", s/60}')
record "$STATUS" "$REASON" "$MINUTES" "$rc"
if [ "$STATUS" != ok ]; then
  W=$(grep '^wasted_cny=' "$LOG.verdict" | cut -d= -f2)
  {
    echo "渲染失败（${STATUS}）：${REASON}"
    echo "耗时 ${MINUTES} 分钟，按 ${PRICE} 元/小时计浪费约 ¥${W}；只动了本任务的 PID，实例没停，GPU 锁已释放。不会自动改用 CPU 重跑。"
    echo "--- 日志尾巴（${LOG}）---"
    tail -20 "$LOG" 2>/dev/null
  } >&2
  case "$STATUS" in crash) exit "$rc" ;; cancelled) exit 130 ;; *) exit 70 ;; esac
fi
exit 0
