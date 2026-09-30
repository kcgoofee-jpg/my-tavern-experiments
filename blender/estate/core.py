# 伊甸庄园 · 共用底层：运行上下文、集合命名、物体登记（楼层 / 剖切标记）、公制 UV 的网格批处理、剖切夹紧节点组。
# 所有权：SHELL 建造者维护；INTERIOR 只调用。改签名先改 CONTRACT.md（§3、§4）。
import math
import bpy, bmesh
from mathutils import Matrix, Vector
from . import plan

ROOT = 'EDEN'                 # 根集合
SITE = 'SITE'                 # 岛体、园林、附属建筑（从不剖切）
PROP_FLOOR, PROP_CUT, PROP_UPPER, PROP_ROOM = 'est_floor', 'est_cut', 'est_upper', 'est_room'


class Ctx:
    """一次运行的上下文。opt = 命令行字典（tc_common.parse_args）。"""
    def __init__(self, opt):
        self.opt = opt
        self.views = [v.strip() for v in str(opt.get('--view', 'ext')).split(',') if v.strip()]
        self.detail = 'fast' if opt.get('--fast') else 'full'                 # fast：跳过家具与细节，只要体块
        self.furniture = not opt.get('--no-furniture') and self.detail == 'full'
        self.assets = not opt.get('--no-assets')                              # False：不联网、不读缓存，全部程序材质
        self.room = opt.get('--room')                                         # --room ID --closeup：只建该层 + 近景机位
        self.scene = bpy.context.scene
        self.floors = floors_needed(self.views, self.room)


def floors_needed(views, room=None):
    """这些视图需要建哪些楼层的室内（外观视图只要外壳）。"""
    if room:
        return plan.FLOOR_ORDER[:plan.FLOOR_ORDER.index(plan.ROOM_BY_ID[room]['floor']) + 1]
    need = set()
    for v in views:
        if v in ('all',): need |= set(plan.FLOOR_ORDER)
        elif v in plan.FLOORS: need |= set(plan.FLOOR_ORDER[:plan.FLOOR_ORDER.index(v) + 1])
    return [f for f in plan.FLOOR_ORDER if f in need]


# ---------------------------------------------------------------- 集合
def coll(path):
    """按路径取 / 建集合：'F2' → EDEN/F2；'F2.room.212' → EDEN/F2/F2.room.212；'SITE.garden' → EDEN/SITE/SITE.garden。
    名字就是完整路径（Blender 集合名全局唯一）。"""
    c = bpy.data.collections.get(path)
    if c is not None: return c
    parts = path.split('.')
    if path == ROOT: parent = bpy.context.scene.collection
    elif len(parts) == 1: parent = coll(ROOT)                                  # F2、SITE
    elif parts[1] == 'room': parent = coll(f'{parts[0]}.rooms')                # F2.room.212 → F2.rooms
    else: parent = coll(parts[0])                                              # F2.shell、F2.roof、F2.rooms、SITE.garden
    c = bpy.data.collections.new(path); parent.children.link(c)
    return c
def floor_coll(fl, part='shell'):
    """楼层下的固定子集合：shell（结构、墙、窗、柱、楼梯）、roof（坐在这一层标高上的屋面）。"""
    return coll(f'{fl}.{part}')
def room_coll(room):
    r = plan.ROOM_BY_ID[room] if isinstance(room, str) else room
    return coll(f'{r["floor"]}.room.{r["id"]}')
def site_coll(part):
    """part：island / garden / trees / water / out（附属建筑）/ paths。"""
    return coll(f'{SITE}.{part}')


def floor_root(fl):
    """每层一个空物体；该层所有物体挂在它下面，'all' 视图靠移动它错开楼层。"""
    name = f'{fl}.root'
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, None); coll(fl).objects.link(o)
    return o


def link(obj, collection, floor=None, cut=False, upper=False, room=None):
    """把物体放进集合并登记标记（CONTRACT.md §4）：
    floor  楼层 id（缺省从集合名推出；SITE 为 None）→ 物体挂到该层 root 下
    cut    剖切该层时夹紧到楼面 + 1.2 m（墙、柱身、窗、高家具）
    upper  剖切该层时整件隐藏（顶棚、檐口、窗楣、吊灯、屋面）"""
    for c in obj.users_collection: c.objects.unlink(obj)
    collection.objects.link(obj)
    fl = floor or collection.name.split('.')[0]
    if fl in plan.FLOORS:
        obj[PROP_FLOOR] = fl
        if obj.parent is None:
            mw = obj.matrix_world.copy(); obj.parent = floor_root(fl); obj.matrix_world = mw
    if cut: obj[PROP_CUT] = True
    if upper: obj[PROP_UPPER] = True
    if room: obj[PROP_ROOM] = room
    return obj


# ---------------------------------------------------------------- 网格批处理（公制 UV：1 UV 单位 = 1 m）
class Batch:
    """同一材质的一批图元 → 一个物体。坐标为府邸坐标（米）。done() 之后按 link() 登记。"""
    def __init__(self, name, mat=None, smooth=False):
        self.name, self.mat, self.smooth, self.bm = name, mat, smooth, bmesh.new()
    def box(self, x0, x1, y0, y1, z0, z1, rot=0.0, pivot=None):
        """轴对齐盒（rot 绕 pivot 或盒心转）。"""
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        M = Matrix.Translation((cx, cy, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1))
        if rot:
            px, py = pivot or (cx, cy)
            M = Matrix.Translation((px, py, 0)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Translation((-px, -py, 0)) @ M
        bmesh.ops.create_cube(self.bm, size=1, matrix=M); return self
    def cbox(self, x, y, z0, w, d, h, rot=0.0):
        """以底面中心定位的盒（宽 w 沿本地 x，深 d 沿本地 y）。"""
        M = Matrix.Translation((x, y, z0 + h / 2)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((w, d, h, 1))
        bmesh.ops.create_cube(self.bm, size=1, matrix=M); return self
    def cyl(self, x, y, z0, r, h, seg=24, r2=None):
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h,
                              matrix=Matrix.Translation((x, y, z0 + h / 2))); return self
    def sphere(self, x, y, z, r, sz=1.0, sub=3):
        bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((1, 1, sz, 1))); return self
    def prism(self, pts, z0, z1):
        """任意多边形（逆时针 [(x, y)]）挤出成柱体。"""
        vb = [self.bm.verts.new((x, y, z0)) for x, y in pts]; vt = [self.bm.verts.new((x, y, z1)) for x, y in pts]
        self.bm.faces.new(list(reversed(vb))); self.bm.faces.new(vt)
        n = len(pts)
        for i in range(n): self.bm.faces.new((vb[i], vb[(i + 1) % n], vt[(i + 1) % n], vt[i]))
        return self
    def ring(self, x, y, z0, r_out, r_in, h, seg=48, gaps=()):
        """圆环墙（鼓座、喷泉池壁）；gaps = [(角度弧度, 开口宽米)]。"""
        for k in range(seg):
            a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg; am = (a0 + a1) / 2
            if any(abs(math.atan2(math.sin(am - g), math.cos(am - g))) * r_out < w / 2 for g, w in gaps): continue
            pts = [(x + r_in * math.cos(a0), y + r_in * math.sin(a0)), (x + r_out * math.cos(a0), y + r_out * math.sin(a0)),
                   (x + r_out * math.cos(a1), y + r_out * math.sin(a1)), (x + r_in * math.cos(a1), y + r_in * math.sin(a1))]
            self.prism(pts, z0, z0 + h)
        return self
    def empty(self): return len(self.bm.verts) == 0
    def done(self):
        metric_uv_bm(self.bm)
        if self.smooth:
            for f in self.bm.faces: f.smooth = True
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        o = bpy.data.objects.new(self.name, me)
        if self.mat is not None: me.materials.append(self.mat)
        return o


def metric_uv_bm(bm):
    """盒投影公制 UV：每个面按法线主轴投影，1 UV 单位 = 1 m（材质按米定纹理尺度）。"""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = l.vert.co
            l[uv].uv = (co.x, co.y) if ax == 2 else (co.x, co.z) if ax == 1 else (co.y, co.z)
def metric_uv(obj):
    """给已有网格物体（例如导入的素材）补公制 UV。"""
    bm = bmesh.new(); bm.from_mesh(obj.data); metric_uv_bm(bm); bm.to_mesh(obj.data); bm.free()


def box(name, x0, x1, y0, y1, z0, z1, mat, collection, **tags):
    """单个盒子物体的快捷写法：建、登记、返回。"""
    o = Batch(name, mat).box(x0, x1, y0, y1, z0, z1).done()
    return link(o, collection, **tags)


# ---------------------------------------------------------------- 剖切：几何节点「把 z 夹到 Cut 以下」
CLAMP_GROUP = 'EST_clamp_z'
def clamp_group():
    ng = bpy.data.node_groups.get(CLAMP_GROUP)
    if ng: return ng
    ng = bpy.data.node_groups.new(CLAMP_GROUP, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Cut', in_out='INPUT', socket_type='NodeSocketFloat')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    pos, sep, mn, comb, sp = N.new('GeometryNodeInputPosition'), N.new('ShaderNodeSeparateXYZ'), N.new('ShaderNodeMath'), N.new('ShaderNodeCombineXYZ'), N.new('GeometryNodeSetPosition')
    mn.operation = 'MINIMUM'
    L.new(pos.outputs[0], sep.inputs[0]); L.new(sep.outputs['Z'], mn.inputs[0]); L.new(gi.outputs['Cut'], mn.inputs[1])
    L.new(sep.outputs['X'], comb.inputs['X']); L.new(sep.outputs['Y'], comb.inputs['Y']); L.new(mn.outputs[0], comb.inputs['Z'])
    L.new(gi.outputs['Geometry'], sp.inputs['Geometry']); L.new(comb.outputs[0], sp.inputs['Position']); L.new(sp.outputs[0], go.inputs['Geometry'])
    return ng
def set_cut(obj, z_world):
    """给物体装 / 更新剖切修改器（z_world = 世界坐标的剖切高度；None = 撤掉）。要求物体没有绕 x / y 的旋转、z 缩放为 1。"""
    m = obj.modifiers.get('est_cut')
    if z_world is None:
        if m: obj.modifiers.remove(m)
        return
    if m is None:
        m = obj.modifiers.new('est_cut', 'NODES'); m.node_group = clamp_group()
    ident = next(s.identifier for s in m.node_group.interface.items_tree if getattr(s, 'in_out', '') == 'INPUT' and s.name == 'Cut')
    v = float(z_world - obj.matrix_world.translation.z)
    props = getattr(m, 'properties', None)                              # Blender 5.2：修改器输入挪到 properties.inputs
    if props is not None and hasattr(props, 'inputs'): props.inputs[ident] = v
    else: m[ident] = v
    obj.update_tag()


def hexrgb(h):
    """'#RRGGBB'（sRGB）→ 线性 RGB 元组。"""
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)
