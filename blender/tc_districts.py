#!/usr/bin/env python3
# 天城分城区拼接：每个城区取一块真实城市的 OSM 肌理，裁到城区多边形里，交界处加一条环路盖住拼缝。
# 数据 © OpenStreetMap contributors，ODbL 1.0。天城是虚构城市：各取材区整体旋转 90°（北 → +x），不保留任何名称。
#
# 用法：
#   python3 blender/tc_districts.py fetch [来源…]   # 下载原始 .osm 到 blender/data/osm/raw/<来源>/（不进 git）
#   python3 blender/tc_districts.py build           # → blender/data/osm/city_mid.json、city_low.json（进 git）
# 城区划分（平面坐标，1 单位 = 100 m，x ∈ [-15, 15]、y ∈ [-9.375, 9.375]）：
#   中层：核心与高区（执法局总局—辉光大教堂—圣铁摇篮一带）= 曼哈顿中城；外围居住 = 布鲁克林；
#         商业区西半 = 新宿，东半 = 九龙旺角（原 city.json）。
#   下层：南缘与东缘工业带 = 鲁尔区杜伊斯堡；执法局下层分局一带 = 九龙深水埗（高密旧楼）；其余贫民窟 = 九龙城—土瓜湾（代城中村）。
import json, math, os, sys, time, random, urllib.request, urllib.error
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OSM = os.path.join(HERE, 'data', 'osm')
RAW = os.path.join(OSM, 'raw')
HALF_W, HALF_H = 15.0, 9.375
CREDIT = '© OpenStreetMap contributors (ODbL)'

# 取材区：中心经纬度；范围固定为南北 3 km × 东西 1.875 km（旋转后正好铺满平面）。hdef 为缺高度时的默认层高区间（米）。
SOURCES = {
    'kowloon':   dict(c=(22.3170, 114.1686), hdef=(45, 75)),     # 油麻地—旺角（原 city.json 的取材区）
    'manhattan': dict(c=(40.7549, -73.9840), hdef=(60, 180)),    # 中城：时代广场—中央车站一带
    'shinjuku':  dict(c=(35.6938, 139.7034), hdef=(20, 50)),     # 新宿站东西口
    'brooklyn':  dict(c=(40.6745, -73.9870), hdef=(9, 15)),      # 公园坡—哥瓦纳斯：联排住宅 + 运河旧仓库
    'village':   dict(c=(22.3240, 114.1880), hdef=(18, 36)),     # 九龙城—土瓜湾：九龙寨城原址周边的高密旧楼（深圳城中村在 OSM 上建筑太稀，弃用）
    'ssp':       dict(c=(22.3300, 114.1620), hdef=(25, 45)),     # 九龙深水埗：旧唐楼高密街区
    'ruhr':      dict(c=(51.4930, 6.7400), hdef=(12, 30)),       # 杜伊斯堡：钢厂、港口、货运铁路
}
ROAD_W = {
    'motorway': .26, 'trunk': .24, 'primary': .2, 'secondary': .16, 'tertiary': .13, 'unclassified': .09, 'residential': .09,
    'motorway_link': .1, 'trunk_link': .1, 'primary_link': .1, 'secondary_link': .09, 'tertiary_link': .08,
    'living_street': .06, 'service': .05, 'pedestrian': .07, 'footway': .025, 'path': .02, 'steps': .025,
}

def ell(x, y, cx, cy, a, b): return ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2
# 每层：城区函数 (x, y) → 来源名；SEAMS 为交界环路（椭圆 cx, cy, a, b），路网在这里断开、由环路接上。
def mid_zone(x, y):
    if ell(x, y, 3.5, 3.8, 9.5, 5.2) < 1: return 'manhattan'
    if ell(x, y, 0, 0, 13.2, 8.2) > 1: return 'brooklyn'
    return 'shinjuku' if x < -1 else 'kowloon'
def low_zone(x, y):
    if y < -3.8 + .25 * x or x > 10.5: return 'ruhr'
    if ell(x, y, -1.8, 3.1, 3.4, 2.6) < 1: return 'ssp'
    return 'village'
LAYERS = {
    'mid': dict(zone=mid_zone, seams=[('ell', 3.5, 3.8, 9.5, 5.2), ('ell', 0, 0, 13.2, 8.2), ('line', -1, -20, -1, 20)]),
    'low': dict(zone=low_zone, seams=[('line', -20, -8.8, 20, 1.2), ('line', 10.5, -20, 10.5, 20), ('ell', -1.8, 3.1, 3.4, 2.6)]),
}
FEATHER = .6          # 交界两侧 60 m 内的建筑按距离随机剔除，密度渐变

def box(src):
    la, lo = SOURCES[src]['c']; dla = 1500 / 110574; dlo = 937.5 / (111320 * math.cos(math.radians(la)))
    return la - dla, la + dla, lo - dlo, lo + dlo

def get(url, out):
    req = urllib.request.Request(url, headers={'User-Agent': 'tiancheng-map-build/1 (github.com/kcgoofee-jpg/my-tavern-experiments)'})
    with urllib.request.urlopen(req, timeout=300) as r, open(out, 'wb') as f: f.write(r.read())

def fetch_box(src, la0, la1, lo0, lo1, tag, depth=0):
    out = os.path.join(RAW, src, f'{tag}.osm')
    if os.path.exists(out) and os.path.getsize(out) > 1000: return
    url = f'https://api.openstreetmap.org/api/0.6/map?bbox={lo0:.5f},{la0:.5f},{lo1:.5f},{la1:.5f}'
    try:
        print('fetch', src, tag, flush=True); get(url, out)
    except urllib.error.HTTPError as e:
        if e.code in (400, 509) and depth < 3:             # 节点太多：切四块再下
            print('  split', e.code); lm, om = (la0 + la1) / 2, (lo0 + lo1) / 2
            for i, (a, b, c, d) in enumerate(((la0, lm, lo0, om), (la0, lm, om, lo1), (lm, la1, lo0, om), (lm, la1, om, lo1))):
                fetch_box(src, a, b, c, d, f'{tag}_{i}', depth + 1)
        elif e.code == 429 and depth < 6: time.sleep(30); fetch_box(src, la0, la1, lo0, lo1, tag, depth + 1)
        else: raise

def fetch(names):
    for src in names or [s for s in SOURCES if s != 'kowloon']:
        os.makedirs(os.path.join(RAW, src), exist_ok=True)
        S, N, W, E = box(src)
        for i in range(4):
            for j in range(2):
                fetch_box(src, S + (N - S) * i / 4, S + (N - S) * (i + 1) / 4, W + (E - W) * j / 2, W + (E - W) * (j + 1) / 2, f't{i}{j}')

def num(v):
    try: return float(str(v).replace('m', '').replace(',', '.').split(';')[0].strip())
    except (ValueError, TypeError): return None

def parse(src):
    """一个取材区 → 平面坐标下的 roads / buildings / parks / water / rail（与 tc_osm.build 同一套规则）。"""
    import glob
    la0, lo0 = SOURCES[src]['c']; MY = 110574.0; MX = 111320.0 * math.cos(math.radians(la0))
    def project(lat, lon): e = (lon - lo0) * MX / 100; n = (lat - la0) * MY / 100; return (round(n, 3), round(-e, 3))
    nodes, ways, rels = {}, {}, {}
    for fn in sorted(glob.glob(os.path.join(RAW, src, '*.osm'))):
        for ev, el in ET.iterparse(fn, events=('end',)):
            if el.tag == 'node': nodes[el.get('id')] = (float(el.get('lat')), float(el.get('lon')))
            elif el.tag == 'way': ways[el.get('id')] = ([nd.get('ref') for nd in el.findall('nd')], {t.get('k'): t.get('v') for t in el.findall('tag')})
            elif el.tag == 'relation': rels[el.get('id')] = ([(m.get('type'), m.get('ref'), m.get('role')) for m in el.findall('member')], {t.get('k'): t.get('v') for t in el.findall('tag')})
            if el.tag in ('way', 'relation'): el.clear()
    line = lambda refs: [project(*nodes[r]) for r in refs if r in nodes]
    out = {k: [] for k in ('roads', 'buildings', 'parks', 'water', 'rail', 'industrial')}
    used = set()
    for mem, tags in rels.values():
        if tags.get('type') == 'multipolygon' and 'building' in tags:
            for t, ref, role in mem:
                if t == 'way' and role == 'outer' and ref in ways and len(ways[ref][0]) > 3 and ways[ref][0][0] == ways[ref][0][-1]:
                    out['buildings'].append({'p': line(ways[ref][0])[:-1], 'h': num(tags.get('height')), 'lv': num(tags.get('building:levels')), 'k': tags.get('building')}); used.add(ref)
    for wid, (refs, tags) in ways.items():
        if len(refs) < 2: continue
        closed = refs[0] == refs[-1] and len(refs) > 3
        hw = tags.get('highway')
        if hw in ROAD_W and tags.get('area') != 'yes':
            if tags.get('tunnel') in ('yes', 'building_passage') or tags.get('layer', '0').startswith('-'): continue
            out['roads'].append({'c': hw, 'w': ROAD_W[hw], 'p': line(refs), 'br': 1 if tags.get('bridge') == 'yes' else 0})
        elif 'building' in tags and closed and wid not in used and tags.get('building') != 'roof':
            out['buildings'].append({'p': line(refs)[:-1], 'h': num(tags.get('height')), 'lv': num(tags.get('building:levels')), 'k': tags.get('building')})
        elif closed and (tags.get('leisure') in ('park', 'garden', 'pitch', 'playground') or tags.get('landuse') in ('grass', 'recreation_ground', 'village_green', 'cemetery')):
            out['parks'].append({'p': line(refs)[:-1]})
        elif closed and (tags.get('natural') == 'water' or tags.get('landuse') in ('basin', 'reservoir') or tags.get('waterway') in ('canal', 'dock', 'riverbank')):
            out['water'].append({'p': line(refs)[:-1]})
        elif closed and tags.get('landuse') in ('industrial', 'railway', 'port'):
            out['industrial'].append({'p': line(refs)[:-1]})
        elif tags.get('railway') in ('rail', 'light_rail') and tags.get('tunnel') != 'yes' and not tags.get('layer', '0').startswith('-'):
            out['rail'].append({'p': line(refs)})
    print(src, {k: len(v) for k, v in out.items()}, 'with height:', sum(1 for b in out['buildings'] if b['h'] or b['lv']), flush=True)
    return out

def seam_dist(x, y, seams):
    d = 1e9
    for s in seams:
        if s[0] == 'ell':
            _, cx, cy, a, b = s; r = math.sqrt(ell(x, y, cx, cy, a, b)); d = min(d, abs(r - 1) * min(a, b))
        else:
            _, x0, y0, x1, y1 = s; dx, dy = x1 - x0, y1 - y0; d = min(d, abs(dx * (y - y0) - dy * (x - x0)) / math.hypot(dx, dy))
    return d

def seam_roads(seams):
    """交界环路：沿每条缝画一条主干道（宽 20 m），裁到平面内。"""
    R = []
    for s in seams:
        if s[0] == 'ell':
            _, cx, cy, a, b = s; pts = [(cx + a * math.cos(t), cy + b * math.sin(t)) for t in [i * 2 * math.pi / 160 for i in range(161)]]
        else:
            _, x0, y0, x1, y1 = s; pts = [(x0 + (x1 - x0) * i / 200, y0 + (y1 - y0) * i / 200) for i in range(201)]
        run = []
        for x, y in pts:
            if abs(x) <= HALF_W + .3 and abs(y) <= HALF_H + .3: run.append((round(x, 3), round(y, 3)))
            elif len(run) > 1: R.append(run); run = []
            else: run = []
        if len(run) > 1: R.append(run)
    return [{'c': 'primary', 'w': .2, 'p': r, 'br': 0} for r in R]

def build():
    random.seed(7)
    cache = {}
    for layer, L in LAYERS.items():
        zone, seams = L['zone'], L['seams']
        need = sorted({zone(x / 2, y / 2) for x in range(-30, 31) for y in range(-19, 20)})
        out = {'credit': CREDIT, 'source': 'OpenStreetMap: ' + ', '.join(need) + ' (rotated 90°, names removed)', 'zones': need,
               'roads': seam_roads(seams), 'buildings': [], 'parks': [], 'water': [], 'rail': [], 'industrial': []}
        for src in need:
            if src not in cache: cache[src] = parse(src)
            d = cache[src]; hdef = SOURCES[src]['hdef']
            inz = lambda x, y: zone(x, y) == src and abs(x) <= HALF_W + .3 and abs(y) <= HALF_H + .3
            for b in d['buildings']:
                P = b['p']
                if len(P) < 3 or not all(inz(x, y) for x, y in P): continue
                A = abs(sum(P[i][0] * P[i - 1][1] - P[i - 1][0] * P[i][1] for i in range(len(P)))) / 2
                if A > 3 and src != 'ruhr': continue              # 超过 3 公顷的整块（车站、综合体外轮廓）俯视像一块平板，剔除
                cx = sum(p[0] for p in P) / len(P); cy = sum(p[1] for p in P) / len(P)
                sd = seam_dist(cx, cy, seams)
                if sd < .15 or (sd < FEATHER and random.random() > (sd - .15) / (FEATHER - .15)): continue
                out['buildings'].append({'p': P, 'h': b['h'], 'lv': b['lv'], 'z': src, 'hd': hdef, 'k': b['k']})
            for r in d['roads']:                                  # 按城区切段，离缝 15 m 内的点丢掉（让位给环路）
                run = []
                for x, y in r['p']:
                    if inz(x, y) and seam_dist(x, y, seams) > .12: run.append((x, y))
                    else:
                        if len(run) > 1: out['roads'].append({**r, 'p': run})
                        run = []
                if len(run) > 1: out['roads'].append({**r, 'p': run})
            for k in ('parks', 'water', 'industrial'):
                for p in d[k]:
                    if len(p['p']) > 2 and all(inz(x, y) for x, y in p['p']): out[k].append({'p': p['p'], 'z': src})
            for r in d['rail']:
                run = []
                for x, y in r['p']:
                    if inz(x, y): run.append((x, y))
                    else:
                        if len(run) > 1: out['rail'].append({'p': run})
                        run = []
                if len(run) > 1: out['rail'].append({'p': run})
        fn = os.path.join(OSM, f'city_{layer}.json')
        with open(fn, 'w') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        print(layer, {k: len(out[k]) for k in ('roads', 'buildings', 'parks', 'water', 'rail', 'industrial')}, os.path.getsize(fn) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch': fetch(sys.argv[2:])
    elif cmd == 'build': build()
    else: sys.exit('用法：tc_districts.py fetch [来源…] | build')
