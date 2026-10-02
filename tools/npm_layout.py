#!/usr/bin/env python3
"""npm 分包布局：算出运行时该拆成哪些包、每包多大、每个资源归哪个包（2026-10-03 起）。

为什么拆（背景）：本仓约 1 GB，超过 jsDelivr 单包 50 MB 上限，`cdn.jsdelivr.net` 与国内镜像
`cdn.jsdmirror.com` 一律 403（"Package size exceeded the configured limit of 50 MB"），整条 CDN 链路取不到东西。
npm 没有单包 50 MB 的限制，于是改走 npm 线路（国内 npmmirror → jsDelivr-npm → unpkg 备用）。
但一个 500 MB 的包对三条线路都不友好（首包要现拉、命中率差），所以按「层」拆：

  eden-map-engine          代码 + 数据 + 三维库 + 设定包（map/viewer.html、app/、core/、ui/、tavern/、
                           data/、i18n/、vendor/、estate/、packs/、根级模块、props/viewer3d.html）
  eden-map-art-<层>        底图瓦片 map/art/<层>.dzi + <层>_files/（按层族分组；一族超目标就按时段分开）
  eden-map-props-<a|b|c…>  三维模型 map/props/<模型>/（贪心装箱到目标体积）

同一族超目标时的规则是确定的：`art/<层>_<时段>` 归入 `eden-map-art-<层族>-<时段>`。
所有包共用一个版本（VERSION）；运行时按包内 `assets.json` 找同版本的其它包。

用法：
  python3 tools/npm_layout.py# 人读的表（包名 / 体积 / 文件数）
  python3 tools/npm_layout.py --json           # 机器读（tools/pack_npm.sh 用这个）
  python3 tools/npm_layout.py --target-mb 25   # 目标体积上限（默认 40）
  python3 tools/npm_layout.py --write-assets map/data/assets.json   # 生成运行时索引
体积是磁盘字节之和（未压缩）；真实上限以 npm / npmmirror / jsDelivr 实测为准。
"""
import argparse
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYPARTS = ('dawn', 'day', 'dusk', 'night')
ENGINE_PATHS = ('map/viewer.html', 'map/app', 'map/core', 'map/ui', 'map/tavern', 'map/data',
                'map/i18n', 'map/vendor', 'map/estate', 'map/packs', 'map/three',
                'map/props/viewer3d.html')
# 底图目录里除 dzi / _files 还有首屏缩略图、云精灵、封面、浮雕、房间图：跟着 world 层走
ART_ALWAYS = ('map/art/clouds', 'map/art/covers', 'map/art/relief', 'map/art/rooms', 'map/art/world_1k.jpg')


def tree_bytes(path):
    if os.path.isfile(path):
        return os.path.getsize(path), 1
    total = count = 0
    for root, _, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
                count += 1
            except OSError:
                pass
    return total, count


def git_files(ref, sub):
    """ref 树里某目录下的文件（以 git 为准；工作树不完整也不会少文件）。"""
    r = subprocess.run(['git', '-C', ROOT, 'ls-tree', '-r', '--name-only', ref, '--', sub],
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f'git ls-tree 失败（本地没有 {ref}？先 git fetch）：{r.stderr.strip()}')
    return [f for f in r.stdout.splitlines() if f]


def layer_family(root):
    """tc_mid_night → (tc_mid, night)；tc_upper_obl_dawn → (tc_upper_obl, dawn)；borders → (borders, '')。"""
    m = re.match(r'^(.*?)(?:_(%s))?$' % '|'.join(DAYPARTS), root)
    return (m.group(1), m.group(2) or '') if m else (root, '')


def pack_greedy(items, target):
    """贪心装箱：按名字顺序装满一个包再开下一个（同样的文件集永远得到同样的分包）。"""
    out, cur, cur_bytes = [], [], 0
    for name, size in items:
        if cur and cur_bytes + size > target:
            out.append(cur)
            cur, cur_bytes = [], 0
        cur.append((name, size))
        cur_bytes += size
    if cur:
        out.append(cur)
    return out


def layer_files(roots, ref):
    out = []
    for r in roots:
        out.append(f'map/art/{r}.dzi')
        d = f'map/art/{r}_files'
        if any(f.startswith(d + '/') for f in git_files(ref, 'map/art')):
            out += [f for f in git_files(ref, d) if f]
    return out


def plan(ref='HEAD', target_mb=40):
    target = target_mb * 1024 * 1024
    files = git_files(ref, 'map')
    pkgs = []

    # --- 引擎包：代码 + 数据 + 设定包 ---
    def under_engine(f):
        return any(f == p or f.startswith(p.rstrip('/') + '/') for p in ENGINE_PATHS) or \
            (f.startswith('map/') and '/' not in f[len('map/'):] and f.endswith(('.js', '.mjs')))
    engine = [f for f in files if under_engine(f)]
    eb = en = 0
    for f in engine:
        b, c = tree_bytes(os.path.join(ROOT, f))
        eb += b
        en += c
    pkgs.append({'name': 'eden-map-engine', 'kind': 'engine', 'files': sorted(engine),
                 'bytes': eb, 'count': en})

    # --- 底图：按层族；族内超目标则每个时段一个包 ---
    roots = sorted({m.group(1) for m in (re.match(r'^map/art/([A-Za-z0-9_]+)\.dzi$', f) for f in files) if m})
    fams = {}
    for root in roots:
        b, c = tree_bytes(os.path.join(ROOT, f'map/art/{root}.dzi'))
        d = os.path.join(ROOT, f'map/art/{root}_files')
        if os.path.isdir(d):
            b2, c2 = tree_bytes(d)
            b += b2
            c += c2
        fam, part = layer_family(root)
        fams.setdefault(fam, []).append((part or 'base', root, b, c))
    art_index = {}
    # 同前缀的小层族先并成一个包（site_* 合计约 11 MB，没必要拆成 10 个包）；并不下超目标就按族分开
    byprefix = {}
    for fam, items in fams.items():
        byprefix.setdefault(fam.split('_')[0], []).append((fam, items))
    families = []
    for prefix, group_ in sorted(byprefix.items()):
        total = sum(b for _, items in group_ for _, _, b, _ in items)
        if len(group_) > 1 and total <= target:
            families.append((f'{prefix}', [it for _, items in group_ for it in items]))
        else:
            families += [(fam, items) for fam, items in sorted(group_)]
    for fam, items in families:
        if sum(b for _, _, b, _ in items) <= target or len(items) == 1:
            name = f'eden-map-art-{fam}'
            rs = [r for _, r, _, _ in items]
            pkgs.append({'name': name, 'kind': 'art', 'files': layer_files(rs, ref),
                         'bytes': sum(b for _, _, b, _ in items), 'count': sum(c for _, _, _, c in items)})
            for r in rs:
                art_index[r] = name
        else:
            for part, root, b, c in items:
                name = f'eden-map-art-{fam}-{part}'
                pkgs.append({'name': name, 'kind': 'art', 'files': layer_files([root], ref),
                             'bytes': b, 'count': c})
                art_index[root] = name
    extra = [p for p in ART_ALWAYS if os.path.exists(os.path.join(ROOT, p))]
    eb2 = en2 = 0
    for p in extra:
        b, c = tree_bytes(os.path.join(ROOT, p))
        eb2 += b
        en2 += c
    for pkg in pkgs:
        if pkg['name'] == 'eden-map-art-world':
            pkg['files'] += extra
            pkg['bytes'] += eb2
            pkg['count'] += en2

    # --- 三维模型：按模型目录装箱 ---
    sizes = {}
    for f in files:
        m = re.match(r'^(map/props/[^/]+)/', f)
        if m:
            sizes[m.group(1)] = sizes.get(m.group(1), 0) + os.path.getsize(os.path.join(ROOT, f))
    props_index = {}
    for i, chunk in enumerate(pack_greedy(sorted(sizes.items()), target)):
        name = f'eden-map-props-{chr(ord("a") + i)}'
        dirs = [d for d, _ in chunk]
        pf = [f for f in files if any(f == d or f.startswith(d + '/') for d in dirs)]
        pkgs.append({'name': name, 'kind': 'props', 'files': pf,
                     'bytes': sum(s for _, s in chunk), 'count': len(pf)})
        for d in dirs:
            props_index[d[len('map/props/'):]] = name

    ver = open(os.path.join(ROOT, 'VERSION'), encoding='utf-8').read().strip()
    return {'version': ver, 'target_mb': target_mb, 'packages': pkgs,
            'assets': {'version': ver, 'art': art_index, 'props': props_index}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ref', default='HEAD')
    ap.add_argument('--target-mb', type=int, default=40)
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--write-assets', metavar='FILE')
    a = ap.parse_args()
    p = plan(a.ref, a.target_mb)
    if a.write_assets:
        path = os.path.join(ROOT, a.write_assets)
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(p['assets'], f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write('\n')
        print(f'写 {a.write_assets}：底图 {len(p["assets"]["art"])} 层、模型 {len(p["assets"]["props"])} 个')
    if a.json:
        print(json.dumps(p, ensure_ascii=False, indent=2))
        return 0
    mb = lambda b: b / 1048576
    print(f"目标每包 ≤ {a.target_mb} MB；版本 {p['version']}；共 {len(p['packages'])} 个包")
    for pkg in p['packages']:
        print(f"  {pkg['name']:34s} {mb(pkg['bytes']):7.1f} MB {pkg['count']:6d} files  ({pkg['kind']})")
    print(f"  {'合计':34s} {mb(sum(x['bytes'] for x in p['packages'])):7.1f} MB "
          f"{sum(x['count'] for x in p['packages']):6d} files")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())