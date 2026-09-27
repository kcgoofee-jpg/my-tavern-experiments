#!/usr/bin/env bash
# 预热 jsDelivr：把某个版本（标签或提交）下 map/ 里的所有文件请求一遍，让 CDN 先从 GitHub 拉好并缓存。
# 这样别人第一次打开地图时不用等 CDN 回源（每个文件首次约 1–2 秒）。
# 用法：bash tools/warm_cdn.sh [版本，默认 map-v$(cat VERSION)] [并发，默认 16]
set -euo pipefail
cd "$(dirname "$0")/.."
REF=${1:-$(python3 -c "import sys; sys.path.insert(0, 'tools'); import verlib; print(verlib.tag_of(open('VERSION').read().strip()))")}; JOBS=${2:-16}   # 标签规则见 tools/verlib.py
BASE="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$REF"
N=$(git ls-tree -r --name-only "$REF" -- map | grep -vE '\.(md|py)$' | wc -l | tr -d ' ')
echo "预热 $REF：$N 个文件，并发 $JOBS"
git ls-tree -r --name-only "$REF" -- map | grep -vE '\.(md|py)$' \
  | xargs -P "$JOBS" -I{} curl -s -o /dev/null -w "%{http_code}\n" "$BASE/{}" \
  | sort | uniq -c
