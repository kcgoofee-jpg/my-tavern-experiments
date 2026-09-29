#!/usr/bin/env python3
"""新建设定包（通用化，docs/generalize/README.md）：在 map/packs/<id>/ 下生成一个能直接打开的最小包。

用法：
  python3 tools/new_pack.py <id> --title 标题 [--title-en EN] [--layers 上城,下城] [--places 3] [--extent 1600x1000] [--no-art] [--force]
  层名是中文时地图 id 为 <id>_l1、<id>_l2…；想要可读的 id，用草稿并给每层写 "id"（例如 "up" → <id>_up）
  python3 tools/new_pack.py <id> ... --from-draft 草稿.json      # 用 tools/draft_pack_from_card.py 的草稿填层与地点

产出（全部是占位，按 docs/generalize/README.md 改成你的设定）：
  manifest.json      清单（map/data/schema/pack.schema.json）
  maps.json          地图注册表：一组 N 层，每层几个地点（maps.schema.json；路径相对包目录）
  <层 id>.json       每层地点坐标（points.schema.json；nx / ny = 0–1 归一化，r = 点击半径）
  events.json        事件分类：3 个大类各 1 个类型、层与地名推断（events.schema.json）
  worldbook.json     世界书附加条目：教模型写地点与事件标签（tools/build_worldbook_addon.py --pack 打包）
  art/<层 id>.dzi    程序生成的占位底图（噪声地形 + 道路，明确标为占位；--no-art 跳过）
生成后自动跑 tools/check_pack.py。打开：map/viewer.html?pack=<id>（本机静态服务器）。只用标准库 + Pillow（画占位图时）。
"""
import argparse, json, os, random, re, subprocess, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID_RE = re.compile(r'^[a-z][a-z0-9_-]{1,31}$')
SAMPLE_EVENTS = {
    'groups': {'市政': '#d9a441', '灾害': '#ff5a2a', '天气': '#7fd6ff'},
    'shapes': {'市政': 'penta', '灾害': 'tri', '天气': 'circle'},
    'types': {'节庆': {'g': '市政', 'ch': '庆', 'src': '镇公所', 'rare': 1},
              '火灾': {'g': '灾害', 'ch': '火', 'src': '巡夜队', 'rare': 2},
              '风暴': {'g': '天气', 'ch': '风', 'src': '港务所', 'rare': 2}},
    'alias': {'集市日': '节庆', '起火': '火灾', '大风': '风暴', 'festival': '节庆', 'fire': '火灾', 'storm': '风暴'},
    'closed': ['结束', '扑灭', '平息', '解除'],
}


def jdump(path, obj):
    with open(path, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, indent=2); f.write('\n')


def slug(s, i):
    t = re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
    return t if re.match(r'^[a-z][a-z0-9_]*$', t or '') else f'p{i + 1}'


def placeholder_art(path, w, h, seed):
    """占位底图：低频噪声地形（草地 / 石地 / 水面）+ 几条道路。不是设定图，只让包能打开、标记有东西可对齐。"""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    rng = np.random.default_rng(seed)
    n = np.zeros((h, w))
    for s, a in ((8, 1.0), (16, .5), (32, .25), (64, .12)):
        g = Image.fromarray((rng.random((max(2, h * s // w), s)) * 255).astype('uint8')).resize((w, h), Image.BICUBIC)
        n += a * np.asarray(g, float) / 255
    n = (n - n.min()) / (n.max() - n.min())
    lo, mid, hi = np.array([46, 74, 88]), np.array([88, 110, 70]), np.array([150, 140, 112])
    t = n[..., None]
    rgb = np.where(t < .35, lo + (mid - lo) * (t / .35), mid + (hi - mid) * ((t - .35) / .65))
    rgb += rng.normal(0, 6, rgb.shape)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img); r = random.Random(seed)
    for k in range(2):   # 两条横穿的缓弯道路（随机游走，不是折线乱画）
        y, pts = h * (.3 + .4 * k) + r.uniform(-h * .08, h * .08), []
        for i in range(13): y += r.uniform(-h * .04, h * .04); pts.append((w * i / 12, y))
        d.line(pts, fill=(196, 184, 150), width=max(3, w // 260), joint='curve')
    d.text((12, h - 24), 'PLACEHOLDER BASE MAP', fill=(230, 230, 230))
    img.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id'); ap.add_argument('--title', required=True); ap.add_argument('--title-en')
    ap.add_argument('--layers', default='Upper,Lower', help='层名，逗号分隔（上到下）')
    ap.add_argument('--places', type=int, default=3, help='每层占位地点数')
    ap.add_argument('--extent', default='1600x1000', help='每层实际尺寸（米）宽x高，也是底图宽高比')
    ap.add_argument('--from-draft', help='tools/draft_pack_from_card.py 产出的草稿（层 / 地点 / 别名）')
    ap.add_argument('--no-art', action='store_true', help='不画占位底图（没装 Pillow / numpy 时用）')
    ap.add_argument('--force', action='store_true', help='目录已存在时覆盖生成的文件（会覆盖你在 <层>.json 里改过的坐标）')
    a = ap.parse_args()
    if not ID_RE.match(a.id) or a.id == 'eden': sys.exit(f'包 id 要是小写字母开头的 2–32 位 a-z0-9_-，且不能是 eden：{a.id!r}')
    d = os.path.join(ROOT, 'map', 'packs', a.id)   # 包只能在 map/packs/<id>（查看器、check_pack、发布脚本都按这里找）
    if os.path.exists(d) and not a.force: sys.exit(f'{d} 已存在（--force 覆盖生成的文件）')
    m = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*', a.extent or '')
    if not m or not float(m[1]) or not float(m[2]): sys.exit(f'--extent 要写成 宽x高（米），例如 1600x1000：{a.extent!r}')
    W, H = float(m[1]), float(m[2])
    if not a.no_art:
        try: import numpy, PIL  # noqa: F401
        except ImportError: sys.exit('画占位底图要 Pillow 与 numpy（pip3 install --user pillow numpy），或加 --no-art 先不画')
    draft = json.load(open(a.from_draft, encoding='utf-8')) if a.from_draft else None
    layers = [(l['name'], l.get('places', []), l.get('id')) for l in draft['layers']] if draft else [(n.strip(), [], None) for n in a.layers.split(',') if n.strip()]
    if not layers: sys.exit('至少一层')
    if any(l[0] == '未分层' for l in layers): print('提醒：草稿里有「未分层」——先把这些地点挪到真正的层里再生成，否则会多出一层叫「未分层」的地图', file=sys.stderr)
    os.makedirs(os.path.join(d, 'art'), exist_ok=True)
    gid = a.id.replace('-', '_')
    maps, ev_layers = {}, []
    for li, (lname, places, lid) in enumerate(layers):
        ls = slug(lid or lname, li)
        mid = f'{gid}_{ls}' if ls != f'p{li + 1}' else f'{gid}_l{li + 1}'
        if not places: places = [{'name': f'{lname} {chr(65 + k)}', 'alias': []} for k in range(a.places)]
        rnd = random.Random(f'{a.id}:{mid}')
        markers, pts = {}, []
        for k, p in enumerate(places):
            pid = slug(p.get('id') or p['name'], k)
            while pid in markers: pid += '_x'
            markers[pid] = {'name': p['name'], 'name_en': p.get('name_en', p['name']), 'tag': 'inf', 'src': p.get('src') or '占位：写这处地点在设定里的出处',
                            'alias': sorted({p['name'], *p.get('alias', [])})}
            pts.append({'id': pid, 'nx': round(.15 + .7 * rnd.random(), 4), 'ny': round(.15 + .7 * rnd.random(), 4), 'r': .03})
        maps[mid] = {'title': f'{a.title} · {lname}', 'title_en': f'{a.title_en or a.title} · {lname}', 'group': gid,
                     'layer': {'name': lname, 'name_en': lname}, 'kind': 'points', 'base': f'art/{mid}.dzi', 'data': f'{mid}.json',
                     'credit': '占位底图（tools/new_pack.py 程序生成）', 'view': {'extent_m': [W, H], 'width_m': W, 'focus': next(iter(markers))}, 'markers': markers}
        jdump(os.path.join(d, f'{mid}.json'), {'extent_m': [W, H], 'markers': pts, 'layer': mid})
        ev_layers.append({'name': lname, 'map': mid, 'match': sorted({m['name'] for m in markers.values()} | {a for m in markers.values() for a in m['alias']})})
        if not a.no_art:
            png = os.path.join(d, 'art', f'{mid}.png'); w = 2048; h = round(w * H / W)
            placeholder_art(png, w, h, zlib.crc32(mid.encode()) & 0xffff)
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'make_dzi.py'), png, os.path.join(d, 'art', mid), '--extent-m', str(W), str(H), '--quality', '78'], check=True)
            os.remove(png)
    first = next(iter(maps))
    jdump(os.path.join(d, 'maps.json'), {'_note': f'设定包 {a.id} 的地图注册表（路径相对本目录）。字段见 map/data/schema/maps.schema.json',
                                         'start': first, 'groups': {gid: {'title': a.title, 'title_en': a.title_en or a.title, 'layers': list(maps)}}, 'maps': maps})
    ev = dict(SAMPLE_EVENTS, layers=ev_layers, region=a.title, tag=f'{a.title}事态')
    jdump(os.path.join(d, 'events.json'), ev)
    lnames = '、'.join(l[0] for l in layers)
    jdump(os.path.join(d, 'worldbook.json'), {'entries': [
        {'name': f'{a.title}·地图联动规范', 'content':
            f'【地图联动】当前地点写成「层·地点」，层是 {lnames} 之一。\n'
            '发生值得上图的事件时，在正文末尾加一行隐藏标签：<span style="display:none">⌖类别｜层·地点｜等级｜一句话｜发布方</span>\n'
            f'类别用：{"、".join(SAMPLE_EVENTS["types"])}；等级 1–3，0 = 已平息。每楼最多 3 条，不要照抄本条示例。'}]})
    jdump(os.path.join(d, 'manifest.json'), {'$schema': '../../data/schema/pack.schema.json', 'id': a.id, 'schema': 1, 'title': a.title, 'title_en': a.title_en or a.title,
                                             'data': {'maps': 'maps.json', 'events': 'events.json', 'worldbook': 'worldbook.json'}, 'theme': {'accent': '#63b4be'},
                                             **({'vars': draft['vars']} if draft and draft.get('vars') else {})})
    print(f'写入 {d}（{len(maps)} 层，{sum(len(m["markers"]) for m in maps.values())} 个地点）')
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'check_pack.py'), a.id], cwd=ROOT)
    sys.exit(r.returncode)


if __name__ == '__main__':
    main()
