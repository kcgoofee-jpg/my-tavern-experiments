#!/usr/bin/env python3
"""生成「伊甸地图·世界书附加条目」

原作角色卡：Yehehua（类脑社区），原作发布帖 https://discord.com/channels/1380075940285124724/1534464824141025321 。本地图与附加条目是经作者同意（2026-09-27，Discord）的二次创作；发布时首帖须附原作帖链接。

：只含地图条目的独立世界书 JSON（酒馆「导入世界书」直接用，不改角色卡）。

内容从仓库数据生成，改了事件类型或地名后重跑即可保持一致：
  - 事件类型、大类顺序、稀有度、示范原文：首个包的事件块（map/packs/eden/overlay.v2.json 的 events，经 map/tavern/events-parse.mjs 的 taxonomy() 用 node 读取）
  - 地标名、层名、庄园房间 / 区域：map/data/maps.json（与 map/app/place-resolver.mjs 的当前地点解析同一份词表）
条目：
  0 说明（WB-2；始终关着，不发给模型，地图写书时重写它的正文：版本、写入时间、条数）
  1 地图联动规范 v4（WB-1，D43；常驻，WB-2 起在聊天末尾：at_depth 深度 0 的 user 消息，order 900 排在卡的深度 0 规则之后，docs/worldbook-layout.md）：每种标签一块（地点 / 人物 / 事件 / 事实 / 改名与用途；物品写在正文里），各一个填好的示范
  2 地图事件类型 v2（常驻，角色定义之后）：9 大类 66 种 + 稀有度
  3 地图当前地点 v3（常驻，角色定义之后）：地图认得的地点叫法（房间 / 区域 / 地标），只是词表
  （v4 起「地图人物位置」并入规范：别名表把 map.character-location 指到 map.link-rules，旧书里那一条按重复条目合并）
  5–7 地图方位·上层 / 中层 / 下层（v0.9.3，EJS 条件；WB-2 起不常驻 + at_depth 深度 1，聊天里出现该层层名 / 地标名时触发）：「世界.当前地点」落在该层某个地标时，只展开那一处的中性方位
    （名称、层、副标题、邻近地标）。要装「提示词模板」（ST-Prompt-Template）扩展；没装时自检会提示关掉这三条。
  8 天城常识-* / 庄园常识-*（v0.9.6，关键词触发，at_depth 深度 1，order 930+）：卡里已有、地图常用的口径（跨层、治安与机构、身份、经济、战力、节日、媒体、各层的光与视野、日程、安保与权限、其他机构）
  9 地点-*（v0.9.6，关键词触发，at_depth 深度 1，order 950+）：map/data/addon_places.json 里另行描述的地点，每处一条；check_maps.py 保证与地图数据同步
  10 地点-<房间名>（PLACE-1a，D44，关键词触发，at_depth 深度 1，order 970+）：每个有说明 / 出入的房间一条，正文 = map/core/place-record.mjs 的 entryText（经 tools/place_records.mjs 取出，
     与查看器的记录卡同一个函数）；通用名（走廊、设备间、储藏室、客房等）加次要关键词（所在建筑的名字，任一）；只有名字的房间不生成。
     发布物另带 index：{ 记录 id: [条目 id] }（房间 → 房间条目，已有「地点-*」的地点 → 它的条目，地标 → 所在层的方位条目），宿主按 id 查档案。
我们的规则只提到我们自己的东西（⌖ 标签、地图.*），不引用卡里的字段名或原文。
示范标签只用包的示范表里的原文（事件块 examples、overlay llm["x-tag-examples"]；模型照抄时地图不落点）。
全部条目默认启用（D43，说明条除外）；关键词条目仍是关键词触发。不写任何关键词过滤规则（地图不过滤内容，见 docs/content-compat.md）。

用法：python3 tools/build_worldbook_addon.py [--version 0.9.1] [--out 路径] [--check 参照世界书.json] [--force]
默认输出：~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v<版本>.json；只用标准库 + node。
版本：不写 --version 时取 VERSION；该版本已发布（有 map-v<版本> 标签）则默认改用 <版本>-dev，不碰已发布的文件。
      显式写一个已发布的版本号时拒绝写出，除非 --force（曾经有 agent 因为 VERSION 还没升而覆盖了已发布的 v0.9.5 文件）。
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDIT = '原作角色卡：Yehehua（类脑社区），原作发布帖 https://discord.com/channels/1380075940285124724/1534464824141025321 。本附加条目是经作者同意的二次创作；「地点-*」条目描述地图上的地点设定；「天城常识-*」「庄园常识-*」是把卡里已有设定按地图需要归纳的口径。'
RARE = {3: '罕', 4: '传'}


def load_events():
    js = ("import * as E from './map/tavern/events-parse.mjs'; import { packGeo } from './tools/eden_geo.mjs';"
          "E.setGeo(packGeo('eden')); const tx = E.taxonomy(), gl = Object.fromEntries(tx.groups.map(g => [g.id, g.label]));"
          "console.log(JSON.stringify({cats: Object.fromEntries(Object.values(tx.types).map(t => [t.label, { g: gl[t.group], ch: t.icon, src: t.source || '', rare: t.rare || 1 }])),"
          " order: E.legend().map(g => g.label), ex: E.examples()}))")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def pick_example(ex, pred, what):
    for s in ex:
        if pred(s): return s
    sys.exit(f'示范原文里找不到示范：{what}（改了首个包 overlay.v2.json 的 events.examples？）')


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
        return '、'.join(k['name'].replace(' ', '') for k in listed(reg[mid]['markers']).values())
    layers = [(reg[m]['layer']['name'], reg[m]['layer'].get('sub', ''), m) for m in ('tc_upper', 'tc_mid', 'tc_low')]
    place_rows = '\n'.join(f'  {name}（{sub}）：{marks(mid)}' for name, sub, mid in layers)

    # ---- 标签规范 v4（WB-1，D43）：每种标签一块、一个填好的示范、解析器收的原样写法；示范都在包的示范表里（照抄不上图）
    event = pick_example(ex, lambda s: s.startswith('⌖网络攻击｜') and s.count('｜') == 4, '紧凑写法 · 带发布方')
    tag = lambda s: f'<span style="display:none">{s}</span>'
    rules = f'''<地图联动规范 v4>
这一条让地图跟上剧情。每次回复写完正文，在最末尾加隐藏标签：一个标签一行，照下面示范的样子包在隐藏的 span 里。读者看不到，正文里不要提到它。格式照抄，只换内容；示范的内容照抄不会上图。
【地点】每次回复都写一行：玩家此刻在哪。叫法见「地图当前地点」。
{tag(RULE_EX['place'])}
【人物】在场的人里，和玩家不在同一处的，或这一回换了地方的，每人一行，名字写全名。
{tag(RULE_EX['char'])}
【事件】正文里出现城里的公开消息（快讯、通报、公告、终端情报）时写一行，没有就不写。字段用｜隔开：类型｜层·地点｜等级｜一句话｜发布方。类型从「地图事件类型」里选；等级 1–3，写 0 表示已解除。
{tag(event)}
【事实】剧情坐实了某个地点一件长期有效的事时写一行：地点：事实。
{tag(RULE_EX['fact'])}
【改名 / 用途】地点被正式改名，或改作别的用途时写一行，只写一次。
{tag(RULE_EX['rename'])}
{tag(RULE_EX['use'])}
【物品】有人拿到东西时，在正文里直接写明谁拿起了什么，物品名写具体；不需要标签。
【提醒】玩家用（OOC：…）提醒你补地图标签时，在这次回复末尾补上那一行。
</地图联动规范 v4>'''

    # ---- 当前地点：只是叫法词表（写标签的规矩都在「地图联动规范」）
    est = reg['eden_estate']
    # 当前地点按包含关系匹配（节点匹配取最长词），含有更短已列词的叫法（主卧室 ⊃ 主卧）不必再列
    lean = lambda ws: [w for w in ws if len(w) >= 2 and not any(o != w and len(o) >= 2 and o in w for o in ws)]
    # 地下两层里 maps.json 房间表没有的卡房间（nsfw_compat_audit P1①）：当前地点经 plan 认得，词表也教给模型；不进 maps.json 房间表（unmapped096 守卫）
    plan = json.load(open(os.path.join(ROOT, 'map/data/eden_estate_rooms.json'), encoding='utf-8'))
    restr = [r['name'] for r in plan.get('rooms', []) if r.get('kind') == 'card' and r.get('floor') in ('B1', 'B2') and r['name'] not in est['rooms']]
    rooms, areas = lean(est['rooms'] + restr), lean(est['areas'])
    here = f'''<地图当前地点>
地图认得下面这些地点叫法，越具体落得越准；标签【地点】【人物】【事件】里的地点照这里写。
  庄园内：伊甸庄园·房间名。房间：{"、".join(rooms)}。室外：{"、".join(areas)}。
  天城内：天城·层·地标，如「天城·中层·天城执法局总局」。各层地标：
{place_rows}
  只知道层时写层名（上层 / 中层 / 下层 / 地基区），或「层 + 街区」（中层 霓虹街）。
  「庄园」「议会」单独写不定层：写具体地标（伊甸庄园、罗斯柴尔德庄园、天城议会）或加层名。
  天城以外写「天城外·地名」，或世界地图上的地名；城外威胁（异兽、野兽潮、外围防线、城外清剿）也写天城外。
  玩家给地点起的叫法（地图设置里的「自定义」，背景里会列出）照写即可。
</地图当前地点>'''

    # ---- 方位（v0.9.3）：EJS 条件条目，每层一条；只展开当前地点所在的那一处
    lore = []
    for name, sub, mid in layers:
        # v0.9.5（通读 R5）：不再常驻，按层触发——聊天里出现这一层的层名或它的地标名 / 别名时才发（EJS 仍只展开当前地点那一处）
        kw = [w for w in dict.fromkeys([name, f'天城{name}', sub, *[x for v in reg[mid].get('markers', {}).values() for x in [v['name'], *v.get('alias', [])]]]) if w and len([*w]) >= 2]
        lore.append((f'地图方位·{name}', ejs_layer(reg, mid), ORD_LORE + len(lore), {'constant': False, 'key': kw, **KW}))


    common = city_facts(json.load(open(os.path.join(ROOT, 'map/data/maps.json'), encoding='utf-8')).get('unplaced', {}).get('items', []))
    # WB-2（D45）版面：规范 at_depth 深度 0（user，紧跟卡的回复末尾规则）；类型表与叫法词表是静态的，留在角色定义之后（缓存前缀里）；关键词条目全在深度 1（见 KW）
    places = addon_places()
    return [README] + [('地图联动规范 v4', rules, 900, RULES_AT), ('地图事件类型 v2', types, 901), ('地图当前地点 v3', here, 902)] + lore + common + places + room_entries(reg, places, lore), n


# WB-1（D43）规范里的示范：都在包的示范表里（overlay llm["x-tag-examples"] 或解析器内置的示范），照抄不上图；tests/wb1_rules.test.mjs 核对每条的写法能被解析
RULE_EX = {'place': '⌖地点 天城·中层·辉光大教堂', 'char': '⌖人物 绫濑遥 @ 伊甸庄园·东侧长廊', 'fact': '⌖事实 会客厅：暗门通主人专用通道',
           'rename': '⌖改名 书房 → 星图室', 'use': '⌖用途 书房：整理旧地图'}
# WB-2（D45，docs/worldbook-layout.md）：规范在聊天末尾（at_depth 深度 0，user 角色，order 900 排在卡的深度 0 规则 order 200 之后）——
# 模型把地图标签和卡的回复末尾规则读成同一块格式要求；深度 0 的 user 消息每轮都在末尾，改位置不动缓存前缀
RULES_AT = {'position': 4, 'depth': 0, 'role': 1}
# WB-2: the readme entry. Always disabled (never injected), first in the book; the map script rewrites its text on every write (version, time, counts: tavern/worldbook-readme.mjs).
README = ('说明 · 伊甸地图附加条目', '（这一条的内容由地图脚本在写入这本书时生成：版本、写入时间、条数，以及要不要删旧书。它始终关着，不会发给模型。）', 1,
          {'constant': False, 'disable': True, 'key': [], 'position': 0, 'depth': 4})


# WB-2（D45）：关键词条目一律 at_depth 深度 1、system 角色、order 910 起（不和卡的 100-500 交错）——
# 触发集合变了只动请求末尾（缓存前缀不动）；放角色定义前后会挪动被缓存的前缀（docs/worldbook-layout.md §5）
KW = {'constant': False, 'position': 4, 'depth': 1, 'role': 0}
# WB-2（D45）关键词条目的 order 段：910 方位 / 930 常识 / 950 地点（42 条）/ 1000 房间（卡的条目在 100-500，永不交错；段间留空，插新族不重排旧条目）
ORD_LORE, ORD_FACTS, ORD_PLACES, ORD_ROOMS = 910, 930, 950, 1000


def city_facts(unplaced):
    """v0.9.6 天城常识（docs/card-omissions.md F1–F11 / B5–B9 / B10 / B22 / D3 / D7 / D12 / D14–D16 / D19 / E1 / E7 / A4–A13）：
    卡里写明、地图与模型常写错的口径，按主题拆成关键词触发的条目（不常驻）；只写中性制度与数字，不写玩法"""
    names = '、'.join(u['name'] for u in unplaced)
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
        # WB-1：分层的光与视野、城市向外延伸（docs/tiancheng-maps.md §0.4–§0.5，D41；卡 L32–L34、L214、L363–L364）
        ('天城常识-上层', ['上层', '天城上层', '悬浮庄园区', '悬浮岛', '浮岛', '云海'],
         '上层（悬浮庄园区，离地 800–1500 m）是数十座悬浮岛，各岛彼此看得见，空域由议会骑士团巡逻。往下看，夜里是中层的灯火，像铺在脚下的电路板；清晨常是翻涌的云海，云隙里透出城市。\n'
         '光：晨，太阳低而暖，云顶镀金，云谷灰蓝；昼，直射的日光；昏，橙红的长影，窗灯陆续亮起，停靠平台的信标亮了；夜里只有很弱的冷月光，亮的都是真实的灯：主楼的窗、园灯与路灯、水池灯、停靠信标，岛底以太核心和符文环的冷光最亮。'),
        ('天城常识-中层', ['中层', '天城中层', '钢铁霓虹区', '霓虹', '全息广告', '悬浮轨道'],
         '中层（钢铁霓虹区，离地 50–800 m）的日照被浮岛和高楼挡住，大部分区域靠人造光：太阳只照到楼冠、高处立面和少数地段，街面常年在阴影里，浮岛正下方更暗；有些地段会下雨。霓虹和全息广告白天也开着。\n'
         '夜里整片城市都亮：核心区楼冠一圈暖金，写字楼是白窗；高区是冷白光，辉光大教堂立面泛光；商业区霓虹和全息广告最密，多品红和青色；外围居住区以暖色窗灯为主；环城军营带是探照灯和白色泛光；悬浮轨道是一条条发光的线。只有公园、运河和空地是暗的。\n'
         '天城人口约 3200 万，地图画的是城市中心一块。城市向四周延伸很远：外围居住区之外是环城军营带，再往外是防卫军守的外围防线。'),
        ('天城常识-下层', ['下层', '天城下层', '地基区', '7号井', '7 号井', '钠灯'],
         '下层（地基区，地面及地下，最深约 200 m）几乎没有自然光，见不到太阳和蓝天。抬头是灰暗的天花板和滴水的检修管道，能看到悬在高处的中层。光都是人造的：钠灯的暗黄光，工厂炉口和天窗的橙光。\n'
         '白班（06:00–18:00）工厂全开，蒸汽被下面的火光照亮；7 号井的竖井口落下全层唯一一道冷白的天光。夜班（18:00–06:00）工厂只开一部分；黑市、酒馆和地下格斗场一带的霓虹更亮，贫民窟里纯黑的角落更多；7 号井竖井口只漏下中层霓虹的一点紫青色。\n'
         '城市向四周延伸很远：工业带、编组场和货运铁路向外放射，贫民窟连成一片，越往外钠灯越稀。'),
        ('庄园常识-日程', ['晨间报到', '午后茶点', '晚宴', '更衣', '排班', '访客', '体检'],
         '时刻只能向前，跨过 00:00 日期加一，时刻与时段不矛盾。每天三个固定时刻：晨间报到、午后茶点、晚宴更衣；访客抵达前十分钟全员就位；排班表每周更新；女仆按区域分班，女仆长持平板巡视、当场记录失误；体检每年一次，另有每月一次数据记录。'),
        ('庄园常识-安保与权限', ['结界', '监控', '门禁', '权限', '暗门', '专用通道', '隔音'],
         '外层结界覆盖全岛、隔绝探查，发生器持续以太供能；各房间可单独启动隔音结界；有入侵警报。监控覆盖除主卧与书房以外的全部区域，录像自动存档 30 日、重要内容永久保存，画面投到大厅、书房、女仆长寝室三处屏幕。'
         '门禁由植入的识别芯片控制：主人全域；女仆长除上锁的书房外全域；正式成员进自己的寝室、三楼与一楼公共区，地下一层按当日任务；新进成员只进新进寝区、三楼浴室与一楼大厅；地下二层只限主人与女仆长。女仆长寝室有一扇直通主卧的专用门；会客厅有暗门接主人专用通道。'),
    ] + ([('天城常识-其他机构', [u['name'] for u in unplaced],
         f'{names}：没有固定的层与位置，写到时只写机构名，不要自行定位。')] if unplaced else [])
    return [kw_entry(c, c, body, keys, ORD_FACTS + i) for i, (c, keys, body) in enumerate(rows)]


def kw_entry(name, tag, body, keys, order):
    """一条关键词触发条目（WB-2 版面：at_depth 深度 1、system 角色，见 KW）：正文用 <tag> 包住。常识、地点、房间条目都走这里"""
    return (name, f'<{tag}>\n{body}\n</{tag}>', order, {**KW, 'key': list(keys)})


def addon_places():
    """地图另行描述的地点（map/data/addon_places.json）：每处一条关键词触发的条目；check_maps.py 保证与地图数据同步"""
    ap = json.load(open(os.path.join(ROOT, 'map/data/addon_places.json'), encoding='utf-8'))['places']
    return [kw_entry(f'地点-{p["name"]}', f'地点·{p["name"]}', p['text'], [w for w in p['alias'] if len([*w]) >= 2], ORD_PLACES + i) for i, p in enumerate(ap)]


# PLACE-1a（D44）：房间条目。记录与正文来自 map/core/place-record.mjs（node tools/place_records.mjs），这里只定关键词、次要关键词与编号。
GENERIC = ('走廊', '连廊', '设备间', '储藏室', '客房', '前室', '过道', '过厅', '前廊', '后廊', '主廊', '布草间', '服务间')   # 通用名：别的宅子里也常见，加次要关键词（所在建筑的名字）
ROOM_EID = {}   # 条目名 -> 稳定编号 map.room.<节点 id，下划线换成连字符>（不进别名表；发布编号只许英文点号 / 连字符）
INDEX = {}      # 记录 id -> [条目 id]（发布物的 index，宿主按 id 查档案）


def place_records():
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'place_records.mjs')], capture_output=True, text=True, encoding='utf-8')
    if r.returncode: sys.exit(f'node tools/place_records.mjs 失败：\n{r.stderr}')
    return json.loads(r.stdout)


def room_entries(reg, places, lore):
    """每个有说明 / 出入的房间一条关键词条目；名字撞上已有条目的不再建（记录指向已有条目）；索引一并填好。"""
    INDEX.clear(); ROOM_EID.clear()
    al = json.load(open(os.path.join(ROOT, 'map/data/worldbook_aliases.json'), encoding='utf-8')).get('ids', {})
    taken = {p[0] for p in places}
    ap = json.load(open(os.path.join(ROOT, 'map/data/addon_places.json'), encoding='utf-8'))['places']
    for p in ap:
        if al.get(f'地点-{p["name"]}'): INDEX[p['id']] = [al[f'地点-{p["name"]}']]
    d = place_records(); out = []
    rid = {r['anchor'] or r['id']: r['id'] for r in d['records']} | {r['id']: r['id'] for r in d['records']}   # 地图标记 id（锚点）-> 记录 id
    for (name, *_), mid in zip(lore, ('tc_upper', 'tc_mid', 'tc_low')):   # 地标 -> 所在层的方位条目（已有自己条目的地点不覆盖）
        for k in listed(reg[mid]['markers']):
            if k in rid: INDEX.setdefault(rid[k], [al[name]])
    for r in d['records']:
        if r['kind'] != 'room' or not r['hasText']: continue
        name = f'地点-{r["name"]}'
        if name in taken or any(name == o[0] for o in out):
            if al.get(name): INDEX[r['id']] = [al[name]]
            continue
        eid = 'map.room.' + r['id'].replace('_', '-'); ROOM_EID[name] = eid; INDEX[r['id']] = [eid]
        parts = [w for w in re.split(r'\s*/\s*', r['name']) if len([*w]) >= 3 and w != r['name']]
        keys = list(dict.fromkeys([*r['keys'], *parts]))
        sec = [k for k in r['parentKeys'] if len([*k]) >= 2] if any(r['name'].endswith(g) for g in GENERIC) or r['name'] in d['shared'] else []
        out.append((name, r['text'], ORD_ROOMS + len(out), {**KW, 'key': keys, **({'keysecondary': sec} if sec else {})}))
    return out


def listed(markers):
    """列入世界书地点清单的地标（wb_list:false 的不列，由 addon_places.json 的条目描述）"""
    return {k: v for k, v in markers.items() if v.get('wb_list', True) is not False}


LAYER_RE = {'上层': '中层|下层', '中层': '上层|下层', '下层': '上层|中层'}


_TREE = None


def node_tree():
    """出货数据的节点树（查看器同一份：map/app/nodes-runtime.mjs，经 tools/node_chain.mjs 取出）：{chain: {地图 id: [祖先名…]}, node: {地图 id: 节点名}}。"""
    global _TREE
    if _TREE is None:
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'node_chain.mjs')], capture_output=True, text=True, encoding='utf-8')
        if r.returncode: sys.exit(f'node tools/node_chain.mjs 失败（[TOPO] 前缀与出口层名要从节点树取，不再手写）：\n{r.stderr}')
        _TREE = json.loads(r.stdout)
    return _TREE


def topo_block(reg, mid):
    """v17（W1，docs/plans/llm-campaign.md 裁决 12/13）：层连通性编译成 [TOPO] 声明块，取代「地图上的地标：…」散文列举。
    连接源只有三类：marker.link 显式跨层通道（出口）、同层地标全集（连通）、层级包含（路径前缀）；routes 不作邻接源。
    与 map/tavern/spatial-contract.mjs 的 topo 语义同一口径（运行时注入与世界书发布件两条路一个说法）。"""
    m, tree = reg[mid], node_tree()
    body = '连通: ' + '、'.join(v['name'].replace(' ', '') for v in listed(m['markers']).values())
    links = []
    for v in listed(m['markers']).values():
        to = (v.get('link') or {}).get('map')
        # 出口 = link.map 指向节点树里的一个层（有 layer）；只是三维页视图的图（lm_* 没有自己的节点）不算；层名取节点名
        if to and to in tree['node'] and reg.get(to, {}).get('layer'): links.append(f"{v['name'].replace(' ', '')}({tree['node'][to]})")
    if links: body += '；出口: ' + '、'.join(links)
    return f'[TOPO: {"/".join([*tree["chain"][mid], tree["node"][mid]])} -> {body}]'


def topo_selftest(reg):
    """wb_topo（W1）：[TOPO] 块对同一份连通信息的 token 占用 ≤ 散文版 25%。
    散文基线 = 无向图的自然语言叙述（每条连接一句完整句子、两个方向都写）——这正是 TOPO 块要替代的东西。
    全量对拍在 tests/wb_topo.test.mjs；这里抽第一层自证，失败直接退出构建。"""
    for mid, m in reg.items():
        if m.get('kind') != 'points' or m.get('status') == 'planned' or not m.get('layer'): continue
        names = [v['name'].replace(' ', '') for v in listed(m['markers']).values()]
        if len(names) < 2: continue
        block = topo_block(reg, mid)
        prose = '。'.join(f'从{a}可以步行前往{b}' for a in names for b in names if a != b) + '。'
        r = tokens(block) / max(1, tokens(prose))
        assert r <= 0.25, f'{mid}: [TOPO] 块 {tokens(block)} tokens，散文版 {tokens(prose)}（{r:.0%} > 25%）'
        return r
    return None


def neighbours(reg, mid, k, n=3):
    """同层最近的 n 个地标（按 data/<层>.json 的归一化坐标）"""
    d = json.load(open(os.path.join(ROOT, 'map', reg[mid]['data']), encoding='utf-8'))
    ok = listed(reg[mid]['markers'])
    xy = {m['id']: (m.get('ax', m['nx']), m.get('ay', m['ny'])) for m in d['markers'] if m['id'] in ok}
    if k not in xy: return []
    x0, y0 = xy[k]
    near = sorted((((x - x0) ** 2 + (y - y0) ** 2), i) for i, (x, y) in xy.items() if i != k)
    return [reg[mid]['markers'][i]['name'].replace(' ', '') for _, i in near[:n] if i in reg[mid]['markers']]


def lore_lines(reg, mid):
    """每个地标一句中性方位：[(匹配词[], 描述)]；再加一句只写到层时的层概况"""
    m, L = reg[mid], reg[mid]['layer']
    rows = []
    for k, v in listed(m['markers']).items():
        nm = v['name'].replace(' ', '')
        sub = re.sub(r'\{\{user\}\}\s*', '玩家', v.get('sub') or '')
        words = [w for w in dict.fromkeys([v['name'], nm, *v.get('alias', [])]) if len([*w]) >= 2]
        nb = neighbours(reg, mid, k)
        rows.append((words, f'{nm}：天城{L["name"]}（{L["sub"]}）' + (f'，{sub}' if sub else '') + (f'；地图上邻近：{"、".join(nb)}' if nb else '') + '。'))
    layer = (L['name'], [L['name'], *m.get('districts', [])], f'天城{L["name"]}（{L["sub"]}，{L.get("alt", "")}）；' + topo_block(reg, mid) + '。')
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

# ---- 标准扩展接口：发布物格式版本 + 条目类别映射字典（通用扩展契约预留；新增条目后未登记会落 'other'，在此补一行即可）----
SHIP_SCHEMA = 1
SHIP_CATEGORIES = {            # 精确编号 → 类别
    'map.link-rules': 'rules',
    'map.event-types': 'events',
    'map.current-location': 'places',
    'map.readme': 'readme',
}
SHIP_CATEGORY_PREFIXES = {     # 编号前缀 → 类别（同一族条目共用一类）
    'map.bearing.': 'places',
    'map.place.': 'places',
    'map.room.': 'places',
    'tiancheng.lore.': 'lore',
    'estate.lore.': 'lore',
}


def ship_categories(ents):
    cats = {}
    for e in ents:
        eid = e['id']
        cats[eid] = SHIP_CATEGORIES.get(eid) or next((c for p, c in SHIP_CATEGORY_PREFIXES.items() if eid.startswith(p)), 'other')
    return cats


def to_ship(book, version):
    """随地图发到 CDN 的附加条目（map/tavern/worldbook-sync.mjs 读，按酒馆助手 WorldbookEntry 形状）：id = 去掉「 vN」后缀的条目名（稳定编号），ver = 版本 + 内容指纹。
    标准扩展接口（通用扩展契约预留）：顶层 `schema` = 发布物格式版本（与 pack.schema.json 的 schema 同一口径，改字段形状先升它）；
    `category` = 稳定编号 → 标准类别字典（rules / events / places / characters / lore，未登记回退 other），通用扩展宿主按类别挑条目。
    worldbook-sync.mjs 只读 ver / aliases / entries，多出的顶层键无害。"""
    import hashlib, os
    ROLE = {0: 'system', 1: 'user', 2: 'assistant'}
    POS = {0: 'before_character_definition', 1: 'after_character_definition', 2: 'before_author_note', 3: 'after_author_note', 4: 'at_depth', 5: 'before_example_messages', 6: 'after_example_messages'}
    # 旧对话兼容：条目别名表（旧编号 → 新编号）单一来源 map/data/worldbook_aliases.json，原样嵌进发布物（worldbook-sync.mjs 合并前先换编号）。
    # 发布的稳定编号 = 别名表里的英文点号编号（用户 2026-09-28）；条目名 / 关键词不变
    ap = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'map', 'data', 'worldbook_aliases.json')
    with open(ap, encoding='utf-8') as f: al = json.load(f)
    ents = []
    for e in book['entries'].values():
        base = re.sub(r'\s+v\d+$', '', e['comment']); eid = ROOM_EID.get(base) or al.get('ids', {}).get(base, base)
        assert re.fullmatch(r'[a-z0-9][a-z0-9.-]*', eid), f'条目「{base}」没有英文编号：在 map/data/worldbook_aliases.json 的 ids 里加「{base}: 英文.点号.编号」'
        ents.append({'id': eid, 'name': e['comment'], 'enabled': not e['disable'], 'content': e['content'],
                     'strategy': {'type': 'constant' if e['constant'] else 'selective', 'keys': list(e['key']), **({'keys_secondary': {'logic': 'and_any', 'keys': list(e['keysecondary'])}} if e['keysecondary'] else {})},
                     'position': {'type': POS.get(e['position'], 'after_character_definition'), 'role': ROLE.get(e['role'] or 0, 'system'), 'depth': e['depth'], 'order': e['order']},
                     'probability': e['probability'], 'recursion': {'prevent_incoming': bool(e['excludeRecursion']), 'prevent_outgoing': bool(e['preventRecursion'])}})
    h = hashlib.sha1(json.dumps(ents, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]
    ver = f'{re.sub(r"-dev$", "", version)}+{h}'
    try: prev = json.load(open(os.path.join(ROOT, 'map', 'data', 'worldbook_addon.json'), encoding='utf-8'))   # the committed ship, also when a test writes the new one elsewhere
    except (OSError, ValueError): prev = {}
    import datetime
    built = prev.get('built') if prev.get('ver') == ver and prev.get('built') else datetime.date.today().isoformat()   # WB-2: the day this exact content first shipped (a re-ship of the same content keeps it)
    return {'schema': SHIP_SCHEMA, 'book': '伊甸地图·世界书附加条目', 'version': version, 'ver': ver, 'built': built, 'category': ship_categories(ents), '_credit': CREDIT, 'aliases': {'ids': al.get('ids', {})}, **({'index': INDEX} if INDEX else {}), 'entries': ents}


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
    """用 events.mjs / app/place-resolver.mjs 自己核对：示范原文都不上图；【地点】里每个地标都能推断出层；当前地点示例能落点。"""
    import re
    rules, here = (next(x[1] for x in items if x[0].startswith(n)) for n in ('地图联动规范', '地图当前地点'))
    spans = re.findall(r'<span style="display:none"[^>]*>[^<]*</span>', rules)
    places = [(m.group(1), w) for m in re.finditer(r'^  (上层|中层|下层)（[^）]*）：(.+)$', here, re.M) for w in m.group(2).split('、')]   # v4：地标清单在叫法词表里
    probes = {'伊甸庄园·书房': 'eden_estate', '伊甸庄园·玫瑰园': 'eden_estate', '天城·中层·天城执法局总局': 'tc_mid', '天城·下层·7号井黑市': 'tc_low', '中层 霓虹街': 'tc_mid'}
    js = """import * as E from './map/tavern/events-parse.mjs'; import { packGeo } from './tools/eden_geo.mjs'; import { packHere } from './tools/pack_here.mjs'; import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(0, 'utf8')); const reg = JSON.parse(fs.readFileSync('map/data/maps.json', 'utf8'));
const idx = packHere('eden'); E.setGeo(packGeo('eden'));
const out = { ex: a.spans.map(s => E.parseMarks(s).length),
  places: a.places.map(([L, w]) => (E.parseMarks(`<span style="display:none" data-tcmap="类型=火灾;地点=${w};标题=测试"></span>`)[0] || {}).layer || ''),
  here: Object.keys(a.probes).map(k => (idx.here(k) || {}).map || '') };
console.log(JSON.stringify(out));"""
    r = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, input=json.dumps({'spans': spans, 'places': places, 'probes': probes}),
                                  capture_output=True, text=True, check=True).stdout)
    bad = [s for s, k in zip(spans, r['ex']) if k] + [f'{w}→{got or "无层"}（应为 {L}）' for (L, w), got in zip(places, r['places']) if got != L] \
        + [f'当前地点 {k}→{got or "不动"}（应为 {want}）' for (k, want), got in zip(probes.items(), r['here']) if got != want]
    if len(spans) != 6 or not places or bad: sys.exit('自检失败：\n  ' + '\n  '.join(bad or ['规范里应有 6 条示范，地点清单不能空']))
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
    who = next(t for c, t, *_ in items if c.startswith('地图联动规范'))   # v4：人物 / 地点 / 事实 / 改名示范都在规范里
    probes = ['天城·中层·天城执法局总局', '中层·霓虹街', '下层·废弃教堂区', '伊甸庄园·书房', '主卧', '天城·上层', ['中层·霓虹街', '[旧格式]'], '世界地图上的某地', '']
    js = MINI_EJS + """
import * as C from './map/tavern/characters-parse.mjs'; import * as V from './map/tavern/mvu-readers.mjs'; import * as I from './map/tavern/interaction-modes.mjs'; import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(0, 'utf8')), ex = JSON.parse(fs.readFileSync('map/packs/eden/overlay.v2.json', 'utf8')).llm['x-tag-examples'];
C.setExamples(ex); V.setCustomExamples(ex); I.configure({ examples: ex });   // 宿主经 tavern/event-geo-load.mjs 装同一份示范表
console.log(JSON.stringify({ tags: C.parseChars(a.who).length + V.parseCustomTags(a.who).length + (I.parseHereTag(a.who) ? 1 : 0),
  out: a.probes.map(h => a.lore.map(([c, t]) => render(t, h).trim())) }));"""
    r = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, input=json.dumps({'who': who, 'lore': lore, 'probes': probes}),
                                  capture_output=True, text=True, check=True).stdout)
    bad = []
    if r['tags']: bad.append(f'地点 / 人物 / 事实 / 改名示范原文会生效（{r["tags"]} 条）')
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


def dev_of(v):
    """WB-2: the version of a build made after release v: the next patch, -dev (0.9.7 released -> 0.9.8-dev), so the label never claims to be the released version."""
    m = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', v)
    return f'{m[1]}.{m[2]}.{int(m[3]) + 1}-dev' if m else f'{v}-dev'


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
        a.version = dev_of(v) if released(v) else v
        if a.version != v: print(f'VERSION {v} 已发布（map-v{v}），输出按 {a.version}（下一个版本的开发中构建；要写正式版本号：--version <新版本>）')
    elif released(a.version) and not a.force:
        sys.exit(f'v{a.version} 已发布（有 map-v{a.version} 标签），拒绝覆盖已发布的附加世界书；确实要重写请加 --force，或用 --version {a.version}-dev / 新版本号')
    items, n = build(a.version)
    lore_max = selftest(items)
    topo_selftest(json.load(open(os.path.join(ROOT, 'map/data/maps.json'), encoding='utf-8'))['maps'])
    book = to_book(items)
    out = a.out or os.path.expanduser(f'~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 v{a.version}.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=2); f.write('\n')
    tot = 0
    kw = 0
    for c, content, _, *ex in items:
        const = (ex[0] if ex else {}).get('constant', True)
        t = tokens(content); tot += t if const else 0; kw += 0 if const or c.startswith(('地图方位', '说明')) else t
        print(f'  {c}：{len(content)} 字符，约 {t} tokens' + ('（EJS 源码，不直接发给模型）' if c.startswith('地图方位') else '（始终关着，不发给模型）' if c.startswith('说明') else '' if const else '（关键词触发）'))
    print(f'写入 {out}（{len(items)} 条，{n} 种类型）')
    rooms = [(c, t) for c, t, *_ in items if c in ROOM_EID]
    if rooms: print(f'PLACE-1a 房间条目 {len(rooms)} 条，共 {sum(len(t) for _, t in rooms)} 字符；单条平均约 {sum(tokens(t) for _, t in rooms) // len(rooms)} tokens，最多 {max(tokens(t) for _, t in rooms)}；带次要关键词 {sum(1 for c, _, _, *x in items if c in ROOM_EID and x[0].get("keysecondary"))} 条')
    print(f'每轮发给模型：常驻约 {tot} tokens + 方位最多约 {lore_max} tokens（EJS 展开后；没装提示词模板扩展时方位条目会原样发出，自检会提示）；关键词条目合计约 {kw} tokens，只在提到时发')
    if a.check: check(book, a.check)
    if a.ship:
        with open(SHIP, 'w', encoding='utf-8') as f: json.dump(to_ship(book, a.version), f, ensure_ascii=False, indent=1); f.write('\n')
        print(f'写入 {os.path.relpath(SHIP, ROOT)}（随地图发布）')


if __name__ == '__main__':
    main()
