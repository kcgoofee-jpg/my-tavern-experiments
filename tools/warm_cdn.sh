#!/usr/bin/env bash
# 预热 jsDelivr：把某个版本（标签或提交）下 map/ 里产品运行时会加载的文件请求一遍，让 CDN 先从 GitHub 拉好并缓存。
# 这样别人第一次打开地图时不用等 CDN 回源（每个文件首次约 1–2 秒）。
# 用法：bash tools/warm_cdn.sh [版本，默认 map-v$(cat VERSION)] [并发，默认 16] [--list | --count]
#   --list / --count：只列出 / 数出要预热的文件，不发请求（ship.sh 演练用）
# C-11：不预热非运行时文件——文档（.md / .txt）、脚本（.py）、map/shots 截图、map/_proto 原型、*/reviews/ 评审稿、
#   产品从不加载的原型页（world.html、world_draft*.html、tiancheng.html 与只被它们用的 section.js）。docs/ 不在 map/ 下，本来就不预热。
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=; ARGS=()
for x in "$@"; do case "$x" in --list|--count) MODE=$x ;; *) ARGS+=("$x") ;; esac; done
REF=${ARGS[0]:-$(python3 -c "import sys; sys.path.insert(0, 'tools'); import verlib; print(verlib.tag_of(open('VERSION').read().strip()))")}; JOBS=${ARGS[1]:-16}   # 标签规则见 tools/verlib.py
BASE="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$REF"
EXCL='\.(md|py|txt)$|^map/(shots|_proto)/|/reviews/|^map/(world|world_draft[0-9]*|tiancheng)\.html$|^map/section\.js$'
files() { git ls-tree -r --name-only "$REF" -- map | grep -vE "$EXCL" || true; }
N=$(files | wc -l | tr -d ' ')
[ "$MODE" = --count ] && { echo "$N"; exit 0; }
[ "$MODE" = --list ] && { files; exit 0; }
echo "预热 $REF：$N 个文件，并发 $JOBS"
files | xargs -P "$JOBS" -I{} curl -s -o /dev/null -w "%{http_code}\n" "$BASE/{}" \
  | sort | uniq -c
