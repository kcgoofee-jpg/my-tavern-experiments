#!/usr/bin/env python3
"""纵深数学对拍（Python 侧）：blender/depth.py 对 tests/fixtures/depth_golden.json。--regen 重生成期望值（改公式时，JS 侧 tests/depth.test.mjs 要同时通过）。"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import depth as DP
FX = os.path.join(ROOT, 'tests', 'fixtures', 'depth_golden.json')
G = json.load(open(FX, encoding='utf-8'))
got = {k: DP.island(k, G['cfg']) for k in G['cfg']['islands']}
if '--regen' in sys.argv:
    G['expected'] = got; json.dump(G, open(FX, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print('regenerated'); sys.exit(0)
bad = [k for k in G['expected'] if json.dumps(got.get(k), sort_keys=True) != json.dumps(G['expected'][k], sort_keys=True)]
print('depth golden (python):', 'ok' if not bad else f'不一致 {bad}'); sys.exit(1 if bad else 0)
