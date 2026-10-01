#!/usr/bin/env python3
"""R-LAYOUT T3 落地：把用户选定的上层岛表方案（tools/upper_layout_v16.py 的产物）写进仓库数据与底图。

v16 预览（upper_layout_v16.py）只出方案与预览图；这里做真正的落地（可重复执行，幂等——增量一律从
当前数据重算，重跑结果不变）：
  ① blender/data/tc_islands.json ← 方案文件（--layout，默认 v16 C）的 x / y、_layout、anchors、_sprite_extent
  ② map/data/tc_upper.json：岛 nx / ny 换到新岛心，轮廓随岛心平移；标记 nx / ny / ax / ay 随岛平移，
     manual 手摆标记（凯莉 / 维克多 / 「Y」）整体吸到岛心；气候塔按方案 anchors 摆；
     巡逻环（patrol）随银冠堡平移，patrol_city 重算成绕伊甸、按方位角依次经过其余岛心的平滑闭环；
     伊甸的标记 / 轮廓不动，留给 tools/eden_anchor_upper.py（--check 测试盯着它）
  ③ map/data/maps.json：eden_hi 插图 bounds 移到伊甸新画框（750 m × 纵深系统 eden scale，画幅中心 = 新岛心）
  ④ 底图 interim 合成（8000 px）：从合成前的整图（*.pre-v16C.png）按旧岛心抠各岛精灵——伊甸用 estate2 r5
     地图抠图（--eden-cut，upper_depth 的 eden scale），精英学院用中性圆角块（尚无俯视图；线上底图正中那块
     本就是错贴的伊甸新图，会连同旧位置的岛一起补掉）——旧位置全部补云 / 补城，按新岛心贴回，各重切 DZI。
     城市底图与云海底图逐像素同相机：精灵沿用云海底图抠出的 alpha，贴城市底图前把 alpha 向内收一圈去掉云边；
     旧岛位置的补洞用远处平移来的城市纹理（模糊补丁会糊楼）。

用法（仓库根目录）：
  python3 tools/upper_layout_land.py            # 干跑：只打印将做的改动
  python3 tools/upper_layout_land.py --write    # 写数据 + 合成底图 + 重切 DZI
输入整图若不存在（首次），自动把当前整图另存为 *.pre-v16C.png 后再合成，保证重跑有干净的输入；
同时把合成前的旧岛心存成 map/art/tc_upper_full.pre-v16C.seeds.json——重跑时 tc_upper.json 已是新岛心，
抠精灵的种子必须仍取旧岛心（备份图和 seeds 都是 git 忽略的临时文件，落地提交后可删）。
精英学院（isle25）还没有俯视图：旧位置补云 / 补城，新位置贴中性圆角块（用户已确认的预览口径）。
落地之后的岛屿集成（isle25 的身体裁片 + 抠图，tools/isles_into_upper.py）是贴在合成结果上的：之后不要再重跑 --write（会把占位块贴回去）。
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_U, H_U = 30.0, 18.75          # 画幅（单位 = 100 m），与 tools/eden_into_upper.py 一致
PX = 8000                       # 工作分辨率（与线上 8K 底图同尺寸）
HPX = round(PX * H_U / W_U)
S = PX / W_U
ALT = {'eden': 1450, 'isle10': 1360, 'isle6': 1300, 'isle30': 1250, 'isle25': 1180,
       'isle9': 1080, 'isle4': 960, 'isle5': 880, 'silver_crown': 820}   # upper-setting.md §2 海拔表
TOWER_OFF = (2.0, 1.2)          # 气候塔相对银冠堡岛心（upper_layout_v16.py 同款）
FILL_OFF = [(3000, 0), (-3000, 0), (0, -2400), (0, 2400), (3000, -2400), (-3000, -2400),
            (4600, 0), (-4600, 0), (1600, -2600), (-1600, -2600), (3000, 2400), (-3000, 2400),
            (5200, -1800), (-5200, -1800), (6000, 0), (-6000, 0)]


def load(rel):
    return json.load(open(os.path.join(ROOT, rel), encoding='utf-8'))


def to_px(x, y):
    return ((x / W_U + .5) * PX, (.5 - y / H_U) * HPX)


def grow(im, r):
    """阈值膨胀，≈ 2r px（upper_layout_v16.py 同款）。"""
    return im.filter(ImageFilter.GaussianBlur(r)).point(lambda v: 255 if v > 3 else 0)


def flood(small, seed_xy, R):
    """1/4 尺度掩膜里、种子周围 R 格窗口的测地膨胀（upper_layout_v16.py 同款；R 格 = 4R px）。"""
    x, y = int(seed_xy[0] / 4), int(seed_xy[1] / 4); x0, y0 = max(0, x - R), max(0, y - R)
    m = small[y0:y + R, x0:x + R]; cur = np.zeros_like(m); cur[y - y0 - 3:y - y0 + 4, x - x0 - 3:x - x0 + 4] = True; cur &= m
    for _ in range(400):
        nxt = (np.asarray(Image.fromarray(cur.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0) & m
        if (nxt == cur).all(): break
        cur = nxt
    full = np.zeros((small.shape[0] * 4, small.shape[1] * 4), bool)
    full[y0 * 4:(y0 + m.shape[0]) * 4, x0 * 4:(x0 + m.shape[1]) * 4] = np.kron(cur, np.ones((4, 4), bool))
    return full


def old_seeds(up, delta_zero):
    """抠精灵的种子 = 合成前的旧岛心（归一化）：首次取当前 tc_upper.json 并存档，重跑读档。"""
    path = os.path.join(ROOT, 'map/art/tc_upper_full.pre-v16C.seeds.json')
    if os.path.exists(path):
        return json.load(open(path, encoding='utf-8'))
    if delta_zero:
        sys.exit('岛心已落地但没有 seeds 存档：无法从备份图还原旧岛心（备份图与存档需成对保留）')
    seeds = {i['id']: [i['nx'], i['ny']] for i in up['islands']}
    tw = next(m for m in up['markers'] if m['id'] == 'climate_tower'); seeds['_tower'] = [tw['nx'], tw['ny']]
    with open(path, 'w', encoding='utf-8') as f: json.dump(seeds, f, indent=1); f.write('\n')
    return seeds


def sprites(base, seeds_n):
    """按旧岛心从云海底图抠岛精灵（形态学参数按 8K 放大）；返回 {id: (rgba, 相对旧岛心的偏移)} 与补洞掩膜。"""
    a = np.asarray(base, np.float32); luma = .299 * a[..., 0] + .587 * a[..., 1] + .114 * a[..., 2]; sat = a.max(-1) - a.min(-1)
    core = Image.fromarray(((luma < 205) | (sat > 40)).astype(np.uint8) * 255)
    core = np.asarray(core.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
                      .filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.MinFilter(17)))
    small = np.asarray(Image.fromarray(core).resize((core.shape[1] // 4, core.shape[0] // 4), Image.BOX)) > 60; core = core > 0
    seeds = {k: (v[0] * PX, v[1] * HPX) for k, v in seeds_n.items()}
    out, hole = {}, np.zeros(core.shape, bool)
    for iid, (sx, sy) in seeds.items():
        if iid == '_tower':                       # 气候塔是亮盘（俯视的发光圆台）：形态学抠不出，按圆盘直接裁
            R_, F_ = 92, 210                      # 圆盘半径（含半透明外环）/ 补洞半径，8K 像素
            x0, y0 = round(sx) - F_, round(sy) - F_; n_ = 2 * F_
            al = Image.new('L', (n_, n_), 0); ImageDraw.Draw(al).ellipse([F_ - R_, F_ - R_, F_ + R_, F_ + R_], fill=255)
            al = al.filter(ImageFilter.GaussianBlur(1.5))
            hm = Image.new('L', (n_, n_), 0); ImageDraw.Draw(hm).ellipse([0, 0, n_ - 1, n_ - 1], fill=255)
            hole[y0:y0 + n_, x0:x0 + n_] |= np.asarray(hm) > 0
            rgba = base.crop((x0, y0, x0 + n_, y0 + n_)).convert('RGBA'); rgba.putalpha(al)
            out[iid] = (rgba, (x0 - sx, y0 - sy)); continue
        comp = flood(small, (sx, sy), 660 if iid in ('eden', 'isle25') else 320)
        ys, xs = np.nonzero(comp)
        if not len(xs): print('  ! 种子处没抠到内容，跳过', iid); continue
        P_ = 220
        x0, y0, x1, y1 = max(0, xs.min() - P_), max(0, ys.min() - P_), min(core.shape[1], xs.max() + P_), min(core.shape[0], ys.max() + P_)
        al = grow(Image.fromarray(comp[y0:y1, x0:x1].astype(np.uint8) * 255), 10).filter(ImageFilter.GaussianBlur(12))
        hole[y0:y1, x0:x1] |= np.asarray(grow(al, 72)) > 0
        bb = al.getbbox(); rgba = base.crop((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3])).convert('RGBA'); rgba.putalpha(al.crop(bb))
        out[iid] = (rgba, (x0 + bb[0] - sx, y0 + bb[1] - sy))
    # 岛外零星残件（升降舱 / 锚点小件，离岛身超出形态学闭合距离）：不属于任何岛精灵 → 只补洞，不搬家
    hs = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255).resize(small.shape[::-1], Image.BOX).filter(ImageFilter.MaxFilter(7))) > 0
    left = small & ~hs; n_ = 0
    while left.any():
        ys_, xs_ = np.nonzero(left); comp = flood(small, (xs_[0] * 4 + 2, ys_[0] * 4 + 2), 80)
        cs = np.asarray(Image.fromarray(comp.astype(np.uint8) * 255).resize(small.shape[::-1], Image.BOX)) > 0
        left &= ~cs; left[ys_[0], xs_[0]] = False
        gy, gx = np.nonzero(comp)
        if not len(gx): continue
        x0, y0, x1, y1 = max(0, gx.min() - 60), max(0, gy.min() - 60), min(core.shape[1], gx.max() + 60), min(core.shape[0], gy.max() + 60)
        al = grow(Image.fromarray(comp[y0:y1, x0:x1].astype(np.uint8) * 255), 10)
        hole[y0:y1, x0:x1] |= np.asarray(grow(al, 44)) > 0; n_ += 1
        print('  残件补洞 @(%d,%d) %d px' % (gx.mean(), gy.mean(), len(gx)))
    return out, hole


def placeholder():
    """精英学院占位：中性圆角块（upper_layout_v16.py 预览同款，尺寸随 8K 放大）。"""
    a_, b_ = 1.80 * S, 1.47 * S
    w, h = round(2 * a_), round(2 * b_); e = Image.new('L', (w, h), 0)
    ImageDraw.Draw(e).rounded_rectangle([24, 24, w - 24, h - 24], radius=round(b_ * .55), fill=255); e = e.filter(ImageFilter.GaussianBlur(10))
    rim = Image.new('L', (w, h), 0); ImageDraw.Draw(rim).rounded_rectangle([24, 24, w - 24, h - 24], radius=round(b_ * .55), outline=255, width=20)
    img = Image.composite(Image.new('RGB', (w, h), (150, 146, 138)), Image.new('RGB', (w, h), (196, 192, 182)), rim.filter(ImageFilter.GaussianBlur(6))).convert('RGBA')
    img.putalpha(e); return img, (-w / 2, -h / 2)


def eden_sprite(cut_path):
    """伊甸精灵：estate2 r5 地图抠图按 750 m 画幅 × 纵深 eden scale 缩放（tools/eden_into_upper.py 同一换算）。"""
    sys.path.insert(0, os.path.join(ROOT, 'blender')); import depth as DP
    scale = DP.island('eden', DP.load())['scale']
    cut = Image.open(cut_path).convert('RGBA')
    k = 750.0 * scale / cut.width / (W_U * 100 / PX)
    cut = cut.resize((round(cut.width * k), round(cut.height * k)), Image.LANCZOS)
    bb = cut.getbbox()
    return cut.crop(bb), (bb[0] - cut.width / 2, bb[1] - cut.height / 2), scale


def fill(base, hole):
    """挖掉掩膜区，用平移过来的远处像素补；羽化只在洞缘（云海、城市纹理都成立）。"""
    a = np.asarray(base, np.float32); H, W = hole.shape; fill = a.copy(); todo = hole.copy()
    for dx, dy in FILL_OFF:
        if not todo.any(): break
        ys, xs = np.nonzero(todo); sx, sy = xs + dx, ys + dy
        ok = (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
        ok[ok] &= ~hole[sy[ok], sx[ok]]
        fill[ys[ok], xs[ok]] = a[sy[ok], sx[ok]]; todo[ys[ok], xs[ok]] = False
    if todo.any(): fill[todo] = np.median(a[~hole], axis=0)
    soft = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(17)).filter(ImageFilter.GaussianBlur(40)), np.float32)[..., None] / 255
    return Image.fromarray((a * (1 - soft) + fill * soft).astype(np.uint8))


def erode(rgba):
    """城市底图用：alpha 向内收一圈再去羽化，云边不进城里。"""
    al = rgba.getchannel('A').filter(ImageFilter.MinFilter(41)).filter(ImageFilter.GaussianBlur(10))
    out = rgba.copy(); out.putalpha(Image.fromarray(np.minimum(np.asarray(al), np.asarray(rgba.getchannel('A')))))
    return out


def city_loop(new_w):
    """patrol_city 重算：绕伊甸、按方位角依次经过其余岛心的闭合 Catmull-Rom（归一化 pts）。"""
    ring = sorted(((x, y) for i, (x, y) in new_w.items() if i != 'eden'), key=lambda c: math.atan2(c[1], c[0]))
    c = [to_px(*p) for p in ring]; n = len(c); out = []
    for k in range(n):
        p0, p1, p2, p3 = c[k - 1], c[k], c[(k + 1) % n], c[(k + 2) % n]
        for t in (j / 12 for j in range(12)):
            out.append([min(.995, max(.005, round(.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t
                                                     + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t ** 3) / px, 4)))   # 样条在画幅边缘会过冲：夹在 0.5 % 边内
                        for d, px in ((0, PX), (1, HPX))])
    return out + [list(out[0])]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='写数据文件、合成底图并重切 DZI（缺省只打印计划）')
    ap.add_argument('--layout', default='blender/data/layouts/tc_islands_v16_C1.json')
    ap.add_argument('--eden-cut', default='logs/campaign/eden_r5/final_cut6000.png')
    a = ap.parse_args()

    up = load('map/data/tc_upper.json')             # 底图渲染时的点位（合成种子 + 平移基线）
    C = load(a.layout)
    reg = load('map/data/maps.json')
    old_c = {i['id']: (i['nx'], i['ny']) for i in up['islands']}
    new_c = {i['id']: (round(i['x'] / W_U + .5, 4), round(.5 - i['y'] / H_U, 4)) for i in C['islands']}
    new_w = {i['id']: (i['x'], i['y']) for i in C['islands']}
    delta = {k: (round(v[0] - old_c[k][0], 6), round(v[1] - old_c[k][1], 6)) for k, v in new_c.items()}
    print('岛心位移（归一化）:')
    for k in sorted(delta): print('  %-13s %+.4f %+.4f' % (k, *delta[k]))

    if a.write:
        # ① 岛表
        with open(os.path.join(ROOT, 'blender/data/tc_islands.json'), 'w', encoding='utf-8') as f:
            json.dump(C, f, ensure_ascii=False, indent=2); f.write('\n')
        print('写入 blender/data/tc_islands.json ←', a.layout)
        # ④ 底图（先于 ②③ 读数；输入永远取 *.pre-v16C.png）
        for src in ('map/art/tc_upper_full.png', 'map/art/tc_upper_city_full.png'):
            pre = os.path.join(ROOT, src.replace('.png', '.pre-v16C.png'))
            if not os.path.exists(pre):
                import shutil; shutil.copy2(os.path.join(ROOT, src), pre)   # 备份与合成路径必须是两个 inode（PIL save 会截断重写）
                print('底图备份', pre)
        base = Image.open(os.path.join(ROOT, 'map/art/tc_upper_full.pre-v16C.png')).convert('RGB')
        city = Image.open(os.path.join(ROOT, 'map/art/tc_upper_city_full.pre-v16C.png')).convert('RGB')
        assert base.size == city.size == (PX, HPX), (base.size, city.size)
        sp, hole = sprites(base, old_seeds(up, all(abs(v) < 1e-6 for d_ in delta.values() for v in d_)))
        ed, ed_off, ed_scale = eden_sprite(a.eden_cut); sp['eden'] = (ed, ed_off)
        sp['isle25'] = placeholder()
        print('精灵: %s；eden scale %s' % (', '.join(sorted(sp)), ed_scale))
        bg = fill(base, hole).convert('RGBA')
        for iid, (img, (ox, oy)) in sorted(sp.items(), key=lambda kv: -ALT.get(kv[0], 0)):
            x, y = to_px(C['anchors']['climate_tower']['x'], C['anchors']['climate_tower']['y']) if iid == '_tower' else to_px(*new_w[iid])
            bg.alpha_composite(img, (round(x + ox), round(y + oy)))
        bg.convert('RGB').save(os.path.join(ROOT, 'map/art/tc_upper_full.png'))
        cf = fill(city, hole).convert('RGBA')
        for iid, (img, (ox, oy)) in sorted(sp.items(), key=lambda kv: -ALT.get(kv[0], 0)):
            x, y = to_px(C['anchors']['climate_tower']['x'], C['anchors']['climate_tower']['y']) if iid == '_tower' else to_px(*new_w[iid])
            cf.alpha_composite(img if iid in ('eden', 'isle25', '_tower') else erode(img), (round(x + ox), round(y + oy)))
        cf.convert('RGB').save(os.path.join(ROOT, 'map/art/tc_upper_city_full.png'))
        for meta in ('map/art/tc_upper_full.png.meta.json', 'map/art/tc_upper_city_full.png.meta.json'):
            p = os.path.join(ROOT, meta); d = json.load(open(p, encoding='utf-8'))
            d['composite'] = 'tools/upper_layout_land.py v16 C（interim：既有岛图按新岛心重贴，正式底图待 base:tc_upper）'
            with open(p, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, indent=1); f.write('\n')
        for name, src in (('tc_upper', 'map/art/tc_upper_full.png'), ('tc_upper_city', 'map/art/tc_upper_city_full.png')):
            subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools/make_dzi.py'), os.path.join(ROOT, src),
                                   os.path.join(ROOT, 'map/art', name), '--extent-m', '3000', '1875'])   # 切完自带校验（--verify 是另一个只验不切的模式）
        # ② 点位图（伊甸留给 eden_anchor_upper.py）
        isl_by_id = {i['id']: i for i in up['islands']}
        mk_island = {k: (v.get('island') or k) for k, v in reg['maps']['tc_upper']['markers'].items()}
        for m in up['markers']:
            mid = m['id']
            if mid == 'eden': continue
            if mid == 'climate_tower':                      # 塔跟方案 anchors 走（银冠堡后缘），锚点偏移随塔平移
                tw = C['anchors']['climate_tower']
                tn = (round(tw['x'] / W_U + .5, 4), round(.5 - tw['y'] / H_U, 4))
                d = (round(tn[0] - m['nx'], 6), round(tn[1] - m['ny'], 6))
                m['nx'], m['ny'] = tn
                m['ax'] = round(m['ax'] + d[0], 4); m['ay'] = round(m['ay'] + d[1], 4)
                continue
            iid = mk_island.get(mid, mid); d = delta.get(iid)
            if d is None: print('  ! 标记没有可动的岛，跳过', mid); continue
            if m.get('manual'):
                m['nx'], m['ny'] = new_c[iid]; m['ax'], m['ay'] = new_c[iid]
            else:
                m['nx'] = round(m['nx'] + d[0], 4); m['ny'] = round(m['ny'] + d[1], 4)
                if m.get('ax') is not None:
                    m['ax'] = round(m['ax'] + d[0], 4); m['ay'] = round(m['ay'] + d[1], 4)
        for i in up['islands']:
            i['nx'], i['ny'] = new_c[i['id']]
            if i['id'] != 'eden' and isinstance(i.get('outline'), list):
                i['outline'] = [[round(x + delta[i['id']][0], 4), round(y + delta[i['id']][1], 4)] for x, y in i['outline']]
        for r in up.get('routes', []):
            if r.get('kind') == 'patrol_city': r['pts'] = city_loop(new_w)
            elif r.get('from') in delta:
                d = delta[r['from']]
                r['pts'] = [[min(.995, max(.005, round(x + d[0], 4))), min(.995, max(.005, round(y + d[1], 4)))] for x, y in r['pts']]   # 平移后夹在画幅 0.5 % 边内
        with open(os.path.join(ROOT, 'map/data/tc_upper.json'), 'w', encoding='utf-8') as f:
            json.dump(up, f, ensure_ascii=False, indent=1); f.write('\n')
        print('写入 map/data/tc_upper.json（伊甸标记/轮廓待 tools/eden_anchor_upper.py）')
        # ③ eden_hi 插图画框
        sys.path.insert(0, os.path.join(ROOT, 'blender')); import depth as DP
        scale = DP.island('eden', DP.load())['scale']
        m = reg['maps']['tc_upper']; ext = m['view']['extent_m']
        ins = next(i for i in m['insets'] if i['id'] == 'eden_hi')
        w, h = 750.0 * scale / ext[0], 750.0 * scale * ins['res_px'][1] / ins['res_px'][0] / ext[1]
        ins['bounds'] = [round(.5 - w / 2, 5), round(.5 - h / 2, 5), round(.5 + w / 2, 5), round(.5 + h / 2, 5)]
        with open(os.path.join(ROOT, 'map/data/maps.json'), 'w', encoding='utf-8') as f:
            json.dump(reg, f, ensure_ascii=False, indent=2); f.write('\n')
        print('写入 map/data/maps.json eden_hi bounds', ins['bounds'], '(750 m × eden scale %s)' % scale)
    else:
        print('干跑：加 --write 落地（岛表 / 点位 / 插图画框 / 两张底图合成 + DZI）')


if __name__ == '__main__':
    main()
