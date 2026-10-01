#!/usr/bin/env bash
# 预热 jsDelivr：把某个版本（标签或提交）下 map/ 里产品运行时会加载的文件请求一遍，让 CDN 先从 GitHub 拉好并缓存。
# 这样别人第一次打开地图时不用等 CDN 回源（每个文件首次约 1–2 秒）。
# 用法：bash tools/warm_cdn.sh [版本，默认 map-v$(cat VERSION)] [并发，默认 16] [选项]
#   --diff [BASE]：只预热本次改动的文件 + 头指针（BASE 默认取版本的父提交）；小改动从 3~5 分钟降到几秒。
#                  改动里出现重度静态资产（map/art/、map/props/、*.dzi、*.glb）时自动升级为全量。
#   --full：强制全量（发版用；不传 --diff 时本来就是全量）。
#   --detach / --async：脱离当前会话后台跑（日志写 logs/warm_cdn.log，可用 --log 改），立刻返回退出码 0。
#   --list / --count：只列出 / 数出要预热的文件，不发请求（ship.sh 演练用）
#   --purge-branch <分支>：预热完再清 jsDelivr 上该分支路径的 head.json 与加载器入口文件缓存（跟随分支几分钟内读到新构建；docs/tooling.md）
# C-11：不预热非运行时文件——文档（.md / .txt）、脚本（.py）、map/shots 截图、map/_proto 原型、*/reviews/ 评审稿、
#   产品从不加载的原型页（world.html、world_draft*.html、tiancheng.html 与只被它们用的 section.js）。docs/ 不在 map/ 下，本来就不预热。
# 预热清单由 tools/warm_plan.py 算（全量 / 增量 / 重度升级都在那里面，tests/test_warm_cdn.py 覆盖）。
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=; ARGS=(); PBR=; FULL=0; DIFF=0; BASE=; DETACH=0; NOESC=0; LOG=logs/warm_cdn.log
while [ $# -gt 0 ]; do case "$1" in
  --list|--count) MODE=$1 ;;
  --purge-branch) PBR=$2; shift ;;
  --diff) DIFF=1; if [ -n "${2:-}" ] && [ "${2#-}" = "$2" ]; then BASE=$2; shift; fi ;;
  --full) FULL=1 ;;
  --no-escalate) NOESC=1 ;;   # 增量里带了 map/art/ / *.glb 也不升级成全量（本次只动了几张浮雕贴图 / 脚本时用）
  --detach|--async) DETACH=1 ;;
  --log) LOG=$2; shift ;;
  -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
  *) ARGS+=("$1") ;; esac; shift; done
purge() { for f in map/data/head.json map/tavern/host-tavernhelper.mjs map/tavern/host-routes.mjs map/tavern/host-lifecycle.mjs map/tavern/host-strings.mjs map/tavern/llm-flow.mjs map/tavern/loot-flow.mjs map/tavern/chars-flow.mjs map/tavern/timeline-flow.mjs map/tavern/host-api.mjs map/tavern/root-store.mjs map/tavern/host-checks.mjs map/tavern/modes-flow.mjs map/tavern/eden-map.js map/tavern/branch-follow.mjs; do   # 宿主拆分（C2）：先清 host-*.mjs 再清入口，免得新入口配旧模块
  curl -fsS --max-time 30 "https://purge.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$PBR/$f" >/dev/null && echo "已清缓存 @$PBR/$f" || echo "清缓存失败 @$PBR/${f}（最长约 12 小时后自然更新；加载器也读 raw.githubusercontent）"; done; }
REF=${ARGS[0]:-$(python3 -c "import sys; sys.path.insert(0, 'tools'); import verlib; print(verlib.tag_of(open('VERSION').read().strip()))")}; JOBS=${ARGS[1]:-16}   # 标签规则见 tools/verlib.py
# 后台脱离：把去掉 --detach 的同一条命令丢给操作系统，输入输出全部重定向，父进程立刻返回（agent 不用干等 CDN）
if [ "$DETACH" = 1 ]; then
  CHILD=("$REF" "$JOBS")
  [ -n "$MODE" ] && CHILD+=("$MODE")
  if [ "$DIFF" = 1 ]; then if [ -n "$BASE" ]; then CHILD+=(--diff "$BASE"); else CHILD+=(--diff); fi; fi
  [ "$FULL" = 1 ] && CHILD+=(--full)
  [ "$NOESC" = 1 ] && CHILD+=(--no-escalate)
  [ -n "$PBR" ] && CHILD+=(--purge-branch "$PBR")
  mkdir -p "$(dirname "$LOG")"
  nohup bash "$0" "${CHILD[@]}" >> "$LOG" 2>&1 < /dev/null &
  PID=$!
  disown "$PID" 2>/dev/null || true
  echo "预热已在后台启动：PID ${PID}，日志 ${LOG}（tail -f 可看进度；不影响当前会话）"
  exit 0
fi
BASE_URL="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$REF"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
PLAN=(python3 tools/warm_plan.py --ref "$REF")
[ "$FULL" = 1 ] && PLAN+=(--full)
if [ "$DIFF" = 1 ]; then if [ -n "$BASE" ]; then PLAN+=(--diff "$BASE"); else PLAN+=(--diff); fi; fi   # BASE = 增量基线（curl 用的是 BASE_URL）
[ "$NOESC" = 1 ] && PLAN+=(--no-escalate)
LIST=$("${PLAN[@]}" 2> "$TMP/note") || { command cat "$TMP/note" >&2; echo "预热清单算不出来（见上面的 warm_plan 报错）" >&2; exit 1; }
NOTE=$(command cat "$TMP/note")
if [ -z "$LIST" ]; then N=0; else N=$(printf '%s\n' "$LIST" | wc -l | tr -d ' '); fi
[ "$MODE" = --count ] && { echo "$N"; exit 0; }
[ "$MODE" = --list ] && { [ "$N" -gt 0 ] && printf '%s\n' "$LIST"; exit 0; }
if [ "$N" = 0 ]; then echo "无需预热：${REF} 没有需要预热的运行时文件（${NOTE}）"; [ -n "$PBR" ] && purge; exit 0; fi
echo "预热 ${REF}：${N} 个文件，并发 ${JOBS}（${NOTE}）"
# 000 = curl 本身出错（连接被重置 / 超时，jsDelivr 首次回源慢时偶发，每次十几个、不固定）：每个请求自带退避重试，
# 仍失败的逐个列出（状态码、curl 退出码、路径），以低并发再补一轮。
get() { curl -s -o /dev/null --max-time 90 --retry 3 --retry-all-errors --retry-delay 3 -w "%{http_code} %{exitcode} {}\n" "$BASE_URL/$1" | sed "s#{}#$1#"; }
export -f get; export BASE_URL
OUT=$(printf '%s\n' "$LIST" | xargs -P "$JOBS" -I{} bash -c 'get "$1"' _ {})
echo "$OUT" | awk '{print $1}' | sort | uniq -c
BAD=$(echo "$OUT" | awk '$1 != 200 {print $3}')
if [ -n "$BAD" ]; then
  echo "补一轮（并发 4）：$(echo "$BAD" | wc -l | tr -d ' ') 个"
  LEFT=$(echo "$BAD" | xargs -P 4 -I{} bash -c 'get "$1"' _ {} | awk '$1 != 200')
  if [ -n "$LEFT" ]; then echo "仍失败（状态 退出码 路径）："; echo "$LEFT"; exit 1; fi
  echo "补齐：全部 200"
fi
[ -n "$PBR" ] && purge
exit 0
