#!/usr/bin/env python3
"""夜图无源亮斑检查（docs/tiancheng-maps.md §0.8 第 2 条）。读 blender/upper_oblique.py --exr 1 写出的
<成图>.png、<成图>_emit.png（源图：只有相机直接看到的发光面）与 <成图>.png.meta.json（lights_uv：灯光对象的画框坐标）。
亮斑 = 成图亮度 > 0.6 的连通区域；区域里（外扩 --pad 像素）要么有源图亮度 > 0.25 的像素，要么有灯光对象，否则算无源。
另报曝光：不透明像素里通道 = 1.0 的比例（clip_pct），以及其中不在发光面上（源图外扩 2 像素之外）的比例（clip_off_source_pct）。
  /usr/bin/python3 tools/oblique_emitcheck.py <成图.png> [--pad 6] [--report out.json]
"""
import json, os, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def read(path):
    return np.asarray(Image.open(path).convert('RGBA'), np.float32) / 255


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r: continue
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def label(mask):
    """4 邻接连通域（纯 numpy 反复传播，亮斑像素少时足够快）→ (标签图, 个数)。"""
    H, W = mask.shape; lab = np.where(mask, np.arange(H * W).reshape(H, W) + 1, 0)
    while True:
        prev = lab
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            nb = np.roll(lab, sh, ax)
            lab = np.where(mask & (nb > 0), np.maximum(lab, nb), lab)
        if np.array_equal(lab, prev): break
    u, inv = np.unique(lab, return_inverse=True)
    return inv.reshape(H, W), len(u) - 1


def main():
    a = sys.argv[1:]; png = a[0]; kw = dict(zip(a[1::2], a[2::2])); pad = int(kw.get('--pad', 6))
    rgb = read(png); H, W = rgb.shape[:2]
    lum = (rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722) * (rgb[..., 3] > .5)
    ex = read(os.path.splitext(png)[0] + '_emit.png')
    emit = (ex[..., :3].max(-1) * ex[..., 3]) > .25
    meta = json.load(open(png + '.meta.json', encoding='utf-8')); lights = np.zeros((H, W), bool)
    for u, v in meta.get('lights_uv', []):
        x, y = int(u * W), int(v * H)
        if 0 <= x < W and 0 <= y < H: lights[y, x] = True
    src = dilate(emit | dilate(lights, pad), pad)
    bright = lum > .6; lab, n = label(bright)
    has = np.bincount(lab[bright & src], minlength=n + 1) > 0; size = np.bincount(lab[bright], minlength=n + 1)
    bad = []
    for k in sorted((k for k in range(1, n + 1) if not has[k]), key=lambda k: -size[k])[:10]:
        ys, xs = np.nonzero(lab == k); bad.append(dict(px=int(size[k]), bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]))
    nbad = int(sum(1 for k in range(1, n + 1) if not has[k])); bad_px = int(sum(size[k] for k in range(1, n + 1) if not has[k]))
    solid = rgb[..., 3] > .9; clip = (rgb[..., :3] >= 1.0).any(-1) & solid; heads = dilate(emit, 2)
    R = dict(png=png, size=[W, H], bright_regions=int(n), bright_px=int(bright.sum()), sourceless_regions=nbad,
             sourceless_px=bad_px, worst=bad, clip_pct=round(100.0 * clip.sum() / max(1, solid.sum()), 3),
             clip_off_source_pct=round(100.0 * (clip & ~heads).sum() / max(1, solid.sum()), 3), lights=len(meta.get('lights_uv', [])),
             mean_lum_opaque=round(float(lum[rgb[..., 3] > .5].mean()), 4), emit_px=int(emit.sum()), passed=nbad == 0)
    if '--report' in kw: json.dump(R, open(kw['--report'], 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(R, ensure_ascii=False))


if __name__ == '__main__':
    main()
