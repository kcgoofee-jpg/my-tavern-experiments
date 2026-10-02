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


# ---------------------------------------------------------------- 正交斜视（D41：docs/tiancheng-maps.md §0.2、附录 OBLIQUE-CODE B）
# 三层共用的朝向与比例尺；画框每层按内容拟合（ortho_frame），相机文件（cam_file）随每张底图发布，前端只读它。
OBLIQUE = dict(az_deg=165.0, pitch_deg=35.0, m_per_px=0.44, aspect=1.6, pad=0.03)
# 太阳：§0.2 写明「相机在东南、太阳在西南：侧光，影子落向东北」。方位按「从 +x 逆时针、指向太阳」记（225° = 西南）。
OBLIQUE_SUN_AZ = 225.0


def ortho_axes(az_deg=OBLIQUE['az_deg'], pitch_deg=OBLIQUE['pitch_deg']):
    """→ (right, up, fwd)，与透视分支同一个 camera_basis。"""
    fwd, right, up = camera_basis(az_deg, pitch_deg)
    return right, up, fwd


def ortho_ru(p, right, up):
    """世界点 → 画框平面坐标（米）：(沿 right, 沿 up)。"""
    return _dot(p, right), _dot(p, up)


def ortho_frame(pts, m_per_px=OBLIQUE['m_per_px'], aspect=OBLIQUE['aspect'], pad=OBLIQUE['pad'], z_c=0.0,
                az_deg=OBLIQUE['az_deg'], pitch_deg=OBLIQUE['pitch_deg'], snap=None):
    """按内容拟合画框：pts 的投影包围盒每边外扩 pad（宽高各乘 1 + pad），短边补齐到 aspect（None = 不补齐），
    像素取整（宽高都是整数像素，w_m = px · m_per_px 精确成立）。snap = (像素网格单位 m, 原点 r, 原点 u)：画框左 / 上边落在该网格上。
    中心点取视线与 z = z_c 平面的交点。返回 frame dict（centre_m / w_m / h_m / px）。"""
    right, up, fwd = ortho_axes(az_deg, pitch_deg)
    R = [ortho_ru(p, right, up) for p in pts]
    r0, r1 = min(r for r, _ in R), max(r for r, _ in R); u0, u1 = min(u for _, u in R), max(u for _, u in R)
    w, h = (r1 - r0) * (1 + pad), (u1 - u0) * (1 + pad); rc, uc = (r0 + r1) / 2, (u0 + u1) / 2
    if aspect:
        if w / h < aspect: w = h * aspect
        else: h = w / aspect
        k = 16 if abs(aspect - 1.6) < 1e-9 else 1                    # 16 : 10 精确：宽是 16 的倍数
        W = int(math.ceil(w / m_per_px / k)) * k; H = int(round(W / aspect))
    else:
        W, H = int(math.ceil(w / m_per_px)), int(math.ceil(h / m_per_px))
    left, top = rc - W * m_per_px / 2, uc + H * m_per_px / 2
    if snap:                                                          # 左 / 上边对齐到主图像素网格（插图与主图逐像素对齐）
        g, gr, gu = snap
        left = gr + math.floor((left - gr) / g) * g; top = gu - math.floor((gu - top) / g) * g
        W = int(math.ceil((rc + w / 2 - left) / m_per_px)); H = int(math.ceil((top - (uc - h / 2)) / m_per_px))
        W += W % 2; H += H % 2                                       # 2 倍密度：宽高取偶数，正好是主图整像素
    rc, uc = left + W * m_per_px / 2, top - H * m_per_px / 2
    t = (z_c - uc * up[2]) / fwd[2]                                   # right_z = 0
    c = [rc * right[i] + uc * up[i] + t * fwd[i] for i in range(3)]
    return dict(centre_m=[round(x, 6) for x in c], w_m=round(W * m_per_px, 6), h_m=round(H * m_per_px, 6), px=[W, H])


def cam_file(frame, m_per_px=OBLIQUE['m_per_px'], az_deg=OBLIQUE['az_deg'], pitch_deg=OBLIQUE['pitch_deg']):
    """相机文件（附录 OBLIQUE-CODE B 的字段）；hash = 朝向 + 比例 + 画框的 sha256 前 16 位。"""
    import hashlib, json
    right, up, fwd = ortho_axes(az_deg, pitch_deg)
    cam = dict(proj='ortho', az_deg=az_deg, pitch_deg=pitch_deg, m_per_px=m_per_px,
               right=[round(x, 12) for x in right], up=[round(x, 12) for x in up], fwd=[round(x, 12) for x in fwd],
               frame=dict(frame), map_m=dict(origin='column-centre', x='east', y='north'))
    cam['hash'] = hashlib.sha256(json.dumps(cam, sort_keys=True).encode()).hexdigest()[:16]
    return cam


def project_ortho(p, cam):
    """→ [u, v]：画框归一化坐标（左上原点）。u = 0.5 + dot(p − c, right) / w_m，v = 0.5 − dot(p − c, up) / h_m。"""
    f = cam['frame']; d = [p[i] - f['centre_m'][i] for i in range(3)]
    return [0.5 + _dot(d, cam['right']) / f['w_m'], 0.5 - _dot(d, cam['up']) / f['h_m']]


def unproject_ortho(u, v, cam, z0):
    """画框点 (u, v) → 视线与 z = z0 平面的交点（米）。"""
    f = cam['frame']; c = f['centre_m']
    q = [c[i] + (u - 0.5) * f['w_m'] * cam['right'][i] - (v - 0.5) * f['h_m'] * cam['up'][i] for i in range(3)]
    t = (z0 - q[2]) / cam['fwd'][2]
    return [q[i] + t * cam['fwd'][i] for i in range(3)]


def affine_ortho(cam):
    """2 × 4 仿射矩阵 A：[u, v]ᵀ = A · [X, Y, Z, 1]ᵀ。"""
    f = cam['frame']; c = f['centre_m']; R, U = cam['right'], cam['up']
    ru = [R[i] / f['w_m'] for i in range(3)]; uv = [-U[i] / f['h_m'] for i in range(3)]
    return [ru + [0.5 - _dot(c, ru)], uv + [0.5 - _dot(c, uv)]]


def ortho_depth(p, cam):
    """沿视线的深度（米，越小越近）：dot(p − c, fwd)。"""
    c = cam['frame']['centre_m']; return _dot([p[i] - c[i] for i in range(3)], cam['fwd'])


def label_rule(visible_ratio, occ):
    if visible_ratio <= 0 and occ.get('dot_when_hidden', True): return 'dot'
    if visible_ratio < occ.get('hide_ratio', 0.4) and occ.get('lift_label', True): return 'lift'
    return 'normal'
