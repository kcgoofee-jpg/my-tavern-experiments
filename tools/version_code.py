#!/usr/bin/env python3
# 生成版本编码，写入 map/data/build.json（发版时在打标签之前运行并一起提交）。
# 编码：S<赛季>-<版本>-<通道>-<构建号>，查看器运行时再加客户端尾号，例如 S1-0701-R-0042-M。
#   赛季（系列）：VERSION 写 S<n>:X.Y.Z 时取 n，否则 1；换系列 = 版本号从 0 重新数（docs/versioning.md）。
#   版本：VERSION 的 主.次.修订 → 主 + 次 + 两位修订，0.7.1 → 0701，1.12.3 → 11203；
#         带第 4 段小修补丁时加 p<补丁>：0.9.6.1 → 0906p1（标签 map-v0.9.6.1）。
#   build.json 里手写的 min_version / force_reason（强制更新：低于 min_version 的版本弹「已停止支持」）原样保留。
#   通道：R 正式、B 公测、T 内测、D 开发（默认 R）。
#   构建号：分支提交数 + 1（即将提交的这次），四位补零；同一提交可以用 git rev-list 反查。
#   尾号（运行时）：I iOS/iPadOS、A 安卓、M macOS、W Windows、S 其他。
# 用法：python3 tools/version_code.py [R|B|T|D]
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ch = (sys.argv[1] if len(sys.argv) > 1 else 'R').upper()
if ch not in 'RBTD' or len(ch) != 1: sys.exit('通道只能是 R / B / T / D')
full = open(os.path.join(ROOT, 'VERSION')).read().strip()
pv = verlib.parse(full)
if not pv: sys.exit(f'VERSION「{full}」不是 X.Y.Z[.P] 或 S<n>:X.Y.Z[.P]')
SEASON, ver = pv   # 赛季 = 系列：VERSION 带 S<n>: 前缀时取它，否则 1
n = int(subprocess.check_output(['git', 'rev-list', '--count', 'HEAD'], cwd=ROOT).decode()) + 1
code = f'S{SEASON}-{verlib.code_seg(ver)}-{ch}-{n:04d}'
out = os.path.join(ROOT, 'map', 'data', 'build.json')
old = {}
try: old = json.load(open(out, encoding='utf-8'))
except Exception: pass
b = {'code': code, 'version': ver}
for k in ('min_version', 'force_reason'):
    if k in old: b[k] = old[k]
json.dump(b, open(out, 'w'), ensure_ascii=False)
print(code)
