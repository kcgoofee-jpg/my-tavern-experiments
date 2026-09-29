#!/usr/bin/env python3
"""渲染资产依赖检查（docs/render-deps.md）：警告「下游产物比上游源文件旧」。
只用 git log 提交时间做粗略核对，不解析内容。默认只警告（退出码 0），--strict 时发现问题退出码 1。
用法：python3 tools/check_render_deps.py [--strict]
"""
import argparse, glob, os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# 下游产物 -> 上游源（glob 模式，相对仓库根）；见 docs/render-deps.md 的对照表
DEPS = {
    'map/art/tc_upper.dzi': ['blender/tiancheng_upper.py', 'blender/upper_islands/*.py', 'map/estate/plan.js', 'blender/estate2/*.py'],
    'map/art/tc_upper_city.dzi': ['blender/tiancheng_upper.py', 'blender/upper_islands/*.py', 'map/estate/plan.js', 'blender/estate2/*.py'],
    # tiancheng_mid.py / tiancheng_low.py 不 import blender/landmarks 下的模块——地标走 tools/landmark.py 流水线，
    # 产物是独立 glb（map/props/<id>/），默认不进底图；只有 ship --patch-basemap 才会改底图，且那一步会直接改到 .dzi 本身
    # （.dzi 自己的提交时间就会比那次 build.py 新）。所以这里不再把 blender/landmarks/**/*.py 全部当成底图上游，
    # 避免每加一个不进底图的新地标都误报（head #54：knights_camp 是这种独立 glb 地标，不该让 tc_mid.dzi 显示落后）。
    'map/art/tc_mid.dzi': ['blender/tiancheng_mid.py'],
    'map/art/tc_low.dzi': ['blender/tiancheng_low.py'],
    'map/art/tc_clouds.dzi': ['map/art/tc_upper.dzi'],
    'map/estate/model/site.glb': ['blender/estate2/*.py'],
    'map/estate/model/house.glb': ['blender/estate2/*.py'],
}

# 窄例外：匹配上面 glob 但不影响该产物的文件（只列确切路径，不写通配）。
# export_glb.py 只把地标导出成 glb（道具查看器用），不参与 tc_mid / tc_low 底图渲染，改它不需要重渲 .dzi。
# lm_anchors.py 只算板上标签的锚点位置，不参与底图渲染，改它同样不需要重渲 .dzi。
NOT_UPSTREAM = {
    'map/art/tc_mid.dzi': {'blender/landmarks/export_glb.py', 'blender/landmarks/lm_anchors.py'},
    'map/art/tc_low.dzi': {'blender/landmarks/export_glb.py', 'blender/landmarks/lm_anchors.py'},
}


def commit_time(path):
    """最近一次提交该路径的时间戳（epoch 秒），没有提交记录返回 None。"""
    r = subprocess.run(['git', 'log', '-1', '--format=%ct', '--', path], cwd=ROOT, capture_output=True, text=True)
    out = r.stdout.strip()
    return int(out) if out.isdigit() else None


def newest(patterns, skip=()):
    """一组 glob 模式里（跳过 skip 里的确切路径），最新提交时间最大的那个文件（路径, 时间戳）；都没有提交记录返回 (None, None)。"""
    best = (None, None)
    for pat in patterns:
        for f in glob.glob(os.path.join(ROOT, pat), recursive=True):
            rel = os.path.relpath(f, ROOT)
            if rel in skip: continue
            t = commit_time(rel)
            if t is not None and (best[1] is None or t > best[1]):
                best = (rel, t)
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--strict', action='store_true', help='发现「下游比上游旧」时退出码 1（默认只警告，退出码 0）')
    a = ap.parse_args()

    warnings = []
    for down, ups in DEPS.items():
        down_path = os.path.join(ROOT, down)
        if not os.path.exists(down_path):
            continue  # 产物还没生成，不算问题
        down_t = commit_time(down)
        if down_t is None:
            continue  # 本地新产物，还没提交，不比较
        up_file, up_t = newest(ups, NOT_UPSTREAM.get(down, ()))
        if up_file is not None and up_t > down_t:
            warnings.append(f'{down} 落后于上游 {up_file}（上游提交更新，可能需要重渲；见 docs/render-deps.md）')

    if warnings:
        print(f'render-deps：{len(warnings)} 条告警（只是粗略信号，人工判断要不要重渲）：')
        for w in warnings:
            print('  -', w)
    else:
        print('render-deps：没有发现下游比上游旧的产物')

    sys.exit(1 if (warnings and a.strict) else 0)


if __name__ == '__main__':
    main()
