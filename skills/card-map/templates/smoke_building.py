"""冒烟级单栋建筑模板（card-map 技能第 5 步的起点；示例 = 示例包 town 的「钟楼」，形制为仓库推断）。

目的只是证明「建模 → 草稿渲染 → .blend → export_glb」这条链能跑；正式标准档要照参考板重写成
blender/landmarks/<id>/build.py（见 blender/landmarks/well7/build.py 的写法：Batch 分组名 = glb 组名，bg_* 只渲不导）。
只用纯色材质（C.flat），不依赖贴图库。

用法（仓库根目录，经 GPU 排队启动器）：
  bash skills/card-map/blender_run.sh <scratch>/clock.log -b --factory-startup --python-expr \
    "import runpy; runpy.run_path('skills/card-map/templates/smoke_building.py', run_name='__main__')" \
    -- --res 640 --samples 16 --out <scratch>/clock_draft.jpg [--blend <scratch>/clock.blend]
"""
import math, os, sys, traceback

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'blender', 'landmarks'))
import common as C  # noqa: E402

A = C.args(dict(res='640', samples='16', out='/tmp/smoke_building.jpg', blend='', log=''))


def main():
    sc = C.setup(A['samples'])
    stone = C.flat('stone', (0.55, 0.52, 0.47), rough=0.8, noise=0.3)
    trim = C.flat('trim', (0.32, 0.3, 0.28), rough=0.7)
    roof = C.flat('roof', (0.18, 0.26, 0.3), rough=0.5, metal=0.3)
    face = C.flat('clockface', (0.92, 0.9, 0.82), rough=0.4)
    ground = C.flat('ground', (0.35, 0.36, 0.33), rough=0.95)
    glass = C.glass('win')

    G = C.Batch('site_ground'); G.box(-30, 30, -30, 30, -0.3, 0, ground)
    W = C.Batch('walls_ext')
    W.box(-4, 4, -4, 4, 0, 1.2, trim)                      # 台基
    W.box(-3.4, 3.4, -3.4, 3.4, 1.2, 22, stone)            # 塔身
    for z in (8, 15, 22):                                  # 腰线
        W.box(-3.6, 3.6, -3.6, 3.6, z - 0.35, z, trim)
    W.box(-3.2, 3.2, -3.2, 3.2, 22, 27, stone)             # 钟室
    Wn = C.Batch('windows')
    for z0 in (3, 10, 17):                                 # 四面竖窗
        for s in (-1, 1):
            Wn.box(-0.5, 0.5, s * 3.41, s * 3.45, z0, z0 + 3, glass)
            Wn.box(s * 3.41, s * 3.45, -0.5, 0.5, z0, z0 + 3, glass)
    P = C.Batch('props_clock')
    for ang in range(0, 360, 90):                          # 四面钟盘（只有指针，不写字）
        a = math.radians(ang); nx, ny = math.cos(a), math.sin(a)
        M = C.Matrix.Translation((nx * 3.25, ny * 3.25, 24.5)) @ C.Matrix.Rotation(a + math.pi / 2, 4, 'Z') @ C.Matrix.Rotation(math.pi / 2, 4, 'X')
        P.cyl(0, 0, 0, 1.6, 0.12, face, n=32, mat=M)
        P.box(-0.05, 0.05, 0, 1.2, 0.13, 0.18, trim, mat=M)
        P.box(-0.05, 0.05, -0.1, 0.8, 0.13, 0.18, trim, mat=M @ C.Matrix.Rotation(math.radians(120), 4, 'Z'))
    R = C.Batch('roof')
    R.cyl(0, 0, 27, 4.2, 7, roof, n=4, r2=0.0, smooth=False)  # 四坡尖顶
    C.Batch.build_all()

    C.sky_sun(sc, 'day', sun_az=220, sun_el=35)
    C.camera(sc, (40, -48, 20), (0, 0, 15), 35)
    sc.view_settings.exposure = -0.6
    C.render(sc, A['out'], A['res'], 1.5, A['blend'])


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if A['log']:
        open(A['log'], 'w').write(msg)
    print(msg)
    raise
