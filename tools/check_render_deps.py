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
    'map/art/tc_mid.dzi': ['blender/tiancheng_mid.py', 'blender/landmarks/**/*.py'],
    'map/art/tc_low.dzi': ['blender/tiancheng_low.py', 'blender/landmarks/**/*.py'],
    'map/art/tc_clouds.dzi': ['map/art/tc_upper.dzi'],
    'map/estate/site.glb': ['blender/estate2/*.py'],
    'map/estate/house.glb': ['blender/estate2/*.py'],
}


def commit_time(path):
    """最近一次提交该路径的时间戳（epoch 秒），没有提交记录返回 None。"""
    r = subprocess.run(['git', 'log', '-1', '--format=%ct', '--', path], cwd=ROOT, capture_output=True, text=True)
    out = r.stdout.strip()
    return int(out) if out.isdigit() else None


def newest(patterns):
    """一组 glob 模式里，最新提交时间最大的那个文件（路径, 时间戳）；都没有提交记录返回 (None, None)。"""
    best = (None, None)
    for pat in patterns:
        for f in glob.glob(os.path.join(ROOT, pat), recursive=True):
            rel = os.path.relpath(f, ROOT)
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
        up_file, up_t = newest(ups)
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
