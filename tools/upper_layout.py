#!/usr/bin/env python3
"""上层构图：按原则摆岛（v13，用户 2026-09-28：伊甸四周留白均匀、左右不偏、伊甸更大）。
读唯一岛表 blender/data/tc_islands.json（真实尺寸、岛形）与纵深 map/data/upper_depth.json（海拔 → 画出尺寸），
按方案算 x / y，写 blender/data/layouts/tc_islands_v13_<方案>.json；--apply <方案> 把它写回岛表。

方案（伊甸在画幅正中；其余岛按「海拔高 → 离伊甸近」排序，保留已批准的远近次序）：
  golden  黄金螺旋：r = r0·φ^(2θ/π)，每岛转 90°（φ 螺线每四分之一圈放大 φ 倍），x 方向按画幅宽高比（≈ φ）拉伸
  phyllo  叶序：第 i 岛 θ = i·137.5°（黄金角），r = r0·√(i + 1)，同样按宽高比拉伸——方向最均匀
  ring    黄金分割环：岛心落在以伊甸为中心、半径取画幅 1/φ 的椭圆环上，按真实面积分配角度（大岛占更大扇区）
都做一次松弛：岛缘间距 ≥ GAP、离画框 ≥ MARGIN、避开气候调节塔；伊甸不动。
"""
import argparse, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import depth as DP

W, H = 30.0, 18.75
PHI = (1 + 5 ** .5) / 2
GAP, MARGIN = .9, .25
TOWER = (8.5, -5.0)


def apparent(d, cfg):
    s = DP.island(d['id'], cfg)['scale']
    return max(d['rx'], d['ry']) * s


def place(kind, I, cfg):
    eden = next(d for d in I if d['id'] == 'eden'); ex, ey = 0.0, 0.0; eden['x'], eden['y'] = ex, ey
    er = apparent(eden, cfg)
    rest = sorted([d for d in I if d['id'] != 'eden'], key=lambda d: -cfg['islands'][d['id']]['alt'])
    sx = W / H                                               # 画幅宽高比 1.6 ≈ φ：横向拉伸，四边留白比例一致
    if kind == 'golden':
        r0 = er * .9 + 2.2; th0 = math.radians(20)
        for i, d in enumerate(rest):
            th = th0 + i * math.pi / 2 * 1.0; r = r0 * PHI ** (i * .5)
            d['x'], d['y'] = ex + math.cos(th) * r * sx ** .5, ey + math.sin(th) * r / sx ** .5
    elif kind == 'phyllo':
        r0 = er * .8 + 1.4; ga = math.radians(137.508)
        for i, d in enumerate(rest):
            th = math.radians(35) + i * ga; r = r0 * math.sqrt(i + 1) * .95
            d['x'], d['y'] = ex + math.cos(th) * r * sx ** .5, ey + math.sin(th) * r / sx ** .5
    elif kind == 'ring':
        A, B = W / 2 / PHI * 1.12, H / 2 / PHI * 1.25
        w = [apparent(d, cfg) for d in rest]; tot = sum(w); th = math.radians(100)
        for d, wi in zip(rest, w):
            th += wi / tot * math.pi; d['x'], d['y'] = ex + math.cos(th) * A, ey + math.sin(th) * B; th += wi / tot * math.pi
    # 松弛
    R = {d['id']: apparent(d, cfg) * 1.08 for d in I}
    for it in range(500):
        moved = False
        for a in I:
            if a['id'] == 'eden': continue
            for b in I + [{'id': '_tower', 'x': TOWER[0], 'y': TOWER[1]}]:
                if a is b: continue
                rb = R.get(b['id'], .45); dx, dy = a['x'] - b['x'], a['y'] - b['y']; dist = math.hypot(dx, dy) or 1e-3
                need = R[a['id']] + rb + GAP
                if dist < need:
                    k = (need - dist) * (1.0 if b['id'] in ('eden', '_tower') else .5)
                    a['x'] += dx / dist * k; a['y'] += dy / dist * k; moved = True
            m = R[a['id']] + MARGIN
            a['x'] = min(W / 2 - m, max(-W / 2 + m, a['x'])); a['y'] = min(H / 2 - m, max(-H / 2 + m, a['y']))
        if not moved: break
    for d in I: d['x'], d['y'] = round(d['x'], 3), round(d['y'], 3)
    return it


def balance(I, cfg):
    """构图指标：四边留白（伊甸到最近岛缘）与左右 / 上下的视觉重心（按画出面积）"""
    A = [(d['x'], d['y'], apparent(d, cfg) ** 2) for d in I if d['id'] != 'eden']; tot = sum(a for *_, a in A)
    cx = sum(x * a for x, _, a in A) / tot; cy = sum(y * a for _, y, a in A) / tot
    return f'重心偏移 ({cx:+.2f}, {cy:+.2f})（单位 100 m，0 = 居中）'


def main():
    p = argparse.ArgumentParser(); p.add_argument('kinds', nargs='*', default=['golden', 'phyllo', 'ring']); p.add_argument('--apply', default='')
    a = p.parse_args(); cfg = DP.load(); os.makedirs(os.path.join(ROOT, 'blender/data/layouts'), exist_ok=True)
    src = os.path.join(ROOT, 'blender/data/tc_islands.json')
    if a.apply:
        L = json.load(open(os.path.join(ROOT, f'blender/data/layouts/tc_islands_v13_{a.apply}.json'), encoding='utf-8'))
        open(src, 'w', encoding='utf-8').write(json.dumps(L, ensure_ascii=False, indent=1) + '\n'); print('applied', a.apply); return
    for k in a.kinds:
        D = json.load(open(src, encoding='utf-8')); it = place(k, D['islands'], cfg)
        D['_layout'] = f'tools/upper_layout.py {k}（松弛 {it} 轮）'
        fn = os.path.join(ROOT, f'blender/data/layouts/tc_islands_v13_{k}.json')
        open(fn, 'w', encoding='utf-8').write(json.dumps(D, ensure_ascii=False, indent=1) + '\n')
        print(k, balance(D['islands'], cfg), [(d['id'], d['x'], d['y']) for d in D['islands']])


if __name__ == '__main__':
    main()
