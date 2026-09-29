#!/usr/bin/env python3
"""树卫生看门狗（2026-09-30 接入 tools/smoke.sh）：拦「大体积未跟踪文件被 git add -A 误提交」一类事故。
本仓历史上发生过两次：rsync 传输临时文件（map/art/.tc_low_day_full.png.iCUfRJ 等，63 MB，至今压在历史里）、
道具烘焙中间贴图（map/props/*/*_tex/）。两次都促生了 .gitignore 规则，但规则永远晚于新花样——
这道防线按体量兜底：未被 .gitignore 覆盖的未跟踪文件，单个超过 HYGIENE_MAX_MB 即失败。
  - 临时 / 中间产物：补 .gitignore（连目录规则）或删掉；
  - 待入库成品（如 make_dzi 刚切出的瓦片金字塔）：逐个 git add，不要 -A 整扫。
CI 是干净检出（无未跟踪文件）天然通过；本机渲染 / 构建期间出现大的中间物会红，这是刻意的。
未跟踪的已忽略文件（.cache/、瓦片源图等）不算数——.gitignore 覆盖到的本来就进不了 add -A。
exit 0 = 干净；exit 1 = 有违规。
"""
import os
import subprocess
import sys

HYGIENE_MAX_MB = 10
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    out = subprocess.run(['git', 'status', '--porcelain', '-z', '--untracked-files=all'],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    bad = []
    for entry in out.split('\0'):
        if not entry.startswith('?? '):
            continue
        p = entry[3:]
        if os.path.isdir(p) or os.path.islink(p):
            continue
        try:
            mb = os.path.getsize(p) / 1048576
        except OSError:
            continue
        if mb >= HYGIENE_MAX_MB:
            bad.append((p, mb))
    if bad:
        print(f'树卫生：{len(bad)} 个未跟踪且未被 .gitignore 覆盖的文件超过 {HYGIENE_MAX_MB} MB（git add -A 会把它们带进仓库）：')
        for p, mb in sorted(bad, key=lambda x: -x[1]):
            print(f'  {p}  {mb:.0f} MB')
        print('临时 / 中间产物：补 .gitignore 或删掉；待入库成品：逐个 git add，不要 -A 整扫。')
        return 1
    print(f'树卫生：未跟踪且未忽略的文件里没有 ≥ {HYGIENE_MAX_MB} MB 的大文件')
    return 0


if __name__ == '__main__':
    sys.exit(main())
