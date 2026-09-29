#!/usr/bin/env python3
"""上层 v10（用户 2026-09-28：岛太多太密 → 只留卡里有的地点，靠高度与远近做纵深）。
由 v8 的 blender/data/tc_islands.json 生成 blender/data/tc_islands_v10.json：
- 伊甸、银冠堡不动；气候调节塔保持原位（塔身在 tiancheng_upper.py 里，不需要岛）；
- 卡里有的 7 座岛分到高 / 中 / 低三层，画出半径 = 真实半径 × 深度系数（1.0 / 0.8 / 0.62），各给一种群落；
- 另留 5 座无名远景小岛（低层，只为纵深：卡里每座岛都是私人庄园，不标记），其余岛全部删掉。
渲染 / 合成 / 加霾同 v9（TC_ISLANDS 环境变量）；规则见 docs/upper-v9-layout.md 的 v10 节。
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = {'high': 1.0, 'mid': .8, 'low': .62}
# id: (真实平均半径 ×100 m, 层, z, 群落, 新位置 x, y；None = 原位)
CARD = {
    'isle30': (1.85, 'high', 6.8, 'water', (11.2, 3.6)),     # 罗斯柴尔德庄园：近相机、最清楚；冬园 + 长水池
    'isle6': (1.45, 'high', 6.2, 'meadow', (11.6, -1.9)),    # 首相府
    'isle10': (1.45, 'mid', 4.4, 'orchard', (7.4, 0.9)),     # 凯莉的宅邸
    'isle9': (1.55, 'mid', 4.0, 'autumn', (-8.6, 4.9)),      # 庄园主联盟会所
    'isle25': (1.75, 'high', 5.8, 'meadow', (11.9, -6.3)),   # 精英学院（气候塔东侧）
    'isle4': (1.65, 'low', 2.2, 'autumn', (5.2, 7.4)),       # 维克多庄园：低、远、旧（秋林）
    'isle5': (2.4, 'low', 1.6, 'conifer', (-3.6, -6.4)),     # 「Y」的庄园：全城最大，但压得最低、雾最重（从不露面）
}
FAR = {   # 无名远景小岛：低层，只为纵深
    'isle14': (1.2, 1.3, 'rock', (-12.6, 1.4)), 'isle18': (1.1, 2.0, 'heath', (-12.4, 7.4)), 'isle31': (1.2, 1.2, 'conifer', (2.6, -8.2)),
    'isle23': (1.05, 1.8, 'rock', (13.4, 7.6)), 'isle13': (1.15, 1.1, 'heath', (-6.8, -1.6)),
}
TERRAIN = {'rock': 'crag', 'conifer': 'crag', 'water': 'lake', 'meadow': 'meadow', 'autumn': 'meadow', 'heath': 'meadow', 'orchard': 'meadow'}


def main():
    D = json.load(open(os.path.join(ROOT, 'blender/data/tc_islands.json'), encoding='utf-8'))
    out = []
    for d in D['islands']:
        if d['id'] in ('eden', 'silver_crown'): d['tier'] = 'mid'; out.append(d); continue
        spec = CARD.get(d['id']) or FAR.get(d['id'])
        if not spec: continue
        if d['id'] in CARD: R, t, z, b, xy = spec
        else: R, z, b, xy = spec; t = 'low'
        asp = d['ry'] / d['rx']; a = R * F[t] / math.sqrt(asp)
        d.update(rx=round(a, 4), ry=round(a * asp, 4), z=z, tier=t, biome=b, terrain=TERRAIN[b], true_r_m=round(R * 100))
        if xy: d['x'], d['y'] = xy
        for k in ('shape', 'rim'): d.pop(k, None)
        out.append(d)
    D['islands'] = out
    D['_v10'] = 'tools/upper_layout_v10.py：只留卡里有的岛 + 5 座无名远景低岛'
    p = os.path.join(ROOT, 'blender/data/tc_islands_v10.json')
    open(p, 'w', encoding='utf-8').write(json.dumps(D, ensure_ascii=False, indent=1) + '\n')
    for d in out: print(d['id'], d.get('tier'), d.get('biome'), d['x'], d['y'], d['rx'])


if __name__ == '__main__':
    main()
