#!/usr/bin/env bash
# 冒烟检查（几秒钟）：提交 / 推送前跑。任何一项失败退出码 1。
# 用法：bash tools/smoke.sh [--cdn <ref>] [--cdn-n 12]
#   1. tools/check_maps.py（注册表、点位、瓦片一致）
#   2. node --test tests/*.test.mjs
#   3. map/viewer.html 的内联脚本抽出来 node --check；map/*.js、map/*.mjs、map/tavern/*.js|mjs 也 node --check
#   4. map/data/*.json、map/i18n/*.json 能解析
#   5. 可选 --cdn <ref>：对该 ref 下 map/ 的一组文件（固定几个入口 + 随机瓦片）发 HEAD 到 jsDelivr，要求全部 200
#   6. tools/**/*.sh lint：`$var` 紧跟非 ASCII 字符（macOS bash 3.2 下会被吞进变量名报 unbound variable）；
#      裸 cat/ls（用户 shell 把 cat/ls 起了坏别名，脚本要用 `command cat`/`command ls`）
#   7. 架构看门狗（tools/check_architecture.py）：map/core/ 单文件 ≤400 行；core 零父级 import、
#      core 与纯流水线不碰宿主全局（单一属主豁免表见脚本头）；viewer.html / map/app/ 禁裸 z-index 字面量
set -uo pipefail
cd "$(dirname "$0")/.."
CDN=""; CDN_N=12
while [ $# -gt 0 ]; do case "$1" in --cdn) CDN=$2; shift 2 ;; --cdn-n) CDN_N=$2; shift 2 ;; -h|--help) sed -n '2,11p' "$0"; exit 0 ;; *) echo "未知参数 $1" >&2; exit 2 ;; esac; done
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FAIL=0
step() { local name=$1; shift; local t=$SECONDS
  if "$@" > "$TMP/out" 2>&1; then echo "✓ $name ($((SECONDS - t))s)"; else echo "✗ $name"; tail -15 "$TMP/out" | sed 's/^/    /'; FAIL=1; fi; }

step "check_maps" python3 tools/check_maps.py
python3 tools/check_render_deps.py | sed 's/^/  [警告] /'   # 只警告，不计入 FAIL（docs/render-deps.md）
step "check_pack（设定包）" python3 tools/check_pack.py
step "架构看门狗（core 行数 / 分层纯净 / 裸 z-index，见 tools/check_architecture.py）" python3 tools/check_architecture.py
step "纵深数学对拍（python ↔ golden；JS 侧在 node --test）" python3 tools/test_depth.py
step "斜视投影对拍（python ↔ golden）" python3 tools/test_project.py
# 空文件守卫：已跟踪的 .mjs/.js/.py/.json/.md 不许是 0 字节（shell 里 cat 被别名成 bat 时 `cat > f <<EOF` 会悄悄写出空文件，stats096 就这样空了两天）；确有需要的空文件写进 EMPTY_OK
EMPTY_OK='^$'
step "无空的已跟踪源文件" bash -c "! git ls-files -- '*.mjs' '*.js' '*.py' '*.json' '*.md' | while IFS= read -r f; do [ -f \"\$f\" ] && [ ! -s \"\$f\" ] && echo \"空文件：\$f\"; done | grep -vE '$EMPTY_OK' | grep ."
step "版本一致（VERSION ↔ build.json ↔ CHANGELOG ↔ README ↔ 标签）" python3 tools/check_version.py
step "令牌内联一致（tokens.css ↔ viewer.html）" python3 tools/sync_tokens.py --check
step "机器标识 ASCII 审计（路径 / JSON 键 / id 字段）" python3 tools/check_ascii.py
step "文档语言（基线之后的新 .md 必须英文，见 docs/language-policy.md）" python3 tools/check_doc_language.py
step "文档语言门控自测（英文过 / 中文拦 / 豁免真的豁免）" python3 tools/test_doc_language.py
step "README 置顶导入链接与路径引用（最新标签 / 预览分支 / 提到的路径都存在）" python3 tools/check_readme.py
step "README 门控自测（过期标签 / 错仓库名 / 死路径会被拦，--fix 能修回来）" python3 tools/test_readme.py
step "渲染守卫 lint（渲染脚本必须经 setup_render_device/pick_gpu 配 GPU）" python3 tools/render_preflight.py lint
step "渲染守卫单测（看门狗状态机 / 预检 / 事故回归）" python3 tools/test_render_guard.py
step "角色卡清洗单测（tools/clean_card.py，V3 容错解析 / 载荷零丢失）" python3 tests/test_clean_card.py
step "node --test tests/($(ls tests/*.test.mjs | wc -l | tr -d ' ') 个)" node --test tests/*.test.mjs

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
  # 覆盖：viewer.html 内联、map/ 与 map/tavern/ 的脚本、庄园 three.js（map/estate/）、世界图数据 map/data/world.js。
  # Node < 22 不做模块语法探测，所以先按脚本查、失败再按 ES 模块查，两个都不行才算失败。
  for f in "$TMP"/inline*.*js map/*.js map/*.mjs map/tavern/*.js map/tavern/*.mjs map/core/*.mjs map/app/*.mjs map/estate/*.js map/data/*.js; do
    [ -f "$f" ] || continue
    node --check "$f" >/dev/null 2>&1 && continue
    node --input-type=module --check < "$f" >/dev/null 2>&1 && continue
    echo "  $f"; node --check "$f" 2>&1 | head -3 | sed 's/^/    /'; rc=1
  done
  return $rc
}
step "node --check（viewer.html 内联 + map 脚本 + 庄园 + 世界图数据）" inline_check

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
  { printf '%s\n' map/viewer.html map/ui/tokens.css map/tavern/eden-map.js map/tavern/host-th.mjs map/tavern/host-routes.mjs map/tavern/host-lifecycle.mjs map/data/maps.json map/events.mjs map/app/boot.mjs
    grep -E '_files/[0-9]+/' <<<"$list" | python3 -c "import sys,random; l=sys.stdin.read().split(); random.shuffle(l); print('\n'.join(l[:$CDN_N]))"
  } | grep -vE '\.(md|py)$' | sort -u > "$TMP/cdn"
  local bad=0 u c
  while read -r u; do c=$(curl -sI -o /dev/null -m 20 -w '%{http_code}' "$base/$u"); [ "$c" = 200 ] || { echo "$c $u"; bad=1; }; done < "$TMP/cdn"
  echo "$(wc -l < "$TMP/cdn" | tr -d ' ') 个 URL"; return $bad
}
[ -n "$CDN" ] && step "jsDelivr HEAD @$CDN" cdn_check

shell_lint() {
  # BSD grep（macOS 自带）没有 -P（PCRE），非 ASCII 判断也不好写可移植的 POSIX 正则，改用 python3。
  python3 - <<'PY'
import re, subprocess, sys
files = subprocess.run(['git', 'ls-files', 'tools/**/*.sh'], capture_output=True, text=True).stdout.split()
var_re = re.compile(r'\$[A-Za-z_][A-Za-z0-9_]*(?=[^\x00-\x7F])')
bare_re = re.compile(r'(^|[;&|(]|\bthen\b|\bdo\b)\s*(cat|ls)(\s|$)')
skip_bare = re.compile(r'\b(command|which|type)\s+(cat|ls)\b')
bad = False
for f in files:
    try:
        lines = open(f, encoding='utf-8').read().splitlines()
    except OSError:
        continue
    var_hits = []
    bare_hits = []
    for i, line in enumerate(lines, 1):
        stripped = line.lstrip()
        if stripped.startswith('#'):
            continue
        for m in var_re.finditer(line):
            # 排除 ${...} 形式（已用花括号转义，是安全写法）
            if m.start() > 0 and line[m.start()-1:m.start()+2] == '${':
                continue
            if line[m.start():m.start()+2] == '${':
                continue
            var_hits.append((i, line.strip()))
            break
        if bare_re.search(line) and not skip_bare.search(line):
            bare_hits.append((i, line.strip()))
    if var_hits:
        bad = True
        print(f"  [变量粘连] {f}：")
        for i, l in var_hits:
            print(f"    {i}: {l}")
    if bare_hits:
        bad = True
        print(f"  [裸 cat/ls] {f}：")
        for i, l in bare_hits:
            print(f"    {i}: {l}")
sys.exit(1 if bad else 0)
PY
}
step "shell lint（变量+中文粘连 / 裸 cat|ls，见 docs/agent-brief.md 里的坏别名坑）" shell_lint

[ $FAIL = 0 ] && echo "smoke: 全部通过" || echo "smoke: 有失败"
exit $FAIL
