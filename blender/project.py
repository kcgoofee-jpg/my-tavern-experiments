"""斜视投影（Python 版）。与 map/core/project.mjs 同一规格；tests/fixtures/project_golden.json 对拍（smoke）。纯 Python，不依赖 bpy。
设计：docs/design/depth-system.md §8。世界坐标一律米：(x·100, y·100, alt)，x 东、y 北、z 上（岛表单位 100 m）。

  camera_basis(az_deg, pitch_deg)       相机朝向：az = 相机所在方位（北 0°、顺时针），pitch = 俯角
  fit_camera(view, focus, pts, aspect)  求相机位置：焦点落在 view.focus_frame，所有点落在画框内（留边 view.margin）
  project(p, cam)                       → [u, v, depth]：u / v 为画幅归一化坐标（左上原点），depth 为到相机平面的距离（米）
  label_rule(visible_ratio, occ)        → 'normal' | 'lift' | 'dot'（遮挡规则，view.occlusion）
相机 dict：{pos, right, up, fwd, lens_mm, sensor_mm, aspect}（写进成图 meta.json，前端与三维模式都读它）。
"""
import math


def _r(x): return math.floor(float(x) * 1e4 + 0.5) / 1e4


def _norm(v): n = math.sqrt(sum(c * c for c in v)); return [c / n for c in v]


def _cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _dot(a, b): return sum(x * y for x, y in zip(a, b))


def camera_basis(az_deg, pitch_deg):
    az, p = math.radians(az_deg), math.radians(pitch_deg)
    fwd = [-math.sin(az) * math.cos(p), -math.cos(az) * math.cos(p), -math.sin(p)]
    right = _norm(_cross(fwd, [0, 0, 1])); up = _cross(right, fwd)
    return fwd, right, up


def project(p, cam):
    d = [p[i] - cam['pos'][i] for i in range(3)]
    z = _dot(d, cam['fwd'])
    k = cam['lens_mm'] / cam['sensor_mm'] / max(z, 1e-6)
    u = 0.5 + _dot(d, cam['right']) * k
    v = 0.5 - _dot(d, cam['up']) * k * cam['aspect']
    return [_r(u), _r(v), _r(z)]


def fit_camera(view, focus, pts, aspect):
    """焦点投到 focus_frame，其余点全部落在 [margin, 1 − margin]；先定朝向，再二分距离、迭代平移。"""
    c = view['camera']; fwd, right, up = camera_basis(c['az_deg'], c['pitch_deg'])
    fu, fv = c.get('focus_frame') or [0.5, 0.5]; m = view.get('margin', 0.04)

    def cam_at(dist):
        T = list(focus)
        for _ in range(30):                      # 平移视线目标，让焦点落到 focus_frame
            cam = dict(pos=[T[i] - fwd[i] * dist for i in range(3)], right=right, up=up, fwd=fwd,
                       lens_mm=c['lens_mm'], sensor_mm=c.get('sensor_mm', 36.0), aspect=aspect)
            u, v, z = project(focus, cam)
            du, dv = u - fu, v - fv
            if abs(du) < 1e-5 and abs(dv) < 1e-5: break
            s = z * c.get('sensor_mm', 36.0) / c['lens_mm']
            T = [T[i] + right[i] * du * s - up[i] * dv * s / aspect for i in range(3)]
        return cam

    def fits(cam): return all(m <= u <= 1 - m and m <= v <= 1 - m and z > 0 for u, v, z in (project(p, cam) for p in pts))
    if c.get('focus_frame') is None:                 # 不指定焦点位置：整体包围盒居中（先粗定距离，再把包围盒中心移到画面中心）
        cen = [sum(p[i] for p in pts) / len(pts) for i in range(3)]; focus = cen; fu, fv = 0.5, 0.5
        for _ in range(6):
            lo, hi = 100.0, 200000.0
            for _ in range(60):
                mid = (lo + hi) / 2
                if fits(cam_at(mid)): hi = mid
                else: lo = mid
            cam = cam_at(hi); U_ = [project(p, cam) for p in pts]
            bu = (min(u for u, _, _ in U_) + max(u for u, _, _ in U_)) / 2; bv = (min(v for _, v, _ in U_) + max(v for _, v, _ in U_)) / 2
            s = hi * c.get('sensor_mm', 36.0) / c['lens_mm']
            focus = [focus[i] + right[i] * (bu - .5) * s - up[i] * (bv - .5) * s / aspect for i in range(3)]
    lo, hi = 100.0, 200000.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if fits(cam_at(mid)): hi = mid
        else: lo = mid
    cam = cam_at(hi)
    return {k: ([_r(x) for x in v] if isinstance(v, list) else v) for k, v in cam.items()}


def label_rule(visible_ratio, occ):
    if visible_ratio <= 0 and occ.get('dot_when_hidden', True): return 'dot'
    if visible_ratio < occ.get('hide_ratio', 0.4) and occ.get('lift_label', True): return 'lift'
    return 'normal'
