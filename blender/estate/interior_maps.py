# 伊甸庄园 · 窗内箱体贴图（INTERIOR-WINDOWS 1）。所有权：INTERIOR 建造者。
# 一台相机放在房间虚拟箱体的视点上，沿箱体的 6 个面各渲一张：像平面就贴在那张箱面上（画面的水平 / 竖直全幅 =
# 该面在相机画面里的水平 / 竖直跨度，用移轴把面心推到画面中心），箱面与像平面平行 ⇒ 投影是仿射的，
# 所以着色器里「射线打进箱内 → 命中哪张面 → 按面上的比例取 uv」和这里出的图是同一套展开，
# 不需要球面 / 立方投影。箱体 = 房间净空：长边算「深」（看进去的方向），短边算「宽」，竖直是「高」；
# clip_end 收在箱面上，箱外的邻居房间被切掉，切出来的空处在拼版时补成该面的平均色。
# 面表 FACES 用箱体自己的轴序 (x=宽, y=高, z=深)，与 map/three/interior-look.mjs 的 FACES 逐行对拍
# （tests/interior_faces.test.mjs 与 python3 tools/test_interior_maps.py）；n = 箱面外法线，up = 画面的上方向，
# 画面水平轴 = n × up（右手系下正好是相机的 +X）。
# 入口：blender/eden_interior_maps.py（经 tools/render_queue.sh 提交）；
# 出图 <out-dir>/<variant>/<类别>_<面>.png + <out-dir>/rooms.json。
import json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
if BLENDER_DIR not in sys.path: sys.path.insert(0, BLENDER_DIR)

FLAGS = ('--closeup', '--data-only', '--preview', '--no-furniture', '--no-assets', '--fast', '--no-export')

# 类别名是通用的房间种类（贴图名与引擎都用它；卡里的房间名只活在这张表的 room 一列）
ROOMS = (
    dict(cat='bedroom', room='315'),
    dict(cat='corridor', room='115'),
    dict(cat='study', room='212'),
    dict(cat='salon', room='119'),
    dict(cat='service', room='404'),
    dict(cat='stairs', room='108'),
)
# n = 箱面的外法线，up = 画面的上方向；都在箱体局部系 (x=宽, y=高, z=深) 里给；画面水平轴 = n × up（右手系下 = 相机 +X）
FACES = (
    dict(k='far', n=(0, 0, 1), up=(0, 1, 0)),        # 正对窗的远墙
    dict(k='near', n=(0, 0, -1), up=(0, 1, 0)),      # 窗所在的那面墙（只在掠射角看见）
    dict(k='right', n=(1, 0, 0), up=(0, 1, 0)),
    dict(k='left', n=(-1, 0, 0), up=(0, 1, 0)),
    dict(k='top', n=(0, 1, 0), up=(0, 0, 1)),        # 顶棚：画面上方 = 往里（深）
    dict(k='bottom', n=(0, -1, 0), up=(0, 0, 1)),    # 地面
)
NIGHT = dict(sun=0.015, sky_color=(0.16, 0.20, 0.30), sky=0.05,
             lamp_color=(1.0, 0.72, 0.42), lamp_watts=210, bulb=26.0)
DAY = dict(lamp_color=(0.92, 0.95, 1.0), lamp_watts=430, bulb=0.8)   # 冷白补光：墙没留窗洞，太阳进不来，见 add_lamps
EYE_IN = 0.32        # 视点从箱心往「窗那面墙」（局部 −深）拉这么深：站在窗前往里看，家具才进画
EYE_W = -0.42        # 横向也偏到一侧（贴着窗角看）：居中的视点只看得到一面正对的平墙，没有纵深
EYE_H = 1.60         # 视点离地（米）：外壳的窗只按本层开，通高空间（楼梯厅）抬到二层标高就进了没有窗的密封格，白天全黑
CLIP_SLACK = 0.45    # 每张面往后多渲这么多米：房间 h 比层高矮，顶面正好卡在天花板前一点


def _dot(a, b): return sum(x * y for x, y in zip(a, b))
def _cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _norm(a):
    l = sum(x * x for x in a) ** 0.5
    return tuple(x / l for x in a) if l else (0.0, 0.0, 0.0)


def room_box(room, inner_rect):
    """房间箱体：中心 + 三半幅 + 世界轴向（局部 x/y/z 各指向哪个世界方向）+ 视点。
    高永远是世界 +Z；深取长边的水平方向（+X 或 +Y）；宽 = 高 × 深，于是 (宽, 高, 深) 构成右手系，
    与着色器那边「窗面法线 + 世界上方向」推出来的局部系同一套约定。"""
    x0, x1, y0, y1 = inner_rect(room)
    wx, wy = (x1 - x0) / 2.0, (y1 - y0) / 2.0
    h = room['h'] or 3.0
    hh = h / 2.0
    center = ((x0 + x1) / 2.0, (y0 + y1) / 2.0, room['z'] + hh)
    if wx >= wy:      # 长边 X：深 = +X，宽 = Z × X = +Y
        axes, half = ((0, 1, 0), (0, 0, 1), (1, 0, 0)), (wy, hh, wx)
    else:             # 长边 Y：深 = +Y，宽 = Z × Y = −X
        axes, half = ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), (wx, hh, wy)
    el = (EYE_W * half[0], min(hh - 0.05, EYE_H - hh), -EYE_IN * half[2])   # 视点（局部系 x=宽 y=高 z=深）：靠窗、偏一侧、离地 1.6 m
    eye = tuple(center[k] + sum(el[i] * axes[i][k] for i in range(3)) for k in range(3))
    return dict(center=center, half=half, axes=axes, eye=eye)


def face_shot(box, face, res):
    """一面箱面的取景：像平面距离 dist、水平 / 竖直半幅 ext_r / ext_u、移轴 shift、世界方向与分辨率。
    纯元组运算（不碰 bpy / mathutils），对拍测试直接 import 它跑。
    相机放在视点（可以不在箱心）：像平面贴在这张箱面上，面与像平面平行，所以投影是仿射的 —— 面的四条边正好
    对上画面四条边，着色器按「面上的比例」取 uv 就严格一致；视点偏出去用移轴补。"""
    half, axes, c, eye = box['half'], box['axes'], box['center'], box.get('eye') or box['center']
    n, u = _norm(face['n']), _norm(face['up'])
    right = _norm(_cross(n, u))
    world = lambda d: tuple(sum(d[i] * axes[i][k] for i in range(3)) for k in range(3))
    N, U, R = world(n), world(u), world(right)
    a = max(range(3), key=lambda i: abs(n[i]))
    sgn = 1 if n[a] > 0 else -1
    oth = [i for i in range(3) if i != a]
    ds, xs, ys = [], [], []
    for s0 in (1, -1):
        for s1 in (1, -1):
            p = [0.0, 0.0, 0.0]
            p[a], p[oth[0]], p[oth[1]] = sgn * half[a], s0 * half[oth[0]], s1 * half[oth[1]]
            w = tuple(c[k] + sum(p[i] * axes[i][k] for i in range(3)) for k in range(3))
            d = tuple(w[k] - eye[k] for k in range(3))
            ds.append(_dot(d, N)); xs.append(_dot(d, R)); ys.append(_dot(d, U))
    dist = sum(ds) / len(ds)
    if min(ds) < 0.01 or max(ds) - min(ds) > 1e-6 * max(1.0, dist):
        raise SystemExit(f'face {face["k"]}: 像平面不平行于箱面，或视点跑到了面外（{ds}）')
    ext_r, ext_u = max(0.2, (max(xs) - min(xs)) / 2.0), max(0.2, (max(ys) - min(ys)) / 2.0)
    shift = ((max(xs) + min(xs)) / 4.0 / ext_r, (max(ys) + min(ys)) / 4.0 / ext_u)
    # 方形像元：长边 = res，短边按该面比例，最少 64 px（走廊这类细长面不必渲到 4000 px 再压进格子）
    if ext_u >= ext_r: res_y, res_x = res, max(64, int(round(res * ext_r / ext_u)))
    else: res_x, res_y = res, max(64, int(round(res * ext_u / ext_r)))
    return dict(n=N, right=R, up=U, dist=dist, ext_r=ext_r, ext_u=ext_u, shift=shift, res=(res_x, res_y))


def set_variant(ctx, variant):
    """昼 = 现成的太阳 + 天光；夜 = 太阳压成月光、天光压暗。"""
    import bpy
    from . import views
    views.lights(ctx)
    sun = bpy.data.objects.get('est_sun')
    bg = (ctx.scene.world.node_tree.nodes.get('Background') if ctx.scene.world else None)
    if variant == 'night':
        if sun: sun.data.energy = NIGHT['sun']
        if bg:
            bg.inputs['Color'].default_value = (*NIGHT['sky_color'], 1)
            bg.inputs['Strength'].default_value = NIGHT['sky']
    elif sun: sun.data.energy = views.SUN['energy']


def add_lamps(ctx, box, variant):
    """箱体内两盏灯 + 一颗看得见的灯头（窗内得有光源，不是一片匀光）。
    灯挂在视点周围、不是箱心：通高空间（楼梯厅）的楼板把箱体切成几格，灯要落在相机那一格里才照得到画面，
    而箱心那条竖线正是电梯井（一根从 F1 通到 F5 的黄铜实心柱），灯摆那儿等于关在井里 —— 六面全黑过一次。
    白天也开灯：外壳的墙没有给窗留洞，太阳照不进室内（昼六面全黑过一次），所以昼面按冷白补光，当作天光。"""
    import bpy
    from mathutils import Vector
    V = NIGHT if variant == 'night' else DAY
    e = Vector(box['eye']); up, depth, wid = (Vector(box['axes'][i]) for i in (1, 2, 0))
    h = box['half']
    made = []
    tops = [(e + up * min(h[1] * 0.62, 1.9) + wid * h[0] * 0.28, V['lamp_watts']),
            (e + depth * h[2] * 0.5 + up * min(h[1] * 0.2, 0.6), V['lamp_watts'] * 0.5)]
    for i, (loc, watts) in enumerate(tops):
        ld = bpy.data.lights.new(f'iw_lamp{i}', 'POINT')
        ld.energy = watts; ld.color = V['lamp_color']; ld.shadow_soft_size = 0.16
        lo = bpy.data.objects.new(f'iw_lamp{i}', ld)
        ctx.scene.collection.objects.link(lo); lo.location = loc
        made.append(lo)
    name = f'iw_bulb_{variant}'
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        b.inputs['Emission Color'].default_value = (*V['lamp_color'], 1)
        b.inputs['Emission Strength'].default_value = V['bulb']
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=tuple(tops[0][0]))
    bulb = bpy.context.active_object; bulb.name = name
    bulb.data.materials.append(m)
    for cc in list(bulb.users_collection): cc.objects.unlink(bulb)
    ctx.scene.collection.objects.link(bulb)
    made.append(bulb)
    return made


def drop(objs):
    import bpy
    for o in objs:
        try: bpy.data.objects.remove(o)    # Blender 5.2：remove 不再收 do_unsafe
        except (ReferenceError, RuntimeError) as e: print(f'[iw] lamp left behind: {e}')   # 已删 / 不在库里：这次运行结束就没了


def place_cam(cam, box, shot, ctx):
    """相机放在视点，局部轴 (X, Y, Z) = (画面右, 画面上, -法线)；与 blender/oblique.py 同一套写 matrix_world 的写法。"""
    from mathutils import Matrix
    x, y, z = shot['right'], shot['up'], tuple(-v for v in shot['n'])
    ex, ey, ez = box.get('eye') or box['center']
    cam.matrix_world = Matrix(((x[0], y[0], z[0], ex), (x[1], y[1], z[1], ey), (x[2], y[2], z[2], ez), (0, 0, 0, 1)))
    cd = cam.data
    cd.type = 'PERSP'; cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0
    # 像平面全宽 = 2·ext_r 落在距离 dist 处：W = S·D/f ⇒ f = 36·dist/(2·ext_r)；移轴把面心推到画面中心
    cd.lens = 18.0 * shot['dist'] / shot['ext_r']
    cd.shift_x, cd.shift_y = shot['shift']
    # 出画留一点余量：箱体高来自房间的 h，比外壳的层高矮几十厘米，顶面那张正好落在天花板前面一点点，
    # 夹死在箱面上就成了「整张顶棚是空的」。多放 CLIP_SLACK 米：面后一点点几何会被投到这一面上（差百分之几，看不出来）。
    cd.clip_start, cd.clip_end = 0.05, shot['dist'] + CLIP_SLACK
    ctx.scene.camera = cam


def render_all(opt):
    """建一次庄园，逐房间 / 逐时段 / 逐面出图；返回写出的路径。"""
    import bpy, estate, tc_common as tc
    from . import core, plan, rooms, views
    res, samples = int(opt['--res']), int(opt['--samples'])
    variant = opt.get('--variant') or 'both'
    variants = ('day', 'night') if variant == 'both' else ((variant,) if variant in ('day', 'night') else None)
    if not variants: sys.exit(f'unknown --variant {variant!r}; use day|night|both')
    want = [c.strip() for c in str(opt.get('--rooms') or '').split(',') if c.strip()]
    picked = [r for r in ROOMS if not want or r['cat'] in want]
    errs, _ = plan.validate(verbose=False)
    # 与 estate.main 同一口径：maps.json 里五间功能间没有对应的 3D 房间，庄园出图一律带 --allow-unmatched 1
    allow = int(opt.get('--allow-unmatched', 0) or os.environ.get('EDEN_ALLOW_UNMATCHED', 0))
    if allow: errs = [e for e in errs if 'not matched' not in e]
    if errs: sys.exit('plan.validate failed: ' + '; '.join(errs[:5]))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ctx = core.Ctx(dict(opt))
    ctx.floors = plan.FLOOR_ORDER                      # 六面贴图要看得到楼上的楼板，全部楼层都建
    estate.build(ctx)
    tick(f'objects={len(bpy.data.objects)} meshes={len(bpy.data.meshes)}')   # 陈设没建出来时这里就会掉一截
    views.configure(ctx, res, samples)
    sc = ctx.scene
    sc.render.film_transparent = True
    cam = bpy.data.objects.get('iw_cam')
    if cam is None:
        cd = bpy.data.cameras.new('iw_cam'); cam = bpy.data.objects.new('iw_cam', cd)
        sc.collection.objects.link(cam)
    out_dir = os.path.abspath(opt['--out-dir'])
    outs, meta = [], {}
    for p in picked:
        room = plan.ROOM_BY_ID[p['room']]
        box = room_box(room, rooms.inner_rect)
        tick(f"{p['cat']} {p['room']}: coll_objects={len(core.room_coll(room).objects)}")
        meta[p['cat']] = dict(room=p['room'], center=[round(v, 3) for v in box['center']],
                              eye=[round(v, 3) for v in box['eye']], half=[round(v, 3) for v in box['half']], faces={})
        for va in variants:
            set_variant(ctx, va)
            lamps = add_lamps(ctx, box, va)
            try:
                for f in FACES:
                    shot = face_shot(box, f, res)
                    place_cam(cam, box, shot, ctx)
                    sc.render.resolution_x, sc.render.resolution_y = shot['res']
                    path = os.path.join(out_dir, va, f"{p['cat']}_{f['k']}.png")
                    outs += views.render(path, ctx)
                    meta[p['cat']]['faces'][f'{va}/{f["k"]}'] = dict(size=list(shot['res']), dist=round(shot['dist'], 3),
                                                                    shift=[round(v, 3) for v in shot['shift']])
            finally:
                drop(lamps)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'rooms.json'), 'w', encoding='utf-8') as fh:
        json.dump(dict(res=res, samples=samples, cats=[p['cat'] for p in picked],
                       faces=[f['k'] for f in FACES], rooms=meta), fh, ensure_ascii=False, indent=1)
    return outs


T0 = time.time()
def tick(msg): print(f'[{time.time() - T0:6.1f}s] {msg}', flush=True)


DEFAULT_OUT = os.path.join(BLENDER_DIR, '..', 'logs', 'campaign', 'interior-windows')


def main():
    import tc_common as tc
    tc.FLAGS = tuple(set(tc.FLAGS) | set(FLAGS))
    opt = tc.parse_args({'--res': '512', '--samples': '16'})
    if '--out-dir' not in opt:                      # --out 是队列 render_truth 的哨兵文件（rooms.json），目录跟着它走
        opt['--out-dir'] = os.path.dirname(os.path.abspath(opt['--out'])) if '--out' in opt else DEFAULT_OUT
    outs = render_all(opt)
    tick(f'done {len(outs)} images')
    return outs


if __name__ == '__main__':
    main()
