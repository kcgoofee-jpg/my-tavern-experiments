#!/usr/bin/env python3
"""Part 9-4：Blender 无头烘焙导出（合并材质网格 → LOD0/LOD1 → glTF → Draco / KTX2）。

用法（走渲染队列或者本机 blender_run.sh）：
    blender -b <scene.blend> -P blender/export_optimized.py -- --out map/art/opt --name manor \
        --lod1 0.45 --draco --ktx2 --max-mb 8
    python3 blender/export_optimized.py --dry-run ...            # 只打计划，不起 Blender

设计要点：
  * bpy 一律惰性 import——本模块在没有 Blender 的机器上（CI / 单测）也能整体加载，
    规划、命令拼装、体积预算这些纯函数因此可以单测（tests/test_export_optimized.py）。
  * 压缩不自己写：交给 gltf-transform CLI（Draco 网格 + KTX2 纹理），本模块只负责拼命令、
    串流水线（draco 之后再 ktx2，中间产物落到临时名）、并在体积超预算时报警。
  * 本脚本不渲染（没有 bpy.ops.render.render），所以不受渲染守卫 GPU 规则的约束
    （tools/render_preflight.py 只管 render 脚本；仍不许出现 compute_device_type）。
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

SCHEMA = 1
DEFAULT_LOD1 = 0.45          # LOD1 减面比例（保留 45% 面数）
DEFAULT_MAX_MB = 8.0         # 单个场景资产体积预算（轻量水准）
KTX2_MODES = ('etc1s', 'uastc')

# ---------------------------------------------------------------- 纯函数（可单测，不碰 bpy）

def lod_ratio(v, lo=0.05, hi=1.0):
    """减面比例夹到 [lo, hi]；乱输入给默认值（不抛——命令行手滑不该毁掉一整次烘焙）。"""
    try:
        r = float(v)
    except (TypeError, ValueError):
        return DEFAULT_LOD1
    if r != r:                                   # NaN
        return DEFAULT_LOD1
    return max(lo, min(hi, r))


def transformer_prefix():
    """gltf-transform 命令前缀：PATH 里有就用，没有就退回 npx（CI 上不预装）。"""
    exe = os.environ.get('EDEN_GLTF_TRANSFORM') or 'gltf-transform'
    if shutil.which(exe):
        return [exe]
    return ['npx', '--yes', '@gltf-transform/cli']


def draco_command(src, dst, prefix=None):
    return list(prefix or transformer_prefix()) + ['draco', src, dst]


def ktx2_command(src, dst, mode='etc1s', prefix=None):
    m = mode if mode in KTX2_MODES else 'etc1s'
    return list(prefix or transformer_prefix()) + [m, src, dst]


def compress_chain(glb, out_dir, base, draco=True, ktx2=True, ktx2_mode='etc1s', tmp_dir=None, prefix=None):
    """把「导出好的 glb」串成压缩流水线：返回 [{step, src, dst, cmd}]（step 顺序执行，后一步吃前一步的产物）。"""
    steps = []
    tmp = tmp_dir or tempfile.gettempdir()
    cur = glb
    if draco:
        dst = os.path.join(tmp, f'{base}.draco.glb')
        steps.append({'step': 'draco', 'src': cur, 'dst': dst, 'cmd': draco_command(cur, dst, prefix)})
        cur = dst
    if ktx2:
        dst = os.path.join(out_dir, f'{base}.ktx2.glb')
        steps.append({'step': 'ktx2', 'src': cur, 'dst': dst, 'cmd': ktx2_command(cur, dst, ktx2_mode, prefix)})
        cur = dst
    return steps, cur


def budget_ok(size_bytes, max_mb=DEFAULT_MAX_MB):
    """体积预算：返回 (ok, mb)。0 或负数预算 = 不设限。"""
    mb = size_bytes / (1024.0 * 1024.0)
    if not max_mb or max_mb <= 0:
        return True, mb
    return mb <= max_mb, mb


def plan(args, tmp_dir=None):
    """纯规划：把参数翻成一份可打印、可单测的执行计划。"""
    name = args.name or os.path.splitext(os.path.basename(args.src or 'scene'))[0]
    out_dir = args.out
    lods = [{'level': 0, 'ratio': 1.0, 'file': f'{name}_lod0.glb'}]
    if args.lod1 is not None and lod_ratio(args.lod1) < 1.0:
        lods.append({'level': 1, 'ratio': lod_ratio(args.lod1), 'file': f'{name}_lod1.glb'})
    steps = []
    compress = []
    for lod in lods:
        base = os.path.splitext(lod['file'])[0]
        if args.draco or args.ktx2:
            chain, final = compress_chain(os.path.join(out_dir, lod['file']), out_dir, base,
                                          draco=args.draco, ktx2=args.ktx2, ktx2_mode=args.ktx2_mode,
                                          tmp_dir=tmp_dir)
            compress.append({'level': lod['level'], 'steps': chain, 'final': final})
            steps.extend([s['step'] for s in chain])
    manifest = {
        'schema': SCHEMA, 'name': name, 'src': args.src, 'out': out_dir,
        'merge_materials': not args.no_merge,
        'lods': lods, 'draco': bool(args.draco), 'ktx2': args.ktx2_mode if args.ktx2 else '',
        'max_mb': args.max_mb, 'manifest': f'{name}.assets.json',
    }
    return {'manifest': manifest, 'lods': lods, 'compress': compress, 'steps': steps}


# ---------------------------------------------------------------- Blender 侧（惰性 import bpy）

def _bpy():
    import bpy                     # 只在真的跑在 Blender 里时才 import（CI 上模块要能加载）
    return bpy


def merge_materials(objects):
    """按材质分组，组间各 join 成一个对象（合并材质网格；同材质的碎件合成一件，draw call 直接降下来）。"""
    bpy = _bpy()
    groups = {}
    for ob in objects:
        if ob.type != 'MESH':
            continue
        key = tuple(sorted(m.name for m in ob.data.materials if m)) or '__none__'
        groups.setdefault(key, []).append(ob)
    merged = []
    for key, group in groups.items():
        if len(group) < 2:
            merged.extend(group)
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        merged.append(group[0])
    return merged


def decimate(obj, ratio):
    """减面：加 DECIMATE 修改器并落地（LOD1 用）。ratio = 保留比例。"""
    bpy = _bpy()
    mod = obj.modifiers.new(name='lod_decimate', type='DECIMATE')
    mod.ratio = lod_ratio(ratio)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return sum(len(p.vertices) for p in obj.data.polygons) if hasattr(obj.data, 'polygons') else 0


def export_glb(path, objects=None):
    """导出选中（或全部）为 glb；坐标/单位照仓库里其它导出脚本的既有口径，不额外改朝向。"""
    bpy = _bpy()
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    if objects:
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=bool(objects))
    return os.path.getsize(path) if os.path.exists(path) else 0


def run_step(cmd, dry_run=False, log=print):
    log('  $ ' + ' '.join(cmd))
    if dry_run:
        return 0
    try:
        return subprocess.call(cmd)
    except OSError as e:
        log(f'  ! 命令起不来（{e}）：后续步骤跳过，已导出的 glb 仍然可用')
        return 127


# ---------------------------------------------------------------- 主流程

def build(args, tmp_dir=None, log=print):
    """真的跑一次：合并 → 导出 LOD0 → 减面 → 导出 LOD1 → Draco / KTX2 → 写清单。"""
    p = plan(args, tmp_dir=tmp_dir)
    os.makedirs(args.out, exist_ok=True)
    bpy = _bpy()
    source = bpy.data.objects if not args.src else [o for o in bpy.data.objects]
    meshes = [o for o in source if o.type == 'MESH']
    if not args.no_merge:
        meshes = merge_materials(meshes)
    outputs, warns = [], []
    for lod in p['lods']:
        if lod['level'] == 1:
            for ob in meshes:
                decimate(ob, lod['ratio'])
        path = os.path.join(args.out, lod['file'])
        size = export_glb(path, meshes)
        ok, mb = budget_ok(size, args.max_mb)
        if not ok:
            warns.append(f"{lod['file']} 体积 {mb:.1f} MB 超过预算 {args.max_mb} MB")
        outputs.append({'level': lod['level'], 'file': lod['file'], 'ratio': lod['ratio'], 'bytes': size, 'mb': round(mb, 2)})
        log(f"LOD{lod['level']} → {lod['file']}（{mb:.2f} MB，ratio {lod['ratio']}）")
    for chain in p['compress']:
        for s in chain['steps']:
            rc = run_step(s['cmd'], dry_run=args.dry_run, log=log)
            if rc:
                warns.append(f"{s['step']} 压缩失败（rc={rc}）：保留未压缩的 {os.path.basename(s['src'])}")
    manifest = dict(p['manifest'])
    manifest['outputs'] = outputs
    manifest['warnings'] = warns
    write_manifest(os.path.join(args.out, manifest['manifest']), manifest)
    for w in warns:
        log('  [警告] ' + w)
    log(f"清单 → {os.path.join(args.out, manifest['manifest'])}")
    return manifest


def write_manifest(path, manifest):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return path


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description='Blender 无头烘焙导出（合并材质 / LOD / Draco / KTX2）')
    ap.add_argument('--src', default='', help='源 .blend（Blender 里由 -P 之后的 -- 传入时留空 = 当前文件）')
    ap.add_argument('--out', required=True, help='输出目录（仓库相对路径，别写绝对路径）')
    ap.add_argument('--name', default='', help='资产名（缺省取源文件名）')
    ap.add_argument('--lod1', type=float, default=DEFAULT_LOD1, help=f'LOD1 减面比例（默认 {DEFAULT_LOD1}，给 1 就是不生成 LOD1）')
    ap.add_argument('--no-merge', action='store_true', help='不合并同材质网格（调试 / 需要保留原对象名时用）')
    ap.add_argument('--draco', action='store_true', help='先过 gltf-transform draco')
    ap.add_argument('--ktx2', action='store_true', help='再走 KTX2 纹理压缩（etc1s / uastc）')
    ap.add_argument('--ktx2-mode', default='etc1s', choices=list(KTX2_MODES))
    ap.add_argument('--max-mb', type=float, default=DEFAULT_MAX_MB, help=f'单场景体积预算（默认 {DEFAULT_MAX_MB} MB）')
    ap.add_argument('--dry-run', action='store_true', help='只打计划，不导 Blender / 不起外部命令')
    ap.add_argument('--tmp', default='', help='压缩中间产物目录（缺省用系统临时目录）')
    return ap.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    headless = not args.dry_run
    if headless:
        p = plan(args, tmp_dir=args.tmp or None)
        print(f"export_optimized：{p['manifest']['name']} → {args.out}"
              f"（LOD {len(p['lods'])} 级，draco={bool(args.draco)}，ktx2={args.ktx2_mode if args.ktx2 else 'off'}）")
        manifest = build(args, tmp_dir=args.tmp or None)
        return 1 if any('超过预算' in w for w in manifest.get('warnings', [])) else 0
    p = plan(args, tmp_dir=args.tmp or None)
    print(json.dumps({'manifest': p['manifest'], 'lods': p['lods'],
                      'compress': [{'level': c['level'], 'steps': [s['step'] for s in c['steps']]} for c in p['compress']]},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
