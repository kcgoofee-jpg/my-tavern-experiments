# A4 试点：中层核心区「OSM 轮廓拉伸」与「纽约 3D 建筑模型真实几何」的 8K 局部对比（独立脚本，不改 tiancheng_mid / tc_city）。
# 做法：原样执行 tiancheng_mid.py（材质、霓虹、楼冠灯带、街道、悬浮轨道、灯光、光晕全部复用），只在 --mode real 时打三处补丁：
#   1. City 生成完以后，把核心区（曼哈顿中城）的 OSM 楼换成 data/real3d/manhattan.npz 里的真实楼（同一投影、同一偏移、同一交界规则）；
#      每栋楼的 p = 地面轮廓，h = 真实高度，obb = 最高一级屋顶面的外接矩形（楼冠灯带、招牌贴着最高那一级退台）。
#   2. City.buildings_mesh：真实楼不挤出，改用原始屋顶面 / 外墙面（按 tops_mid 算出的楼顶高度等比缩放高度）。
#   3. tc_city.roof_kit：真实楼不再加女儿墙、退台塔楼和规则屋顶设备（数据里已经有真实的退台、机房、塔冠），只保留航空障碍灯与少量楼顶小灯。
#      --mode hybrid：真实几何之上，再在最高一级屋顶面上按原规则加女儿墙、冷却塔 / 水箱、太阳能板、天窗（不加假的退台塔楼）。
# 两种模式都不写 map/data（tc.write_data 置空）。
# 用法（先确认没有别的 Blender 渲染在跑：pgrep -f "[M]acOS/Blender -b"）：
#   Blender -b -P blender/test_real3d_crop.py -- --mode extrude|real|hybrid --res 8000 --samples 64 --crop 0.55,0.10,0.70,0.24 --out docs/drafts/real3d_extrude.png
import os, sys, math, runpy, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
import tc_common as tc, tc_city, tc_real3d

opt = tc.parse_args({})
MODE = str(opt.get('--mode', 'extrude'))
assert MODE in ('extrude', 'real', 'hybrid'), '--mode extrude|real|hybrid'
if '--out' not in opt:                                               # 不给 --out 时绝不写到 map/art
    sys.argv += ['--out', os.path.abspath(os.path.join(HERE, '..', 'docs', 'drafts', f'real3d_{MODE}.png'))]
tc.write_data = lambda *a, **k: None
STATS = {}

if MODE in ('real', 'hybrid'):
    RD = tc_real3d.load('manhattan')
    _init, _bmesh, _kit = tc_city.City.__init__, tc_city.City.buildings_mesh, tc_city.roof_kit

    def _replace_core(city):
        D = next(D for D in city.districts if D['kind'] == 'core'); P = D['P']; ox, oy = D['offset']; di = city.districts.index(D)
        rr = np.random.default_rng(4401)                             # 过渡带的密度渐变（与 City 同一规则；另起随机，不动城市序列）
        old = [b for b in city.b if b['dk'] == 'core']; keep = [b for b in city.b if b['dk'] != 'core']
        new = []
        for i in range(len(RD['BH'])):
            Q = (RD['BP'][i] + (ox, oy)).astype(np.float32)
            if len(Q) < 3: continue
            if tc_city.poly_area(Q) < 0: Q = Q[::-1]
            a = float(tc_city.poly_area(Q))
            if a < .0004: continue
            cx, cy = map(float, Q.mean(0))
            if abs(cx) > tc.W / 2 + .3 or abs(cy) > tc.H / 2 + .3: continue
            dd = tc_city.sdist(cx, cy, P)
            if dd < .12 or min(tc_city.sdist(qx, qy, P) for qx, qy in Q[::max(1, len(Q) // 6)]) < .05: continue
            if dd < tc_city.BAND and rr.random() > .35 + .65 * (dd - .12) / (tc_city.BAND - .12): continue
            T = (RD['TP'][i] + (ox, oy)).astype(np.float32)
            if tc_city.poly_area(T) < 0: T = T[::-1]
            ob = tc_city.obb(T if len(T) >= 3 and abs(tc_city.poly_area(T)) > 1e-5 else Q)
            h = float(max(RD['BH'][i], 3.0))
            new.append(dict(p=Q, cx=cx, cy=cy, a=a, h=h, n=tc.district(cx, cy), obb=ob, k=D['k'], dk='core', di=di, real=i, top_p=T if len(T) >= 3 else Q))
        city.b = keep + new
        city.roof = np.tile(np.float32(.3), (len(city.b), 3))
        STATS.update(osm_core=len(old), real_core=len(new))
        tc.tick(f'real3d: core buildings OSM {len(old)} → NYC 3D model {len(new)}')

    def _init_patched(self, rng, layer='mid'):
        _init(self, rng, layer)
        if layer in ('mid', 'upper'): _replace_core(self)
    tc_city.City.__init__ = _init_patched

    FSTART = RD['FS']; BF = RD['BF'].astype(np.int64)
    def _real_mesh(name, idx, z0, z1, colors, m):
        import bpy
        fr = np.random.default_rng(4402)
        co, loops, totals, fcol = [], [], [], []; base = 0
        for j, bi in enumerate(idx):
            b = bpy_b[bi]; i = b['real']
            f0, f1 = BF[i], BF[i + 1]
            fidx = [RD['FI'][FSTART[f]:FSTART[f + 1]] for f in range(f0, f1)]
            used = np.unique(np.concatenate(fidx)); remap = {int(v): k for k, v in enumerate(used)}
            Vb = RD['Vf'][used]; H = max(float(RD['BH'][i]), 1e-3)
            s = (float(z1[j]) - float(z0[j])) / H                  # 真实高度（米）→ 平面单位，等比到 tops_mid 算出的楼顶
            ox, oy = b['_off']
            co.extend(zip(Vb[:, 0] + ox, Vb[:, 1] + oy, float(z0[j]) + Vb[:, 2] * s))
            c = np.asarray(colors[j], np.float32)
            for f, F in zip(range(f0, f1), fidx):
                loops.extend(remap[int(v)] + base for v in F); totals.append(len(F))
                if RD['FT'][f] == 1: k = c * fr.uniform(.8, 1.25)   # 每块屋顶面（退台、机房、塔冠）深浅略有不同
                else: k = c * .8
                fcol.append((float(k[0]), float(k[1]), float(k[2]), 1.0))
            base += len(Vb)
        me = bpy.data.meshes.new(name); me.vertices.add(len(co)); me.vertices.foreach_set('co', np.array(co, np.float32).ravel())
        L = np.array(loops, np.int32); T = np.array(totals, np.int32); S = np.concatenate([[0], np.cumsum(T)[:-1]]).astype(np.int32)
        me.loops.add(len(L)); me.loops.foreach_set('vertex_index', L)
        me.polygons.add(len(T)); me.polygons.foreach_set('loop_start', S); me.polygons.foreach_set('loop_total', T)
        me.polygons.foreach_set('use_smooth', np.zeros(len(T), bool))   # 平直着色（Blender 4.1+ 新建网格默认平滑，复杂 n 边形会出现褶皱状的明暗）
        me.update(calc_edges=True)
        ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', np.repeat(np.array(fcol, np.float32), T, axis=0).ravel())
        me.validate(clean_customdata=False)                           # 真实数据里偶有退化面（重复点），去掉
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
        if m: o.data.materials.append(m)
        STATS.update(real_faces=len(T), real_verts=len(co))
        tc.tick(f'{name}: {len(idx)} real buildings, {len(T)} faces, {len(co)} verts')
        return o

    def _bmesh_patched(self, name, idx, z0, z1, colors, m):
        global bpy_b
        bpy_b = self.b
        z0 = np.broadcast_to(z0, len(idx)); z1 = np.broadcast_to(z1, len(idx)); idx = np.asarray(idx)
        real = np.array(['real' in self.b[i] for i in idx], bool)
        D = next(D for D in self.districts if D['kind'] == 'core')
        for i in idx[real]: self.b[i]['_off'] = D['offset']
        o = _bmesh(self, name, idx[~real], z0[~real], z1[~real], np.asarray(colors)[~real], m)
        if real.any(): _real_mesh(name + '_real', idx[real], z0[real], z1[real], np.asarray(colors)[real], m)
        return o
    tc_city.City.buildings_mesh = _bmesh_patched

    def _kit_patched(city, idx, tops, cols, rng, style, **kw):
        idx = np.asarray(idx); tops = np.asarray(tops); cols = np.asarray(cols)
        real = np.array(['real' in city.b[i] for i in idx], bool)
        o = _kit(city, idx[~real], tops[~real], cols[~real], rng, style, **kw)
        if MODE == 'hybrid' and real.any():                          # 混合：真实几何 + 最高一级退台上的女儿墙、设备、太阳能板（不再加假的退台塔楼）
            st = dict(tc_city.STYLE[style]); tc_city.STYLE[style]['tower'] = 0.0
            saved = {i: city.b[i]['p'] for i in idx[real]}
            for i in idx[real]: city.b[i]['p'] = city.b[i]['top_p']
            try: o2 = _kit(city, idx[real], tops[real], cols[real], np.random.default_rng(4404), style, **kw)
            finally:
                tc_city.STYLE[style].update(st)
                for i, P_ in saved.items(): city.b[i]['p'] = P_
            for k_ in o: o[k_] = list(o[k_]) + list(o2[k_])
        lr = np.random.default_rng(4403); zb = kw.get('zbase', tc.Z_GROUND)
        zb = tc.Z_GROUND if zb is None else zb
        for i, top in zip(idx[real], tops[real]):
            b = city.b[i]; x, y, w, d, rot = b['obb']
            if top - zb > 1.2 and lr.random() < .6: o['towers'].append((x, y, float(top)))   # 航空障碍灯按最高一级的中心
            if lr.random() < .06: o['lamps'].append((x + lr.uniform(-.3, .3) * w, y + lr.uniform(-.3, .3) * d, float(top) + .002))
        return o
    tc_city.roof_kit = _kit_patched

t0 = time.time()
runpy.run_path(os.path.join(HERE, 'tiancheng_mid.py'), run_name='__main__')
print('REAL3D_STATS', MODE, STATS, f'{time.time() - t0:.0f}s total', flush=True)
