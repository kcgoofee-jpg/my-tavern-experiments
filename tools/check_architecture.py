#!/usr/bin/env python3
"""架构看门狗（2026-09-30 接入 tools/smoke.sh；S0-B 起覆盖整个引擎并加「只减不增」账本）。

背景见 docs/reviews/architecture_and_stream_perf.md 与 docs/plans/spatial-os.md §五 S0。八道防线：

  1. 体量防膨胀：引擎源文件（见 ENGINE_GLOBS）单文件物理行数 ≤ 400。既有超长文件登记在
     tools/arch_baseline.json 的 "lines"，只许缩短不许再长；map/core/* 永远不准进账本（硬 400）。
  2. 分层单向纯净：
     - map/core/ 是最底层的纯叶模块：不许出现任何指向父目录的相对 import
       （反向 import '../tavern/…' 这类宿主层回引首当其冲）。
     - core 与纯计算流水线（map/tavern/context.mjs、msgtext.mjs、sanitize.mjs、preset.mjs、stash-store.mjs、stash-recompute.mjs；
       流水线可以 import ../core/，其余父级 import 仍拦）的源码，
       剥离注释与字符串字面量后不许出现宿主环境对象：
       window / document / localStorage / sessionStorage / navigator / Mvu / SillyTavern。
       唯一例外是下方 OWNERS 登记的全局单一属主，豁免按「文件 × 对象」最窄登记，
       新属主进表必须写明理由。Mvu / SillyTavern 的全仓唯一属主 mvu-bridge.mjs
       由 tests/mvu_bridge.test.mjs 源码扫描机检，本脚本不重复。
  3. 裸 z-index 封锁：引擎全部文件里 z-index 的取值只许是 var(--zu-*) / var(--zv-*) 名义常量
     （表定义在 viewer.html 顶部：--zu-* 外层 UI、--zv-* 视口槽位）、含 var() 的 calc、
     或运行期表达式（如 layerhost 的 String(slotZ(slot))）；裸数字字面量拦截，
     含对象字面量写法 `zIndex: 99999`。既有的按文件计数登记在账本 "zindex"，只减不增。
  4. 卡专有名词封锁（Pack 0 铁律的引擎版）：词表 = 保底名册 16 人 + 卡专有地名 / 设定词 / 内部标识
     （见 TERM_EXTRA；英文卡词见 EN_TERMS，区分大小写）。引擎文件剥掉注释后扫描（评述里难免提到卡），字符串字面量算数；
     另扫 map/i18n/zh.json 与 en.json 的**值**。逐次计数：map/core/* 硬零，其余文件 ≤ 账本 "terms"。
     人名地名属于设定包数据（map/packs/<id>/、map/data/），引擎零硬编码。
  8. 注释里的卡词（阶段 A 验收，同一张词表、只数注释，另含 map/ui/*.css）：评述同样写中性措辞
     （「主场景」「主城」…），逐文件计数，map/core/* 硬零，其余 ≤ 账本 "comment_terms"（现为空）。
     与第 4 条互补：第 4 条剥注释后扫，第 8 条只数注释，两者合起来 = 计划 §8 的 grep。
  5. 学术引用封锁（2026-09-30 用户决定，口径来自参考卡「no academic citations embedded in project」）：
     map/ 与 tests/ 的源码里不许出现论文名 / 期刊缩写 / arXiv / DOI / et al. —— 代码只说**机制**
     （如「滑动窗口关键帧压缩」「领域槽位解耦追踪」），出处统一存在
     docs/plans/llm-campaign.md §10《References — theoretical background》一处。
     只查源码（.mjs/.js）：文档、数据、第三方 vendor 不在本防线内。本条与第 2 条行为不变。
  7. 旧 `TC*` 全局封锁（S5-3，硬零、无账本）：引擎文件里不许出现 `window.TC<大写>` / `P.TC<大写>`（含 `parent.` /
     `globalThis.` 前缀）。全局名按 docs/naming.md 表 C 改成了 `<名>Api` / `<名>View`；新代码不许再造 `TC*`。
  6. 内联外观样式：引擎文件里 `.style.<属性> =` 赋值、`.style =`、`cssText`、HTML / 模板串里的
     `style="…"` / `style='…'` / `style=${…}` 逐次计数，≤ 账本 "inline_style"。不计：`<style>` 块、
     `style.setProperty('--…')` 与声明全是 `--x: v` 的 `style="…"`（CSS 自定义属性是传动态几何的许可通道）、`style.transform` 与
     `style.left/top/width/height`（动态几何）。

「只减不增」账本（ratchet）：tools/arch_baseline.json = {"lines","zindex","terms","inline_style","comment_terms","empty_catch"}，
只列有违规的文件，数字只许变小。工具生成，不手写：
  python3 tools/check_architecture.py                     检查（有违规 exit 1，逐条 文件:行号 或 文件:计数>账本）
  python3 tools/check_architecture.py --init-baseline     账本不存在时首次生成
  python3 tools/check_architecture.py --update-baseline   下调账本到当前计数；绝不抬高数字、绝不加新文件，有增长即拒绝

  9. 空 catch（D16）：引擎文件里 `catch (e) {}` / `catch {}` / `.catch(() => {})` 等吞错写法按文件计数，≤ 账本 "empty_catch"
     （map/core 也按账本算，不是硬零）。新文件或计数变大即失败；该记日志的换成 console.warn（logbuf 收进反馈报告）。

  10. 宿主接口名封锁（F0，硬零、无账本）：酒馆助手 / 酒馆的接口名（词表 = map/tavern/host-adapter.mjs
     的 TH_API 登记表，本脚本读它，不另建一份）只许在适配层里出现。引擎其余文件剥注释与字符串后命中即失败——
     所有调用走 host.fn / host.ok 或分组接口（events / chat / mvu / vars / inject / wb / macro / ui）。
     纯函数模块收「取法函数」当参数、按名字字符串要接口不算违规（名字在字符串里，真调用经调用方递进来的 host.fn）。

引擎范围（ENGINE_GLOBS）之外永不扫描：map/vendor/、map/estate/ 下的 vendor / model / assets 等（S7-3 起 map/estate/*.js 与 index.html 在范围内）、map/props/*/（逐道具数据）、
map/packs/、map/data/、map/section.js、viewer.html 以外的 map/*.html、map/_proto/、map/tavern/test-*.html、
tests/、tools/。

exit 0 = 全过；exit 1 = 有违规。纯文本机检，与
tests/layer_registry.test.mjs 的常量对拍 / mvu_bridge 的隔离契约互补。
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / 'map' / 'core'
BASELINE_PATH = ROOT / 'tools' / 'arch_baseline.json'
PIPELINE = ['map/tavern/context.mjs', 'map/tavern/msgtext.mjs', 'map/tavern/sanitize.mjs', 'map/tavern/preset.mjs', 'map/tavern/stash-store.mjs', 'map/tavern/stash-recompute.mjs']
MAX_CORE_LINES = 400      # 旧名保留；现在是全引擎的单文件行数上限
MAX_LINES = MAX_CORE_LINES
CORE_PREFIX = 'map/core/'

# 引擎范围：检查 1 / 3 / 4 / 6 共用这一张表。表外（vendor、庄园页、逐道具数据、设定包、数据、原型、工具、测试）永不扫描。
ENGINE_GLOBS = [
    'map/core/*.mjs', 'map/app/*.mjs', 'map/tavern/*.mjs', 'map/tavern/eden-map.js',
    'map/ui/*.js', 'map/ui/*.mjs', 'map/three/*.mjs', 'map/*.mjs',
    'map/viewer.html', 'map/props/viewer3d.html',
    'map/estate/main.js', 'map/estate/presence.js', 'map/estate/labels.js', 'map/estate/terrain.js', 'map/estate/index.html',   # S7-3 T9: the 3D page is the engine's interior viewer now (the first pack's words live in its manifest and data)
]
COMMENT_EXTRA_GLOBS = ['map/ui/*.css']   # 检查 8 在引擎文件之外多扫的样式表（令牌表的注释）
I18N_FILES = ['map/i18n/zh.json', 'map/i18n/en.json']   # 检查 4 额外扫这两本词典的「值」

# 账本五栏：键名即检查名。
KINDS = ('lines', 'zindex', 'terms', 'inline_style', 'comment_terms', 'empty_catch')
# map/core 对这些栏不是硬零：吞错的 catch 在 core 里也有「预期且无害」的（存储配额、隐私模式），照账本只减不增。
CORE_SOFT_KINDS = {'empty_catch'}
BASELINE_NOTE = ('Ratchet ledger for tools/check_architecture.py: counts may only go down; '
                 'regenerate with --update-baseline (never hand-edit, never add a file).')

# 检查 4 在保底名册之外追加的词：卡专有地名 / 设定词 / 内部标识。改这张表就是改口径。
TERM_EXTRA = ['母畜', '挤奶', '庄园', '伊甸', '天城', '原域', '圣都', '首相', '罗斯柴尔德',
              '外界知情', '网络攻击', 'tiancheng', 'eden_estate', 'tc_upper', 'tc_mid', 'tc_low']
# 英文卡词（S4-4，区分大小写）：英文文案里的产品名 / 地名 / 词条；不含 EdenMap / eden-map / edenMap（那些是全局名、消息类型与存储键，S5 / S10 再改）
EN_TERMS = ['Tiancheng', 'Eden Map', 'Eden map', 'Eden Manor', 'Manor rooms', 'Manor grounds', 'Estate members', 'Estate reputation']

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
# 学术引用封锁（第 5 道防线）：论文名 / 期刊缩写 / 预印本与 DOI / 引用习惯写法。
# 收紧到「一眼能认出来的引用形态」：改动这张表就是改口径，必须在 docs/plans/llm-campaign.md §10 同步说明。
CITATION_RE = re.compile(
    r'SokoBench|WorldCoder|Orak\b|arXiv|doi\.org|\bNeurIPS\b|\bICLR\b|\bTMLR\b|\bTASLP\b|\bKRAFTON\b'
    r'|Expert Systems with Applications|Information Processing & Management|\bet al\.',
    re.IGNORECASE)
CITATION_FILES = ['map/core/*.mjs', 'map/tavern/*.mjs', 'map/three/*.mjs', 'map/app/*.mjs', 'map/*.mjs',
                  'tests/*.mjs']
IMPORT_RE = re.compile(r"""\b(?:from|import)\s*\(\s*(['"])([^'"\n]+)\1|\bfrom\s+(['"])([^'"\n]+)\3""")
ZVALUE_RE = re.compile(
    r"""z-index\s*:\s*([^;}]+)"""                     # CSS 声明
    r"""|\.zIndex\s*=\s*([^;\n]+)"""                  # 直接赋值
    r"""|setProperty\(\s*['"]z-?[iI]ndex['"]\s*,\s*([^)\n]+)"""  # setProperty（z-index / zIndex 大小写都收）
    r"""|\bzIndex\s*:\s*([^,;}\n]+)"""                # 对象字面量 { zIndex: 99999 }
)
# 检查 6：内联外观样式。几何属性（动态定位 / 尺寸）与 CSS 自定义属性是许可通道，不计。
STYLE_GEOMETRY = {'transform', 'left', 'top', 'width', 'height'}
STYLE_ASSIGN_RE = re.compile(r'\.style\.([A-Za-z_]\w*)\s*[-+]?=(?!=)')
STYLE_WHOLE_RE = re.compile(r'\.style\s*=(?!=)')
CSSTEXT_RE = re.compile(r'\bcssText\b')
STYLE_ATTR_RE = re.compile(r"""(?<![.\w$-])style=(?:\\?["']|\$\{)""")
STYLE_CUSTOM_DECL_RE = re.compile(r'--[\w-]+\s*:')


def custom_props_only(src, m):
    """style="…" 属性的声明全是 CSS 自定义属性（--x: v，一条或多条）→ True（同 style.setProperty('--…')，不计）。"""
    tok = m.group(0)
    if tok.endswith('{'):
        return False
    q = tok[-1]
    end = src.find(q, m.end())
    if end < 0:
        return False
    decls = [d.strip() for d in src[m.end():end].rstrip('\\').split(';') if d.strip()]
    return bool(decls) and all(STYLE_CUSTOM_DECL_RE.match(d) for d in decls)


def strip(src, literals=True):
    """把注释（// 与 /* */）与（可选）字符串字面量替换成等长空白：行号不漂移，token 检查不误伤。
    `://`（URL 的双斜线）不算行注释，免得网址后面的内容被误吞成注释。"""
    out = []
    i, n = 0, len(src)

    def blank(s):
        return ''.join('\n' if c == '\n' else ' ' for c in s)

    while i < n:
        if src.startswith('//', i) and not (i > 0 and src[i - 1] == ':'):
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


def code_of(path, text):
    """剥注释、留字符串字面量；.html 先剥 <!-- --> 再剥脚本 / 样式里的注释。"""
    if str(path).endswith('.html'):
        text = re.sub(r'<!--.*?-->', lambda m: ''.join('\n' if c == '\n' else ' ' for c in m.group(0)),
                      text, flags=re.S)
    return strip(text, literals=False)


def line_of(src, pos):
    return src.count('\n', 0, pos) + 1


def rel_of(p, root=ROOT):
    p = Path(p)
    try:
        return str(p.relative_to(root))
    except ValueError:
        return str(p)


def engine_files(root=ROOT):
    """引擎范围内的全部源文件（ENGINE_GLOBS）。"""
    return sorted({p for pat in ENGINE_GLOBS for p in Path(root).glob(pat) if p.is_file()})


# ---------------------------------------------------------------- 账本

def load_baseline(path=None):
    """读账本；文件不存在返回 None。"""
    path = Path(BASELINE_PATH if path is None else path)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def _section(baseline, kind):
    return (baseline or {}).get(kind, {}) or {}


def check_baseline_shape(baseline):
    """账本本身的合法性：map/core/* 永远不许进账本（core 是硬线）；计数必须是正整数。"""
    bad = []
    for kind in KINDS:
        for rel, n in _section(baseline, kind).items():
            if rel.startswith(CORE_PREFIX) and kind not in CORE_SOFT_KINDS:
                bad.append(f"arch_baseline.json[{kind}]: {rel} 不许进账本——map/core 是硬线，违规必须当场改掉")
            if not isinstance(n, int) or n <= 0:
                bad.append(f"arch_baseline.json[{kind}]: {rel} 的计数 {n!r} 不是正整数（无违规的文件不该列）")
    return bad


def _ratchet(kind, hits, baseline, scanned, subset):
    """hits {rel: [(行号, 说明)]} 对账本：新增文件有违规 / 已登记文件计数变大 = 违规；
    map/core 一律按零线。返回 (bad, lowerable, counts)；lowerable = [(rel, 当前, 账本)]。"""
    allowed = _section(baseline, kind)
    bad, lowerable = [], []
    for rel in sorted(hits):
        h = hits[rel]
        cap = 0 if rel.startswith(CORE_PREFIX) and kind not in CORE_SOFT_KINDS else allowed.get(rel, 0)
        if len(h) <= cap:
            continue
        if cap == 0:
            for line, msg in sorted(h)[:8]:
                bad.append(f"{rel}:{line}: {msg}")
            if len(h) > 8:
                bad.append(f"{rel}: 另有 {len(h) - 8} 处同类违规")
        else:
            bad.append(f"{rel}: 计数 {len(h)} > 账本 {cap}（只减不增）")
    for rel, cap in sorted(allowed.items()):
        if (rel.startswith(CORE_PREFIX) and kind not in CORE_SOFT_KINDS) or (subset and rel not in scanned):
            continue
        cur = len(hits.get(rel, []))
        if cur < cap:
            lowerable.append((rel, cur, cap))
    return bad, lowerable, {rel: len(h) for rel, h in hits.items()}


def _info(scanned, counts, lowerable, **extra):
    return dict(scanned=len(scanned), counts=counts, lowerable=lowerable, **extra)


# ---------------------------------------------------------------- 检查 1：体量

def check_line_count(files=None, baseline=None, root=ROOT):
    baseline = load_baseline() if baseline is None else baseline
    targets = engine_files(root) if files is None else [Path(f) for f in files]
    allowed = _section(baseline, 'lines')
    bad, sizes = [], {}
    for p in targets:
        rel = rel_of(p, root)
        n = len(p.read_text(encoding='utf-8').splitlines())
        sizes[rel] = n
        cap = MAX_LINES if rel.startswith(CORE_PREFIX) else max(MAX_LINES, allowed.get(rel, 0))
        if n > cap:
            tip = ('拆子模块或下沉数据' if cap == MAX_LINES
                   else f'账本只许缩短不许再长（账本 {allowed[rel]}）')
            bad.append(f"{rel}: {n} 行，超过单文件上限 {cap} 行（{tip}）")
    lowerable = []
    for rel, cap in sorted(allowed.items()):
        if rel.startswith(CORE_PREFIX) or (files is not None and rel not in sizes):
            continue
        cur = sizes.get(rel, 0)
        cur = cur if cur > MAX_LINES else 0
        if cur < cap:
            lowerable.append((rel, cur, cap))
    counts = {rel: n for rel, n in sizes.items() if n > MAX_LINES}
    return bad, _info(sizes, counts, lowerable, sizes=sizes)


# ---------------------------------------------------------------- 检查 2：分层（行为不变）

def check_layering(root=ROOT):
    """core 零父级 import；core 与纯流水线禁触宿主全局（属主豁免表除外）。纯流水线（PIPELINE）可以 import ../core/（宿主层引核心层是正向）。"""
    bad = []
    files = sorted((root / 'map' / 'core').glob('*.mjs')) + [root / f for f in PIPELINE if (root / f).exists()]
    for p in files:
        rel = str(p.relative_to(root))
        text = p.read_text(encoding='utf-8')
        code_keep_quotes = strip(text, literals=False)
        for m in IMPORT_RE.finditer(code_keep_quotes):
            spec = m.group(2) if m.group(2) is not None else m.group(4)
            if spec.startswith('..') and not (rel in PIPELINE and spec.startswith('../core/')):
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


# ---------------------------------------------------------------- 检查 3：裸 z-index

def scan_zindex(files=None, root=ROOT):
    hits = {}
    targets = engine_files(root) if files is None else [Path(f) for f in files]
    for p in targets:
        rel = rel_of(p, root)
        src = code_of(p, p.read_text(encoding='utf-8'))
        for m in ZVALUE_RE.finditer(src):
            raw = next(g for g in m.groups() if g is not None).strip()
            val = raw.strip('\'"`').strip()
            if re.match(r'^-?\d', val):
                hits.setdefault(rel, []).append((
                    line_of(src, m.start()),
                    f"裸 z-index 字面量「{raw}」——改用 var(--zu-*) / var(--zv-*) 名义常量（表在 viewer.html 顶部）"))
    return hits, len(targets)


def check_zindex(files=None, baseline=None, root=ROOT):
    baseline = load_baseline() if baseline is None else baseline
    hits, n = scan_zindex(files, root)
    scanned = {rel_of(p, root) for p in (engine_files(root) if files is None else files)}
    bad, low, counts = _ratchet('zindex', hits, baseline, scanned, files is not None)
    return bad, _info(scanned, counts, low)


# ---------------------------------------------------------------- 检查 4：卡专有名词

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


def term_list():
    """检查 4 的完整词表 = pack0_names() ∪ TERM_EXTRA ∪ EN_TERMS。"""
    return sorted(set(pack0_names()) | set(TERM_EXTRA) | set(EN_TERMS))


def _json_strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from _json_strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from _json_strings(v)


def scan_terms(files=None, names=None, i18n=None, root=ROOT):
    """逐次计数（最长词优先、不重叠）：引擎源文件剥注释后扫；i18n 词典只扫值。"""
    names = term_list() if names is None else names
    rx = re.compile('|'.join(re.escape(t) for t in sorted(names, key=len, reverse=True)))
    hits = {}
    tip = "——人名 / 地名属于设定包数据（map/packs/<id>/、map/data/），引擎零硬编码"
    targets = engine_files(root) if files is None else [Path(f) for f in files]
    for p in targets:
        rel = rel_of(p, root)
        code = code_of(p, p.read_text(encoding='utf-8'))
        for m in rx.finditer(code):
            hits.setdefault(rel, []).append((line_of(code, m.start()), f"引擎出现卡专有名词「{m.group(0)}」{tip}"))
    dicts = [Path(root) / f for f in I18N_FILES] if i18n is None else [Path(f) for f in i18n]
    for p in dicts:
        if not p.exists():
            continue
        rel = rel_of(p, root)
        raw = p.read_text(encoding='utf-8')
        for val in _json_strings(json.loads(raw)):
            for m in rx.finditer(val):
                at = raw.find(val[:24])
                hits.setdefault(rel, []).append((line_of(raw, at) if at >= 0 else 1,
                                                 f"词典值出现卡专有名词「{m.group(0)}」——核心词典保持中性，"
                                                 f"卡文案走包清单 strings"))
    return hits, len(targets) + len(dicts)


def check_terms(files=None, baseline=None, names=None, i18n=None, root=ROOT):
    baseline = load_baseline() if baseline is None else baseline
    hits, n = scan_terms(files, names, i18n, root)
    scanned = {rel_of(p, root) for p in (engine_files(root) if files is None else files)}
    scanned |= {rel_of(Path(root) / f, root) for f in I18N_FILES} if i18n is None else \
        {rel_of(f, root) for f in i18n}
    bad, low, counts = _ratchet('terms', hits, baseline, scanned, files is not None)
    return bad, _info(scanned, counts, low)


def comment_files(root=ROOT):
    """检查 8 的扫描面 = 引擎源文件 + 令牌样式表。"""
    extra = {p for pat in COMMENT_EXTRA_GLOBS for p in Path(root).glob(pat) if p.is_file()}
    return sorted(set(engine_files(root)) | extra)


def scan_comment_terms(files=None, names=None, root=ROOT):
    """只数注释里的卡词（词表同检查 4）：原文命中、而剥注释后对应位置已是空白 = 注释命中。"""
    names = term_list() if names is None else names
    rx = re.compile('|'.join(re.escape(t) for t in sorted(names, key=len, reverse=True)))
    hits = {}
    tip = "——注释也写中性措辞（「主场景」「主城」…）；人名 / 地名只在设定包数据里出现"
    targets = comment_files(root) if files is None else [Path(f) for f in files]
    for p in targets:
        rel = rel_of(p, root)
        raw = p.read_text(encoding='utf-8')
        code = code_of(p, raw)
        for m in rx.finditer(raw):
            if code[m.start()].isspace():
                hits.setdefault(rel, []).append((line_of(raw, m.start()), f"注释出现卡专有名词「{m.group(0)}」{tip}"))
    return hits, len(targets)


def check_comment_terms(files=None, baseline=None, names=None, root=ROOT):
    baseline = load_baseline() if baseline is None else baseline
    hits, n = scan_comment_terms(files, names, root)
    scanned = {rel_of(p, root) for p in (comment_files(root) if files is None else files)}
    bad, low, counts = _ratchet('comment_terms', hits, baseline, scanned, files is not None)
    return bad, _info(scanned, counts, low)


def check_pack0():
    """旧入口（map/core 硬零）：现在是检查 4 的子集；保留给旧调用方。"""
    bad, _ = check_terms(files=sorted(CORE.glob('*.mjs')), baseline={}, i18n=[])
    return bad


# ---------------------------------------------------------------- 检查 5：学术引用（行为不变）

def citation_files():
    """本防线覆盖的源码集合（默认：map 下的自有源码 + tests/*.mjs）。"""
    return sorted({p for pat in CITATION_FILES for p in ROOT.glob(pat)})


def check_citations(files=None):
    """源码里不许出现学术引用形态（第 5 道防线）：出处只存 docs/plans/llm-campaign.md §10。
    files 可显式给（门控自测 tools/test_architecture_gate.py 用），缺省扫 citation_files()。"""
    bad = []
    targets = citation_files() if files is None else [Path(f) for f in files]
    for p in targets:
        rel = str(p.relative_to(ROOT)) if str(p).startswith(str(ROOT)) else str(p)
        code = p.read_text(encoding='utf-8')
        for m in CITATION_RE.finditer(code):
            bad.append(f"{rel}:{line_of(code, m.start())}: 源码出现学术引用「{m.group(0)}」"
                       f"——代码只写机制（如「滑动窗口关键帧压缩」），出处统一存 "
                       f"docs/plans/llm-campaign.md §10（2026-09-30 用户口径）")
    return bad, len(targets)


# ---------------------------------------------------------------- 检查 6：内联外观样式

def scan_inline_style(files=None, root=ROOT):
    hits = {}
    tip = "——外观走 class / 令牌；动态几何用 style.left/top/width/height/transform 或 style.setProperty('--…')"
    targets = engine_files(root) if files is None else [Path(f) for f in files]
    for p in targets:
        rel = rel_of(p, root)
        src = code_of(p, p.read_text(encoding='utf-8'))
        found = []
        for m in STYLE_ASSIGN_RE.finditer(src):
            if m.group(1) in STYLE_GEOMETRY or m.group(1) == 'cssText':
                continue
            found.append((m.start(), f".style.{m.group(1)} 赋值{tip}"))
        for m in STYLE_WHOLE_RE.finditer(src):
            found.append((m.start(), f".style = 整体赋值{tip}"))
        for m in CSSTEXT_RE.finditer(src):
            found.append((m.start(), f"cssText{tip}"))
        for m in STYLE_ATTR_RE.finditer(src):
            if custom_props_only(src, m):
                continue
            found.append((m.start(), f"style=\"…\" 内联样式属性{tip}"))
        if found:
            hits[rel] = [(line_of(src, pos), msg) for pos, msg in sorted(found)]
    return hits, len(targets)


def check_inline_style(files=None, baseline=None, root=ROOT):
    baseline = load_baseline() if baseline is None else baseline
    hits, n = scan_inline_style(files, root)
    scanned = {rel_of(p, root) for p in (engine_files(root) if files is None else files)}
    bad, low, counts = _ratchet('inline_style', hits, baseline, scanned, files is not None)
    return bad, _info(scanned, counts, low)


# ---------------------------------------------------------------- 检查 9：空 catch（D16：对用户安静，对日志不沉默）

# `catch (e) {}` / `catch {}` / `.catch(() => {})` / `.catch(e => {})` / `.catch(function () {})`，空白与（已剥掉的）注释不影响判断。
EMPTY_CATCH_RE = re.compile(
    r'\bcatch\s*(?:\(\s*[\w$]*\s*\))?\s*\{\s*\}'
    r'|\.catch\s*\(\s*(?:\(\s*[\w$]*\s*\)|[\w$]+|function\s*\(\s*[\w$]*\s*\))\s*(?:=>\s*)?\{\s*\}\s*\)')


def scan_empty_catch(files=None, root=ROOT):
    hits = {}
    tip = "——吞错的 catch 要么 console.warn('[map] <模块>: <什么> failed', e)（logbuf 会收进反馈报告），要么留着并写注释说明为什么无害"
    targets = engine_files(root) if files is None else [Path(f) for f in files]
    for p in targets:
        src = code_of(p, p.read_text(encoding='utf-8'))
        found = [(m.start(), f"空 catch{tip}") for m in EMPTY_CATCH_RE.finditer(src)]
        if found:
            hits[rel_of(p, root)] = [(line_of(src, pos), msg) for pos, msg in found]
    return hits, len(targets)


def check_empty_catch(files=None, baseline=None, root=ROOT):
    baseline = load_baseline() if baseline is None else baseline
    hits, n = scan_empty_catch(files, root)
    scanned = {rel_of(p, root) for p in (engine_files(root) if files is None else files)}
    bad, low, counts = _ratchet('empty_catch', hits, baseline, scanned, files is not None)
    return bad, _info(scanned, counts, low)


# ---------------------------------------------------------------- 账本维护

# ---------------------------------------------------------------- 检查 7：旧 TC* 全局（S5-3，硬零）

TC_GLOBAL_RE = re.compile(r'\b(?:window|parent|globalThis|P)\.TC[A-Z0-9]\w*')


def check_tc_globals(files=None, root=ROOT):
    """引擎文件里 `window.TC<大写>` / `P.TC<大写>` 一律违规（注释不计）。files 可显式给（门控自测用）。"""
    bad = []
    targets = engine_files(root) if files is None else [Path(f) for f in files]
    for p in targets:
        src = code_of(p, p.read_text(encoding='utf-8'))
        for m in TC_GLOBAL_RE.finditer(src):
            bad.append(f"{rel_of(p, root)}:{line_of(src, m.start())}: 旧全局「{m.group(0)}」——全局名按 docs/naming.md 表 C 取 "
                       f"<名>Api / <名>View，不再造 TC*")
    return bad, len(targets)


# ---------------------------------------------------------------- 检查 10：宿主接口名（F0，硬零、无账本）

HOST_ADAPTER = 'map/tavern/host-adapter.mjs'
HOST_NATIVE = 'map/tavern/host-native.mjs'
ADAPTER_FILES = {HOST_ADAPTER, HOST_NATIVE}
TH_API_BLOCK_RE = re.compile(r'export const TH_API\s*=\s*Object\.freeze\(\[(.*?)\]\)', re.S)
QUOTED_RE = re.compile(r"'([^']+)'")


def th_api_names(root=ROOT):
    """适配层登记的宿主接口名表：读 map/tavern/host-adapter.mjs 的 TH_API（这一张表是唯一来源）。
    解析不出来直接退出——闸门空转比报错危险。"""
    src = (Path(root) / HOST_ADAPTER).read_text(encoding='utf-8')
    m = TH_API_BLOCK_RE.search(src)
    if not m:
        sys.exit(f'{HOST_ADAPTER}: 找不到 TH_API 登记表，检查 10 无法运行')
    return sorted(set(QUOTED_RE.findall(m.group(1))))


def strip_js(src, literals=True):
    r"""strip() 的正则字面量版：`/…/i` 里的引号（如 /=\s*"([^"]{1,80})"/）不该被当成字符串开头——
    一旦错位，后面的真字符串被当代码、真代码被当字符串。检查 10 按名字扫「裸引用 / 成员访问」，
    错位就是误报，所以这条防线单独用这一版（其余检查沿用 strip，账本计数不动）。"""
    out = []
    i, n = 0, len(src)

    def blank(s):
        return ''.join('\n' if c == '\n' else ' ' for c in s)

    def regex_ok():
        """当前位置的 `/` 能是正则开头吗：前面最近的非空白字符不是标识符 / 数字 / ) ] } . 引号。"""
        for j in range(len(out) - 1, -1, -1):
            s = out[j].rstrip('\n \t')
            if not s:
                continue
            c = s[-1]
            return not (c.isalnum() or c in '_$)]}\'"`.')
        return True

    while i < n:
        c = src[i]
        if src.startswith('//', i) and not (i > 0 and src[i - 1] == ':'):
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(blank(src[i:j])); i = j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(blank(src[i:j])); i = j; continue
        if literals and c in '\'"`':
            q = c
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2; continue
                if src[j] == q:
                    break
                j += 1
            end = min(j + 1, n)
            out.append(blank(src[i:end])); i = end; continue
        if literals and c == '/' and i + 1 < n and src[i + 1] not in '/*' and regex_ok():
            j = i + 1
            while j < n:
                ch = src[j]
                if ch == '\\':
                    j += 2; continue
                if ch == '[':
                    j += 1
                    while j < n and src[j] != ']':
                        j += 2 if src[j] == '\\' else 1
                    j += 1; continue
                if ch == '/':
                    j += 1
                    while j < n and src[j].isalpha():
                        j += 1
                    break
                if ch == '\n':
                    j = i + 1; break
                j += 1
            out.append(blank(src[i:j])); i = j; continue
        out.append(c); i += 1
    return ''.join(out)


def scan_host_calls(files=None, root=ROOT):
    """F0：酒馆 / 酒馆助手的接口名与全局对象只许出现在适配层里。引擎源码剥注释、字符串与正则字面量后
    按 TH_API 名单扫裸引用与成员访问（`window.Mvu`、`Mvu.getMvuData`、`getChatMessages(…)`），命中即违规（硬零）。
    纯函数模块收「取法函数」当参数、按名字字符串要接口不算违规——名字在字符串里，真调用必须经调用方递进来的
    host.fn，闸门因此仍然只认一个出口。files 可显式给（门控自测用）。"""
    names = th_api_names(root)
    rx = re.compile(r'(?:\?\.|\.)?\b(' + '|'.join(re.escape(n) for n in names) + r')\b(?!\s*[:=](?![:=]))')
    hits = {}
    targets = list(host_check_files(files, root))
    for p in targets:
        rel = rel_of(p, root)
        raw = p.read_text(encoding='utf-8')
        if str(p).endswith('.html'):
            raw = re.sub(r'<!--.*?-->', lambda m: ''.join('\n' if c == '\n' else ' ' for c in m.group(0)), raw, flags=re.S)
        src = strip_js(raw, literals=True)
        found = [(line_of(src, m.start()), f"直连宿主接口「{m.group(0)}」——改经 {HOST_ADAPTER}（host.fn/ok 或分组接口）")
                 for m in rx.finditer(src)]
        if found:
            hits[rel] = found
    return hits, len(targets)


def host_check_files(files=None, root=ROOT):
    """检查 10 的扫描面 = 引擎文件去掉适配层本身（TH 版与原生版都豁免）。"""
    return [p for p in (engine_files(root) if files is None else [Path(f) for f in files])
            if rel_of(p, root) not in ADAPTER_FILES]


def check_host_calls(files=None, root=ROOT):
    hits, n = scan_host_calls(files, root)
    bad = []
    for rel in sorted(hits):
        for line, msg in sorted(hits[rel])[:8]:
            bad.append(f"{rel}:{line}: {msg}")
        if len(hits[rel]) > 8:
            bad.append(f"{rel}: 另有 {len(hits[rel]) - 8} 处同类违规")
    return bad, n, len(hits)


def current_counts(root=ROOT):
    """当前各栏的按文件违规计数（只含非零文件）；--init / --update-baseline 用。"""
    _, li = check_line_count(baseline={}, root=root)
    out = {'lines': dict(li['counts'])}
    for kind, scan in (('zindex', scan_zindex), ('terms', scan_terms), ('inline_style', scan_inline_style),
                       ('comment_terms', scan_comment_terms), ('empty_catch', scan_empty_catch)):
        hits, _ = scan(root=root)
        out[kind] = {rel: len(h) for rel, h in hits.items() if h}
    return out


def build_baseline(cur):
    data = {'_note': BASELINE_NOTE}
    for kind in KINDS:
        data[kind] = {rel: cur.get(kind, {})[rel] for rel in sorted(cur.get(kind, {}))}
    return data


def write_baseline(data, path=None):
    Path(BASELINE_PATH if path is None else path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def lowered_baseline(baseline, cur):
    """只减不增：返回 (新账本, 降下来的条目, 增长 / 新增的条目)。"""
    new = {'_note': baseline.get('_note', BASELINE_NOTE)}
    down, grew = [], []
    for kind in KINDS:
        old = _section(baseline, kind)
        new[kind] = {}
        for rel, n in cur.get(kind, {}).items():
            if rel not in old:
                grew.append(f"{kind} {rel}: 新增违规 {n}（不在账本里）")
            elif n > old[rel]:
                grew.append(f"{kind} {rel}: {old[rel]} → {n}（增长）")
            else:
                new[kind][rel] = n
                if n < old[rel]:
                    down.append(f"{kind} {rel}: {old[rel]} → {n}")
        for rel, o in old.items():
            if rel not in cur.get(kind, {}):
                down.append(f"{kind} {rel}: {o} → 0（移出账本）")
        new[kind] = {rel: new[kind][rel] for rel in sorted(new[kind])}
    return new, down, grew


# ---------------------------------------------------------------- 入口

def _cli(args):
    if args.init_baseline:
        if BASELINE_PATH.exists():
            print(f"拒绝：{BASELINE_PATH.relative_to(ROOT)} 已存在；下调用 --update-baseline")
            return 1
        cur = current_counts()
        core = [f"{k} {rel}" for k in KINDS if k not in CORE_SOFT_KINDS for rel in cur[k] if rel.startswith(CORE_PREFIX)]
        if core:
            print("拒绝生成：map/core 有违规，硬线不进账本，先改掉：")
            for c in core:
                print(f"  {c}")
            return 1
        write_baseline(build_baseline(cur))
        print(f"已生成 {BASELINE_PATH.relative_to(ROOT)}：" + '，'.join(
            f"{k} {len(cur[k])} 个文件 / {sum(cur[k].values())}" for k in KINDS))
        return 0
    baseline = load_baseline()
    if baseline is None:
        print(f"缺 {BASELINE_PATH.relative_to(ROOT)}：先跑 python3 tools/check_architecture.py --init-baseline")
        return 1
    cur = current_counts()
    new, down, grew = lowered_baseline(baseline, cur)
    if grew:
        print("拒绝更新账本：账本只减不增，先修掉这些违规：")
        for g in grew:
            print(f"  {g}")
        return 1
    write_baseline(new)
    if down:
        print(f"账本下调 {len(down)} 条：")
        for d in down:
            print(f"  {d}")
    else:
        print("账本无可下调条目（已是最小）")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description='架构看门狗（10 道防线 + 只减不增账本）')
    ap.add_argument('--init-baseline', action='store_true', help='账本不存在时首次生成')
    ap.add_argument('--update-baseline', action='store_true', help='下调账本到当前计数（只减不增）')
    args = ap.parse_args(argv)
    if args.init_baseline or args.update_baseline:
        return _cli(args)

    baseline = load_baseline()
    if baseline is None:
        print(f"缺 {BASELINE_PATH.relative_to(ROOT)}：先跑 python3 tools/check_architecture.py --init-baseline")
        return 1
    fails = check_baseline_shape(baseline)

    def tail(info, bad):
        return f"；超账本 {len(bad)} 条，{len(info['lowerable'])} 条可下调"

    def note_lowerable(info, kind):
        for rel, cur, cap in info['lowerable']:
            print(f"    可下调 {kind} {rel}: {cap} → {cur}（baseline can shrink: python3 tools/check_architecture.py --update-baseline）")

    bad, info = check_line_count(baseline=baseline)
    top = max(info['sizes'].items(), key=lambda kv: kv[1]) if info['sizes'] else ('-', 0)
    print(f"  [体量] 引擎 {info['scanned']} 个文件，最大 {top[0]} {top[1]} 行（上限 {MAX_LINES}，"
          f"账本登记 {len(_section(baseline, 'lines'))} 个）{tail(info, bad)}")
    note_lowerable(info, 'lines')
    fails += bad

    bad = check_layering()
    print(f"  [分层] core 零父级 import + core/纯流水线宿主全局触点（豁免 {len(OWNERS)} 个属主文件）")
    fails += bad

    bad, info = check_zindex(baseline=baseline)
    print(f"  [z-index] 引擎 {info['scanned']} 个文件，裸字面量 {sum(info['counts'].values())} 处"
          f"（账本 {sum(_section(baseline, 'zindex').values())}）{tail(info, bad)}")
    note_lowerable(info, 'zindex')
    fails += bad

    bad, info = check_terms(baseline=baseline)
    print(f"  [卡词] 引擎 + 词典共 {info['scanned']} 个文件，词表 {len(term_list())} 个词，命中 "
          f"{sum(info['counts'].values())} 处（账本 {sum(_section(baseline, 'terms').values())}；"
          f"map/core 硬零）{tail(info, bad)}")
    note_lowerable(info, 'terms')
    fails += bad

    bad, n_files = check_citations()
    print(f"  [引用] map 源码 + tests 共 {n_files} 个文件，学术引用形态须为零（出处只存任务书 §10）")
    fails += bad

    bad, info = check_inline_style(baseline=baseline)
    print(f"  [内联样式] 引擎 {info['scanned']} 个文件，内联外观样式 {sum(info['counts'].values())} 处"
          f"（账本 {sum(_section(baseline, 'inline_style').values())}）{tail(info, bad)}")
    note_lowerable(info, 'inline_style')
    fails += bad

    bad, n_files = check_tc_globals()
    print(f"  [TC 全局] 引擎 {n_files} 个文件，window.TC* / P.TC* 须为零")
    fails += bad

    bad, info = check_comment_terms(baseline=baseline)
    print(f"  [注释卡词] 引擎 + 令牌样式表共 {info['scanned']} 个文件，注释里的卡词 {sum(info['counts'].values())} 处"
          f"（账本 {sum(_section(baseline, 'comment_terms').values())}；map/core 硬零）{tail(info, bad)}")
    note_lowerable(info, 'comment_terms')
    fails += bad

    bad, info = check_empty_catch(baseline=baseline)
    print(f"  [空 catch] 引擎 {info['scanned']} 个文件，空 catch 共 {sum(info['counts'].values())} 处"
          f"（账本 {sum(_section(baseline, 'empty_catch').values())}；只减不增，吞错要么记日志要么写注释）{tail(info, bad)}")
    note_lowerable(info, 'empty_catch')
    fails += bad

    bad, n_files, n_hit_files = check_host_calls()
    print(f"  [宿主接口] 引擎 {n_files} 个文件（适配层除外），TH_API 名单直连须为零"
          f"（所有酒馆 / 酒馆助手调用走 {HOST_ADAPTER}）")
    fails += bad

    if fails:
        print(f"架构看门狗：{len(fails)} 处违规")
        for f in fails:
            print(f"  {f}")
        return 1
    print("架构看门狗：10 道防线全过")
    return 0


if __name__ == '__main__':
    sys.exit(main())
