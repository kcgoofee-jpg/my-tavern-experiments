#!/usr/bin/env bash
# 冒烟检查（几秒钟）：提交 / 推送前跑。任何一项失败退出码 1。
# 用法：bash tools/smoke.sh [--cdn <ref>] [--cdn-n 12]
#   1. tools/check_maps.py（注册表、点位、瓦片一致）
#   2. node --test tests/*.test.mjs
#   3. map/viewer.html 的内联脚本抽出来 node --check；map/*.js、map/*.mjs、map/tavern/*.js|mjs 也 node --check
#   4. map/data/*.json、map/i18n/*.json 能解析
#   5. 可选 --cdn <ref>：对该 ref 下 map/ 的一组文件（固定几个入口 + 随机瓦片）发 HEAD 到 jsDelivr，要求全部 200
set -uo pipefail
cd "$(dirname "$0")/.."
CDN=""; CDN_N=12
while [ $# -gt 0 ]; do case "$1" in --cdn) CDN=$2; shift 2 ;; --cdn-n) CDN_N=$2; shift 2 ;; -h|--help) sed -n '2,9p' "$0"; exit 0 ;; *) echo "未知参数 $1" >&2; exit 2 ;; esac; done
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FAIL=0
step() { local name=$1; shift; local t=$SECONDS
  if "$@" > "$TMP/out" 2>&1; then echo "✓ $name ($((SECONDS - t))s)"; else echo "✗ $name"; tail -15 "$TMP/out" | sed 's/^/    /'; FAIL=1; fi; }

step "check_maps" python3 tools/check_maps.py
step "node --test tests/ ($(ls tests/*.test.mjs | wc -l | tr -d ' ') 个)" node --test tests/*.test.mjs

inline_check() {
  python3 - "$TMP" <<'PY' || return 1
import re, sys, os
tmp = sys.argv[1]; html = open('map/viewer.html', encoding='utf-8').read()
n = 0
for m in re.finditer(r'<script(?P<a>[^>]*)>(?P<b>[\s\S]*?)</script>', html):
    if 'src=' in m.group('a') or not m.group('b').strip(): continue
    ext = '.mjs' if 'module' in m.group('a') else '.js'
    open(os.path.join(tmp, f'inline{n}{ext}'), 'w', encoding='utf-8').write(m.group('b')); n += 1
print(n, 'inline scripts'); sys.exit(0 if n else 1)
PY
  local f rc=0
  for f in "$TMP"/inline*.*js map/*.js map/*.mjs map/tavern/*.js map/tavern/*.mjs; do
    [ -f "$f" ] || continue
    case "$f" in map/tavern/eden-map.js) node --input-type=module --check < "$f" || { echo "  $f"; rc=1; }; continue ;; esac
    node --check "$f" || { echo "  $f"; rc=1; }
  done
  return $rc
}
step "node --check（viewer.html 内联 + map 脚本）" inline_check

json_check() { python3 - <<'PY'
import json, glob, sys
bad = 0; files = sorted(glob.glob('map/data/*.json') + glob.glob('map/i18n/*.json'))
for f in files:
    try: json.load(open(f, encoding='utf-8'))
    except Exception as e: print(f, e); bad += 1
print(len(files), 'files'); sys.exit(1 if bad else 0)
PY
}
step "JSON（map/data、map/i18n）" json_check

cdn_check() {
  local base="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$CDN"
  git rev-parse --verify -q "$CDN^{commit}" >/dev/null || git fetch -q origin "$CDN" 2>/dev/null || true
  local list; list=$(git ls-tree -r --name-only "$CDN" -- map 2>/dev/null) || { echo "本地没有 $CDN（先 git fetch）"; return 1; }
  { printf '%s\n' map/viewer.html map/tavern/eden-map.js map/data/maps.json map/events.js
    grep -E '_files/[0-9]+/' <<<"$list" | python3 -c "import sys,random; l=sys.stdin.read().split(); random.shuffle(l); print('\n'.join(l[:$CDN_N]))"
  } | grep -vE '\.(md|py)$' | sort -u > "$TMP/cdn"
  local bad=0 u c
  while read -r u; do c=$(curl -sI -o /dev/null -m 20 -w '%{http_code}' "$base/$u"); [ "$c" = 200 ] || { echo "$c $u"; bad=1; }; done < "$TMP/cdn"
  echo "$(wc -l < "$TMP/cdn" | tr -d ' ') 个 URL"; return $bad
}
[ -n "$CDN" ] && step "jsDelivr HEAD @$CDN" cdn_check

[ $FAIL = 0 ] && echo "smoke: 全部通过" || echo "smoke: 有失败"
exit $FAIL
