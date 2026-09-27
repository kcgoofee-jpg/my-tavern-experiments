#!/usr/bin/env python3
"""生成「伊甸地图·世界书附加条目」：只含地图条目的独立世界书 JSON（酒馆「导入世界书」直接用，不改角色卡）。

内容从仓库数据生成，改了事件类型或地名后重跑即可保持一致：
  - 事件类型、大类顺序、稀有度、示范原文：map/tavern/events.mjs（CATS / GROUP_ORDER / EXAMPLES，经 node 读取）
  - 地标名、层名、庄园房间 / 区域：map/data/maps.json（与 map/here.mjs 的当前地点解析同一份词表）
条目（全部常驻，位置「角色定义之后」）：
  1 地图联动规范 v3：标签两种写法、字段、地点写法、频率、连锁、示范
  2 地图事件类型 v2：9 大类 66 种 + 稀有度
  3 地图当前地点写法：MVU「世界.当前地点」怎么写才能落到房间 / 地标
示范标签只用 EXAMPLES 里的原文（模型照抄时地图不落点）。不写任何关键词过滤规则（地图不过滤内容，见 docs/content-compat.md）。

用法：python3 tools/build_worldbook_addon.py [--version 0.9.1] [--out 路径] [--check 参照世界书.json]
默认输出：~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v<版本>.json；只用标准库 + node。
"""
import argparse, json, os, subprocess, sys

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
        return '、'.join(k['name'].replace(' ', '') for k in reg[mid]['markers'].values())
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
MVU「世界.当前地点」写到最具体的位置，地图打开时直接落到那里：
  庄园内：伊甸庄园·房间名。房间：{"、".join(rooms)}。室外：{"、".join(areas)}。
  天城内：天城·层·地标（地标名同「地图联动规范」的【地点】），如「天城·中层·天城执法局总局」。
  天城以外：写世界地图上的地名。
  玩家自己给房间起的叫法（在地图里设置，只存在玩家本机）照写即可。
【人物位置】重要人物离开玩家、去了别处时，在正文末尾加一个隐藏标签，地图的人物栏就把他标在那里：
  <span style="display:none">⌖人物 维克多 @ 下层·7号井</span>（示范原文不上图；名字、地点换成剧情内容，地点写法同上）
  只在人物换地方时写，一楼最多几条；和玩家同处的人不用写。
</地图当前地点>'''

    return [('地图联动规范 v3', rules, 900), ('地图事件类型 v2', types, 901), ('地图当前地点', here, 902)], n


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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--version', default=open(os.path.join(ROOT, 'VERSION')).read().strip() if os.path.exists(os.path.join(ROOT, 'VERSION')) else '0.9.1')
    ap.add_argument('--out')
    ap.add_argument('--check', metavar='参照.json', help='按一份现有世界书核对字段与类型')
    a = ap.parse_args()
    items, n = build(a.version)
    selftest(items)
    book = to_book(items)
    out = a.out or os.path.expanduser(f'~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v{a.version}.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=2); f.write('\n')
    tot = 0
    for c, content, _ in items:
        t = tokens(content); tot += t; print(f'  {c}：{len(content)} 字符，约 {t} tokens')
    print(f'写入 {out}（{len(items)} 条，{n} 种类型，合计约 {tot} tokens）')
    if a.check: check(book, a.check)


if __name__ == '__main__':
    main()
