"""下层斜视成图（D41 批 3；设定 docs/tiancheng-maps.md §0.3 / §0.4 / §0.8，相机文件格式见附录 OBLIQUE-CODE B）。

由 blender/tiancheng_low.py 在 TC_OBLIQUE=1 时调用：地基区已经建好（100 m 单位，地面 z = 0），这里接管时段光照、
共用正交相机、画框拟合、成图与相机文件。相机是三层共用那套（§0.2：正交、方位 165°、俯角 35°、0.44 m/px），
下层地面 z = 0（L34）；本层两个班次同一画框，因此相机文件哈希相同。

下层没有日照（L34、L363）：不画太阳、不画天光、不出蓝天环境光，头顶是中层底板漏下来的一点暗橙。所以两班都是
人造光体系（§0.4）：
  白班（--obtod dayshift，兼晨 / 昼时段）工厂全开、炉口与屋顶天窗透出橙光，钠灯全亮，货运铁路有车头灯；
      7 号井竖井口落下全层唯一的天光——一道冷白光柱，在地面落成一块光斑。
  夜班（--obtod nightshift，兼昏 / 夜时段）工厂只开一部分、暗下去的厂房更多，钠灯照旧，
      黑市 / 汤锅 / 拳场一带的零碎霓虹更亮，贫民窟里更多纯黑的角落；井口只剩中层漏下来的一点紫青色。

构建始终走默认那一份夜景几何与灯光（脚本参数不带 --day），两班只是把各组自发光与灯按倍数调上去调下来。

用法（经 tools/render_queue.sh 提交）：
  blender -b --factory-startup --python-expr "import os, runpy; os.environ['TC_OBLIQUE']='1'; runpy.run_path('blender/tiancheng_low.py', run_name='__main__')" -- \
      --samples 16 --obres 2000 --obtod dayshift --no-data --out logs/campaign/rb3/dayshift_2000.png [--exr 1] [--dark 1]
  --obres：成图宽；0 或不给 = 相机文件里的定稿像素（同一画框的低分辨率草图，哈希不变）。
  --exr 1：自检用，另出 <out>_emit.png 源图（只有相机直接看到的发光面），灯光对象位置写进 meta。
  --dark 1：只出暗检图 <out>_dark.png（512 px，所有灯与自发光关掉，只留 7 号井光柱），不渲主图（§0.8 第 5 条）。
每张成图旁写 <out>.meta.json：相机文件、班次、画框来源、7 号井坐标、灯光对象画框坐标。
"""
import json, math, os, sys, time
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import tc_common as tc
import tc_detail as td
import project as PJ
import oblique as OB

UNIT = 100.0                             # 层脚本 1 单位 = 100 m
TIER = (0.0, 200.0)                      # 下层高度范围（L34）：地面 0，地下设施最深约 200 m（不剖开）
COLUMN = (1500.0, 937.5)                 # 中心柱半宽 / 半高（三层同一块 3000 × 1875 m 片区）
Z0 = 0.0                                 # 场景 z = 0 = 地面 = 海拔 0 m
Z_C = sum(TIER) / 2
FLAT = ('low_ground', 'roads', 'water', 'parks', 'ground')   # 地面平铺只是衬底，不参与画框拟合
SLACK = 250.0                               # 平面中心超出中心柱这个余量（米）的对象不进画框拟合
WELL7 = (4.6, -6.9)                      # 7 号井（与 tiancheng_low.py 同坐标，平面单位）
SHAFT_TOP = .58                          # 竖井口高度（平面单位）：中层底板下方
T0 = time.time()

# 班次：环境色、环境强度、曝光、点光倍数、工厂组倍数、零碎霓虹组倍数、井口光柱
PERIODS = {
    'dayshift':   dict(amb=(.50, .38, .25), ambi=.19, exp=0.0, lamp=1.00, industry=1.70, market=.55, well='day'),
    'nightshift': dict(amb=(.50, .38, .25), ambi=.09, exp=0.0, lamp=0.90, industry=0.40, market=1.55, well='night'),
}
# 自发光分组（材质名的子串）：工业区的工作灯与场区灯一组（白班全开、夜班只开一部分），黑市 / 汤锅 / 贫民窟的
# 零碎窗光一组（夜班更亮），钠灯与机构窗光两班一样。
# 注：下层场景里没有高炉——tiancheng_low.py 的钢厂一段挂在 `if FURN:` 上，而 FURN 的选址始终没解出（构建日志里
# 没有钢厂那一行，industrial fill 的 fires 也是 0），所以「工厂全开」只能由确实存在的工业工作灯与橙色出铁光承担。
GROUPS = dict(industry=('filllamp', 'amc_fluor', 'yard_sodium'),
              market=('slumdot', 'darkfill', 'soup_fire', 'lmhead'))
COLUMN_MAT = 'well7_column'


def tick(msg): print(f'[low_oblique {time.time() - T0:6.1f}s] {msg}', flush=True)


def to_m(p):
    """层脚本坐标（100 m 单位）→ 米制世界（x 东、y 北、z 海拔）。"""
    return [p[0] * UNIT, p[1] * UNIT, p[2] * UNIT + Z0]


def corners(sc, skip=()):
    """场景里可见实体的包围盒角点（米）。只有整个包围盒都在中心柱之内的对象参与画框拟合：
    地面平铺只是衬底，伸出柱外的悬空连线（通区全城的铁路与站台，一件网格就是整片）也不该把画框撑大——
    下层画框由中心柱定（§0.2：约 3520 × 2200 m），柱外的部分在边上出画。"""
    pts, out = [], []
    for o in sc.objects:
        if o.type != 'MESH' or o.hide_render or o.name in skip or not o.visible_get(): continue
        cs = [to_m(o.matrix_world @ Vector(c)) for c in o.bound_box]
        if any(abs(p[0]) > COLUMN[0] or abs(p[1]) > COLUMN[1] for p in cs):
            out.append(o.name); continue
        pts += cs
    tick(f'frame: {len(pts) // 8} objects in, {len(out)} out' + (': ' + ', '.join(out[:12]) if out else ''))
    return pts


def fit_camera(sc):
    """画框（§0.2）：中心柱在本层高度范围内的投影 + 本层全部实体，外扩 3 %，补齐 16 : 10，取整像素。"""
    box = [[sx * COLUMN[0], sy * COLUMN[1], z] for sx in (-1, 1) for sy in (-1, 1) for z in TIER]
    cam = PJ.cam_file(PJ.ortho_frame(box + corners(sc, FLAT), z_c=Z_C))
    f = cam['frame']
    tick(f"frame {f['px']} {f['w_m']} x {f['h_m']} m  hash {cam['hash']}")
    return cam


def ground_out(sc, span=(130.0, 90.0)):
    """地面衬底：绝对尺寸铺到画框外（顶视图只铺到 1.2 倍片区；斜视看得见画框外，不铺远就会看见地块的硬边）。
    tc_common.road_plane 建的面叫 'Plane'（没改名），按名字与材质两路认；缩放给绝对值而不是乘倍数——
    实测 road_plane 的 scale 到了这一步已经不是 (W·1.2, H·1.25)，乘倍数只会把一块 100 m 的小板放大成 260 m 的小板。
    材质也换成沥青：city_mat 的底色取自顶点色属性，平面没有这个属性，整块地面会是黑的，把所有灯光光池都吞掉。"""
    hit = []
    for o in sc.objects:
        if o.type != 'MESH' or o.name in ('roads', 'roads_joints'): continue
        # 只认tc_common.road_plane 建的那块地面：对象名 'Plane'，或者材质正好是低层地面那个 'lowground'。
        # 不能按 'road' / 'ground' 这种通用材质名去认——roads_mesh 的材质也叫 'road'，会把整张街网放大成 13 km。
        if o.name != 'Plane' and not any(m and m.name == 'lowground' for m in o.data.materials): continue
        o.scale = (span[0], span[1], 1.0); o.name = 'low_ground'
        mg = td.asphalt_mat('low_ground_mat', (.062, .058, .052), 1.5)
        tc.set_in(tc.bsdf_of(mg), ('Specular IOR Level', 'Specular'), .06)
        o.data.materials.clear(); o.data.materials.append(mg)
        hit.append(o.name)
    bpy.context.view_layer.update()
    d = next((o.dimensions for o in sc.objects if o.name == 'low_ground'), None)
    tick(f'ground plate {hit} -> {round(d.x * UNIT)} x {round(d.y * UNIT)} m' if d else f'ground plate {hit}: NOT FOUND')


# ---------------------------------------------------------------- 灯光
def emission_groups(P):
    """按组缩放自发光：工厂组与零碎霓虹组两班不同，其余不动（每盏灯头的自发光与它那盏灯同组缩放，
    所以功率和它在地上的光池不会脱节）。"""
    done = {}
    for key, tokens in GROUPS.items():
        n = 0
        for m in bpy.data.materials:
            if not any(t in m.name for t in tokens): continue
            nt = getattr(m, 'node_tree', None)
            if nt is None: continue
            for nd in nt.nodes:
                if nd.type == 'EMISSION' and not nd.inputs['Strength'].is_linked: nd.inputs['Strength'].default_value *= P[key]; n += 1
                elif nd.type == 'BSDF_PRINCIPLED' and not nd.inputs['Emission Strength'].is_linked:
                    nd.inputs['Emission Strength'].default_value *= P[key]; n += 1
        done[key] = n
    return done


def well_column(sc, mode):
    """7 号井竖井口的光柱（§0.4）：白班是全层唯一的天光——冷白光柱 + 地面光斑；夜班只剩一点紫青色漏光。
    自发光材质 + 透明混合，只对相机可见（不照亮别处，真正的光还是那盏井口面光源）。"""
    x, y = WELL7
    m = bpy.data.materials.new(COLUMN_MAT); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    for x_ in [n for n in N if n.type != 'OUTPUT_MATERIAL']: N.remove(x_)
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    col = (.72, .84, 1.0, 1) if mode == 'day' else (.42, .34, .78, 1)      # 白班冷白，夜班紫青
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = col
    em.inputs['Strength'].default_value = 1.15 if mode == 'day' else .16
    tcn = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tcn.outputs['Generated'], sep.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .05; mr.inputs['From Max'].default_value = .85
    mr.inputs['To Max'].default_value = .85 if mode == 'day' else .5; L.new(sep.outputs['Z'], mr.inputs['Value'])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(mr.outputs['Result'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    o = tc.cyl_mesh(COLUMN_MAT, cyl_params(x, y, .02, .30, SHAFT_TOP - .02), m, 28)
    o.visible_shadow = False; o.visible_diffuse = False; o.visible_glossy = False; o.visible_transmission = False
    ld = bpy.data.lights.get('shaft_sky')
    if ld: ld.energy = 7.0 if mode == 'day' else .5                # 井口面光源：白班是那束天光，夜班只剩漏光
    tick(f"well-7 column ({mode})")


def cyl_params(x, y, z0, r, h):
    """tc.cyl_mesh 的一行参数 (x, y, z0, r, h)。"""
    import numpy as np
    return np.array([[x, y, z0, r, h]], np.float32)


def apply_period(sc, P, tod):
    """班次：只留人造光（没有太阳、没有天光）；井口光柱按班次重建；两组自发光与点光按倍数缩放。"""
    for o in [o for o in sc.objects if o.type == 'LIGHT' and o.data.type == 'SUN']: bpy.data.objects.remove(o, do_unlink=True)
    n = 0
    for l in bpy.data.lights:
        if l.type in ('POINT', 'AREA', 'SPOT'): l.energy *= P['lamp']; n += 1
    for o in sc.objects:                       # 顶视图的浮岛暗盘 / 只投影的遮挡板在斜视里会浮在街上：都藏掉
        if o.name.startswith('isle_shade') or o.name.startswith('isle_occ'): o.hide_render = True
    ground_out(sc)
    w = bpy.data.worlds.new('obl_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs[0].default_value = (*P['amb'], 1); bg.inputs[1].default_value = P['ambi']   # 只有中层底板漏下的一点暗橙
    done = emission_groups(P)
    well_column(sc, P['well'])
    tick(f'shift {tod}: lights x{P["lamp"]} ({n} datablocks), industry x{P["industry"]} ({done.get("industry", 0)}),'
         f' market x{P["market"]} ({done.get("market", 0)}), ambient x{P["ambi"]}')


# ---------------------------------------------------------------- 渲染
def cycles(sc, samples, noise, bounces=4):
    sc.render.engine = 'CYCLES'
    gpu = tc.setup_render_device(sc); sc.cycles.device = 'GPU' if gpu else 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = noise
    sc.cycles.use_denoising = True
    try: sc.cycles.denoising_use_gpu = gpu
    except AttributeError: pass
    try: sc.cycles.use_light_tree = True
    except AttributeError: pass
    c = sc.cycles; c.max_bounces = bounces; c.diffuse_bounces = min(bounces, 2); c.glossy_bounces = min(bounces, 2)
    c.transmission_bounces = min(bounces, 2); c.volume_bounces = 0; c.transparent_max_bounces = 8
    c.caustics_reflective = c.caustics_refractive = False
    c.use_auto_tile = True; c.tile_size = 2048
    sc.render.film_transparent = False                     # 下层是完整不透明画面（§0.3）
    s = sc.render.image_settings; s.file_format = 'PNG'; s.color_mode = 'RGBA'; s.color_depth = '8'; s.compression = 15
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'


def emit_only(sc):
    """源图（§0.8 第 2 条）：关掉所有灯光对象；自发光不再照亮别处，成图里亮的只剩相机直接看到的发光面。"""
    for ob in sc.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
        elif ob.type == 'MESH': ob.visible_diffuse = ob.visible_glossy = ob.visible_transmission = False
    for m in bpy.data.materials:
        try: m.cycles.emission_sampling = 'NONE'
        except AttributeError: pass
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    c = sc.cycles; c.samples = 4; c.use_denoising = False; c.max_bounces = 0


def dark_pass(sc):
    """暗检（§0.8 第 5 条）：所有灯与自发光关掉、世界归零，只留白班那束7 号井光柱。"""
    for ob in sc.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
    for m in bpy.data.materials:
        if m.name == COLUMN_MAT: continue
        nt = getattr(m, 'node_tree', None)
        if nt is None: continue
        for nd in nt.nodes:                # 不看有没有连线：发光强度被顶点色之类驱动时，链接还在就等于没关
            if nd.type == 'EMISSION':
                for lk in list(nd.inputs['Strength'].links): nt.links.remove(lk)
                nd.inputs['Strength'].default_value = 0.0
            elif nd.type == 'BSDF_PRINCIPLED':
                for lk in list(nd.inputs['Emission Strength'].links): nt.links.remove(lk)
                nd.inputs['Emission Strength'].default_value = 0.0
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    c = sc.cycles; c.samples = 8; c.use_denoising = False; c.max_bounces = 1; c.transparent_max_bounces = 12


def lights_uv(cam):
    """所有灯光对象的画框坐标——亮斑要么在源图里有源，要么旁边有灯。"""
    out = []
    for ob in bpy.context.scene.objects:
        if ob.type == 'LIGHT' and ob.data.type != 'SUN':
            u, v = PJ.project_ortho(to_m(ob.matrix_world.translation), cam)
            if 0 <= u <= 1 and 0 <= v <= 1: out.append([round(u, 5), round(v, 5)])
    return out


def main(layer, city=None):
    opt = layer.opt; sc = layer.sc
    tod = str(opt.get('--obtod', 'nightshift')); P = PERIODS[tod]
    out = os.path.abspath(str(opt['--out'])); samples = int(opt.get('--samples', 64))
    res = int(opt.get('--obres', 0) or 0); exr = str(opt.get('--exr', '0')) == '1'
    dark = str(opt.get('--dark', '0')) == '1'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cycles(sc, samples, float(opt.get('--noise', .015)))
    apply_period(sc, P, tod)
    bpy.context.view_layer.update()
    cam = fit_camera(sc)
    gl = tuple(map(float, str(opt.get('--fog', '.75,9.5,-.7')).split(',')))       # 合成器光晕：两班都靠它
    ti = tuple(map(float, str(opt.get('--tight', '.6,7,.45')).split(',')))
    sc.view_settings.exposure = P['exp']
    if dark:                                               # 只出暗检图（512 px），供§0.8 第 5 条量测（光晕会把暗部抬起来，暗检不加）
        dark_pass(sc)
        OB.ortho_camera(sc, cam, 512, unit=UNIT, z0=Z0)
        sc.render.filepath = os.path.splitext(out)[0] + '_dark.png'
        bpy.ops.render.render(write_still=True)
        json.dump(dict(camera=cam, period=dict(P, tod=tod), check='dark pass', kept=COLUMN_MAT),
                  open(sc.render.filepath + '.meta.json', 'w'), ensure_ascii=False, indent=1)
        tick('WROTE ' + sc.render.filepath); return
    tc.glare(sc, gl[0], gl[1], gl[2], tight=ti)
    OB.ortho_camera(sc, cam, res or None, unit=UNIT, z0=Z0)
    sc.render.filepath = out
    t1 = time.time(); bpy.ops.render.render(write_still=True)
    tick(f'WROTE {out} {sc.render.resolution_x}x{sc.render.resolution_y} in {(time.time() - t1) / 60:.1f} min')
    meta = dict(camera=cam, islands={}, markers={}, lights_uv=lights_uv(cam) if exr else [],
                period=dict(P, tod=tod), well7=[WELL7[0] * UNIT, WELL7[1] * UNIT],
                scene=dict(script='blender/tiancheng_low.py (TC_OBLIQUE=1)', unit_m=UNIT, z0_m=Z0, tier=list(TIER),
                           blender=bpy.app.version_string),
                render=dict(tod=tod, samples=samples, res=[sc.render.resolution_x, sc.render.resolution_y],
                            minutes=round((time.time() - t1) / 60, 2)))
    json.dump(meta, open(out + '.meta.json', 'w'), ensure_ascii=False, indent=1)
    if exr:
        emit_only(sc); OB.ortho_camera(sc, cam, res or None, unit=UNIT, z0=Z0)
        sc.render.filepath = os.path.splitext(out)[0] + '_emit.png'; bpy.ops.render.render(write_still=True)
        tick('WROTE ' + sc.render.filepath)


if __name__ == '__main__':
    sys.exit('由 blender/tiancheng_low.py 调用（TC_OBLIQUE=1），不要单独跑')