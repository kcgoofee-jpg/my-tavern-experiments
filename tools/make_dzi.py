#!/usr/bin/env python3
"""把一张大图切成 Deep Zoom（DZI）瓦片金字塔，供 OpenSeadragon 按需加载。

用法：
  python3 tools/make_dzi.py <源图> <输出前缀> [--tile 512] [--format jpg|png] [--quality 82] [--minline 0.35]
  python3 tools/make_dzi.py --verify <前缀> [--extent-m 宽 高]      # 只校验已有金字塔
输出：<前缀>.dzi 与 <前缀>_files/<层级>/<列>_<行>.<格式>。依赖 Pillow（pip3 install --user pillow）。
原子（C-8）：先切到临时目录 + 临时 .dzi，校验层数 / 每层瓦片数后再换上；中断只留下临时目录，旧金字塔不动。
--extent-m：地图的实际宽高（米，maps.json view.extent_m）；与 DZI 宽高比偏差超过 1% 时报错。
"""
import argparse, math, os, re, shutil, sys
from PIL import Image, ImageChops, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def expected(W, H, T):
    """每层 (层号, 宽, 高, 瓦片数)，与 OpenSeadragon 的 DZI 约定一致。"""
    top = math.ceil(math.log2(max(W, H)))
    out = []
    for level in range(top, -1, -1):
        s = 2 ** (top - level); w, h = max(1, math.ceil(W / s)), max(1, math.ceil(H / s))
        out.append((level, w, h, math.ceil(w / T) * math.ceil(h / T)))
    return out


def verify(dzi, files, extent=None, tol=.01):
    """校验 .dzi 与瓦片目录：层数、每层瓦片文件齐全且没有多余；extent_m 与宽高比。返回问题列表。"""
    x = open(dzi, encoding='utf-8').read()
    m = {k: re.search(k + r'="([^"]+)"', x) for k in ('Format', 'TileSize', 'Width', 'Height')}
    if not all(m.values()): return [f'{dzi}: 缺 Format / TileSize / Size']
    fmt, T, W, H = m['Format'].group(1), int(m['TileSize'].group(1)), int(m['Width'].group(1)), int(m['Height'].group(1))
    bad, exp = [], expected(W, H, T)
    have = sorted(int(d) for d in os.listdir(files) if d.isdigit()) if os.path.isdir(files) else []
    if have != sorted(l for l, *_ in exp): bad.append(f'{files}: 层 {have[:3]}…（{len(have)} 层），应为 0…{exp[0][0]}（{len(exp)} 层）')
    for level, w, h, n in exp:
        d = os.path.join(files, str(level))
        if not os.path.isdir(d): continue
        want = {f'{c}_{r}.{fmt}' for c in range(math.ceil(w / T)) for r in range(math.ceil(h / T))}
        got = set(os.listdir(d))
        if want - got: bad.append(f'{d}: 缺 {len(want - got)} / {n} 张瓦片（如 {sorted(want - got)[0]}）')
        if got - want: bad.append(f'{d}: 多出 {len(got - want)} 个文件（如 {sorted(got - want)[0]}）')
    if extent:
        r, e = W / H, extent[0] / extent[1]
        if abs(r / e - 1) > tol: bad.append(f'{dzi}: {W}×{H}（{r:.3f}）与 extent_m {extent[0]:g}×{extent[1]:g}（{e:.3f}）宽高比差 {abs(r / e - 1) * 100:.1f}%')
    return bad


def min_line_underlay(orig, w, h, s, alpha_floor):
    """每层最小线宽（B5 遗留）：细线随金字塔缩放会淡到看不见，这里在低层给线像素保底。

    orig 是 RGBA 源图（线条叠加层：非线像素 alpha=0）。按缩放系数 s 在该层分辨率上把线掩膜
    膨胀到至少 1 px 宽，颜色取线条像素的预乘重采样色，alpha 抬到 alpha_floor。
    返回 (rgb, a) 或 None（s 太小 / 非叠加层不需要）。"""
    r = int(math.ceil(s / 2))
    if r < 1:
        return None
    a0 = orig.getchannel('A').point(lambda p: 255 if p > 8 else 0)
    m = a0.resize((w, h), Image.BILINEAR)
    m = m.filter(ImageFilter.MaxFilter(2 * r + 1)).point(lambda p: 255 if p > 96 else 0)
    col = orig.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
    ca = col.getchannel('A').point(lambda p: min(255, int(alpha_floor * 255)) if p > 0 else 0)
    ca = ImageChops.multiply(ca, m)          # 膨胀支撑 ∩ 有线色的像素
    if ca.getextrema() == (0, 0):
        return None
    rgb = Image.merge('RGB', col.split()[:3])
    return rgb, ca


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--tile', type=int, default=512); ap.add_argument('--overlap', type=int, default=1)
    ap.add_argument('--format', default='jpg', choices=['jpg', 'png']); ap.add_argument('--quality', type=int, default=80)
    ap.add_argument('--extent-m', type=float, nargs=2, metavar=('W', 'H'))
    ap.add_argument('--minline', type=float, default=0.0, metavar='ALPHA',
                    help='线条叠加层的每层最小线宽：低层把线像素 alpha 抬到 ALPHA（0.35 左右），远处缩放国界仍可见')
    if '--verify' in sys.argv:
        i = sys.argv.index('--verify'); pre = sys.argv[i + 1]
        em = sys.argv.index('--extent-m') if '--extent-m' in sys.argv else 0
        bad = verify(pre + '.dzi', pre + '_files', [float(v) for v in sys.argv[em + 1:em + 3]] if em else None)
        for b in bad: print('错误', b)
        print(f'{pre}.dzi：' + ('通过' if not bad else f'{len(bad)} 个问题')); sys.exit(1 if bad else 0)
    a = ap.parse_args()
    img = Image.open(a.src).convert('RGBA' if a.format == 'png' else 'RGB')
    orig = img.copy() if (a.minline > 0 and img.mode == 'RGBA') else None
    W, H = img.size
    top = math.ceil(math.log2(max(W, H)))
    files, dzi = a.out + '_files', a.out + '.dzi'
    if a.extent_m:   # 先查比例，免得切完才发现（extent_m 与图对不上 = 标记 / 比例尺整体错位）
        r, e = W / H, a.extent_m[0] / a.extent_m[1]
        if abs(r / e - 1) > .01: sys.exit(f'{a.src}: {W}×{H} 与 extent_m {a.extent_m[0]:g}×{a.extent_m[1]:g} 宽高比差 {abs(r / e - 1) * 100:.1f}%（>1%），不切')
    tmp, tdzi, old = f'{files}.tmp-{os.getpid()}', f'{dzi}.tmp-{os.getpid()}', f'{files}.old-{os.getpid()}'
    shutil.rmtree(tmp, ignore_errors=True)
    n = 0
    for level in range(top, -1, -1):
        s = 2 ** (top - level)
        w, h = max(1, math.ceil(W / s)), max(1, math.ceil(H / s))
        if (w, h) != img.size:   # 带透明通道时用预乘 alpha 缩放，避免透明像素的颜色渗进边缘
            img = img.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA') if img.mode == 'RGBA' else img.resize((w, h), Image.LANCZOS)
        if orig is not None:     # 每层最小线宽：细线在低层不再淡没（B5）
            u = min_line_underlay(orig, w, h, W / w, a.minline)
            if u:
                rgb, ca = u
                base = img.convert('RGB')
                mixed = Image.composite(rgb, base, ca.point(lambda p: 255 if p > 0 else 0))
                img = Image.merge('RGBA', list(mixed.split()) + [ImageChops.lighter(img.getchannel('A'), ca)])
        d = os.path.join(tmp, str(level)); os.makedirs(d)
        T, O = a.tile, a.overlap
        for c in range(math.ceil(w / T)):
            for r in range(math.ceil(h / T)):
                box = (max(0, c * T - O), max(0, r * T - O), min(w, (c + 1) * T + O), min(h, (r + 1) * T + O))
                t = img.crop(box); p = os.path.join(d, f'{c}_{r}.{a.format}')
                if a.format == 'jpg': t.save(p, quality=a.quality, optimize=True, progressive=False)
                else: t.save(p, optimize=True)
                n += 1
    with open(tdzi, 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" '
                f'Format="{a.format}" Overlap="{a.overlap}" TileSize="{a.tile}"><Size Width="{W}" Height="{H}"/></Image>\n')
    bad = verify(tdzi, tmp, a.extent_m)
    if bad:
        for b in bad: print('错误', b, file=sys.stderr)
        shutil.rmtree(tmp, ignore_errors=True); os.remove(tdzi); sys.exit('校验失败，旧金字塔未动')
    # 换上：旧目录先挪开 → 新目录就位 → .dzi 原子替换 → 删旧目录（中途中断时旧 .dzi 仍指向完整的旧目录或 .old）
    if os.path.isdir(files): os.rename(files, old)
    os.rename(tmp, files); os.replace(tdzi, dzi)
    shutil.rmtree(old, ignore_errors=True)
    print(f'{a.out}.dzi：{W}×{H}，{top + 1} 层，{n} 张瓦片')


if __name__ == '__main__':
    main()
