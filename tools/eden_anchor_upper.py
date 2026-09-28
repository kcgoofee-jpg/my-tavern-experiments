#!/usr/bin/env python3
"""把 map/data/tc_upper.json 里伊甸的标记锚点与岛轮廓对齐到 estate2 r4（v7 底图贴的就是它，见 tools/eden_into_upper.py）。

用法：python3 tools/eden_anchor_upper.py [--check]    # --check：只比对，不一致时退出码 1
- 岛心：blender/data/tc_islands.json 的 eden x / y（1 单位 = 100 m），与 eden_into_upper.py 的贴图位置同一变换
- 锚点 ax / ay：estate2 的访客停靠平台中心（blender/estate2/layout.py 的 dock 分区，岛坐标 (0, −256) m，正面 = −y = 图上向下）
- 轮廓 outline：layout.outline_R（estate2 的岛缘），48 点
- 其余标记（含 manual: true 的手摆点位）与其他岛一律不动
只读 blender/ 下的纯 numpy 模块，不跑 Blender。
"""
import importlib.util, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_M, H_M = 3000.0, 1875.0          # 上层整图（tc_common.W / H × 100 m）
DATA = os.path.join(ROOT, 'map/data/tc_upper.json')


def layout():
    spec = importlib.util.spec_from_file_location('estate2_layout', os.path.join(ROOT, 'blender/estate2/layout.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def compute():
    L = layout()
    isl = next(i for i in json.load(open(os.path.join(ROOT, 'blender/data/tc_islands.json')))['islands'] if i['id'] == 'eden')
    cx, cy = isl['x'] * 100, isl['y'] * 100                     # 岛心（米，y 向北）
    rot = isl.get('rot', 0) or 0
    to_n = lambda x, y: (round((cx + x * math.cos(rot) - y * math.sin(rot)) / W_M + .5, 4), round(.5 - (cy + x * math.sin(rot) + y * math.cos(rot)) / H_M, 4))
    dock = next(z for z in L.PADS if z['id'] == 'dock')['c']
    n = 48
    outline = [list(to_n(float(L.outline_R(t)) * math.cos(t), float(L.outline_R(t)) * math.sin(t))) for t in (2 * math.pi * k / n for k in range(n))]
    return {'center': to_n(0, 0), 'anchor': to_n(*dock), 'r': round(L.A / W_M, 4), 'outline': outline}


def main():
    c = compute(); d = json.load(open(DATA, encoding='utf-8'))
    tbl = {i['id'] for i in json.load(open(os.path.join(ROOT, 'blender/data/tc_islands.json')))['islands']}
    if '--check' in sys.argv and {i['id'] for i in d['islands']} != tbl:   # 岛表已换（v12+ 纵深 / 斜视），发布数据还是旧底图：等重渲后再比（check_maps 同时报警告）
        print('伊甸锚点：底图 / 点位待按新岛表重渲，暂不比对'); sys.exit(0)
    mk = next(m for m in d['markers'] if m['id'] == 'eden'); il = next(i for i in d['islands'] if i['id'] == 'eden')
    want = {'nx': c['center'][0], 'ny': c['center'][1], 'r': c['r'], 'ax': c['anchor'][0], 'ay': c['anchor'][1]}
    diff = {k: (mk.get(k), v) for k, v in want.items() if mk.get(k) != v}
    if il.get('outline') != c['outline']: diff['outline'] = f"{len(il.get('outline') or [])} 点 → {len(c['outline'])} 点"
    if '--check' in sys.argv:
        for k, v in diff.items(): print('不一致', k, v)
        print('伊甸锚点：' + ('一致' if not diff else f'{len(diff)} 项不一致（python3 tools/eden_anchor_upper.py 更新）')); sys.exit(1 if diff else 0)
    mk.update(want); il['outline'] = c['outline']
    with open(DATA, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, indent=1); f.write('\n')
    for k, v in diff.items(): print('更新', k, v)
    print('写入', os.path.relpath(DATA, ROOT))


if __name__ == '__main__':
    main()
