#!/usr/bin/env bash
# 渲染任务队列：agent 提交任务，本脚本决定派给 Mac（tools/blender_run.sh）还是云端（tools/cloud/render.sh），
# 而不是各自直接调用那两个脚本——这样才能保证 Mac 显卡锁 / 云端锁不被绕过，且忙的那台不会被撞车派第二个任务。
# 文件式队列：logs/queue/{pending,running,done}/，一个任务一个文件，一行：<tag>\t<blender_run.sh 参数（shell 转义）>
#
# 用法：
#   tools/render_queue.sh submit <draft|final|any> -- <blender_run.sh 参数...>   # 建任务
#     例：tools/render_queue.sh submit draft -- --asset tc_mid --kind draft --res 2048 --spp 16 -- \
#           -b --factory-startup --python-expr "..." -- --res 2048 --samples 16 --out map/art/_x.png
#   tools/render_queue.sh dispatch [--once]     # 派工一轮：查两台设备是否空闲，把能派的 pending 任务派出去（后台跑）
#                                                #   不给 --once 时是常驻循环，每 POLL 秒查一轮，Ctrl-C 退出
#   tools/render_queue.sh status                # Mac / 各云实例状态 + 正在跑的任务 + pending 计数
#   tools/render_queue.sh list                  # 列 pending/running/done 任务文件
#
# 调度规则：
#   draft → 优先 Mac；Mac 忙、有云实例空闲时也会派去云端（云端当草图机使的临时借用）。
#   final → 优先云端（多台云实例时挑第一台空闲的）；云端全忙、Mac 空闲时也会派去 Mac（反过来借用）。
#   any   → 见谁先空就派谁（先查 Mac，再查各云实例）。
#   云端任务派发前会检查本地改动时间戳（tools/cloud/.locks/<实例>.last_sync），比同步戳新就先跑一次 sync.sh 再渲。
# 环境变量：DRY_RUN=1 演练；POLL（秒，默认 20，dispatch 常驻循环用）
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLOUD="$ROOT/tools/cloud"
QDIR="$ROOT/logs/queue"; PEND="$QDIR/pending"; RUN="$QDIR/running"; DONE="$QDIR/done"
DRY_RUN=${DRY_RUN:-0}
POLL=${POLL:-20}
mkdir -p "$PEND" "$RUN" "$DONE"

cloud_hosts() {
  # 列出配置好的云实例名：default（remote.env）+ hosts/*.env
  [ -f "$CLOUD/remote.env" ] && echo default
  for f in "$CLOUD"/hosts/*.env; do
    [ -f "$f" ] || continue
    b=$(basename "$f" .env)
    [ "$b" = "example.env" ] && continue
    echo "$b"
  done
}

mac_busy() { pgrep -f 'tools/blender_run.sh' >/dev/null 2>&1; }
cloud_busy() {
  # cloud_busy <实例名>：BUSY/IDLE，通过 tools/cloud/status.sh --busy-check（只走 tools/cloud/*.sh，不直连）
  local h=$1
  DRY_RUN="$DRY_RUN" bash "$CLOUD/status.sh" --host "$h" --busy-check 2>/dev/null | tail -1
}

need_sync() {
  # 本地文件有没有比上次 sync 新：比对 tools/cloud/.locks/<host>.last_sync 的 mtime
  local h=$1
  local stamp="$CLOUD/.locks/${h}.last_sync"
  [ -f "$stamp" ] || return 0
  # -newer 找一个比戳新的已跟踪文件就够；用 git ls-files 避免扫 node_modules/.git 这些大目录
  local hit
  hit=$(cd "$ROOT" && git ls-files -z | xargs -0 -I{} find {} -newer "$stamp" -print 2>/dev/null | head -1)
  [ -n "$hit" ]
}
mark_synced() { local h=$1; mkdir -p "$CLOUD/.locks"; touch "$CLOUD/.locks/${h}.last_sync"; }

idle_guard_on() { [ -f "$CLOUD/.locks/${1}.idle_guard_on" ]; }

usage() { sed -n '2,20p' "$0"; }

cmd_submit() {
  local tag=${1:-}; shift || true
  case "$tag" in draft|final|any) ;; *) echo "第一个参数要是 draft|final|any" >&2; exit 2 ;; esac
  [ "${1:-}" = "--" ] || { echo "用法：render_queue.sh submit <draft|final|any> -- <blender_run.sh 参数...>" >&2; exit 2; }
  shift
  [ $# -ge 1 ] || { echo "-- 之后要有 blender_run.sh 的参数" >&2; exit 2; }
  # 渲染守卫：参数语法 / 必须用设备 helper / 脚本参数表，不过就不进队列（docs/cloud-render.md「渲染守卫」）
  python3 "$ROOT/tools/render_preflight.py" check -- "$@" >/dev/null || { echo "提交被拒：见上面的原因（tools/render_preflight.py）" >&2; exit 2; }
  local q=""
  for a in "$@"; do q+=" $(printf '%q' "$a")"; done
  local id
  id="$(date +%Y%m%d_%H%M%S)_$$_$RANDOM"
  local f="$PEND/${id}.job"
  printf '%s\t%s\n' "$tag" "${q# }" > "$f"
  echo "提交：${f}（tag=$tag）"
}

cmd_list() {
  for d in "$PEND" "$RUN" "$DONE"; do
    echo "-- $(basename "$d")（$(command ls "$d" 2>/dev/null | grep -c '\.job$') 个）--"
    for f in "$d"/*.job; do [ -f "$f" ] || continue; echo "  $(basename "$f")：$(command cat "$f")"; done
  done
}

cmd_status() {
  echo "== Mac =="
  if mac_busy; then echo "  忙（$(pgrep -fal 'tools/blender_run.sh' | head -1)）"; else echo "  空闲"; fi
  echo "== 云实例 =="
  local any_host=0
  while IFS= read -r h; do
    [ -n "$h" ] || continue
    any_host=1
    local b; b=$(cloud_busy "$h")
    echo "  $h：${b:-未知（连不上或没配置）}"
  done < <(cloud_hosts)
  [ "$any_host" = 1 ] || echo "  （没配置任何实例，见 tools/cloud/remote.env.example）"
  echo "== 队列 =="
  echo "  pending：$(command ls "$PEND" 2>/dev/null | grep -c '\.job$')"
  echo "  running：$(command ls "$RUN" 2>/dev/null | grep -c '\.job$')"
  echo "  done（本次未清）：$(command ls "$DONE" 2>/dev/null | grep -c '\.job$')"
}

# blender_run.sh 只有「第一个参数正好是 --log」才会走新式参数解析（否则整段被当成旧式用法，第一个参数被
# 误当成日志路径），所以不能像 render_split.sh 那样简单地往参数最前面插 --cache-blend。这里改成：在任务
# 自己的参数里找第一个裸 `--`（分隔 blender CLI 参数和脚本 sys.argv 的那个），把 --cache-blend 插在它前面；
# 找不到 `--` 就插在最后（那时候插哪都行，因为没有脚本 argv 要保护）。
# 不用 mapfile（macOS 系统自带 bash 3.2 没有这个内置命令）：insert_cache_blend 直接写全局数组 INSERT_OUT。
insert_cache_blend() {
  local dir=$1; shift
  INSERT_OUT=()
  local sep_idx=-1 i=0
  for a in "$@"; do [ "$a" = "--" ] && [ "$sep_idx" = -1 ] && sep_idx=$i; i=$((i+1)); done
  if [ "$sep_idx" -ge 0 ]; then
    i=0
    for a in "$@"; do
      [ "$i" = "$sep_idx" ] && INSERT_OUT+=(--cache-blend "$dir")
      INSERT_OUT+=("$a"); i=$((i+1))
    done
  else
    INSERT_OUT=("$@" --cache-blend "$dir")
  fi
}

run_job_mac() {
  local jobfile=$1 args=$2 runfile=$3
  (
    eval "set -- $args"
    insert_cache_blend "$ROOT/.cache/blend" "$@"
    bash "$ROOT/tools/blender_run.sh" "${INSERT_OUT[@]}" > "${runfile}.log" 2>&1
    rc=$?
    echo "$rc" > "${runfile}.rc"
    mv -f "$jobfile" "$DONE/$(basename "$jobfile")" 2>/dev/null
    rm -f "$runfile"
  ) &
  disown
}

run_job_cloud() {
  local jobfile=$1 args=$2 runfile=$3 host=$4
  (
    if need_sync "$host"; then
      echo "本地有改动，先 sync（$host）" >> "${runfile}.log"
      DRY_RUN="$DRY_RUN" bash "$CLOUD/sync.sh" --host "$host" >> "${runfile}.log" 2>&1
      mark_synced "$host"
    fi
    eval "set -- $args"
    # 相对路径：render.sh 在远端会先 cd 到 REMOTE_DIR 再跑 blender_run.sh，所以这里不用（也不能）在本地展开 REMOTE_DIR
    insert_cache_blend ".cache/blend" "$@"
    DRY_RUN="$DRY_RUN" bash "$CLOUD/render.sh" --host "$host" "${INSERT_OUT[@]}" >> "${runfile}.log" 2>&1
    rc=$?
    echo "$rc" > "${runfile}.rc"
    mv -f "$jobfile" "$DONE/$(basename "$jobfile")" 2>/dev/null
    rm -f "$runfile"
  ) &
  disown
}

cmd_dispatch_once() {
  # 不用关联数组（macOS 系统自带 bash 3.2 没有 declare -A）：云实例状态存进一个「host\tstatus」的临时文件，查询用 grep。
  local dispatched=0
  local mb; mb=$(mac_busy && echo 1 || echo 0)
  local cb_file; cb_file=$(mktemp)
  trap 'rm -f "$cb_file"' RETURN
  while IFS= read -r h; do [ -n "$h" ] && printf '%s\t%s\n' "$h" "$(cloud_busy "$h")" >> "$cb_file"; done < <(cloud_hosts)
  cb_set() { local h=$1 v=$2 tmp; tmp=$(mktemp); grep -v "^${h}	" "$cb_file" > "$tmp" 2>/dev/null; printf '%s\t%s\n' "$h" "$v" >> "$tmp"; mv "$tmp" "$cb_file"; }
  first_idle_host() { awk -F'\t' '$2=="IDLE"{print $1; exit}' "$cb_file"; }
  any_idle_host() { awk -F'\t' '$2=="IDLE"{f=1} END{exit !f}' "$cb_file"; }

  for f in "$PEND"/*.job; do
    [ -f "$f" ] || continue
    local line tag args target=""
    line=$(command cat "$f"); tag=${line%%$'\t'*}; args=${line#*$'\t'}

    if [ "$tag" = draft ] || [ "$tag" = any ]; then
      [ "$mb" = 0 ] && target=mac
    fi
    if [ -z "$target" ] && { [ "$tag" = final ] || [ "$tag" = any ]; }; then
      local h; h=$(first_idle_host); [ -n "$h" ] && target="cloud/$h"
    fi
    # 反向借用：draft 但 Mac 忙、有云空闲 → 派云端；final 但云全忙、Mac 空闲 → 派 Mac
    if [ -z "$target" ] && [ "$tag" = draft ] && [ "$mb" = 1 ]; then
      local h; h=$(first_idle_host); [ -n "$h" ] && target="cloud/$h"
    fi
    if [ -z "$target" ] && [ "$tag" = final ] && [ "$mb" = 0 ]; then
      any_idle_host || target=mac
    fi
    [ -z "$target" ] && continue

    local id; id=$(basename "$f" .job)
    local runfile="$RUN/${id}.job"
    mv "$f" "$runfile" || continue
    echo "派工：$id（tag=$tag）→ $target"
    if [ "$target" = mac ]; then
      mb=1  # 这一轮内不要把第二个任务也派去 Mac
      run_job_mac "$runfile" "$args" "$RUN/${id}"
    else
      local h=${target#cloud/}
      cb_set "$h" BUSY
      run_job_cloud "$runfile" "$args" "$RUN/${id}" "$h"
    fi
    dispatched=$((dispatched+1))
  done

  local pend_n; pend_n=$(command ls "$PEND" 2>/dev/null | grep -c '\.job$')
  if [ "$pend_n" = 0 ] && [ "$dispatched" = 0 ]; then
    local run_n; run_n=$(command ls "$RUN" 2>/dev/null | grep -c '\.job$')
    if [ "$run_n" = 0 ]; then
      while IFS= read -r h; do
        [ -n "$h" ] || continue
        if idle_guard_on "$h"; then continue; fi
        echo "提醒：队列空了，云实例 $h 没开自动空闲关机（tools/cloud/idle_guard.sh --idle-shutdown 30 --host $h），记得手动关机省钱"
      done < <(cloud_hosts)
    fi
  fi
  return 0
}

case "${1:-}" in
  submit) shift; cmd_submit "$@" ;;
  list) cmd_list ;;
  status) cmd_status ;;
  dispatch)
    shift
    if [ "${1:-}" = "--once" ]; then
      cmd_dispatch_once
    else
      echo "常驻派工循环，每 ${POLL}s 一轮，Ctrl-C 退出"
      trap 'echo 停止; exit 0' INT TERM
      while true; do cmd_dispatch_once; sleep "$POLL"; done
    fi
    ;;
  ""|-h|--help) usage ;;
  *) echo "未知命令 $1（submit|list|status|dispatch）" >&2; exit 2 ;;
esac
