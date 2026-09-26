#!/usr/bin/env python3
# 生成版本编码，写入 map/data/build.json（发版时在打标签之前运行并一起提交）。
# 编码：S<赛季>-<版本>-<通道>-<构建号>，查看器运行时再加客户端尾号，例如 S1-0701-R-0042-M。
#   赛季：固定，换大版本 / 大改设定时手动加一（SEASON）。
#   版本：VERSION 的 主.次.修订 → 主 + 次 + 两位修订，0.7.1 → 0701，1.12.3 → 11203。
#   通道：R 正式、B 公测、T 内测、D 开发（默认 R）。
#   构建号：分支提交数 + 1（即将提交的这次），四位补零；同一提交可以用 git rev-list 反查。
#   尾号（运行时）：I iOS/iPadOS、A 安卓、M macOS、W Windows、S 其他。
# 用法：python3 tools/version_code.py [R|B|T|D]
import json, os, subprocess, sys

SEASON = 1
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ch = (sys.argv[1] if len(sys.argv) > 1 else 'R').upper()
if ch not in 'RBTD' or len(ch) != 1: sys.exit('通道只能是 R / B / T / D')
major, minor, patch = (int(x) for x in open(os.path.join(ROOT, 'VERSION')).read().strip().split('.'))
n = int(subprocess.check_output(['git', 'rev-list', '--count', 'HEAD'], cwd=ROOT).decode()) + 1
code = f'S{SEASON}-{major}{minor}{patch:02d}-{ch}-{n:04d}'
out = os.path.join(ROOT, 'map', 'data', 'build.json')
json.dump({'code': code, 'version': f'{major}.{minor}.{patch}'}, open(out, 'w'), ensure_ascii=False)
print(code)
