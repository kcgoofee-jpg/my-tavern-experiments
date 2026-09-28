#!/usr/bin/env python3
"""斜视投影对拍（Python 侧）：blender/project.py 对 tests/fixtures/project_golden.json。"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import project as PJ
G = json.load(open(os.path.join(ROOT, 'tests', 'fixtures', 'project_golden.json'), encoding='utf-8'))
ok = [PJ.project(p, G['cam']) for p in G['points']] == G['uv'] and all(PJ.label_rule(r, G['view']['occlusion']) == w for r, w in G['rules'])
ok = ok and PJ.fit_camera(G['view'], G['points'][0], G['points'], G['cam']['aspect']) == G['cam']
print('project golden (python):', 'ok' if ok else '不一致'); sys.exit(0 if ok else 1)
