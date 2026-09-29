#!/usr/bin/env python3
"""架构看门狗（2026-09-30 接入 tools/smoke.sh）：解耦重构收官后立下的三大铁律的轻量机检。

背景见 docs/reviews/architecture_and_stream_perf.md；三道防线：

  1. 体量防膨胀：map/core/*.mjs 单文件物理行数 ≤ 400，超过即败（防单体巨石复发）。
  2. 分层单向纯净：
     - map/core/ 是最底层的纯叶模块：不许出现任何指向父目录的相对 import
       （反向 import '../tavern/…' 这类宿主层回引首当其冲）。
     - core 与纯计算流水线（map/tavern/context.mjs、map/tavern/msgtext.mjs）的源码，
       剥离注释与字符串字面量后不许出现宿主环境对象：
       window / document / localStorage / sessionStorage / navigator / Mvu / SillyTavern。
       唯一例外是下方 OWNERS 登记的全局单一属主，豁免按「文件 × 对象」最窄登记，
       新属主进表必须写明理由。Mvu / SillyTavern 的全仓唯一属主 mvu-bridge.mjs
       由 tests/mvu_bridge.test.mjs 源码扫描机检，本脚本不重复。
  3. 裸 z-index 封锁：map/viewer.html 与 map/app/*.mjs 里 z-index 的取值只许是
     var(--zu-*) / var(--zv-*) 名义常量（表定义在 viewer.html 顶部：--zu-* 外层 UI、
     --zv-* 视口槽位）、含 var() 的 calc、或运行期表达式（如 layerhost 的
     String(slotZ(slot))）；裸数字字面量一律拦截。
  4. Pack 0 铁律（通用化 v1）：map/core/ 内核严禁出现卡片专有人名 / 地名
     （保底名册 16 人 + 伊甸庄园 / 天城）。注释剥掉后扫描（评述里难免提到卡）；
     字符串字面量 / 代码里出现 = 违规——人名地名属于设定包数据
     （map/packs/<id>/、map/data/），内核零硬编码分支。

exit 0 = 全过；exit 1 = 有违规（逐条 文件:行号）。纯文本机检，与
tests/layer_registry.test.mjs 的常量对拍 / mvu_bridge 的隔离契约互补。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / 'map' / 'core'
PIPELINE = ['map/tavern/context.mjs', 'map/tavern/msgtext.mjs']
Z_FILES = ['map/viewer.html'] + sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'map' / 'app').glob('*.mjs'))
MAX_CORE_LINES = 400

# 全局单一属主豁免表（文件 → 允许出现的宿主对象）。窄豁免：只豁对象名，不豁整文件语义；
# 加条目必须写明这个文件为什么是它的唯一属主。
OWNERS = {
    # 本机存储服务（arch-v2 §4）：查看器 / 宿主 / 庄园三维子页同源共用一份存储，键全登记在这。
    'map/core/storage.mjs': {'localStorage', 'sessionStorage'},
    # 日志缓冲的 install()：挂 window error / unhandledrejection / pagehide 钩子（typeof 守卫，
    # 浏览器外跳过），日志节流落盘也走本机存储；模块尾的 typeof document 是自装守卫的一部分。
    'map/core/logbuf.mjs': {'window', 'document', 'localStorage'},
    # 房间图集图片压缩：无 OffscreenCanvas 的环境退回 document.createElement('canvas')。
    'map/core/room-gallery-db.mjs': {'document'},
}

HOST_OBJECTS = re.compile(r'\b(window|document|localStorage|sessionStorage|navigator|Mvu|SillyTavern)\b')
IMPORT_RE = re.compile(r"""\b(?:from|import)\s*\(\s*(['"])([^'"\n]+)\1|\bfrom\s+(['"])([^'"\n]+)\3""")
ZVALUE_RE = re.compile(
    r"""z-index\s*:\s*([^;}]+)"""                     # CSS 声明
    r"""|\.zIndex\s*=\s*([^;\n]+)"""                  # 直接赋值
    r"""|setProperty\(\s*['"]z-?[iI]ndex['"]\s*,\s*([^)\n]+)"""  # setProperty（z-index / zIndex 大小写都收）
)


def strip(src, literals=True):
    """把注释（// 与 /* */）与（可选）字符串字面量替换成等长空白：行号不漂移，token 检查不误伤。"""
    out = []
    i, n = 0, len(src)

    def blank(s):
        return ''.join('\n' if c == '\n' else ' ' for c in s)

    while i < n:
        if src.startswith('//', i):
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(blank(src[i:j]))
            i = j
        elif src.startswith('/*', i):
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(blank(src[i:j]))
            i = j
        elif literals and src[i] in '\'"`':
            q = src[i]
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == q:
                    break
                j += 1
            end = min(j + 1, n)
            out.append(blank(src[i:end]))
            i = end
        else:
            out.append(src[i])
            i += 1
    return ''.join(out)


def line_of(src, pos):
    return src.count('\n', 0, pos) + 1


def check_line_count():
    bad = []
    sizes = {}
    for p in sorted(CORE.glob('*.mjs')):
        n = len(p.read_text(encoding='utf-8').splitlines())
        rel = str(p.relative_to(ROOT))
        sizes[rel] = n
        if n > MAX_CORE_LINES:
            bad.append(f"{rel}: {n} 行，超过 core 单文件上限 {MAX_CORE_LINES} 行（拆子模块或下沉数据）")
    return bad, sizes


def check_layering():
    """core 零父级 import；core 与纯流水线禁触宿主全局（属主豁免表除外）。"""
    bad = []
    files = sorted(CORE.glob('*.mjs')) + [ROOT / f for f in PIPELINE]
    for p in files:
        rel = str(p.relative_to(ROOT))
        text = p.read_text(encoding='utf-8')
        code_keep_quotes = strip(text, literals=False)
        for m in IMPORT_RE.finditer(code_keep_quotes):
            spec = m.group(2) if m.group(2) is not None else m.group(4)
            if spec.startswith('..'):
                bad.append(f"{rel}:{line_of(code_keep_quotes, m.start())}: "
                           f"反向 import '{spec}'——core 是纯叶层，不许回引宿主层 / 上层目录")
        code = strip(text, literals=True)
        allow = OWNERS.get(rel, set())
        for m in HOST_OBJECTS.finditer(code):
            if m.group(1) in allow:
                continue
            bad.append(f"{rel}:{line_of(code, m.start())}: 触碰宿主对象 {m.group(1)}"
                       f"——宿主全局只许经登记的单一属主（OWNERS 表，见脚本头）")
    return bad


def check_zindex():
    bad = []
    for rel in Z_FILES:
        src = (ROOT / rel).read_text(encoding='utf-8')
        for m in ZVALUE_RE.finditer(src):
            raw = next(g for g in m.groups() if g is not None).strip()
            val = raw.strip('\'"`').strip()
            if re.match(r'^-?\d', val):
                bad.append(f"{rel}:{line_of(src, m.start())}: 裸 z-index 字面量「{raw}」"
                           f"——改用 var(--zu-*) / var(--zv-*) 名义常量（表在 viewer.html 顶部）")
    return bad


def pack0_names():
    """卡片专有名词表：保底名册（map/data/fallback_roster.json 的 members.name）+ 卡片专有地名。
    'eden' 包 id 除外——那是默认包的标识符（core/pack.mjs DEFAULT_ID），不是文案。"""
    names = {'天城', '伊甸庄园'}
    f = ROOT / 'map' / 'data' / 'fallback_roster.json'
    if f.exists():
        for m in json.loads(f.read_text(encoding='utf-8')).get('members', []):
            if isinstance(m, dict) and m.get('name'):
                names.add(str(m['name']))
    return sorted(names)


def check_pack0():
    bad = []
    names = pack0_names()
    for p in sorted(CORE.glob('*.mjs')):
        code = strip(p.read_text(encoding='utf-8'), literals=False)   # 剥注释（评述里难免提到卡名）、留字符串字面量
        rel = str(p.relative_to(ROOT))
        for name in names:
            if name in code:
                bad.append(f"{rel}:{line_of(code, code.index(name))}: 内核出现卡片专有名词「{name}」"
                           f"——人名 / 地名属于设定包数据（map/packs/<id>/、map/data/），内核零硬编码分支")
    return bad


def main():
    fails = []

    bad, sizes = check_line_count()
    top = max(sizes.items(), key=lambda kv: kv[1]) if sizes else ('-', 0)
    print(f"  [体量] map/core {len(sizes)} 个模块，最大 {top[0]} {top[1]} 行（上限 {MAX_CORE_LINES}）")
    fails += bad

    bad = check_layering()
    print(f"  [分层] core 零父级 import + core/纯流水线宿主全局触点（豁免 {len(OWNERS)} 个属主文件）")
    fails += bad

    bad = check_zindex()
    print(f"  [z-index] viewer.html + map/app 共 {len(Z_FILES)} 个文件，裸字面量须为零")
    fails += bad

    bad = check_pack0()
    print(f"  [Pack 0] core 禁卡专有名词（保底名册 + 地名，共 {len(pack0_names())} 个词），命中须为零")
    fails += bad

    if fails:
        print(f"架构看门狗：{len(fails)} 处违规")
        for f in fails:
            print(f"  {f}")
        return 1
    print("架构看门狗：4 道防线全过")
    return 0


if __name__ == '__main__':
    sys.exit(main())
