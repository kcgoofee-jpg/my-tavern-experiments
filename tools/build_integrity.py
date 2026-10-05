#!/usr/bin/env python3
"""代码文件完整性清单：map/data/integrity.json = {head_sha, at, files: {仓库内路径: sha256}}。

给 F2 扩展加载器（ext/index.js）用：import 引擎入口之前先逐文件校 SHA-256，对不上就失败关死
（docs/extension-study.md §6 / §8，思路取自 ykny12058/ilw-native-owner，只取思路没取代码）。
覆盖范围 = check_architecture.py 的 ENGINE_GLOBS + map/ui/*.css（代码面；art / props / packs 数据不在
「代码文件」之列，走 @提交号不可变地址本身）。
清单与 head.json 一样按「内容提交」生成：head_sha 记内容提交号，加载器拿它和 head.json 的 sha 对表。

用法（bump_head.py 每次推 head 时自动跑；手工重算）：
  python3 tools/build_integrity.py            # 按当前 HEAD 生成并写文件
  python3 tools/build_integrity.py --check    # 只比对：现有清单 vs 当前 HEAD，差则退出码 1
只用标准库。
"""
import argparse, datetime, glob, hashlib, json, os, subprocess, sys

PATH = 'map/data/integrity.json'

# 与 tools/check_architecture.py 的 ENGINE_GLOBS 同表 + 扩展加载器要 import 的两条线路入口
GLOBS = [
    'map/core/*.mjs', 'map/app/*.mjs', 'map/tavern/*.mjs', 'map/tavern/eden-map.js',
    'map/ui/*.js', 'map/ui/*.mjs', 'map/ui/*.css', 'map/three/*.mjs', 'map/*.mjs',
    'map/viewer.html', 'map/props/viewer3d.html',
    'map/estate/main.js', 'map/estate/presence.js', 'map/estate/labels.js', 'map/estate/terrain.js', 'map/estate/index.html',
]


def head_sha():
    return subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()


def files_of(root):
    out = {}
    for pat in GLOBS:
        for p in sorted(glob.glob(os.path.join(root, pat))):
            if not os.path.isfile(p):
                continue
            rel = os.path.relpath(p, root)
            with open(p, 'rb') as f:
                out[rel] = hashlib.sha256(f.read()).hexdigest()
    return out


def build(root, sha):
    return {'head_sha': sha, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'files': files_of(root)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    sha = head_sha()
    doc = build(root, sha)
    if a.check:
        try:
            with open(PATH, encoding='utf-8') as f:
                old = json.load(f)
        except Exception:
            sys.exit(f'{PATH} 不存在，先跑 python3 tools/build_integrity.py')
        drift = [p for p in doc['files'] if old.get('files', {}).get(p) != doc['files'][p]]
        missing = [p for p in doc['files'] if p not in old.get('files', {})]
        extra = [p for p in old.get('files', {}) if p not in doc['files']]
        if drift or missing or extra:
            for p in drift: print('changed:', p)
            for p in missing: print('missing:', p)
            for p in extra: print('extra:', p)
            sys.exit(1)
        print(f'integrity.json 与 HEAD 一致（{len(doc["files"])} 个文件）')
        return
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print(f'integrity.json：{len(doc["files"])} 个代码文件 @ {sha[:12]}')


if __name__ == '__main__':
    main()
