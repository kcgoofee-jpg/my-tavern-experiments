#!/usr/bin/env python3
"""Part 9-3：2.5D 浮雕微资产生成器（高度场 → 法线 / 粗糙度），零第三方依赖（自带 PNG 写出）。

用法：python3 tools/make_relief_maps.py [--out map/art/relief] [--size 512] [--pattern manor]
产物：<out>/<pattern>_height.png、_normal.png、_rough.png 与 relief.json 清单（渲染层按清单取图，
不写死路径）。确定性：同一 (size, pattern) 永远得到同一张图——没有随机源、不读系统时间，
改一次参数重跑一次即可，产物可以直接进 git 对拍。

为什么自己写 PNG：CI 里不一定有 numpy / PIL，而这套图只有几百 KB、纯过程化生成，
zlib + struct 几十行就够了（tools/smoke.sh 的门禁因此不依赖任何第三方包）。
"""
import argparse, json, math, os, struct, sys, zlib

SCHEMA = 1
DEFAULT_OUT = os.path.join('map', 'art', 'relief')
PATTERNS = ('manor',)


def _hash01(x, y):
    """确定性 hash（0~1）：同一坐标永远同一个值，用来做石面颗粒。"""
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def height_field(size, pattern='manor'):
    """高度场（0=凹，1=凸）：石砌层 + 错缝 + 窗洞 + 檐口。返回长度 size*size 的浮点列表。"""
    h = [0.0] * (size * size)
    course = max(8, size // 8)                      # 一层石材的高度
    for y in range(size):
        row = y // course
        v = y % course
        for x in range(size):
            u = x + (row % 2) * (course // 2)       # 竖缝逐层错开半块
            jx = min(u % course, course - 1 - (u % course))
            jy = min(v, course - 1 - v)
            val = 0.62 + 0.05 * (_hash01(x, y) - 0.5)      # 石面
            if jx <= 1 or jy <= 1:
                val = 0.34                                  # 灰缝凹进去
            h[y * size + x] = val
    if pattern == 'manor':
        _add_openings(h, size)
        _add_bands(h, size)
    return h


def _add_openings(h, size):
    """窗洞：外框凸起、内框斜面、玻璃凹进去（2.5D 视差最出效果的地方）。"""
    cols, rows = 3, 2
    w, hh = max(8, size // 7), max(8, size // 5)
    gx, gy = size // (cols + 1), size // (rows + 1)
    for r in range(rows):
        for c in range(cols):
            cx, cy = gx * (c + 1), gy * (r + 1)
            for y in range(cy - hh // 2, cy + hh // 2):
                if not (0 <= y < size):
                    continue
                for x in range(cx - w // 2, cx + w // 2):
                    if not (0 <= x < size):
                        continue
                    edge = max(abs(x - cx) / (w / 2), abs(y - cy) / (hh / 2))
                    if edge > 0.84:
                        h[y * size + x] = 0.92             # 窗框
                    elif edge > 0.60:
                        h[y * size + x] = 0.55             # 内框斜面
                    else:
                        h[y * size + x] = 0.20             # 玻璃


def _add_bands(h, size):
    """檐口（顶）与勒脚（底）：两条横带把立面分成三段，斜视时先看到的就是它们。"""
    top, bot = max(4, size // 14), max(4, size // 18)
    for y in range(size):
        for x in range(size):
            i = y * size + x
            if y < top:
                h[i] = 0.96 if (y % max(2, top // 3)) > 0 else 0.88
            elif y > size - bot:
                h[i] = 0.80


def normal_from_height(h, size, strength=2.6):
    """Sobel 求梯度 → 切线空间法线（OpenGL 约定：绿通道朝上，three 直接用）。"""
    at = lambda x, y: h[min(size - 1, max(0, y)) * size + min(size - 1, max(0, x))]
    out = bytearray(size * size * 3)
    for y in range(size):
        for x in range(size):
            dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
            dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
            nx, ny, nz = -dx * strength, -dy * strength, 1.0
            l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            i = (y * size + x) * 3
            out[i] = int(round((nx / l * 0.5 + 0.5) * 255))
            out[i + 1] = int(round((ny / l * 0.5 + 0.5) * 255))
            out[i + 2] = int(round((nz / l * 0.5 + 0.5) * 255))
    return bytes(out)


def rough_from_height(h, size):
    """粗糙度：玻璃最光滑、灰缝最粗糙、石材居中偏粗（着色器只读绿通道，这里写成灰度）。"""
    out = bytearray(size * size * 3)
    for i, v in enumerate(h):
        if v < 0.30:
            r = 0.16                     # 玻璃
        elif v < 0.42:
            r = 0.95                     # 灰缝
        elif v > 0.85:
            r = 0.45                     # 窗框 / 檐口（打磨过）
        else:
            r = 0.78                     # 石材
        r = max(0.0, min(1.0, r + 0.04 * (_hash01(i % size, i // size) - 0.5)))
        c = int(round(r * 255))
        out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = c
    return bytes(out)


def gray_bytes(values, size):
    """高度场 → 灰度 RGB（调试 / 视差采样都读它）。"""
    out = bytearray(size * size * 3)
    for i, v in enumerate(values):
        c = int(round(max(0.0, min(1.0, v)) * 255))
        out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = c
    return bytes(out)


def write_png(path, size, rgb):
    """最小 PNG 写出（8 位 truecolor，无隔行）。"""
    raw = bytearray()
    stride = size * 3
    for y in range(size):
        raw.append(0)
        raw += rgb[y * stride:(y + 1) * stride]

    def chunk(typ, body):
        return struct.pack('>I', len(body)) + typ + body + struct.pack('>I', zlib.crc32(typ + body) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))


def read_png_gray(path):
    """自检用：读回自己写的 PNG，返回 (size, 绿通道列表)。只认本脚本产出的 8 位 truecolor。"""
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', '不是 PNG'
    pos, idat, w = 8, b'', 0
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            w, hgt, depth, ctype = struct.unpack('>IIBB', body[:10])
            assert depth == 8 and ctype == 2, '只认 8 位 truecolor'
        elif typ == b'IDAT':
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    out, stride = [], w * 3
    for y in range(hgt):
        row = raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)]
        out.extend(row[i * 3 + 1] for i in range(w))
    return w, out


def build(out_dir=DEFAULT_OUT, size=512, pattern='manor'):
    """生成一组资产并写出清单；返回 manifest dict（渲染层按它取图）。"""
    if pattern not in PATTERNS:
        raise SystemExit(f'未知 pattern {pattern}（可选：{", ".join(PATTERNS)}）')
    size = max(16, int(size))
    h = height_field(size, pattern)
    names = {
        'height': f'{pattern}_facade_height.png',
        'normal': f'{pattern}_facade_normal.png',
        'rough': f'{pattern}_facade_rough.png',
    }
    write_png(os.path.join(out_dir, names['height']), size, gray_bytes(h, size))
    write_png(os.path.join(out_dir, names['normal']), size, normal_from_height(h, size))
    write_png(os.path.join(out_dir, names['rough']), size, rough_from_height(h, size))
    manifest = {
        'schema': SCHEMA,
        'pattern': pattern,
        'size': [size, size],
        'tileable': True,
        'assets': {
            f'{pattern}_facade': {
                'height': names['height'],
                'normal': names['normal'],
                'rough': names['rough'],
                'parallax': 0.05,          # 视差深度（UV 单位）：0 = 只留法线
                'normalScale': 0.85,
                'albedo': [0.82, 0.79, 0.72],
            },
        },
    }
    with open(os.path.join(out_dir, 'relief.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=DEFAULT_OUT, help='输出目录（默认 map/art/relief）')
    ap.add_argument('--size', type=int, default=512, help='贴图边长（默认 512）')
    ap.add_argument('--pattern', default='manor', choices=list(PATTERNS))
    a = ap.parse_args(argv)
    m = build(a.out, a.size, a.pattern)
    print(f'relief：{a.pattern} {a.size}x{a.size} → {a.out}（{len(m["assets"])} 组资产）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
