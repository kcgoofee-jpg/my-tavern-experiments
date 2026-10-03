#!/usr/bin/env python3
"""把入口的模块图打成一个文件（PERF-BUNDLE / Q-33 的实验工具，2026-10-03）。

**结论：这条路上没有收益，所以没有接进发布链路。** 留着是为了让这个结论可复现，也给下一次换打包器
（或换目标）用。`tools/pack_npm.sh` 不调它；仓库里的源码始终是模块。

为什么当初想做：EXT-STUDY §3.2 实测（Mac WebKit 冷启动 23.9 s 的一次里，7.8 s 花在「入口模块约 40 个
静态 import，每个都从 CDN 单独取一次」）。想法是把宿主入口的模块图压成一次请求。

实测到什么（`node tools/browser/perf_first_frame.mjs`，Chromium + WebKit，各 3 次，模拟 250 ms 往返
+ 每域名 6 个连接的浏览器上限，见该文件的注释）：

  宿主入口        81 个请求 → 1 个（确定性收益，测到了）
  全页请求数      317 → 277（少 40 个）
  首帧Chromium  11911 ms（11693–11932）→ 13492 ms（13482–13498）  ← 反而慢 1.6 s
  首帧 WebKit  12541 ms（12309–12541）→ 13792 ms（13774–13839）  ← 反而慢 1.3 s
  首帧 WebKit（热） 7697 ms（7479–7730）→ 9012 ms（8978–13813）  ← 反而慢 1.3 s

  加上 --minify 也不变（403 KB，首帧 13481 ms，与不压缩的 13492 ms 一样）：多出来的那 1.5 s 不是
  解析体积，是「81 个小脚本合成一个大作用域之后」的代价。

所以 EXT-STUDY §3.2 那个「40 次串行取模块吃 7.8 秒」的归因**不成立**：模块图并不是串行的（查看器早就
有 modulepreload 清单，见 map/viewer.html），真正挤的是 CDN 当时有多忙。请求数在本地不花钱，在被打满的
CDN 上才花钱——要确认这件事得在真 TT 里量，那是人的活。

用法（仍然可用）：
  python3 tools/bundle_engine.py --list            # 每个入口的模块数与体积
  python3 tools/bundle_engine.py --out dist/pkg    # 把打包产物写进 dist/pkg/<入口路径>（minify 加 --minify）
  python3 tools/bundle_engine.py --check           # 入口图有没有变（这个可以进 smoke）
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 要打包的入口：宿主脚本（酒馆助手 import 的那一个）与查看器的启动模块。两者都是「父模块不到手、
# 子模块就发不出去」最深的那两张图；viewer3d.html 是独立子页，不在这里。
# 只打宿主入口。查看器的 app/boot.mjs 试过：它的图里模块之间有循环，打包后 esbuild 的初始化
# 顺序与浏览器原生 ESM 不同，mainInner 读到 undefined 的 .init、go() 读到 undefined 的 .collapse，
# 地图起不来（tools/browser/accept.mjs 首屏 30 s）。修它要改源码，超出本提示词的范围（OUT：行为不变）。
ENTRIES = ('map/tavern/eden-map.js',)
ESBUILD = 'esbuild@0.28.2'
ESBUILD = 'esbuild@0.28.2'   # 钉死版本：换版本要重新验一遍四个浏览器探针
# 静态 import / export ... from / import('字面量')；只跟相对路径（bare specifier 由浏览器原样取，
# 不属于本地图）。注释与字符串里的同形文本会多算一两个文件——宁可多算，不可漏算。
IMP = re.compile(r"""(?:^|[\s;{(])(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]""")
IMP_BARE = re.compile(r"""(?:^|[\s;{(])import\s*['"]([^'"]+)['"]""")
DYN = re.compile(r"""import\s*\(\s*['"]([^'"]+)['"]\s*\)""")


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def walk(entry):
    """入口的静态模块图（相对路径闭包）。返回 ({相对路径: 文本}, 不存在的引用)。"""
    seen, queue, missing = {}, [entry], []
    while queue:
        rel = queue.pop()
        if rel in seen:
            continue
        full = os.path.join(ROOT, rel)
        if not os.path.exists(full):
            missing.append(rel)
            continue
        with open(full, encoding='utf-8') as f:
            text = f.read()
        seen[rel] = text
        for spec in IMP.findall(text) + IMP_BARE.findall(text) + DYN.findall(text):
            if spec.startswith('.'):
                queue.append(os.path.normpath(os.path.join(os.path.dirname(rel), spec)))
    return seen, missing


def graph_hash():
    """两张图合起来一个哈希：内容变了就变，与遍历顺序无关。"""
    h = hashlib.sha256()
    for entry in ENTRIES:
        files, _ = walk(entry)
        for f in sorted(files):
            h.update(('%s:%s\n' % (f, sha(os.path.join(ROOT, f)))).encode())
    return h.hexdigest()


def describe():
    out = {'tool': ESBUILD, 'graph': graph_hash()}
    for entry in ENTRIES:
        files, missing = walk(entry)
        out[entry] = {'modules': len(files),
                      'bytes': sum(len(t.encode()) for t in files.values()),
                      'missing': sorted(missing)}
    return out


def bundle(entry, out_dir, minify=False):
    """把一个入口打成单文件，放到 out_dir 下的同一路径。"""
    dest = os.path.join(out_dir, entry)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    banner = ('// 由 tools/bundle_engine.py 打的包（PERF-BUNDLE）：%s 与它的模块图合成一个文件。\n'
              '// 注意：文件头记着结论——这条路上没有收益，发布链路没有用它（见文件头）。生成器 %s。\n'
              % (entry, ESBUILD))
    cmd = ['npx', '--yes', ESBUILD, os.path.join(ROOT, entry), '--bundle', '--format=esm',
           '--outfile=' + dest, '--log-level=warning'] + (['--minify'] if minify else [])
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode or not os.path.exists(dest):
        raise SystemExit('esbuild 失败（%s）：%s' % (entry, (r.stderr or r.stdout).strip()[:400]))
    with open(dest, encoding='utf-8') as f:
        body = f.read()
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(banner + body)
    return os.path.getsize(dest)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', metavar='DIR', help='把打包产物写进 DIR/<入口路径>')
    ap.add_argument('--check', action='store_true', help='只报入口图的规模（这个可以进 smoke 当尺子）')
    ap.add_argument('--list', action='store_true', help='人看：每个入口的模块数与体积')
    ap.add_argument('--minify', action='store_true', help='再压缩（实测不改变结论，见文件头）')
    a = ap.parse_args()
    d = describe()
    for entry in ENTRIES:
        for m in d[entry]['missing']:
            print('%s 引用了不存在的 %s' % (entry, m), file=sys.stderr)

    if a.list:
        print('graph %s' % d['graph'][:16])
        for entry in ENTRIES:
            print('  %-24s %4d modules %8.1f KB' % (entry, d[entry]['modules'], d[entry]['bytes'] / 1024))
        return 0

    if a.check:
        print('入口图：' + '、'.join('%s %d modules / %.1f KB' % (k, d[k]['modules'], d[k]['bytes'] / 1024)
                                    for k in ENTRIES) + '（graph %s）' % d['graph'][:16])
        return 0

    if a.out:
        for entry in ENTRIES:
            n = bundle(entry, a.out, a.minify)
            print('  %-24s %4d modules -> %7.1f KB%s' % (entry, d[entry]['modules'], n / 1024,
                                                          '（minify）' if a.minify else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
