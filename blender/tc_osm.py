#!/usr/bin/env python3
# OpenStreetMap → 天城城市骨架（纯 Python，不依赖 Blender）。
# 数据 © OpenStreetMap contributors，ODbL 1.0（https://www.openstreetmap.org/copyright）。
# 取材区域：香港九龙油麻地—旺角—太子一带（南北约 3 km、东西约 1.875 km），世界上最密的高层街区之一，
# OSM 的建筑轮廓与层数在这里很完整。天城是虚构城市：整块区域旋转 90°（北 → 东）放进 3 km × 1.875 km 的片区，
# 不保留任何名称标签，地标另按设定叠加。
#
# 用法：
#   python3 blender/tc_osm.py fetch [区域 ...]   # 从 api.openstreetmap.org 分块下载原始 .osm 到 blender/data/osm/raw/<区域>/（不进 git）
#   python3 blender/tc_osm.py build [区域 ...]   # 原始 .osm → blender/data/osm/<区域>.json（进 git，渲染只读这些）
# 区域见 REGIONS；各层按城区拼接哪些区域见 tc_city.DISTRICTS。
# <区域>.json：以区域中心为原点的平面坐标（1 单位 = 100 m），
#   roads[{c 等级, w 宽度, p [[x, y], …]}]、buildings[{p 轮廓, h 高度 m 或 null, lv 层数或 null}]、
#   parks / water [{p}]、rail [{p}]。
import json, math, os, sys, glob, urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OSM = os.path.join(HERE, 'data', 'osm')
CREDIT = '© OpenStreetMap contributors (ODbL)'
# 各参考区域：中心经纬度、取材宽高（米，旋转之后的 x / y 方向）、旋转角（度，把 (东, 北) 逆时针转多少）。
# 输出 data/osm/<名>.json，坐标以区域中心为原点、1 单位 = 100 m；拼到天城哪一块由 tc_city.DISTRICTS 决定。
REGIONS = {
    # 九龙油麻地—旺角—太子（中层商业区；也是任务 2 的整片底子）：南北 3 km 转成横向
    'kowloon':   dict(lat=22.3170, lon=114.1686, w=3000, h=1875, rot=-90),
    # 纽约曼哈顿中城（中层核心区与高区）：大道（北偏东约 29°）转成横向
    'manhattan': dict(lat=40.7549, lon=-73.9840, w=2400, h=1700, rot=-61),
    # 纽约布鲁克林 Park Slope—Gowanus（中层外围居住区）：联排住宅 + 运河边旧仓库
    'brooklyn':  dict(lat=40.6760, lon=-73.9880, w=1400, h=2200, rot=0),
    # 德国鲁尔区杜伊斯堡北部（下层工业带）：钢厂、货运铁路、储罐
    'ruhr':      dict(lat=51.4905, lon=6.7400, w=1900, h=2200, rot=0),
    # 深圳白石洲一带（下层城中村的道路骨架；OSM 里城中村的楼几乎没画，楼按握手楼尺度生成）
    'shenzhen':  dict(lat=22.5395, lon=113.9650, w=1700, h=2200, rot=0),
}
MY = 110574.0
def region(name): return REGIONS[name]
def projector(name):
    """经纬度 → 区域平面坐标：以区域中心为原点，(东, 北) 逆时针转 rot 度，1 单位 = 100 m。"""
    R = REGIONS[name]; mx = 111320.0 * math.cos(math.radians(R['lat'])); a = math.radians(R['rot']); c, s = math.cos(a), math.sin(a)
    def project(lat, lon):
        e = (lon - R['lon']) * mx / 100; n = (lat - R['lat']) * MY / 100
        return round(e * c - n * s, 3), round(e * s + n * c, 3)
    return project
def bbox(name, margin=1.15):
    """覆盖旋转后取材框的经纬度范围 (南, 西, 北, 东)。"""
    R = REGIONS[name]; mx = 111320.0 * math.cos(math.radians(R['lat'])); a = math.radians(R['rot'])
    hw, hh = R['w'] / 2 * margin, R['h'] / 2 * margin
    pts = [(x * math.cos(-a) - y * math.sin(-a), x * math.sin(-a) + y * math.cos(-a)) for x in (-hw, hw) for y in (-hh, hh)]
    es, ns = [p[0] for p in pts], [p[1] for p in pts]
    return R['lat'] + min(ns) / MY, R['lon'] + min(es) / mx, R['lat'] + max(ns) / MY, R['lon'] + max(es) / mx

ROAD_W = {   # 道路等级 → 路面宽度（平面单位，1 = 100 m）；只保留走得了车或人的路
    'motorway': .26, 'trunk': .24, 'primary': .2, 'secondary': .16, 'tertiary': .13, 'unclassified': .09, 'residential': .09,
    'motorway_link': .1, 'trunk_link': .1, 'primary_link': .1, 'secondary_link': .09, 'tertiary_link': .08,
    'living_street': .06, 'service': .05, 'pedestrian': .07, 'footway': .025, 'path': .02, 'steps': .025,
}

def fetch(name):
    """分块从 api.openstreetmap.org 下载（每块约 500 m；返回 400 / 509 说明节点太多，自动再切四块）。"""
    raw = os.path.join(OSM, 'raw', name); os.makedirs(raw, exist_ok=True)
    s0, w0, n0, e0 = bbox(name); k = [0]
    def get(s, w, n, e, depth=0):
        url = f'https://api.openstreetmap.org/api/0.6/map?bbox={w:.5f},{s:.5f},{e:.5f},{n:.5f}'
        req = urllib.request.Request(url, headers={'User-Agent': 'tiancheng-map-build/1 (github.com/kcgoofee-jpg/my-tavern-experiments)'})
        try:
            with urllib.request.urlopen(req, timeout=300) as r: data = r.read()
        except urllib.error.HTTPError as ex:
            if ex.code in (400, 509) and depth < 4:
                mn, me = (s + n) / 2, (w + e) / 2
                for a_ in ((s, w, mn, me), (s, me, mn, e), (mn, w, n, me), (mn, me, n, e)): get(*a_, depth + 1)
                return
            raise
        k[0] += 1; open(os.path.join(raw, f'tile{k[0]}.osm'), 'wb').write(data); print(name, 'tile', k[0], len(data) // 1024, 'KB', flush=True)
    step = .0045
    la = s0
    while la < n0:
        lo = w0
        while lo < e0:
            get(la, lo, min(n0, la + step), min(e0, lo + step * 1.2)); lo += step * 1.2
        la += step

def num(v):
    try: return float(str(v).replace('m', '').replace(',', '.').split(';')[0].strip())
    except (ValueError, TypeError): return None

def build(name):
    project = projector(name); R = REGIONS[name]; HALF_W, HALF_H = R['w'] / 200, R['h'] / 200
    RAW = os.path.join(OSM, 'raw', name)
    files = sorted(glob.glob(os.path.join(RAW, '*.osm')))
    if not files: sys.exit(f'没有原始数据：先运行 python3 {sys.argv[0]} fetch {name}（或把 .osm 放进 {RAW}）')
    nodes, ways, rels = {}, {}, {}
    for fn in files:
        for ev, el in ET.iterparse(fn, events=('end',)):
            if el.tag == 'node': nodes[el.get('id')] = (float(el.get('lat')), float(el.get('lon')))
            elif el.tag == 'way':
                ways[el.get('id')] = ([nd.get('ref') for nd in el.findall('nd')], {t.get('k'): t.get('v') for t in el.findall('tag')})
            elif el.tag == 'relation':
                rels[el.get('id')] = ([(m.get('type'), m.get('ref'), m.get('role')) for m in el.findall('member')], {t.get('k'): t.get('v') for t in el.findall('tag')})
            if el.tag in ('way', 'relation'): el.clear()
    print(f'nodes {len(nodes)}, ways {len(ways)}, relations {len(rels)}')
    def line(refs):
        pts = [project(*nodes[r]) for r in refs if r in nodes]
        return pts
    def inside(pts, pad=.5): return any(abs(x) < HALF_W + pad and abs(y) < HALF_H + pad for x, y in pts)
    out = {'credit': CREDIT, 'region': name, 'size_m': [R['w'], R['h']], 'rot': R['rot'], 'roads': [], 'buildings': [], 'parks': [], 'water': [], 'rail': [], 'tanks': [], 'industrial': []}
    used_outer = set()
    for rid, (mem, tags) in rels.items():                      # 多边形关系里的建筑：取外环
        if tags.get('type') == 'multipolygon' and 'building' in tags:
            for t, ref, role in mem:
                if t == 'way' and role == 'outer' and ref in ways:
                    refs, wt = ways[ref]
                    if len(refs) > 3 and refs[0] == refs[-1]:
                        pts = line(refs)
                        if inside(pts): out['buildings'].append({'p': pts[:-1], 'h': num(tags.get('height')), 'lv': num(tags.get('building:levels'))}); used_outer.add(ref)
    for wid, (refs, tags) in ways.items():
        if len(refs) < 2: continue
        closed = refs[0] == refs[-1] and len(refs) > 3
        hw = tags.get('highway')
        if hw in ROAD_W and tags.get('area') != 'yes':
            if tags.get('tunnel') in ('yes', 'building_passage') or tags.get('layer', '0').startswith('-'): continue   # 地下的不画
            pts = line(refs)
            if len(pts) > 1 and inside(pts): out['roads'].append({'c': hw, 'w': ROAD_W[hw], 'p': pts, 'br': 1 if tags.get('bridge') == 'yes' else 0})
        elif 'building' in tags and closed and wid not in used_outer and tags.get('building') not in ('roof',):
            pts = line(refs)
            if inside(pts, 0): out['buildings'].append({'p': pts[:-1], 'h': num(tags.get('height')), 'lv': num(tags.get('building:levels'))})
        elif closed and (tags.get('leisure') in ('park', 'garden', 'pitch', 'playground') or tags.get('landuse') in ('grass', 'recreation_ground', 'village_green')):
            pts = line(refs)
            if inside(pts): out['parks'].append({'p': pts[:-1]})
        elif closed and (tags.get('natural') == 'water' or tags.get('landuse') in ('basin', 'reservoir')):
            pts = line(refs)
            if inside(pts): out['water'].append({'p': pts[:-1]})
        elif closed and tags.get('man_made') in ('storage_tank', 'silo', 'gasometer'):
            pts = line(refs)
            if inside(pts): out['tanks'].append({'p': pts[:-1]})
        elif closed and tags.get('landuse') in ('industrial', 'railway'):
            pts = line(refs)
            if inside(pts): out['industrial'].append({'p': pts[:-1]})
        elif tags.get('railway') in ('rail', 'light_rail') and tags.get('tunnel') != 'yes' and not tags.get('layer', '0').startswith('-'):
            pts = line(refs)
            if len(pts) > 1 and inside(pts): out['rail'].append({'p': pts})
    for k in ('roads', 'buildings', 'parks', 'water', 'rail', 'tanks', 'industrial'): print(name, k, len(out[k]))
    hs = [b for b in out['buildings'] if b['h'] or b['lv']]; print(f'buildings with height/levels: {len(hs)} / {len(out["buildings"])}')
    os.makedirs(OSM, exist_ok=True)
    fn = os.path.join(OSM, f'{name}.json')
    with open(fn, 'w') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', fn, os.path.getsize(fn) // 1024, 'KB')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    names = sys.argv[2:] or list(REGIONS)
    if cmd not in ('fetch', 'build'): sys.exit('用法：python3 blender/tc_osm.py fetch|build [区域 ...]（区域：' + ' '.join(REGIONS) + '）')
    for n in names: (fetch if cmd == 'fetch' else build)(n)
