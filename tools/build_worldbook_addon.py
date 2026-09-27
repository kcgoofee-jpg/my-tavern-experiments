#!/usr/bin/env python3
"""生成「伊甸地图·世界书附加条目」：只含地图条目的独立世界书 JSON（酒馆「导入世界书」直接用，不改角色卡）。

内容从仓库数据生成，改了事件类型或地名后重跑即可保持一致：
  - 事件类型、大类顺序、稀有度、示范原文：map/tavern/events.mjs（CATS / GROUP_ORDER / EXAMPLES，经 node 读取）
  - 地标名、层名、庄园房间 / 区域：map/data/maps.json（与 map/here.mjs 的当前地点解析同一份词表）
条目（全部常驻，位置「角色定义之后」）：
  1 地图联动规范 v3：标签两种写法、字段、地点写法、频率、连锁、示范
  2 地图事件类型 v2：9 大类 66 种 + 稀有度
  3 地图当前地点 v2：地图认得的地点叫法（房间 / 区域 / 地标）；剧情改名 / 用途标签（⌖改名 / ⌖用途，v0.9.3）
  4 地图人物位置 v1（v0.9.3）：在场人物换地方时写人物标签。卡的 MVU zod 结构会丢掉在场人物对象里的未知键，
    所以不要求模型写任何变量，标签才是地图的来源
  5–7 地图方位·上层 / 中层 / 下层（v0.9.3，EJS 条件）：「世界.当前地点」落在该层某个地标时，只展开那一处的中性方位
    （名称、层、副标题、邻近地标）。要装「提示词模板」（ST-Prompt-Template）扩展；没装时自检会提示关掉这三条。
我们的规则只提到我们自己的东西（人物标签、⌖改名 / ⌖用途、地图.*），不引用卡里的字段名或原文。
示范标签只用 EXAMPLES 里的原文（模型照抄时地图不落点）。不写任何关键词过滤规则（地图不过滤内容，见 docs/content-compat.md）。

用法：python3 tools/build_worldbook_addon.py [--version 0.9.1] [--out 路径] [--check 参照世界书.json]
默认输出：~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v<版本>.json；只用标准库 + node。
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RARE = {3: '罕', 4: '传'}


def load_events():
    js = ("import * as E from './map/tavern/events.mjs';"
          "console.log(JSON.stringify({cats: E.CATS, order: E.GROUP_ORDER, ex: [...E.EXAMPLES]}))")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def pick_example(ex, pred, what):
    for s in ex:
        if pred(s): return s
    sys.exit(f'EXAMPLES 里找不到示范：{what}（改了 events.mjs 的 EXAMPLES？）')


def build(version):
    ev = load_events()
    reg = json.load(open(os.path.join(ROOT, 'map/data/maps.json'), encoding='utf-8'))['maps']
    cats, ex = ev['cats'], ev['ex']

    # ---- 类型清单（按大类，稀有度用（罕）（传）标）
    rows, n = [], 0
    for g in ev['order']:
        names = [k + (f'（{RARE[v["rare"]]}）' if v['rare'] in RARE else '') for k, v in cats.items() if v['g'] == g]
        n += len(names); rows.append(f'  {g}：' + ' / '.join(names))
    types = (f'<地图事件类型 v2>\n类型写下面的具体名字（{len(rows)} 大类 {n} 种）；地图按大类配色、按类型配图标字。'
             '（罕）整局每种一两次，（传）整局最多一次，其余常见或少见。事件要少、种类要多，同一类型不要连着用。\n'
             + '\n'.join(rows) +
             '\n  双轨：同一类里，以太一侧（结界、信标、潮汐、配给、魔导装甲、以太泄漏）与科技一侧（监控、电网、义体、轨道、网络）轮流出现。'
             '「泄露」= 数据泄露，「泄漏」= 以太泄漏。\n</地图事件类型 v2>')

    # ---- 地点：各层地标（标准名）
    def marks(mid):
        return '、'.join(k['name'].replace(' ', '') for k in canon(reg[mid]['markers']).values())
    layers = [(reg[m]['layer']['name'], reg[m]['layer'].get('sub', ''), m) for m in ('tc_upper', 'tc_mid', 'tc_low')]
    place_rows = '\n'.join(f'  {name}（{sub}）：{marks(mid)}' for name, sub, mid in layers)

    full = pick_example(ex, lambda s: s.startswith('类型=火灾') and '编号=' in s, '火灾 + 编号')
    cyber = pick_example(ex, lambda s: s.startswith('类型=网络攻击'), '网络攻击')
    person = pick_example(ex, lambda s: s.startswith('类型=首相出席'), '人物')
    ether = pick_example(ex, lambda s: s.startswith('类型=以太潮汐'), '以太双轨')
    compact_tpl = pick_example(ex, lambda s: s.startswith('⌖类别｜'), '紧凑写法模板')
    compact_off = pick_example(ex, lambda s: s.startswith('⌖火灾') and '｜0｜' in s, '紧凑写法 · 解除')
    span = lambda s: f'<span style="display:none" data-tcmap="{s}"></span>'
    cspan = lambda s: f'<span style="display:none">{s}</span>'

    rules = f'''<地图联动规范 v3>
【用途】天城地图是一块城市态势看板。正文里的快讯、通报、公告、终端情报写到城里某处的公开事件时，在该载体末尾加一个隐藏标签，地图就在对应位置落一个事件点。标签对读者不可见，正文不要提到它。
【写法一】一个事件一个标签：
{span(full)}
  字段用 ; 分隔，名和值用 = 连接（全角 ；＝ 也认）。
  类型（必填）：见「地图事件类型」。地点（必填）：见【地点】。标题（必填）：十字左右，写发生了什么。
  等级：1–3，默认 2，3 = 严重（这种写法不写 0）。
  状态：发生中 / 进行中 / 预告 / 处置中；写 已解除 / 已扑灭 / 已恢复 / 已控制 = 关闭该事件。
  时间：剧情内时间，只作显示。来源：发布方，可省。
  编号：同一事件的后续（升级、处置、解除）沿用同一编号；没有编号时按「类型 + 地点」合并。
  网络攻击另有 范围（全城 / 上层 / 中层 / 下层）与 持续（影响多少楼，默认 3）。
【写法二·紧凑】{cspan(compact_tpl)}，发布方可省；等级写 0 = 已解除。
【地点】地点里要含层名或下列地标名，否则地图不知道放哪：
{place_rows}
  只知道层时写层名（上层 / 中层 / 下层 / 地基区），或「层 + 街区」（中层 霓虹街）。天城以外写「天城外·地名」。
【人物】只记城市公开知道的事：公开行程（出席、阅兵、晚宴、弥撒、授勋），以及丑闻、违约、继承、罢免被曝光的那一刻（罕见，每人整局最多一次）。标题写头衔与公开事由。
【频率】多数楼层一个标签都没有。只在出现新的通报、或事件升级 / 解除时加；一楼最多 3 个；同一事件不每楼重复。
【连锁】一件事引出另一件时，编号沿用同一前缀（LEB-88-0317 → LEB-88-0318），标题点明起因（「酸雨致 7 号井停电」）。
【示范】照抄示范原文不会上图，写真实事件时换成剧情内容：
{span(person)}
{span(ether)}
{span(cyber)}
{cspan(compact_off)}
</地图联动规范 v3>'''

    # ---- 当前地点
    est = reg['eden_estate']
    # 当前地点按包含关系匹配（here.mjs 取最长词），含有更短已列词的叫法（主卧室 ⊃ 主卧）不必再列
    lean = lambda ws: [w for w in ws if len(w) >= 2 and not any(o != w and len(o) >= 2 and o in w for o in ws)]
    rooms, areas = lean(est['rooms']), lean(est['areas'])
    here = f'''<地图当前地点>
地图按当前地点落点；下面这些叫法地图都认得，越具体落得越准：
  庄园内：伊甸庄园·房间名。房间：{"、".join(rooms)}。室外：{"、".join(areas)}。
  天城内：天城·层·地标（地标名同「地图联动规范」的【地点】），如「天城·中层·天城执法局总局」。
  天城以外：写世界地图上的地名。
  玩家给地点起的叫法（地图设置里的「自定义」，背景里会列出）照写即可。
【改名 / 用途】剧情里某个地点或人物被正式改了名字、改作别的用途时，在正文末尾加一个隐藏标签，地图会记下来：
  <span style="display:none">⌖改名 原名 → 新名</span>　<span style="display:none">⌖用途 地点：用途</span>
  （上面是写法模板，照抄不生效。）只在剧情里真的改名 / 改用途的那一楼写一次，不重复。
</地图当前地点>'''

    # ---- 人物位置（v0.9.3）：标签是主来源；结构里有位置字段时才同时更新
    who = f'''<地图人物位置>
地图的人物栏按下面的隐藏标签标出每个人在哪里。标签写在正文末尾，读者看不到，正文不要提到它：
  <span style="display:none">⌖人物 名字 @ 层·地点</span>
  名字：和「在场人物」里的写法一致（全名）。地点：写法同「地图当前地点」，最好是「层·地标」或「伊甸庄园·房间」。
何时写：
  - 有人进入场景、而他所在的地方和玩家不同；
  - 有人从一处去了另一处（包括跟着玩家换地方的同行者：写新地点）；
  - 有人离开场景、去向已知（写去向）。去向不明就不写。
  - 只在位置变化的那一楼写；和玩家一直在同一处、没有移动的人不用写；同一个人同一地点不重复。一楼最多 5 条。
不要为了地图在变量里新增任何字段；人物位置只写标签。
</地图人物位置>'''

    # ---- 方位（v0.9.3）：EJS 条件条目，每层一条；只展开当前地点所在的那一处
    lore = []
    for name, sub, mid in layers:
        lore.append((f'地图方位·{name}', ejs_layer(reg, mid), 910 + len(lore)))


    return [('地图联动规范 v3', rules, 900), ('地图事件类型 v2', types, 901), ('地图当前地点 v2', here, 902), ('地图人物位置 v1', who, 903)] + lore, n


def canon(markers):
    """卡里有的地标（canon:false = 仓库自设、卡中没有，不向模型列出；见 docs/card-digest.md §10）"""
    return {k: v for k, v in markers.items() if v.get('canon', True) is not False}


INFERRED = '（位置为地图推断）'


LAYER_RE = {'上层': '中层|下层', '中层': '上层|下层', '下层': '上层|中层'}


def neighbours(reg, mid, k, n=3):
    """同层最近的 n 个地标（按 data/<层>.json 的归一化坐标）"""
    d = json.load(open(os.path.join(ROOT, 'map', reg[mid]['data']), encoding='utf-8'))
    ok = canon(reg[mid]['markers'])
    xy = {m['id']: (m.get('ax', m['nx']), m.get('ay', m['ny'])) for m in d['markers'] if m['id'] in ok}
    if k not in xy: return []
    x0, y0 = xy[k]
    near = sorted((((x - x0) ** 2 + (y - y0) ** 2), i) for i, (x, y) in xy.items() if i != k)
    return [reg[mid]['markers'][i]['name'].replace(' ', '') for _, i in near[:n] if i in reg[mid]['markers']]


def lore_lines(reg, mid):
    """每个地标一句中性方位：[(匹配词[], 描述)]；再加一句只写到层时的层概况"""
    m, L = reg[mid], reg[mid]['layer']
    rows = []
    for k, v in canon(m['markers']).items():
        nm = v['name'].replace(' ', '')
        sub = re.sub(r'\{\{user\}\}\s*', '玩家', v.get('sub') or '')
        words = [w for w in dict.fromkeys([v['name'], nm, *v.get('alias', [])]) if len([*w]) >= 2]
        nb = neighbours(reg, mid, k)
        # 位置（或层）是地图推断的：写明，不当事实注入（tag=inf：卡没给层或地点本身是推断；src 含「推断」：层是卡给的，具体位置推断）
        inf = INFERRED if v.get('tag') == 'inf' else '（具体位置为地图推断）' if '推断' in v.get('src', '') else ''
        rows.append((words, f'{nm}：天城{L["name"]}（{L["sub"]}）' + (f'，{sub}' if sub else '') + inf + (f'；地图上邻近：{"、".join(nb)}（相对位置为地图推断）' if nb else '') + '。'))
    layer = (L['name'], [L['name'], *m.get('districts', [])], f'天城{L["name"]}（{L["sub"]}，{L.get("alt", "")}）；地图上的地标：' + '、'.join(v['name'].replace(' ', '') for v in canon(m['markers']).values()) + '（多数地标的具体位置为地图推断）。')
    return rows, layer


def ejs_layer(reg, mid):
    """一层一条 EJS：当前地点含该层地标的叫法（取最长的）→ 那一处；只写了层名 / 大区 → 层概况；写了别的层 → 什么都不输出"""
    rows, (lname, lwords, ltext) = lore_lines(reg, mid)
    P = json.dumps([[w, t] for w, t in rows], ensure_ascii=False, separators=(',', ':'))
    W = json.dumps([w for w in lwords if len([*w]) >= 2], ensure_ascii=False, separators=(',', ':'))
    return ("<% { const h = String([].concat(getvar('stat_data.世界.当前地点', { defaults: '' }))[0] ?? ''); "
            f"if (h && !(/{LAYER_RE[lname]}/.test(h) && !h.includes('{lname}'))) {{ const P = {P}; let t = '', n = 0; "
            "for (const [ws, d] of P) for (const w of ws) if (w.length > n && h.includes(w)) { t = d; n = w.length; } "
            f"if (!t && {W}.some(w => h.includes(w))) t = {json.dumps(ltext, ensure_ascii=False)}; "
            "if (t) { %>[地图方位·仅背景] <%- t %><% } } } %>")


FIELDS = dict(  # 与 SillyTavern 1.12+ 导出的世界书条目字段一致（参照 ~/Downloads/酒馆/世界书/ 里的现有文件）
    key=[], keysecondary=[], constant=True, vectorized=False, selective=True, selectiveLogic=0, addMemo=True,
    position=1, disable=False, ignoreBudget=False, excludeRecursion=True, preventRecursion=True,
    matchPersonaDescription=False, matchCharacterDescription=False, matchCharacterPersonality=False,
    matchCharacterDepthPrompt=False, matchScenario=False, matchCreatorNotes=False, delayUntilRecursion=False,
    probability=100, useProbability=True, depth=4, outletName='', group='', groupOverride=False, groupWeight=100,
    scanDepth=None, caseSensitive=None, matchWholeWords=None, useGroupScoring=None, automationId='', role=None,
    sticky=0, cooldown=0, delay=0, triggers=[], characterFilter={'isExclude': False, 'names': [], 'tags': []},
)


def to_book(items):
    entries = {}
    for i, (comment, content, order) in enumerate(items):
        e = {'uid': i, 'comment': comment, 'content': content, 'order': order, 'displayIndex': i}
        for k, v in FIELDS.items(): e.setdefault(k, json.loads(json.dumps(v)))
        entries[str(i)] = e
    return {'entries': entries}


def tokens(s):
    """粗估：中日韩字符约 1 token / 字，其余约 4 字符 / token（各家分词器差别大，只作量级参考）。"""
    cjk = sum(1 for c in s if '⺀' <= c <= '鿿' or '＀' <= c <= '￯' or '　' <= c <= '〿')
    return cjk + (len(s) - cjk) // 4


def check(book, ref_path):
    ref = json.load(open(ref_path, encoding='utf-8'))
    assert isinstance(ref.get('entries'), dict) and isinstance(book.get('entries'), dict)
    ref_keys = set(next(iter(ref['entries'].values())).keys())
    for k, e in book['entries'].items():
        assert k == str(e['uid']), k
        miss, extra = ref_keys - set(e), set(e) - ref_keys
        assert not miss, f'条目 {k} 缺字段 {miss}'
        for f in ref_keys & set(e):
            rv = next(iter(ref['entries'].values()))[f]
            if rv is not None and e[f] is not None and not {type(rv), type(e[f])} <= {bool, int}: assert type(rv) is type(e[f]), f'{f}: {type(e[f])} ≠ {type(rv)}'
        if extra: print(f'  条目 {k} 多出字段（参照文件没有）：{sorted(extra)}')
    print(f'结构核对通过：{os.path.basename(ref_path)}（{len(ref_keys)} 个字段）')


def selftest(items):
    """用 events.mjs / here.mjs 自己核对：示范原文都不上图；【地点】里每个地标都能推断出层；当前地点示例能落点。"""
    import re
    rules, here = items[0][1], items[2][1]
    spans = re.findall(r'<span style="display:none"[^>]*>[^<]*</span>', rules)
    places = [(m.group(1), w) for m in re.finditer(r'^  (上层|中层|下层)（[^）]*）：(.+)$', rules, re.M) for w in m.group(2).split('、')]
    probes = {'伊甸庄园·书房': 'eden_estate', '伊甸庄园·玫瑰园': 'eden_estate', '天城·中层·天城执法局总局': 'tc_mid', '天城·下层·7号井黑市': 'tc_low', '中层 霓虹街': 'tc_mid'}
    js = """import * as E from './map/tavern/events.mjs'; import { buildIndex, resolveHere } from './map/here.mjs'; import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(0, 'utf8')); const reg = JSON.parse(fs.readFileSync('map/data/maps.json', 'utf8'));
const idx = buildIndex(reg);
const out = { ex: a.spans.map(s => E.parseMarks(s).length),
  places: a.places.map(([L, w]) => (E.parseMarks(`<span style="display:none" data-tcmap="类型=火灾;地点=${w};标题=测试"></span>`)[0] || {}).layer || ''),
  here: Object.keys(a.probes).map(k => (resolveHere(k, idx) || {}).map || '') };
console.log(JSON.stringify(out));"""
    r = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, input=json.dumps({'spans': spans, 'places': places, 'probes': probes}),
                                  capture_output=True, text=True, check=True).stdout)
    bad = [s for s, k in zip(spans, r['ex']) if k] + [f'{w}→{got or "无层"}（应为 {L}）' for (L, w), got in zip(places, r['places']) if got != L] \
        + [f'当前地点 {k}→{got or "不动"}（应为 {want}）' for (k, want), got in zip(probes.items(), r['here']) if got != want]
    if not spans or not places or bad: sys.exit('自检失败：\n  ' + '\n  '.join(bad or ['没找到示范或地点清单']))
    print(f'自检通过：{len(spans)} 条示范都不上图，{len(places)} 个地标都能推断层，{len(probes)} 个当前地点示例落点正确')
    return selftest_093(items)


# 最小 EJS（<% %> / <%- %> / <%= %>），只用来在 node 里验证方位条目的输出；getvar 桩按 MVU 取 stat_data.世界.当前地点
MINI_EJS = r"""const render = (tpl, here) => { let code = 'let __o = "";'; let i = 0; const re = /<%([-=]?)([\s\S]*?)%>/g; let m;
  while ((m = re.exec(tpl))) { code += '__o += ' + JSON.stringify(tpl.slice(i, m.index)) + ';'; code += m[1] ? '__o += String(' + m[2] + ');' : m[2] + '\n'; i = re.lastIndex; }
  code += '__o += ' + JSON.stringify(tpl.slice(i)) + '; return __o;';
  const getvar = (k, o = {}) => (k === 'stat_data.世界.当前地点' ? (here === undefined ? o.defaults : here) : o.defaults);
  return new Function('getvar', code)(getvar); };"""


def selftest_093(items):
    """v0.9.3：人物 / 改名示范不生效；方位条目按当前地点只展开一处，别的层、没写地点时为空；统计渲染后的 tokens"""
    lore = [(c, t) for c, t, _ in items if c.startswith('地图方位')]
    who, here = next(t for c, t, _ in items if c.startswith('地图人物位置')), next(t for c, t, _ in items if c.startswith('地图当前地点'))
    probes = ['天城·中层·天城执法局总局', '中层·霓虹街', '下层·废弃教堂区', '伊甸庄园·书房', '主卧', '天城·上层', ['中层·霓虹街', '[旧格式]'], '世界地图上的某地', '']
    js = MINI_EJS + """
import * as C from './map/tavern/characters.mjs'; import * as V from './map/tavern/mvu.mjs'; import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify({ tags: C.parseChars(a.who).length + V.parseCustomTags(a.here).length,
  out: a.probes.map(h => a.lore.map(([c, t]) => render(t, h).trim())) }));"""
    r = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, input=json.dumps({'who': who, 'here': here, 'lore': lore, 'probes': probes}),
                                  capture_output=True, text=True, check=True).stdout)
    bad = []
    if r['tags']: bad.append(f'人物 / 改名示范原文会生效（{r["tags"]} 条）')
    want = {0: '中层', 1: '中层', 2: '下层', 3: '上层', 4: '上层', 5: '上层'}   # 探针 → 应该展开的层（其余层为空）
    for i, outs in enumerate(r['out']):
        got = [c.split('·')[1] for (c, _), o in zip(lore, outs) if o]
        exp = [want[i]] if i in want else ([] if i >= 7 else ['中层'])
        if got != exp: bad.append(f'方位 {probes[i]!r} → {got}（应为 {exp}）')
    if not r['out'][0][1].startswith('[地图方位·仅背景] 天城执法局总局：'): bad.append('中层地标行格式不对：' + r['out'][0][1][:40])
    if bad: sys.exit('v0.9.3 自检失败：\n  ' + '\n  '.join(bad))
    rendered = [max(tokens(o) for o in outs) for outs in zip(*r['out'])]
    print(f'v0.9.3 自检通过：示范不生效；方位条目 {len(probes)} 个探针各只展开一层；渲染后每轮最多约 {max(rendered)} tokens')
    print('  示例：' + next(o for o in r['out'][0] if o))
    return max(rendered)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--version', default=open(os.path.join(ROOT, 'VERSION')).read().strip() if os.path.exists(os.path.join(ROOT, 'VERSION')) else '0.9.1')
    ap.add_argument('--out')
    ap.add_argument('--check', metavar='参照.json', help='按一份现有世界书核对字段与类型')
    a = ap.parse_args()
    items, n = build(a.version)
    lore_max = selftest(items)
    book = to_book(items)
    out = a.out or os.path.expanduser(f'~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v{a.version}.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=2); f.write('\n')
    tot = 0
    for c, content, _ in items:
        t = tokens(content); tot += 0 if c.startswith('地图方位') else t
        print(f'  {c}：{len(content)} 字符，约 {t} tokens' + ('（EJS 源码，不直接发给模型）' if c.startswith('地图方位') else ''))
    print(f'写入 {out}（{len(items)} 条，{n} 种类型）')
    print(f'每轮发给模型：常驻约 {tot} tokens + 方位最多约 {lore_max} tokens（EJS 展开后；没装提示词模板扩展时方位条目会原样发出，自检会提示）')
    if a.check: check(book, a.check)


if __name__ == '__main__':
    main()
