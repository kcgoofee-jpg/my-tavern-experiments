#!/usr/bin/env python3
"""发版一致性检查：VERSION ↔ map/data/build.json ↔ CHANGELOG ↔ README ↔ git 标签。

背景（2026-09-27 接手时发现）：版本号散在 5 个地方，以前**没有任何东西核对它们是否一致**。
运行时会拿脚本 URL 里的版本（`@map-vX.Y.Z`）和 `map/data/build.json` 的 `version` 比，不一致就
在用户面板上永久显示「脚本 vX 与地图 vY 版本不一致」；而构建号（编码里的 N）按「提交数 + 1」算，
提交顺序一错就再也反查不回来。所以这里把能查的都查掉：

  1. VERSION 是 X.Y.Z；
  2. build.json 的 version == VERSION；
  3. build.json 的 code（S<赛季>-<版本>-<通道>-<构建号>）里的版本段 == VERSION；
  4. README 顶部「当前发布版本 `X.Y.Z`」== VERSION；
  5. CHANGELOG 有 `## X.Y.Z` 小节；
  6. 打了 `map-vX.Y.Z` 标签时：CHANGELOG 不许再写「未发版」，标签里那份 build.json 必须和当前一致，
     构建号 N 必须 == `git rev-list --count map-vX.Y.Z`（这就是「反查」的定义）；
  7. 没打标签、CHANGELOG 也没写「未发版」时：只警告（正常的发版窗口：改完 VERSION 等提交，标签还没打）。

用法：python3 tools/check_version.py [--tag map-vX.Y.Z]
退出码：0 通过（可能有警告）；1 有错误。
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors, warns = [], []


def sh(*a):
    return subprocess.run(a, cwd=ROOT, capture_output=True, text=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', help='只查这个标签（默认查 map-v<VERSION>）')
    a = ap.parse_args()

    vp = os.path.join(ROOT, 'VERSION')
    if not os.path.exists(vp):
        print('错误 没有 VERSION 文件'); return 1
    ver = open(vp, encoding='utf-8').read().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', ver):
        errors.append(f'VERSION「{ver}」不是 X.Y.Z')
    tag = a.tag or f'map-v{ver}'

    # 2/3. build.json
    bp = os.path.join(ROOT, 'map', 'data', 'build.json')
    b = {}
    if not os.path.exists(bp):
        errors.append('缺 map/data/build.json（发版前跑 python3 tools/version_code.py R）')
    else:
        try: b = json.load(open(bp, encoding='utf-8'))
        except ValueError as e: errors.append(f'build.json 解析失败：{e}')
    if b:
        if b.get('version') != ver:
            errors.append(f'build.json 的 version「{b.get("version")}」≠ VERSION「{ver}」——'
                          f'用户自检会一直报「脚本与地图版本不一致」')
        m = re.fullmatch(r'S(\d+)-(\d+)-([RBTD])-(\d{4})', str(b.get('code', '')))
        if not m:
            errors.append(f'build.json 的 code「{b.get("code")}」不符合 S<赛季>-<版本>-<通道>-<构建号>')
        else:
            major, minor, patch = (int(x) for x in ver.split('.'))
            want = f'{major}{minor}{patch:02d}'
            if m.group(2) != want:
                errors.append(f'build.json 的 code 版本段「{m.group(2)}」≠ VERSION 推出的「{want}」')

    # 4. README
    rp = os.path.join(ROOT, 'README.md')
    if os.path.exists(rp):
        mt = re.search(r'当前发布版本\s*`([\d.]+)`', open(rp, encoding='utf-8').read())
        if not mt: warns.append('README 顶部没找到「当前发布版本 `X.Y.Z`」')
        elif mt.group(1) != ver: errors.append(f'README「当前发布版本 {mt.group(1)}」≠ VERSION「{ver}」')

    # 5/6/7. CHANGELOG 与标签
    cp = os.path.join(ROOT, 'CHANGELOG.md')
    head = None
    if os.path.exists(cp):
        txt = open(cp, encoding='utf-8').read()
        for line in txt.splitlines():
            if line.startswith(f'## {ver}'):
                head = line.strip(); break
        if head is None:
            errors.append(f'CHANGELOG 没有「## {ver}」小节')
    else:
        errors.append('缺 CHANGELOG.md')

    has_tag = sh('git', 'rev-parse', '-q', '--verify', f'refs/tags/{tag}').returncode == 0
    if has_tag and head is not None:
        if '未发版' in head:
            errors.append(f'已打标签 {tag}，CHANGELOG 还写着「未发版」：{head}')
        # 标签里那份 build.json 必须和当前一致（防「改了没提交就发版」）
        r = sh('git', 'show', f'{tag}:map/data/build.json')
        if r.returncode != 0:
            errors.append(f'{tag} 里没有 map/data/build.json')
        else:
            try:
                tb = json.loads(r.stdout)
                if tb != b: errors.append(f'{tag} 里的 build.json 与当前工作区不一致（{tb} vs {b}）')
            except ValueError as e: errors.append(f'{tag} 里的 build.json 解析失败：{e}')
        # 构建号反查
        if b and (m := re.fullmatch(r'S(\d+)-(\d+)-([RBTD])-(\d{4})', str(b.get('code', '')))):
            n = int(sh('git', 'rev-list', '--count', tag).stdout.strip() or 0)
            if n and n != int(m.group(4)):
                errors.append(f'build.json 构建号 {int(m.group(4))} ≠ {tag} 的提交数 {n}'
                              f'（version_code.py 要在发版提交前跑，构建号 = 提交数 + 1）')
    elif head is not None and '未发版' not in head:
        warns.append(f'CHANGELOG 的「{head}」标成已发版，但还没有 {tag} 标签（发版窗口内属正常）')

    for w in warns: print('警告', w)
    for e in errors: print('错误', e)
    print(f"版本检查：VERSION {ver}，标签 {tag}{'（已存在）' if has_tag else '（未打）'}；"
          f"{len(errors)} 个错误，{len(warns)} 个警告")
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
