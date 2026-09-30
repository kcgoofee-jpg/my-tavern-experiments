#!/usr/bin/env python3
"""上层 v16 排岛（R-LAYOUT，用户 2026-10-01：伊甸必须在上层地图正中、明显最大；其余岛更小、拉开距离、互不相像）。

不跑 Blender：岛的「画出尺寸」直接从当前上层底图量（map/art/tc_upper_files 第 12 级 = 4000 px 拼回整图），
伊甸用 estate2 的地图抠图（--eden-cut，缺省时同样从底图抠）。三个方案都把伊甸放在 30 × 18.75 画幅正中，
其余八座（含银冠堡；以太气候调节塔跟着银冠堡后缘走）按海拔与设定摆（docs/upper-setting.md §1 两条轴、§2 海拔表），
再做一次松弛：岛缘间距 ≥ GAP、离画框 ≥ MARGIN，伊甸不动。

用法（仓库根目录）：
  python3 tools/upper_layout_v16.py layouts                      写 blender/data/layouts/tc_islands_v16_{A,B,C}.json
  python3 tools/upper_layout_v16.py preview --out DIR [--eden-cut PNG]
      DIR/{current,A,B,C}.png（2000 px）：把各岛从底图抠下，补云后按新岛心贴回，画标记与虚线巡逻圈
只读 map/ 与 blender/data/，不写岛表；选定后的落地（改岛表、移标记 / 锚点 / 航线、世界书）是 T3 的事。
"""
import argparse, copy, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_U, H_U = 30.0, 18.75            # 画幅（单位 = 100 m）
PX = 4000                         # 工作分辨率（DZI 第 12 级）
S = PX / W_U                      # 每单位像素
GAP, GAP_EDEN, MARGIN = 1.1, 1.5, 0.45
NO_CUTOUT = ('isle25',)           # 精英学院：底图正中那块其实是旧版伊甸（eden_hi 插图框未随 v15 移走），本岛还没有俯视图 → 中性椭圆
TOWER_OFF = (2.0, 1.2)            # 以太气候调节塔相对银冠堡岛心（tc_islands.json anchors：立在银冠堡后缘）
ALT = {'eden': 1450, 'isle10': 1360, 'isle6': 1300, 'isle30': 1250, 'isle25': 1180,
       'isle9': 1080, 'isle4': 960, 'isle5': 880, 'silver_crown': 820}          # upper-setting.md §2 海拔表

# 种子岛心（单位；+y 北）。松弛只做微调，方案的性格在这里。
SEEDS = {
    'A': {   # 同心两环：高而常被看见的四家围在伊甸四角，低的、隐秘的退到画框四边
        'isle10': (-8.6, 5.2), 'isle6': (8.4, 5.4), 'isle30': (8.6, -5.0), 'isle25': (-10.0, -4.2),
        'isle9': (0.6, 7.0), 'isle4': (13.0, 0.4), 'isle5': (-13.0, 1.4), 'silver_crown': (1.6, -7.4),
    },
    'B': {   # 前庭航道：伊甸南侧停靠平台正对画幅下缘的银冠堡升降井，南面留空作进场空域；其余五家成马蹄形环抱北、东、西
        'isle10': (-7.4, 5.8), 'isle6': (7.6, 5.8), 'isle30': (10.2, -1.0), 'isle25': (-10.4, -1.2),
        'isle9': (0.0, 7.3), 'isle4': (12.6, 6.6), 'isle5': (-13.1, 6.9), 'silver_crown': (-1.0, -7.4),
    },
    'C': {   # 黄金角螺旋：从伊甸向外按海拔一圈圈放远（137.5° 递进），疏密不均；「Y」与维克多沉到对角远处
        'isle10': None, 'isle6': None, 'isle30': None, 'isle25': None,
        'isle9': None, 'isle4': None, 'isle5': None, 'silver_crown': None,
    },
}
TEXT = {
    'A': 'v16 A 同心两环：伊甸正中；凯莉 / 首相府 / 罗斯柴尔德 / 精英学院围在四角（高、近、常被看见），联盟会所 / 维克多 / 「Y」/ 银冠堡退到四边（低、远）',
    'B': 'v16 B 前庭航道：伊甸正中，南侧停靠平台正对下缘的银冠堡升降井，南面留空作进场空域；其余岛马蹄形环抱北、东、西，越低越往外角',
    'C': 'v16 C 黄金角螺旋：伊甸正中，其余岛按海拔从高到低沿 137.5° 螺旋向外，距离即隐秘度；「Y」、维克多沉到对角',
}


def load(rel):
    return json.load(open(os.path.join(ROOT, rel), encoding='utf-8'))


def base_image():
    """map/art/tc_upper_files/12 拼回 4000 × 2500（瓦片 512，重叠 1）。"""
    d = os.path.join(ROOT, 'map/art/tc_upper_files/12'); im = Image.new('RGB', (PX, round(PX * H_U / W_U)))
    for f in os.listdir(d):
        c, r = (int(v) for v in f.split('.')[0].split('_'))
        im.paste(Image.open(os.path.join(d, f)).convert('RGB'), (c * 512 - (1 if c else 0), r * 512 - (1 if r else 0)))
    return im


def to_px(x, y):
    return (x / W_U + .5) * PX, (.5 - y / H_U) * PX * H_U / W_U


def flood(small, seed_xy, R=240):
    """在 1/4 尺度掩膜内、种子周围 R 格的窗口里做测地膨胀（每步 7 格），返回 4000 px 尺度的连通块。"""
    x, y = int(seed_xy[0] / 4), int(seed_xy[1] / 4); x0, y0 = max(0, x - R), max(0, y - R)
    m = small[y0:y + R, x0:x + R]; cur = np.zeros_like(m); cur[y - y0 - 3:y - y0 + 4, x - x0 - 3:x - x0 + 4] = True; cur &= m
    for _ in range(400):
        nxt = (np.asarray(Image.fromarray(cur.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0) & m
        if (nxt == cur).all(): break
        cur = nxt
    full = np.zeros((small.shape[0] * 4, small.shape[1] * 4), bool)
    full[y0 * 4:(y0 + m.shape[0]) * 4, x0 * 4:(x0 + m.shape[1]) * 4] = np.kron(cur, np.ones((4, 4), bool))
    return full


def sprites(base, eden_cut=''):
    """各岛从底图抠下的 RGBA 精灵：{id: (img, 左上相对岛心的偏移 px)}，外加 _tower。"""
    a = np.asarray(base, np.float32); luma = .299 * a[..., 0] + .587 * a[..., 1] + .114 * a[..., 2]; sat = a.max(-1) - a.min(-1)
    core = Image.fromarray(((luma < 205) | (sat > 40)).astype(np.uint8) * 255)
    core = np.asarray(core.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
                      .filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)))
    small = np.asarray(Image.fromarray(core).resize((core.shape[1] // 4, core.shape[0] // 4), Image.BOX)) > 60; core = core > 0
    up = load('map/data/tc_upper.json'); H = base.height
    seeds = {i['id']: (i['nx'] * PX, i['ny'] * H) for i in up['islands']}
    tw = next(m for m in up['markers'] if m['id'] == 'climate_tower'); seeds['_tower'] = (tw['nx'] * PX, tw['ny'] * H)
    out, hole = {}, np.zeros(core.shape, bool)
    for iid, (sx, sy) in seeds.items():
        comp = flood(small, (sx, sy), 330 if iid in ('eden', 'isle25') else 160)
        ys, xs = np.nonzero(comp); P_ = 110
        x0, y0, x1, y1 = max(0, xs.min() - P_), max(0, ys.min() - P_), min(comp.shape[1], xs.max() + P_), min(comp.shape[0], ys.max() + P_)
        grow = lambda im, r: im.filter(ImageFilter.GaussianBlur(r)).point(lambda v: 255 if v > 3 else 0)   # 近似膨胀 ≈ 2r px
        al = grow(Image.fromarray(comp[y0:y1, x0:x1].astype(np.uint8) * 255), 5).filter(ImageFilter.GaussianBlur(6))
        hole[y0:y1, x0:x1] |= np.asarray(grow(al, 22)) > 0
        bb = al.getbbox(); rgba = base.crop((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3])).convert('RGBA'); rgba.putalpha(al.crop(bb))
        out[iid] = (rgba, (x0 + bb[0] - sx, y0 + bb[1] - sy))
    sys.path.insert(0, os.path.join(ROOT, 'blender')); import depth as DP
    isl = {i['id']: i for i in load('blender/data/tc_islands.json')['islands']}
    for iid in NO_CUTOUT:
        a_, b_ = 1.80 * S, 1.47 * S     # 占位面积落在凯莉（2.51）与罗斯柴尔德（2.79）之间：1180 m 的中档岛，不与任何岛同大
        w, h = round(2 * a_), round(2 * b_); e = Image.new('L', (w, h), 0)
        ImageDraw.Draw(e).rounded_rectangle([12, 12, w - 12, h - 12], radius=round(b_ * .55), fill=255); e = e.filter(ImageFilter.GaussianBlur(5))
        rim = Image.new('L', (w, h), 0); ImageDraw.Draw(rim).rounded_rectangle([12, 12, w - 12, h - 12], radius=round(b_ * .55), outline=255, width=10)
        img = Image.composite(Image.new('RGB', (w, h), (150, 146, 138)), Image.new('RGB', (w, h), (196, 192, 182)), rim.filter(ImageFilter.GaussianBlur(3))).convert('RGBA')
        img.putalpha(e); out[iid] = (img, (-w / 2, -h / 2))
    if eden_cut and os.path.exists(eden_cut):     # estate2 抠图：750 m 画幅 × 纵深缩放（与 tools/eden_into_upper.py 同一换算）
        cut = Image.open(eden_cut).convert('RGBA'); k = 750.0 * DP.island('eden', DP.load())['scale'] / cut.width / (W_U * 100 / PX)
        cut = cut.resize((round(cut.width * k), round(cut.height * k)), Image.LANCZOS)
        out['eden'] = (cut.crop(cut.getbbox()), (cut.getbbox()[0] - cut.width / 2, cut.getbbox()[1] - cut.height / 2))
    return out, hole


def clouds_only(base, hole):
    """挖掉所有岛，用平移过来的云纹补洞（云是低频团块，羽化后看不出接缝）。"""
    a = np.asarray(base, np.float32); H, W = hole.shape; fill = a.copy(); todo = hole.copy()
    for dx, dy in [(1500, 0), (-1500, 0), (0, -1200), (0, 1200), (1500, -1200), (-1500, -1200), (2300, 0), (-2300, 0),
                   (800, -1300), (-800, -1300), (1500, 1200), (-1500, 1200), (2600, -900), (-2600, -900), (3000, 0), (-3000, 0)]:
        ys, xs = np.nonzero(todo); sx, sy = xs + dx, ys + dy
        ok = (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
        ok[ok] &= ~hole[sy[ok], sx[ok]]
        fill[ys[ok], xs[ok]] = a[sy[ok], sx[ok]]; todo[ys[ok], xs[ok]] = False
    if todo.any(): fill[todo] = np.median(a[~hole], axis=0)
    soft = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(20)), np.float32)[..., None] / 255
    return Image.fromarray((a * (1 - soft) + fill * soft).astype(np.uint8))


def extents(sp):
    """精灵半宽 / 半高（单位）与相对岛心的偏心，用于松弛与画框检查。"""
    ext = {}
    for iid, (img, (ox, oy)) in sp.items():
        if iid == '_tower': continue
        hw, hh = img.width / 2 / S, img.height / 2 / S
        ext[iid] = (round(hw, 3), round(hh, 3), round((ox / S + hw), 3), round(-(oy / S + hh), 3))   # a, b, 偏心 ex, ey（+y 北）
    return ext


def r_dir(e, th):
    a, b = e[0], e[1]
    return a * b / math.hypot(b * math.cos(th), a * math.sin(th))


def spiral(ext):
    order = sorted((i for i in ALT if i != 'eden'), key=lambda i: -ALT[i]); P = {}
    for k, iid in enumerate(order):
        th = math.radians(62) + k * math.radians(137.508); r = 6.4 + 1.05 * k
        P[iid] = (math.cos(th) * r * 1.45, math.sin(th) * r * .82)
    return P


def relax(P, ext):
    P = {k: list(v) for k, v in P.items()}; P['eden'] = [0.0, 0.0]
    tw = {'_tower': (.45, .45, 0, 0)}
    for it in range(2000):
        moved = False
        pts = dict(P); pts['_tower'] = [P['silver_crown'][0] + TOWER_OFF[0], P['silver_crown'][1] + TOWER_OFF[1]]
        E = dict(ext, **tw)
        cen = {k: (v[0] + E[k][2], v[1] + E[k][3]) for k, v in pts.items()}
        for a in P:
            if a == 'eden': continue
            for b in cen:
                if b == a or (a == 'silver_crown' and b == '_tower'): continue
                dx, dy = cen[a][0] - cen[b][0], cen[a][1] - cen[b][1]; d = math.hypot(dx, dy) or 1e-3; th = math.atan2(dy, dx)
                need = r_dir(E[a], th) + r_dir(E[b], th) + (GAP_EDEN if 'eden' in (a, b) else GAP)
                if d < need:
                    k = (need - d) * (1.0 if b in ('eden', '_tower') else .5) + 1e-3
                    P[a][0] += dx / d * k; P[a][1] += dy / d * k; moved = True
            hw, hh, ex, ey = E[a]
            lo_x, hi_x = -W_U / 2 + MARGIN + hw - ex, W_U / 2 - MARGIN - hw - ex
            lo_y, hi_y = -H_U / 2 + MARGIN + hh - ey, H_U / 2 - MARGIN - hh - ey
            if a == 'silver_crown': hi_x = min(hi_x, W_U / 2 - MARGIN - .45 - TOWER_OFF[0]); hi_y = min(hi_y, H_U / 2 - MARGIN - .45 - TOWER_OFF[1])
            cx_, cy_ = min(hi_x, max(lo_x, P[a][0])), min(hi_y, max(lo_y, P[a][1]))
            if (cx_, cy_) != tuple(P[a]): moved = True
            P[a][0], P[a][1] = cx_, cy_
        if not moved: break
    return {k: (round(v[0], 3), round(v[1], 3)) for k, v in P.items()}, it


def check(P, ext):
    """最小岛缘间距（中心线方向的椭圆近似）、是否全在画框内（含边距）、伊甸是否居中且最大。"""
    E = dict(ext); issues, gaps = [], []
    ids = list(P)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ca = (P[a][0] + E[a][2], P[a][1] + E[a][3]); cb = (P[b][0] + E[b][2], P[b][1] + E[b][3])
            th = math.atan2(cb[1] - ca[1], cb[0] - ca[0])
            g = math.hypot(cb[0] - ca[0], cb[1] - ca[1]) - r_dir(E[a], th) - r_dir(E[b], th); gaps.append((round(g, 2), a, b))
            if g < GAP - .05: issues.append('gap %s-%s %.2f' % (a, b, g))
        hw, hh, ex, ey = E[a]; x, y = P[a][0] + ex, P[a][1] + ey
        if abs(x) + hw > W_U / 2 - MARGIN + .01 or abs(y) + hh > H_U / 2 - MARGIN + .01: issues.append('frame ' + a)
    area = {k: E[k][0] * E[k][1] for k in E}
    if max(area, key=area.get) != 'eden': issues.append('eden not largest')
    av = sorted(area.values())
    if min(b - a for a, b in zip(av, av[1:])) < .06: issues.append('two islands the same size')
    return issues, min(gaps)


def write_layouts(ext):
    src = load('blender/data/tc_islands.json'); res = {}
    for k in 'ABC':
        seed = spiral(ext) if k == 'C' else SEEDS[k]
        P, it = relax(seed, ext); issues, g = check(P, ext)
        D = copy.deepcopy(src)
        for isl in D['islands']: isl['x'], isl['y'] = P[isl['id']]
        sc = P['silver_crown']
        D['anchors']['climate_tower']['x'], D['anchors']['climate_tower']['y'] = round(sc[0] + TOWER_OFF[0], 3), round(sc[1] + TOWER_OFF[1], 3)
        D['_layout'] = '%s（2026-10-01，tools/upper_layout_v16.py，松弛 %d 轮；最小岛缘间距 %.2f 单位）' % (TEXT[k], it, g[0])
        D['_sprite_extent'] = {i: list(v) for i, v in ext.items()}
        fn = os.path.join(ROOT, 'blender/data/layouts/tc_islands_v16_%s.json' % k)
        open(fn, 'w', encoding='utf-8').write(json.dumps(D, ensure_ascii=False, indent=1) + '\n')
        print(k, 'relax', it, 'min gap', g, 'issues', issues or 'none'); res[k] = P
    return res


def font(sz):
    for f in ('/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc'):
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def route_pts(r, P, old, H):
    """巡逻环（from = to）整体跟那座岛平移；跨岛的 patrol_city 改成绕伊甸、按方位角依次经过其余岛心的平滑闭环（旧线跟旧布局走，逐点平移会乱）。"""
    if r['kind'] == 'patrol':
        dx, dy = (P[r['from']][0] - old[r['from']][0]) / W_U * PX, -(P[r['from']][1] - old[r['from']][1]) / H_U * H
        return [(x * PX + dx, y * H + dy) for x, y in r['pts']]
    ring = sorted((i for i in P if i != 'eden'), key=lambda i: math.atan2(P[i][1], P[i][0]))
    c = [to_px(*P[i]) for i in ring]; n = len(c); out = []
    for k in range(n):                                    # 闭合 Catmull-Rom
        p0, p1, p2, p3 = c[k - 1], c[k], c[(k + 1) % n], c[(k + 2) % n]
        for t in (j_ / 12 for j_ in range(12)):
            out.append(tuple(.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t
                                   + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t ** 3) for d in (0, 1)))
    return out + out[:1]


def dashed(dr, pts, col, on=34, off=18):
    """沿整条折线连续计相位的虚线。"""
    pos = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0) or 1e-6; t = 0.0
        while t < L:
            ph = (pos + t) % (on + off); step = min((on if ph < on else on + off) - ph, L - t)
            if ph < on: dr.line([(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L), (x0 + (x1 - x0) * (t + step) / L, y0 + (y1 - y0) * (t + step) / L)], fill=col, width=6)
            t += step
        pos += L


def overlay(im, P, old):
    """标记（岛心）与银冠堡巡逻虚线圈，按岛心平移。im 为 4000 px 工作图。"""
    up = load('map/data/tc_upper.json'); mk = load('map/data/maps.json')['maps']['tc_upper']['markers']
    dr = ImageDraw.Draw(im, 'RGBA'); H = im.height; f = font(40)
    for r in up.get('routes', []):
        pts = route_pts(r, P, old, H) if P is not old else [(x * PX, y * H) for x, y in r['pts']]
        dashed(dr, pts, (70, 90, 140, 200) if r['kind'] == 'patrol' else (70, 90, 140, 120))
    for m in up['markers']:
        iid = 'silver_crown' if m['id'] == 'climate_tower' else (mk.get(m['id'], {}).get('island') or m['id'])
        if iid not in P: iid = next(i['id'] for i in load('blender/data/tc_islands.json')['islands'] if i.get('marker') == m['id'])
        if m['id'] == 'climate_tower': x, y = to_px(P[iid][0] + TOWER_OFF[0], P[iid][1] + TOWER_OFF[1])
        else: x, y = to_px(*P[iid])
        rr = 26 if m['id'] == 'eden' else 16
        dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(200, 60, 40, 235) if m['id'] == 'eden' else (40, 60, 110, 230), outline=(255, 255, 255, 255), width=5)
        name = mk.get(m['id'], {}).get('name', m['id']) + ('（待渲）' if iid in NO_CUTOUT and P is not old else '')
        tw_ = dr.textlength(name, font=f); dr.rounded_rectangle([x - tw_ / 2 - 10, y + rr + 6, x + tw_ / 2 + 10, y + rr + 58], 10, fill=(255, 255, 255, 215))
        dr.text((x - tw_ / 2, y + rr + 10), name, font=f, fill=(30, 30, 40, 255))


def preview(out, eden_cut):
    os.makedirs(out, exist_ok=True)
    base = base_image(); sp, hole = sprites(base, eden_cut); ext = extents(sp)
    cur = {i['id']: (i['x'], i['y']) for i in load('blender/data/tc_islands.json')['islands']}
    im = base.copy(); overlay(im, cur, cur); im.resize((2000, 1250), Image.LANCZOS).save(os.path.join(out, 'current.png'))
    bg = clouds_only(base, hole)
    for k in 'ABC':
        L = load('blender/data/layouts/tc_islands_v16_%s.json' % k); P = {i['id']: (i['x'], i['y']) for i in L['islands']}
        im = bg.convert('RGBA')
        for iid, (img, (ox, oy)) in sorted(sp.items(), key=lambda kv: -ALT.get(kv[0], 0)):
            if iid == '_tower': x, y = to_px(P['silver_crown'][0] + TOWER_OFF[0], P['silver_crown'][1] + TOWER_OFF[1])
            else: x, y = to_px(*P[iid])
            im.alpha_composite(img, (round(x + ox), round(y + oy)))
        im = im.convert('RGB'); overlay(im, P, cur)
        im.resize((2000, 1250), Image.LANCZOS).save(os.path.join(out, k + '.png')); print('wrote', os.path.join(out, k + '.png'))


def main():
    p = argparse.ArgumentParser(); p.add_argument('cmd', choices=['layouts', 'preview', 'extents'])
    p.add_argument('--out', default=''); p.add_argument('--eden-cut', default='')
    a = p.parse_args()
    if a.cmd == 'preview': return preview(a.out or '.', a.eden_cut)
    sp, _ = sprites(base_image(), a.eden_cut); ext = extents(sp)
    if a.cmd == 'extents': return print(json.dumps(ext, indent=1))
    write_layouts(ext)


if __name__ == '__main__':
    main()
