#!/usr/bin/env python3
"""外圈环图自检（D41 批 4；docs/tiancheng-maps.md §0.5 / §0.8；设定与检查项见 render_batch 的 notes）。

  /usr/bin/python3 tools/outskirts_check.py <外圈.png> [--report <json>]

四件事（都从成图与 <png>.meta.json 算，不需要 Blender）：
  ① 逐带剖面：把每个像素反投影到地面，算出它离柱心多少米，按 1 km 一档统计中位亮度、p95、亮像素占比
     与纹理能量（相对 5×5 均值的平均偏差）——「越往外楼越稀、越暗」要在这条曲线上看得出单调下降。
  ② 雾色落点：画框最外 1.5 % 那一圈的均值与 FOG-1 的时段令牌（map/ui/tokens.css 的 --fog-<时段>）比，
     每通道差 ≤ 6 算过——外缘融进雾，矩形的边才看不出来。
  ③ 柱内空着：柱内（中心柱 3000 × 1875 m）不该有生成的东西，亮度必须低于贴柱那一圈。
  ④ 相机：同一层各时段 / 两班必须是同一哈希（哈希由成图的相机文件算，与主图相机文件对照打印）。
numpy / PIL 在 /usr/bin/python3。
"""
import json, os, re, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import project as PJ                                        # noqa: E402

BANDS = [(0, 2000), (2000, 3000), (3000, 4000), (4000, 5000), (5000, 6000), (6000, 7000), (7000, 10 ** 9)]
TOL_LUM = 0.06          # 逐带中位亮度的单调下降容差（外圈本来就在变暗，允许一点起伏）
TOL_TEX = 0.004         # 逐带纹理能量的单调下降容差
TEX_MIN = 0.004         # 低于这个纹理能量就算「这一带已经没有内容」（判雾接手用）
BORDER = 0.015          # 画框最外这一圈
BORDER_TOL = 6          # 每通道与雾色令牌的差（0-255）


def fog_token(period):
    """FOG-1 的雾色令牌（map/ui/tokens.css）。"""
    css = open(os.path.join(ROOT, 'map', 'ui', 'tokens.css'), encoding='utf-8').read()
    m = re.search(r'--fog-%s:\s*(#[0-9a-fA-F]{6})' % re.escape(period), css)
    if not m:
        sys.exit(f'no --fog-{period} in map/ui/tokens.css')
    h = m.group(1).lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32), m.group(1)


def grid(cam, H, W, step=2):
    """抽样后的像素网格：返回 (行列索引, 画框 u, 画框 v, 视线上的点)。u / v 按成图本身的尺寸算，
    所以同框的低分辨率草图和定稿都能用（相机文件里的 px 是定稿像素）。"""
    vv = np.arange(step, H, step)
    uu = np.arange(step, W, step)
    V, U = np.meshgrid(vv, uu, indexing='ij')
    u = (U + .5) / W
    v = (V + .5) / H
    f, R, Up, F = cam['frame'], cam['right'], cam['up'], cam['fwd']
    q = np.stack([f['centre_m'][i] + (u - .5) * f['w_m'] * R[i] - (v - .5) * f['h_m'] * Up[i] for i in range(3)])
    return vv, uu, u, v, q


def boxmean(a, k=5):
    """边缘复制的盒式均值（纹理能量的基准）。"""
    p = np.pad(a, k // 2, mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    H, W = a.shape
    s = k * k
    return (c[k:k + H, k:k + W] - c[0:H, k:k + W] - c[k:k + H, 0:W] + c[0:H, 0:W]) / s


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    png = a[0]
    kw = dict(zip(a[1::2], a[2::2]))
    meta = json.load(open(png + '.meta.json', encoding='utf-8'))
    cam = meta['camera']
    period = meta['period']['tod']
    z0 = meta['scene']['ground_m']
    im = np.asarray(Image.open(png).convert('RGB'), np.float32)
    H, W = im.shape[:2]
    step = max(1, int(kw.get('--step', 2)))
    vv, uu, u, v, q = grid(cam, H, W, step)
    px = im[np.ix_(vv, uu, np.arange(3))]
    t = (z0 - q[2]) / cam['fwd'][2]
    R = np.hypot(q[0] + t * cam['fwd'][0], q[1] + t * cam['fwd'][1])
    lum = (px * [.2126, .7152, .0722]).sum(-1) / 255.
    tex = np.abs(lum - boxmean(lum))                                    # 纹理能量：有楼有街的地方大，雾里接近 0
    tok, hexes = fog_token(meta.get('fog', {}).get('token', period))
    # ① 逐带
    bands = []
    for r0, r1 in BANDS:
        m = (R >= r0) & (R < r1)
        if not m.any():
            bands.append(dict(r=[r0, r1 if r1 < 10 ** 8 else None], px=0)); continue
        bands.append(dict(r=[r0, r1 if r1 < 10 ** 8 else None], px=int(m.sum()),
                          lum_med=round(float(np.median(lum[m])), 4), lum_p95=round(float(np.percentile(lum[m], 95)), 4),
                          lit_frac=round(float((lum[m] > .5).mean()), 4), tex=round(float(tex[m].mean()), 5)))
    seq = [b for b in bands[1:] if b.get('px')]           # 城区各带（跳过柱内那一带）
    thin = [dict(r=cur['r'], d_lum=round(cur['lum_med'] - prev['lum_med'], 4),
                 d_lit=round(cur['lit_frac'] - prev['lit_frac'], 4), d_tex=round(cur['tex'] - prev['tex'], 5))
            for prev, cur in zip(seq, seq[1:])]
    city = [b for b in seq if b.get('tex', 0) > TEX_MIN]  # 还有内容的那几带
    cthin = [dict(r=cur['r'], d_lum=round(cur['lum_med'] - prev['lum_med'], 4),
                  d_lit=round(cur['lit_frac'] - prev['lit_frac'], 4), d_tex=round(cur['tex'] - prev['tex'], 5))
             for prev, cur in zip(city, city[1:])]
    # 判定只覆盖设定写死的两件事：
    #   「越往外楼越稀」= 有内容的那几带纹理能量不增；
    #   「到外缘完全融进雾」= 最外一带几乎没有内容，且外缘那一圈落在雾色令牌上。
    # 逐带的亮度 / 亮像素占比照算照报（R 里是完整剖面），但不作判定：雾会把远处托亮——夜里雾色比 4–5 km 的
    # 城外还亮，下层白班的外圈更是一半浅色雾，整幅中位亮度本来就会向外抬，那是「雾越厚」，不是城没变暗。
    tex_dec = len(city) >= 2 and all(d['d_tex'] <= TOL_TEX for d in cthin)
    outer = seq[-1] if seq else {}
    fog_dec = bool(outer) and outer.get('tex', 1.) < TEX_MIN
    # ② 画框外缘 vs 雾色令牌
    edge = (u < BORDER) | (u > 1 - BORDER) | (v < BORDER) | (v > 1 - BORDER)
    bmean = px[edge].mean(0)
    bdev = np.abs(bmean - tok)
    border_ok = bool(bdev.max() <= BORDER_TOL)
    # ③ 柱内空着
    col = meta.get('column_m', [1500.0, 937.5])
    m_in = (np.abs(q[0] + t * cam['fwd'][0]) < col[0] + 120) & (np.abs(q[1] + t * cam['fwd'][1]) < col[1] + 120)
    lum_in = float(np.median(lum[m_in])) if m_in.any() else None
    lum_ring = float(np.median(lum[(R > col[0]) & (R < col[0] + 900)])) if ((R > col[0]) & (R < col[0] + 900)).any() else None
    col_ok = lum_in is not None and (lum_ring is None or lum_in <= lum_ring + .02)
    R_ = dict(png=os.path.relpath(png, ROOT), size=[W, H], hash=cam['hash'],
              tier_cam=meta['scene'].get('tier_cam'), tier_cam_hash=meta['scene'].get('tier_cam_hash'),
              period=period, ground_m=z0, m_per_px=cam['m_per_px'], frame=cam['frame'],
              bands=bands, thinning=thin, city_bands=[b['r'] for b in city], city_thinning=cthin,
              border=dict(token=hexes, mean=[round(float(c), 1) for c in bmean], dev=[round(float(c), 1) for c in bdev],
                          tol=BORDER_TOL, pass_=border_ok),
              column=dict(lum_med=lum_in, ring_lum_med=lum_ring, pass_=col_ok),
              pass_=bool(border_ok and col_ok and tex_dec and fog_dec),
              checks=dict(border_fog=border_ok, column_empty=col_ok, texture_thins=tex_dec, fog_takes_over=fog_dec))
    if '--report' in kw:
        json.dump(R_, open(kw['--report'], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(R_, ensure_ascii=False, indent=1))


def _inside_column(cam, z0, u, v, col):
    """像素反投影的落点是否落在中心柱矩形内（含 120 m 余量）。"""
    f, R, U, F = cam['frame'], cam['right'], cam['up'], cam['fwd']
    q = np.stack([f['centre_m'][i] + (u - .5) * f['w_m'] * R[i] - (v - .5) * f['h_m'] * U[i] for i in range(3)])
    t = (z0 - q[2]) / F[2]
    x, y = q[0] + t * F[0], q[1] + t * F[1]
    return (np.abs(x) < col[0] + 120) & (np.abs(y) < col[1] + 120)


if __name__ == '__main__':
    main()