# 伊甸庄园 · Blender 模型包（任务 8）。约定见 blender/estate/CONTRACT.md。
# 入口：blender/eden_manor.py（命令行）→ estate.main()。
# 模块与所有权：
#   plan.py      平面数据（lead）          core.py   底层工具（SHELL）
#   shell.py     建筑壳（SHELL）            site.py   岛体与园林（SHELL）
#   views.py     相机、光照、剖切（SHELL）  export.py 房间多边形导出（SHELL）
#   mats.py      材质库（INTERIOR）         assets.py CC0 素材（INTERIOR）
#   furniture.py 家具（INTERIOR）           rooms.py  房间饰面与陈设（INTERIOR）
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
if BLENDER_DIR not in sys.path: sys.path.insert(0, BLENDER_DIR)
T0 = time.time()
def tick(msg): print(f'[{time.time() - T0:6.1f}s] {msg}', flush=True)

DEFAULTS = {'--view': 'ext', '--res': '2000', '--samples': '32', '--out': os.path.join(BLENDER_DIR, '..', 'docs', 'drafts', 'estate_b1_{view}.png')}
FLAGS = ('--closeup', '--data-only', '--preview', '--no-furniture', '--no-assets', '--fast', '--no-export')


def build(ctx):
    """建整座庄园（一次）：材质 → 岛与园林 → 建筑壳 → 各层房间饰面与陈设。"""
    from . import shell, site, rooms, core, plan
    site.build(ctx); tick('site')
    shell.build(ctx); tick('shell')
    for fl in ctx.floors:
        for r in plan.rooms(fl):
            c = core.room_coll(r)
            rooms.finish(r, c)
            if ctx.furniture: rooms.furnish(r, c)
    tick(f'rooms {ctx.floors}')


def _out(template, view, multi):
    t = os.path.abspath(template)
    if '{view}' in t: return t.replace('{view}', view)
    if multi: b, e = os.path.splitext(t); return f'{b}_{view}{e or ".png"}'
    return t


def main(argv=None):
    import bpy, tc_common as tc
    tc.FLAGS = tuple(set(tc.FLAGS) | set(FLAGS))
    given = tc.parse_args({})
    d = dict(DEFAULTS)
    if given.get('--preview'): d.update({'--res': '800', '--samples': '8'})
    opt = tc.parse_args(d)
    crops = tc.parse_crops(opt)
    if crops and '--crop' in opt: sys.exit('use either --crop or --crops/--crops-json, not both')
    if '--crop' in opt: crops = [('crop', tc.parse_box(opt['--crop']))]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    from . import core, views, export, plan, rooms
    errs, _ = plan.validate(verbose=False)
    if errs: sys.exit('plan.validate failed: ' + '; '.join(errs[:5]))
    ctx = core.Ctx(opt)
    for v in ctx.views:
        if v not in views.VIEWS: sys.exit(f'unknown view {v!r}; use {views.VIEWS}')
    if ctx.room and ctx.room not in plan.ROOM_BY_ID: sys.exit(f'unknown room {ctx.room!r}')
    build(ctx)
    res, samples = int(opt['--res']), int(opt['--samples'])
    views.configure(ctx, res, samples)
    outs = []
    if ctx.room and opt.get('--closeup'):
        for i, shot in enumerate(rooms.closeups(plan.ROOM_BY_ID[ctx.room])):
            views.closeup(ctx.room, shot, ctx)
            p = _out(opt['--out'], f'{ctx.room}_{shot["name"]}', True)
            tick(f'closeup {ctx.room} {shot["name"]}')
            if not opt.get('--data-only'): outs += views.render(p, ctx)
        return outs
    multi = len(ctx.views) > 1
    for v in ctx.views:
        cam = views.setup(v, ctx)
        p = _out(opt['--out'], v, multi)
        if not opt.get('--no-export') and v != 'island':
            export.write(v, export.view_data(v, ctx, cam), os.path.splitext(os.path.basename(p))[0], ctx)
        if opt.get('--data-only'): continue
        tick(f'render {v} {res}px {samples} spp')
        if crops:
            cd = os.path.abspath(opt.get('--out-dir') or os.path.dirname(p))
            outs += views.render(os.path.join(cd, 'x.png'), ctx, [(f'{v}_{n}' if multi else n, b) for n, b in crops])
        else:
            outs += views.render(p, ctx)
    tick('done')
    return outs
