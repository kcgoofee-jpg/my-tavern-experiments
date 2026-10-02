#!/usr/bin/env python3
"""斜视投影对拍（Python 侧）：blender/project.py 对 tests/fixtures/project_golden.json。"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import project as PJ
G = json.load(open(os.path.join(ROOT, 'tests', 'fixtures', 'project_golden.json'), encoding='utf-8'))
ok = [PJ.project(p, G['cam']) for p in G['points']] == G['uv'] and all(PJ.label_rule(r, G['view']['occlusion']) == w for r, w in G['rules'])
ok = ok and PJ.fit_camera(G['view'], G['points'][0], G['points'], G['cam']['aspect']) == G['cam']
# 正交分支（D41）：朝向与附录 OBLIQUE-CODE B 的数值一致；投影 / 反算往返误差 < 1e-6；仿射矩阵与逐点投影一致；画框 16 : 10、整像素
pts = [[-1500, -937.5, 800], [1500, 937.5, 1500], [1500, -937.5, 800], [-1500, 937.5, 1500], [120, 40, 1450]]
cam = PJ.cam_file(PJ.ortho_frame(pts, z_c=1150.0)); f = cam['frame']
ok_o = all(abs(a - b) < 1e-4 for a, b in zip(cam['right'] + cam['up'] + cam['fwd'], [0.9659, 0.2588, 0, -0.1485, 0.554, 0.8192, -0.212, 0.7912, -0.5736]))
ok_o = ok_o and f['px'][0] * 10 == f['px'][1] * 16 and abs(f['w_m'] - f['px'][0] * 0.44) < 1e-6 and abs(f['centre_m'][2] - 1150) < 1e-3
A = PJ.affine_ortho(cam)
for p in pts + [[333.3, -12.5, 990.0]]:
    u, v = PJ.project_ortho(p, cam); q = PJ.unproject_ortho(u, v, cam, p[2])
    ok_o = ok_o and max(abs(q[i] - p[i]) for i in range(3)) < 1e-6 and 0 <= u <= 1 and 0 <= v <= 1
    ok_o = ok_o and abs(sum(a * b for a, b in zip(A[0], p + [1])) - u) < 1e-9 and abs(sum(a * b for a, b in zip(A[1], p + [1])) - v) < 1e-9
ins = PJ.ortho_frame([[0, 0, 1450], [300, 200, 1300]], 0.22, None, .1, 1450.0, snap=(0.44, PJ.ortho_ru(f['centre_m'], cam['right'], cam['up'])[0] - f['w_m'] / 2,
                     PJ.ortho_ru(f['centre_m'], cam['right'], cam['up'])[1] + f['h_m'] / 2))
x0 = 0.5 + PJ._dot([ins['centre_m'][i] - f['centre_m'][i] for i in range(3)], cam['right']) / f['w_m'] - ins['w_m'] / (2 * f['w_m'])
ok_o = ok_o and abs(x0 * f['px'][0] - round(x0 * f['px'][0])) < 1e-3 and ins['px'][0] % 2 == 0
print('ortho (python):', 'ok' if ok_o else '不一致', f['px'])
print('project golden (python):', 'ok' if ok else '不一致'); sys.exit(0 if ok and ok_o else 1)
