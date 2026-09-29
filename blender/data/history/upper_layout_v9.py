#!/usr/bin/env python3
"""上层 v9 布局 / 配色方案：由 blender/data/tc_islands.json（v8）生成 tc_islands_v9<A|B>.json。
用法：python3 tools/upper_layout_v9.py A|B   →  blender/data/tc_islands_v9A.json
渲染：TC_ISLANDS=blender/data/tc_islands_v9A.json blender -b -P blender/tiancheng_upper.py -- --no-data 1 --selfcheck warn ...

规则（docs/upper-v9-layout.md）：
- 真实尺寸：卡里有的岛按伊甸同一比例放大（真实半径 140–200 m；「Y」的庄园卡说全天城最大 → 240 m）；普通岛真实半径 95–165 m，不再有「故意设小」的岛。
- 高度分三层：高层 z 5.2–7.5（离相机近，按真实尺寸画、清晰）；中层 z 3–5（× 0.8、薄霾）；低层 z 1–2.8（× 0.62、厚霾 + 云盖）。
  正交俯视没有透视，所以「远小近大」由数据里的深度系数给出（画出的半径 = 真实半径 × 系数），霾由 tools/upper_haze.py 按层后处理。
  卡里有的岛与伊甸都在高 / 中层，系数 1，模型按真实尺寸贴。
- 群落（biome）决定岛面主色；伊甸不动、仍是画面焦点。
"""
import json, math, os, random, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 30.0, 18.75
CARD = {'isle30': 1.85, 'isle9': 1.55, 'isle25': 1.75, 'isle6': 1.45, 'isle10': 1.45, 'isle4': 1.65, 'isle5': 2.4}   # 真实平均半径（单位 100 m）
TIER = {'high': (5.2, 7.5, 1.0), 'mid': (3.0, 5.0, .8), 'low': (1.0, 2.8, .62)}
TERRAIN = {'rock': 'crag', 'conifer': 'crag', 'water': 'lake', 'vineyard': 'terrace', 'meadow': 'meadow', 'autumn': 'meadow',
           'heath': 'meadow', 'orchard': 'meadow'}


def plan(opt):
    """返回 (tier(id, x, y), biome(id, x, y, tier))"""
    ex, ey = 1.5, .8
    if opt == 'A':          # 同心：离伊甸越远越低；暖（近）→ 冷（远）
        def tier(i, x, y):
            d = math.hypot(x - ex, (y - ey) * 1.5)
            return 'high' if d < 7 else ('mid' if d < 11.5 else 'low')
        warm, mid_, cool = ('meadow', 'water', 'orchard'), ('autumn', 'vineyard', 'meadow'), ('conifer', 'rock', 'heath')
        def biome(i, x, y, t, k): return {'high': warm, 'mid': mid_, 'low': cool}[t][k % 3]
    else:                   # 斜向：西北低而冷（高山针叶、崖石、石南），东南高而暖（秋林、葡萄园、野花）；水景园散在中带
        def tier(i, x, y):
            s = (x - ex) * .6 - (y - ey)
            return 'low' if s < -6 else ('mid' if s < 1.5 else 'high')
        pal = {'low': ('conifer', 'rock', 'heath', 'conifer'), 'mid': ('water', 'orchard', 'meadow', 'autumn'), 'high': ('autumn', 'vineyard', 'meadow', 'autumn')}
        def biome(i, x, y, t, k): return pal[t][k % 4]
    return tier, biome


def main():
    opt = (sys.argv[1] if len(sys.argv) > 1 else 'A').upper()
    D = json.load(open(os.path.join(ROOT, 'blender/data/tc_islands.json'), encoding='utf-8'))
    tier, biome = plan(opt); rnd = random.Random(90 + ord(opt))
    I = D['islands']; k = 0
    for d in I:
        if d['id'] in ('eden', 'silver_crown'): d['tier'] = 'mid'; continue
        asp = d['ry'] / d['rx']
        if d['id'] in CARD:
            t = 'high'; R = CARD[d['id']]
        else:
            t = tier(d['id'], d['x'], d['y']); R = rnd.uniform(.95, 1.65)
        z0, z1, f = TIER[t]
        a = R * f / math.sqrt(asp)
        d['rx'], d['ry'] = round(a, 4), round(a * asp, 4); d['z'] = round(rnd.uniform(z0, z1), 3); d['tier'] = t
        d['true_r_m'] = round(R * 100)
        if d['id'] not in CARD:
            b = biome(d['id'], d['x'], d['y'], t, k); k += 1
            d['biome'] = b; d['terrain'] = TERRAIN[b]
            for key in ('shape', 'rim'): d.pop(key, None)
    # 松弛：边缘间距 ≥ 0.7（70 m）；伊甸、银冠堡不动；出界的收回；实在放不下的普通低层岛删掉
    fixed = {'eden', 'silver_crown'}
    rad = lambda d: max(d['rx'], d['ry']) * 1.12
    for it in range(400):
        moved = 0
        for a in I:
            for b in I:
                if a is b: continue
                dx, dy = b['x'] - a['x'], b['y'] - a['y']; dist = math.hypot(dx, dy) or 1e-3
                need = rad(a) + rad(b) + .7
                if dist < need:
                    push = (need - dist) / 2 + .01
                    for s, o in ((a, -1), (b, 1)):
                        if s['id'] in fixed: continue
                        w = 2 if (a['id'] in fixed or b['id'] in fixed) else 1
                        s['x'] += o * dx / dist * push * w * .5; s['y'] += o * dy / dist * push * w * .5
                    moved += 1
        for d in I:
            if d['id'] in fixed: continue
            m = rad(d) + .3
            d['x'] = min(W / 2 - m, max(-W / 2 + m, d['x'])); d['y'] = min(H / 2 - m, max(-H / 2 + m, d['y']))
        if not moved: break
    bad = set()
    for a in I:
        for b in I:
            if a is not b and math.hypot(a['x'] - b['x'], a['y'] - b['y']) < rad(a) + rad(b) + .3:
                victim = min((a, b), key=lambda d: (d['id'] in CARD or d['id'] in fixed, d.get('tier') != 'low', rad(d)))
                bad.add(victim['id'])
    D['islands'] = [d for d in I if d['id'] not in bad]
    for d in D['islands']:
        d['x'], d['y'] = round(d['x'], 3), round(d['y'], 3)
    D['_v9'] = f'方案 {opt}（tools/upper_layout_v9.py）：松弛 {it} 轮，删去放不下的岛 {sorted(bad)}'
    out = os.path.join(ROOT, f'blender/data/tc_islands_v9{opt}.json')
    open(out, 'w', encoding='utf-8').write(json.dumps(D, ensure_ascii=False, indent=1) + '\n')
    from collections import Counter
    print(out, 'islands', len(D['islands']), 'dropped', sorted(bad), 'tiers', Counter(d.get('tier') for d in D['islands']),
          'biomes', Counter(d.get('biome') for d in D['islands']))


if __name__ == '__main__':
    main()
