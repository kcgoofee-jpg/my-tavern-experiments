#!/usr/bin/env python3
"""生成「伊甸地图·世界书附加条目」

原作角色卡：Yehehua（类脑社区），原作发布帖 https://discord.com/channels/1380075940285124724/1534464824141025321 。本地图与附加条目是经作者同意（2026-09-27，Discord）的二次创作；发布时首帖须附原作帖链接。

：只含地图条目的独立世界书 JSON（酒馆「导入世界书」直接用，不改角色卡）。

内容从仓库数据生成，改了事件类型或地名后重跑即可保持一致：
  - 事件类型、大类顺序、稀有度、示范原文：map/tavern/events.mjs（CATS / GROUP_ORDER / EXAMPLES，经 node 读取）
  - 地标名、层名、庄园房间 / 区域：map/data/maps.json（与 map/here.mjs 的当前地点解析同一份词表）
条目（全部常驻，位置「角色定义之后」）：
  1 地图联动规范 v3：标签两种写法、字段、地点写法、频率、连锁、示范
  2 地图事件类型 v2：9 大类 66 种 + 稀有度
  3 地图当前地点 v2：地图认得的地点叫法（房间 / 区域 / 地标）；剧情改名 / 用途标签（⌖改名 / ⌖用途，v0.9.3）
  4 地图人物位置 v1（v0.9.3）：在场人物换地方时写人物标签。卡的 MVU zod 结构会丢掉在场人物对象里的未知键，
    所以不要求模型写任何变量，标签才是地图的来源
  5–7 地图方位·上层 / 中层 / 下层（v0.9.3，EJS 条件；v0.9.5 起不常驻，聊天里出现该层层名 / 地标名时触发）：「世界.当前地点」落在该层某个地标时，只展开那一处的中性方位
    （名称、层、副标题、邻近地标）。要装「提示词模板」（ST-Prompt-Template）扩展；没装时自检会提示关掉这三条。
  8 天城常识-* / 庄园常识-*（v0.9.6，关键词触发）：卡里已有、地图常用的口径（跨层、治安与机构、身份、经济、战力、节日、媒体、日程、安保与权限、位置未写的机构）
  9 地图补充-*（v0.9.6，关键词触发）：map/data/addon_places.json 里用户决定 / 仓库自设的地点，每处一条；check_maps.py 保证与地图数据同步
我们的规则只提到我们自己的东西（人物标签、⌖改名 / ⌖用途、地图.*），不引用卡里的字段名或原文。
示范标签只用 EXAMPLES 里的原文（模型照抄时地图不落点）。不写任何关键词过滤规则（地图不过滤内容，见 docs/content-compat.md）。

用法：python3 tools/build_worldbook_addon.py [--version 0.9.1] [--out 路径] [--check 参照世界书.json] [--force]
默认输出：~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v<版本>.json；只用标准库 + node。
版本：不写 --version 时取 VERSION；该版本已发布（有 map-v<版本> 标签）则默认改用 <版本>-dev，不碰已发布的文件。
      显式写一个已发布的版本号时拒绝写出，除非 --force（曾经有 agent 因为 VERSION 还没升而覆盖了已发布的 v0.9.5 文件）。
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDIT = '原作角色卡：Yehehua（类脑社区），原作发布帖 https://discord.com/channels/1380075940285124724/1534464824141025321 。本附加条目是经作者同意的二次创作；「地图补充-*」条目是地图附加的地点设定（用户决定或仓库自设），原卡没有；「天城常识-*」「庄园常识-*」是把卡里已有设定按地图需要归纳的口径。'
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
  时间：剧情内时间（与变量 世界.当前日期 / 当前时刻 一致），只作显示；年份跟剧情当前日期走，不要照抄示范里的年份。
  来源：发布方，可省；用城里的机构名：天城通讯社、全息新闻网络、天城一台、天城执法局、资产管理委员会、圣光教会、庄园主联盟、天城执政厅、议会骑士团、天城防卫军。
  编号：同一事件的后续（升级、处置、解除）沿用同一编号；没有编号时按「类型 + 地点」合并。
  网络攻击另有 范围（全城 / 上层 / 中层 / 下层）与 持续（影响多少楼，默认 3）。
【写法二·紧凑】{cspan(compact_tpl)}，发布方可省；等级写 0 = 已解除。
【地点】地点里要含层名或下列地标名，否则地图不知道放哪：
{place_rows}
  只知道层时写层名（上层 / 中层 / 下层 / 地基区），或「层 + 街区」（中层 霓虹街）。天城以外写「天城外·地名」；城外威胁（异兽、野兽潮、外围防线、城外清剿）也写天城外。
  「庄园」「议会」单独写不定层：写具体地标（伊甸庄园、罗斯柴尔德庄园、天城议会）或加层名。
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
    # restricted 卡房间（B1/B2，nsfw_compat_audit P1①）：here.mjs 经 plan 认得，词表也教给模型；不进 maps.json 房间表（unmapped096 守卫）
    plan = json.load(open(os.path.join(ROOT, 'map/data/eden_estate_rooms.json'), encoding='utf-8'))
    restr = [r['name'] for r in plan.get('rooms', []) if r.get('kind') == 'restricted']
    rooms, areas = lean(est['rooms'] + restr), lean(est['areas'])
    here = f'''<地图当前地点>
地图按当前地点落点；下面这些叫法地图都认得，越具体落得越准：
  庄园内：伊甸庄园·房间名。房间：{"、".join(rooms)}。室外：{"、".join(areas)}。
  天城内：天城·层·地标（地标名同「地图联动规范」的【地点】），如「天城·中层·天城执法局总局」。
  天城以外：写世界地图上的地名。
  玩家给地点起的叫法（地图设置里的「自定义」，背景里会列出）照写即可。
【地点标签】本楼玩家换了地点时，在正文末尾加一个隐藏标签作为补充（变量照常更新，以变量为准）：<span style="display:none">⌖地点 层·地点</span>（写法模板，照抄不生效）。
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
        # v0.9.5（通读 R5）：不再常驻，按层触发——聊天里出现这一层的层名或它的地标名 / 别名时才发（EJS 仍只展开当前地点那一处）
        kw = [w for w in dict.fromkeys([name, f'天城{name}', sub, *[x for v in reg[mid].get('markers', {}).values() for x in [v['name'], *v.get('alias', [])]]]) if w and len([*w]) >= 2]
        lore.append((f'地图方位·{name}', ejs_layer(reg, mid), 910 + len(lore), {'constant': False, 'key': kw}))


    common = city_facts(json.load(open(os.path.join(ROOT, 'map/data/maps.json'), encoding='utf-8')).get('unplaced', {}).get('items', []))
    return [('地图联动规范 v3', rules, 900), ('地图事件类型 v2', types, 901), ('地图当前地点 v2', here, 902), ('地图人物位置 v1', who, 903)] + lore + common + addon_places(), n


KW = {'constant': False, 'position': 0, 'depth': 4}   # 关键词触发，照卡里设定条目的写法（角色定义之前、深度 4）
ADDON_NOTE = '（地图附加设定，原卡没有）'


def city_facts(unplaced):
    """v0.9.6 天城常识（docs/card-omissions.md F1–F11 / B5–B9 / B10 / B22 / D3 / D7 / D12 / D14–D16 / D19 / E1 / E7 / A4–A13）：
    卡里写明、地图与模型常写错的口径，按主题拆成关键词触发的条目（不常驻）；只写中性制度与数字，不写玩法"""
    names = '、'.join(u['name'] for u in unplaced)
    T = lambda tag, body: f'<{tag}>\n{body}\n</{tag}>'
    rows = [
        ('天城常识-跨层', ['跨层', '通行许可', '通行证', '检查点', '入境税', '身份芯片'],
         '上层悬浮岛之间只有私人悬浮载具，没有公共交通。跨层要持天城执政厅签发的通行许可（写明方向、持证人、随行与有效时段，编号 P 加五位数）；中层与下层之间的检查点查验身份芯片与随身铭牌；下层商品进入中层缴 5% 入境税。'),
        ('天城常识-治安与机构', ['治安', '执法局', '分局', '骑士团', '防卫军', '教区', '修道院', '戒严', '帮派'],
         '治安随高度递减：上层几乎没有犯罪，中层高区良好，中层低区夜里部分街区不安全；下层大部分地盘由帮派控制，唯一相对安全的是资产管理委员会直管设施的周边。\n'
         '执法局约 8 万人：中层 18 个辖区各一个分局，下层名义 6 个、实际运转 3 个。议会骑士团 12 个分队，巡逻据点在中层高区；防卫军约 3 万，守外围防线。委员会另有约 2000 人的执法分队。'
         '圣光教会：中层 12 个教区（每区一座主教堂和若干礼拜堂）与 5 座普通修道院；下层 3 个教区，教堂多半荒废，靠施粥站、孤儿收容所、免费诊所维持。\n'
         '戒严权在议会；历史上只有两次：制度初推行时的大规模抗议，和八年前的下层帮派联合暴动（开场年份新历 2088 时即 2080 年前后）。'),
        ('天城常识-身份', ['公职', '公开身份', '身份保密', '体面'],
         '庄园成员的身份可以对外保密：本人照常担任原来的公职（首相、将军、教授等），公开场合维持原身份。'),
        ('天城常识-经济', ['以太元', 'Æ', '灰票', '税', '支付', '物价'],
         '以太元（Æ）由天城中央储备署发行，用植入芯片或个人终端支付；实体货币只在下层黑市流通（灰票，匿名芯片卡）。交易税 8%，资产持有税分档，上层全面免税；下层日薪约 80–150 Æ。'),
        ('天城常识-战力', ['战力', '超凡', '天灾', '几阶', '阶位'],
         '天灾 > 超凡五阶 > 四阶 > 三阶 > 二阶 > 一阶 > 普通人；持枪的普通人约等于超凡一至二阶，坦克、战斗机约等于二至三阶；没写会魔法的人按普通人算。'),
        ('天城常识-节日与社交季', ['建城纪念日', '制度纪念日', '丰收节', '拍卖季', '品鉴宴', '猎季', '晚祷'],
         '建城纪念日悬浮轨道免费一日；制度纪念日上层办大型拍卖会与品鉴宴，中层放假一日、商家促销；丰收节已成购物节。庄园主联盟的拍卖在春秋两季，猎季在秋季（野外营地）；品鉴宴的名次影响社交声望。圣光教会每周六晚祷。'),
        ('天城常识-媒体', ['新闻', '通讯社', '天城一台', '全息', '直播', '舆论'],
         '天城通讯社（官方）、全息新闻网络（中层公共区推送）、天城一台（电视）。上层私人终端连未过滤的全球网络，中层部分话题被屏蔽，下层靠加密终端与黑市数据商。'),
        ('庄园常识-日程', ['晨间报到', '午后茶点', '晚宴', '更衣', '排班', '访客', '体检'],
         '时刻只能向前，跨过 00:00 日期加一，时刻与时段不矛盾。每天三个固定时刻：晨间报到、午后茶点、晚宴更衣；访客抵达前十分钟全员就位；排班表每周更新；女仆按区域分班，女仆长持平板巡视、当场记录失误；体检每年一次，另有每月一次数据记录。'),
        ('庄园常识-安保与权限', ['结界', '监控', '门禁', '权限', '暗门', '专用通道', '隔音'],
         '外层结界覆盖全岛、隔绝探查，发生器持续以太供能；各房间可单独启动隔音结界；有入侵警报。监控覆盖除主卧与书房以外的全部区域，录像自动存档 30 日、重要内容永久保存，画面投到大厅、书房、女仆长寝室三处屏幕。'
         '门禁由植入的识别芯片控制：主人全域；女仆长除上锁的书房外全域；正式成员进自己的寝室、三楼与一楼公共区，地下一层按当日任务；新进成员只进新进寝区、三楼浴室与一楼大厅；地下二层只限主人与女仆长。女仆长寝室有一扇直通主卧的专用门；会客厅有暗门接主人专用通道。'),
    ] + ([('天城常识-位置未写', [u['name'] for u in unplaced],
         f'{names}：卡里没写层与位置，写到时只写机构名，不要自行定位。')] if unplaced else [])
    return [(c, T(c, body), 420 + i, {**KW, 'key': keys}) for i, (c, keys, body) in enumerate(rows)]


def addon_places():
    """地图补充的地点（map/data/addon_places.json）：每处一条关键词触发的条目；check_maps.py 保证与地图数据同步"""
    ap = json.load(open(os.path.join(ROOT, 'map/data/addon_places.json'), encoding='utf-8'))['places']
    return [(f'地图补充-{p["name"]}', f'<地图补充·{p["name"]}>\n{p["text"]}{ADDON_NOTE}\n</地图补充·{p["name"]}>', 440 + i,
             {**KW, 'key': [w for w in p['alias'] if len([*w]) >= 2]}) for i, p in enumerate(ap)]


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
    for i, (comment, content, order, *extra) in enumerate(items):
        e = {'uid': i, 'comment': comment, 'content': content, 'order': order, 'displayIndex': i, **(extra[0] if extra else {})}
        for k, v in FIELDS.items(): e.setdefault(k, json.loads(json.dumps(v)))
        entries[str(i)] = e
    return {'_credit': CREDIT, 'entries': entries}   # 酒馆导入只读 entries；_credit 是原作署名


SHIP = os.environ.get('EDEN_SHIP_OUT') or os.path.join(ROOT, 'map', 'data', 'worldbook_addon.json')   # 测试可改到临时文件


def to_ship(book, version):
    """随地图发到 CDN 的附加条目（map/tavern/wbsync.mjs 读，按酒馆助手 WorldbookEntry 形状）：id = 去掉「 vN」后缀的条目名（稳定编号），ver = 版本 + 内容指纹。"""
    import hashlib, os
    POS = {0: 'before_character_definition', 1: 'after_character_definition', 2: 'before_author_note', 3: 'after_author_note', 4: 'at_depth', 5: 'before_example_messages', 6: 'after_example_messages'}
    # 旧对话兼容：条目别名表（旧编号 → 新编号）单一来源 map/data/worldbook_aliases.json，原样嵌进发布物（wbsync.mjs 合并前先换编号）。
    # 发布的稳定编号 = 别名表里的英文点号编号（用户 2026-09-28）；条目名 / 关键词不变
    ap = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'map', 'data', 'worldbook_aliases.json')
    with open(ap, encoding='utf-8') as f: al = json.load(f)
    ents = []
    for e in book['entries'].values():
        base = re.sub(r'\s+v\d+$', '', e['comment']); eid = al.get('ids', {}).get(base, base)
        assert re.fullmatch(r'[a-z0-9][a-z0-9.-]*', eid), f'条目「{base}」没有英文编号：在 map/data/worldbook_aliases.json 的 ids 里加「{base}: 英文.点号.编号」'
        ents.append({'id': eid, 'name': e['comment'], 'enabled': not e['disable'], 'content': e['content'],
                     'strategy': {'type': 'constant' if e['constant'] else 'selective', 'keys': list(e['key'])},
                     'position': {'type': POS.get(e['position'], 'after_character_definition'), 'role': 'system', 'depth': e['depth'], 'order': e['order']},
                     'probability': e['probability'], 'recursion': {'prevent_incoming': bool(e['excludeRecursion']), 'prevent_outgoing': bool(e['preventRecursion'])}})
    h = hashlib.sha1(json.dumps(ents, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]
    return {'book': '伊甸地图·世界书附加条目', 'version': version, 'ver': f'{re.sub(r"-dev$", "", version)}+{h}', 'aliases': {'ids': al.get('ids', {})}, 'entries': ents}


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
    lore = [(c, t) for c, t, *_ in items if c.startswith('地图方位')]
    who, here = next(t for c, t, *_ in items if c.startswith('地图人物位置')), next(t for c, t, *_ in items if c.startswith('地图当前地点'))
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


def build_pack(pid, out=None):
    """非 eden 包：条目 = 包的 worldbook.json + 自动生成的「事件类型」「地点叫法」两条（和地图解析同一份数据）。不带原作署名（那是 eden 的）。"""
    d = os.path.join(ROOT, 'map', 'packs', pid)
    man = json.load(open(os.path.join(d, 'manifest.json'), encoding='utf-8')); data = man['data']
    wb = json.load(open(os.path.join(d, data['worldbook']), encoding='utf-8')) if data.get('worldbook') else {'entries': []}
    items = [(e['name'], e['content'], 100 + i) for i, e in enumerate(wb['entries'])]
    if data.get('events'):
        ev = json.load(open(os.path.join(d, data['events']), encoding='utf-8'))
        rows = [f"{g}：" + '、'.join(k for k, v in ev['types'].items() if v['g'] == g) for g in (ev.get('order') or ev['groups'])]
        items.append((f"{man['title']}·事件类型", '【地图事件类型】标签的「类别」写下面的类型名之一：\n' + '\n'.join(rows), 200))
    reg = json.load(open(os.path.join(d, data['maps']), encoding='utf-8'))
    rows = [f"{m.get('layer', {}).get('name', mid)}：" + '、'.join(v['name'] for v in (m.get('markers') or {}).values()) for mid, m in reg['maps'].items() if m.get('kind') == 'points']
    items.append((f"{man['title']}·地图地点", '【地图地点】当前地点写成「层·地点」，地图认得这些叫法：\n' + '\n'.join(rows), 210))
    book = to_book(items); book.pop('_credit', None)
    out = out or os.path.expanduser(f"~/Downloads/酒馆/世界书/{man['title']}·地图附加条目.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f: json.dump(book, f, ensure_ascii=False, indent=2); f.write('\n')
    print(f'写入 {out}（{len(items)} 条）')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--version', help='默认取 VERSION；已发布则 <VERSION>-dev')
    ap.add_argument('--out')
    ap.add_argument('--check', metavar='参照.json', help='按一份现有世界书核对字段与类型')
    ap.add_argument('--force', action='store_true', help='允许写已发布版本（有 map-v<版本> 标签）的文件')
    ap.add_argument('--ship', action='store_true', help='另写 map/data/worldbook_addon.json（随地图发到 CDN，设置「写入世界书」与自动同步用；版本号不带 -dev）')
    ap.add_argument('--pack', help='设定包 id（通用化）：打包 map/packs/<id>/worldbook.json 的条目，外加由包的 events.json / maps.json 生成的类型表与地点表')
    a = ap.parse_args()
    if a.pack and a.pack != 'eden': return build_pack(a.pack, a.out)
    released = lambda v: subprocess.run(['git', 'rev-parse', '-q', '--verify', f'refs/tags/map-v{v}'], cwd=ROOT, capture_output=True).returncode == 0
    if a.version is None:
        v = open(os.path.join(ROOT, 'VERSION')).read().strip() if os.path.exists(os.path.join(ROOT, 'VERSION')) else '0.9.1'
        a.version = f'{v}-dev' if released(v) else v
        if a.version != v: print(f'VERSION {v} 已发布（map-v{v}），输出按 {a.version}（要写正式版本号：--version <新版本>）')
    elif released(a.version) and not a.force:
        sys.exit(f'v{a.version} 已发布（有 map-v{a.version} 标签），拒绝覆盖已发布的附加世界书；确实要重写请加 --force，或用 --version {a.version}-dev / 新版本号')
    items, n = build(a.version)
    lore_max = selftest(items)
    book = to_book(items)
    out = a.out or os.path.expanduser(f'~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v{a.version}.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=2); f.write('\n')
    tot = 0
    kw = 0
    for c, content, _, *ex in items:
        const = (ex[0] if ex else {}).get('constant', True)
        t = tokens(content); tot += t if const else 0; kw += 0 if const or c.startswith('地图方位') else t
        print(f'  {c}：{len(content)} 字符，约 {t} tokens' + ('（EJS 源码，不直接发给模型）' if c.startswith('地图方位') else '' if const else '（关键词触发）'))
    print(f'写入 {out}（{len(items)} 条，{n} 种类型）')
    print(f'每轮发给模型：常驻约 {tot} tokens + 方位最多约 {lore_max} tokens（EJS 展开后；没装提示词模板扩展时方位条目会原样发出，自检会提示）；关键词条目合计约 {kw} tokens，只在提到时发')
    if a.check: check(book, a.check)
    if a.ship:
        with open(SHIP, 'w', encoding='utf-8') as f: json.dump(to_ship(book, a.version), f, ensure_ascii=False, indent=1); f.write('\n')
        print(f'写入 {os.path.relpath(SHIP, ROOT)}（随地图发布）')


if __name__ == '__main__':
    main()
