#!/usr/bin/env bash
# 预热 jsDelivr：把某个版本（标签或提交）下 map/ 里产品运行时会加载的文件请求一遍，让 CDN 先从 GitHub 拉好并缓存。
# 这样别人第一次打开地图时不用等 CDN 回源（每个文件首次约 1–2 秒）。
# 用法：bash tools/warm_cdn.sh [版本，默认 map-v$(cat VERSION)] [并发，默认 16] [--list | --count]
#   --list / --count：只列出 / 数出要预热的文件，不发请求（ship.sh 演练用）
#   --purge-branch <分支>：预热完再清 jsDelivr 上该分支路径的 head.json 与加载器入口文件缓存（跟随分支几分钟内读到新构建；docs/tooling.md）
# C-11：不预热非运行时文件——文档（.md / .txt）、脚本（.py）、map/shots 截图、map/_proto 原型、*/reviews/ 评审稿、
#   产品从不加载的原型页（world.html、world_draft*.html、tiancheng.html 与只被它们用的 section.js）。docs/ 不在 map/ 下，本来就不预热。
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=; ARGS=(); PBR=
while [ $# -gt 0 ]; do case "$1" in --list|--count) MODE=$1 ;; --purge-branch) PBR=$2; shift ;; *) ARGS+=("$1") ;; esac; shift; done
purge() { for f in map/data/head.json map/tavern/host-th.mjs map/tavern/host-routes.mjs map/tavern/host-lifecycle.mjs map/tavern/eden-map.js map/tavern/follow.mjs; do   # 宿主拆分（C2）：先清 host-*.mjs 再清入口，免得新入口配旧模块
  curl -fsS --max-time 30 "https://purge.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$PBR/$f" >/dev/null && echo "已清缓存 @$PBR/$f" || echo "清缓存失败 @$PBR/$f（最长约 12 小时后自然更新；加载器也读 raw.githubusercontent）"; done; }
REF=${ARGS[0]:-$(python3 -c "import sys; sys.path.insert(0, 'tools'); import verlib; print(verlib.tag_of(open('VERSION').read().strip()))")}; JOBS=${ARGS[1]:-16}   # 标签规则见 tools/verlib.py
BASE="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$REF"
EXCL='\.(md|py|txt)$|^map/data/schema/|^map/(shots|_proto)/|/reviews/|^map/(world|world_draft[0-9]*|tiancheng)\.html$|^map/section\.js$'
files() { git ls-tree -r --name-only "$REF" -- map | grep -vE "$EXCL" || true; }
N=$(files | wc -l | tr -d ' ')
[ "$MODE" = --count ] && { echo "$N"; exit 0; }
[ "$MODE" = --list ] && { files; exit 0; }
echo "预热 ${REF}：${N} 个文件，并发 ${JOBS}"
# 000 = curl 本身出错（连接被重置 / 超时，jsDelivr 首次回源慢时偶发，每次十几个、不固定）：每个请求自带退避重试，
# 仍失败的逐个列出（状态码、curl 退出码、路径），以低并发再补一轮。
get() { curl -s -o /dev/null --max-time 90 --retry 3 --retry-all-errors --retry-delay 3 -w "%{http_code} %{exitcode} {}\n" "$BASE/$1" | sed "s#{}#$1#"; }
export -f get; export BASE
OUT=$(files | xargs -P "$JOBS" -I{} bash -c 'get "$1"' _ {})
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
