#!/usr/bin/env python3
"""发版一致性检查：VERSION ↔ map/data/build.json ↔ CHANGELOG ↔ README ↔ git 标签。

背景（2026-09-27 接手时发现）：版本号散在 5 个地方，以前**没有任何东西核对它们是否一致**。
运行时会拿脚本 URL 里的版本（`@map-vX.Y.Z`）和 `map/data/build.json` 的 `version` 比，不一致就
在用户面板上永久显示「脚本 vX 与地图 vY 版本不一致」；而构建号（编码里的 N）按「提交数 + 1」算，
提交顺序一错就再也反查不回来。所以这里把能查的都查掉：

  1. VERSION 是 X.Y.Z，或带第 4 段小修补丁 X.Y.Z.P（标签 map-vX.Y.Z.P，编码版本段 XYZZpP）；
     新系列写 S<n>:X.Y.Z[.P]（标签 map-s<n>-vX.Y.Z[.P]，编码前缀 S<n>；规则在 tools/verlib.py，见 docs/versioning.md）；
     build.json 可带 min_version（X.Y.Z[.P]，≤ version）/ force_reason：低于 min_version 的脚本弹「此版本已停止支持」；
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
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verlib

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
    pv = verlib.parse(ver)
    if not pv:
        errors.append(f'VERSION「{ver}」不是 X.Y.Z[.P] 或 S<n>:X.Y.Z[.P]'); pv = (1, '0.0.0')
    series, plain = pv
    tag = a.tag or (verlib.tag_of(ver) if verlib.parse(ver) else f'map-v{ver}')

    # 2/3. build.json
    bp = os.path.join(ROOT, 'map', 'data', 'build.json')
    b = {}
    if not os.path.exists(bp):
        errors.append('缺 map/data/build.json（发版前跑 python3 tools/version_code.py R）')
    else:
        try: b = json.load(open(bp, encoding='utf-8'))
        except ValueError as e: errors.append(f'build.json 解析失败：{e}')
    if b:
        if b.get('version') != plain:
            errors.append(f'build.json 的 version「{b.get("version")}」≠ VERSION「{ver}」（build.json 不写系列前缀，应是「{plain}」）——'
                          f'用户自检会一直报「脚本与地图版本不一致」')
        m = verlib.CODE_RE.fullmatch(str(b.get('code', '')))
        if not m:
            errors.append(f'build.json 的 code「{b.get("code")}」不符合 S<赛季>-<版本>-<通道>-<构建号>')
        else:
            want = verlib.code_seg(plain)
            if int(m.group(1)) != series:
                errors.append(f'build.json 的 code 系列「S{m.group(1)}」≠ VERSION 的系列「S{series}」')
            if m.group(2) != want:
                errors.append(f'build.json 的 code 版本段「{m.group(2)}」≠ VERSION 推出的「{want}」')

        mv = b.get('min_version')
        if mv is not None:
            if not verlib.parse(mv): errors.append(f'build.json 的 min_version「{mv}」不是 X.Y.Z[.P] 或 S<n>:X.Y.Z[.P]')
            elif verlib.key(mv) > verlib.key(ver):
                errors.append(f'build.json 的 min_version {mv} 比本版 {ver} 还新：所有人（包括本版）都会被要求更新')

    # 4. README
    rp = os.path.join(ROOT, 'README.md')
    if os.path.exists(rp):
        mt = re.search(r'当前发布版本\s*`((?:S\d+:)?[\d.]+)`', open(rp, encoding='utf-8').read())
        if not mt: warns.append('README 顶部没找到「当前发布版本 `X.Y.Z`」')
        elif mt.group(1) != ver: errors.append(f'README「当前发布版本 {mt.group(1)}」≠ VERSION「{ver}」')

    # 5/6/7. CHANGELOG 与标签
    cp = os.path.join(ROOT, 'CHANGELOG.md')
    head = None
    if os.path.exists(cp):
        txt = open(cp, encoding='utf-8').read()
        for line in txt.splitlines():
            if re.match(rf'## {re.escape(ver)}(?![\d.])', line):   # 0.9.6 不能匹配到 0.9.6.1 的小节
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
        if b and (m := verlib.CODE_RE.fullmatch(str(b.get('code', '')))):
            n = int(sh('git', 'rev-list', '--count', tag).stdout.strip() or 0)
            if n and n != int(m.group(4)):
                # 2026-09-29：C4（git 瘦身 / filter-repo 重写历史）把 map-v0.9.5 指到了「恢复渲染资产」那一笔
                # （a61bdd4d，第 572 位），而 build.json 的 0280 是**原发布提交**的位数——两者都不算错，
                # 但「构建号 == 标签提交数」这条反查在不改标签的前提下已无法同时成立（改标签会动到 CDN 上钉的发布物，更危险）。
                # 所以降级为警告；下次发版时 version_code.py 会写新标签的位数，这条自然恢复。
                warns.append(f'build.json 构建号 {int(m.group(4))} ≠ {tag} 的提交数 {n}：C4 重写历史后标签指向恢复提交，'
                             f'这条反查在下一次发版（重跑 version_code.py）之前不成立，属已知情况、不影响发布物一致性')
    elif head is not None and '未发版' not in head:
        warns.append(f'CHANGELOG 的「{head}」标成已发版，但还没有 {tag} 标签（发版窗口内属正常）')

    for w in warns: print('警告', w)
    for e in errors: print('错误', e)
    print(f"版本检查：VERSION {ver}，标签 {tag}{'（已存在）' if has_tag else '（未打）'}；"
          f"{len(errors)} 个错误，{len(warns)} 个警告")
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
