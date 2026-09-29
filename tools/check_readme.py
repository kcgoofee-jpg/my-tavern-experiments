#!/usr/bin/env python3
"""README 置顶的导入链接 + 里面提到的路径：守着别过期。

为什么要有这个：README 顶部钉着「酒馆助手一行 import」的地址，钉的是仓库名 + 预览分支 + 最新标签，
另外正文里散着一堆路径引用。这些东西不会自己保持正确——2026-09-29 一次通读就发现错了好几处
（`map/estate3d/` 这个目录从来不存在、色觉模式早做了却还写着「无限期推迟」、事件种数写 9 类 66 种、
国内线路写「npmmirror（计划）」但其实早就用 `cdn.jsdmirror.com` 实现了）。所以放进 smoke 当门控。

检查项：
  1. 顶部必须有两条 import 地址：预览线（ref = 预览分支）与发版线（ref = 最新 `map-v*` 标签）；
  2. 地址里的仓库名 == git remote origin 的仓库名；
  3. 正文声明的「当前发布版本 `X`」「标签 `map-vY`」与 `VERSION` / 最新标签一致；
  4. 正文里出现的仓库相对路径（`map/…`、`tools/…`、`docs/…`、`blender/…`）必须真实存在。

用法：
  python3 tools/check_readme.py            # 门控（smoke 里跑的就是这个）
  python3 tools/check_readme.py --fix      # 把地址里的仓库名 / 预览分支 / 标签刷成当前值（发布流程用）
  python3 tools/check_readme.py --net      # 额外联网 HEAD 一下那两条地址（默认不联网，CI/离线可用）
  python3 tools/check_readme.py -v         # 多打一点
退出码：0 通过；1 有不一致；2 用法问题。
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
README = os.path.join(ROOT, 'README.md')
PREVIEW_REF = 'preview'                      # 预览线分支名（docs/branching.md）
URL_RE = re.compile(r'https://([a-z0-9.-]+)/gh/([^/\s`]+/[^/\s`]+)@([^/\s`]+)/map/tavern/eden-map\.js')
PATH_DIRS = ('map/', 'tools/', 'docs/', 'blender/', 'tests/', '.github/')
# 有意不存在的路径写在这里（例如还没有的产出物）；默认空，宁可报错也别静默放过
ALLOW_MISSING = set()


def sh(*args):
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()


def remote_slug():
    url = sh('git', 'remote', 'get-url', 'origin')
    m = re.search(r'[:/]([^/:]+/[^/]+?)(?:\.git)?$', url)
    return m.group(1) if m else ''


def latest_tag():
    tags = sh('git', 'tag', '--list', 'map-v*').split()

    def key(t):
        m = re.match(r'^map-v(\d+)\.(\d+)\.(\d+)', t)
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)

    return max(tags, key=key) if tags else ''


def main():
    fix = '--fix' in sys.argv
    net = '--net' in sys.argv
    verbose = '-v' in sys.argv or '--verbose' in sys.argv
    target = README
    if '--file' in sys.argv:                      # 自测用：检查另一份文件
        i = sys.argv.index('--file')
        if i + 1 >= len(sys.argv):
            print('--file 后面要给路径', file=sys.stderr)
            return 2
        target = os.path.abspath(sys.argv[i + 1])
    if not os.path.exists(target):
        print('找不到 ' + target, file=sys.stderr)
        return 2

    text = open(target, encoding='utf-8').read()
    lines = text.splitlines()
    slug, tag = remote_slug(), latest_tag()
    version = open(os.path.join(ROOT, 'VERSION'), encoding='utf-8').read().strip()
    problems = []
    fixed = []

    # --- 1/2. 顶部两条 import 地址 ---
    urls = [m for m in URL_RE.finditer(text)]
    if not urls:
        problems.append('顶部没有找到形如 https://<host>/gh/<owner>/<repo>@<ref>/map/tavern/eden-map.js 的导入地址')
    rel = [m for m in urls if m.group(3) != PREVIEW_REF]
    prev = [m for m in urls if m.group(3) == PREVIEW_REF]
    if not prev:
        problems.append(f'缺「跟随开发（预览线）」那条：ref 必须是 `{PREVIEW_REF}`')
    if not rel:
        problems.append('缺「发版线（钉标签）」那条：ref 应该是最新标签 `%s`' % (tag or '<还没有标签>'))
    for m in urls:
        if m.group(2) != slug:
            problems.append(f'第 {text[:m.start()].count(chr(10)) + 1} 行的地址里仓库名是 `{m.group(2)}`，'
                            f'而 origin 是 `{slug}`')
    if tag:
        for m in rel:
            if m.group(3) != tag:
                problems.append(f'发版线钉的 ref 是 `{m.group(3)}`，最新标签是 `{tag}`（发布时按 --fix 刷新）')

    # --- 3. 正文声明的版本与标签 ---
    if version and f'当前发布版本 `{version}`' not in text:
        problems.append(f'正文没写「当前发布版本 `{version}`」（VERSION = {version}）')
    if tag and f'`{tag}`' not in text:
        problems.append(f'正文没提到最新标签 `{tag}`')

    # --- 4. 正文提到的路径是否真实存在 ---
    missing = []
    for tok in sorted(set(re.findall(r'`([^`\n]+)`', text))):
        t = tok.strip()
        if not t.startswith(PATH_DIRS):
            continue
        if any(c in t for c in '*<>{}') or t.endswith('/'):
            continue
        if not (re.search(r'\.(js|mjs|json|md|py|sh|html|css|glb|png|jpg|jpeg|webp|dzi|csv|patch|yml|yaml)$', t)
                or '/' in t):
            continue
        if t in ALLOW_MISSING:
            continue
        if not os.path.exists(os.path.join(ROOT, t)):
            missing.append(t)
    for t in missing:
        problems.append(f'正文提到的路径不存在：`{t}`')

    # --- --fix：只改能唯一确定的东西（仓库名 / 预览分支 / 标签） ---
    if fix and urls:
        new = text
        for m in urls:
            host, repo, ref, = m.group(1), m.group(2), m.group(3)
            want = PREVIEW_REF if ref == PREVIEW_REF else tag or ref
            if repo != slug or want != ref:
                new = new.replace(m.group(0), f'https://{host}/gh/{slug}@{want}/map/tavern/eden-map.js')
                fixed.append(f'`{repo}@{ref}` → `{slug}@{want}`')
        if new != text:
            open(target, 'w', encoding='utf-8').write(new)
            print('已刷新：' + '；'.join(fixed))
            # 修完重判一次（本进程里的 text 已经是旧的，别拿旧结论报错）
            again = [sys.executable, os.path.abspath(__file__), '--file', target]
            if verbose:
                again.append('-v')
            if net:
                again.append('--net')
            return subprocess.run(again, cwd=ROOT).returncode

    # --- 可选联网 ---
    if net:
        for m in URL_RE.finditer(text if not fix else new):
            r = subprocess.run(['curl', '-fsS', '-o', '/dev/null', '-w', '%{http_code}', '-I', m.group(0)],
                               capture_output=True, text=True)
            code = r.stdout.strip()
            if code != '200':
                problems.append(f'联网检查：{m.group(0)} 返回 {code}')
            elif verbose:
                print(f'  200  {m.group(0)}')

    if fixed:
        print('已刷新：' + '；'.join(fixed))
    if problems:
        print('README 门控不通过：', file=sys.stderr)
        for p in problems:
            print('  ✗ ' + p, file=sys.stderr)
        print('（只刷新地址用 `python3 tools/check_readme.py --fix`；正文里的过时内容要手改）', file=sys.stderr)
        return 1
    if verbose:
        print(f'  OK 仓库 {slug} · 预览 {PREVIEW_REF} · 最新标签 {tag} · 路径引用 {len(set(re.findall(r"`([^`\n]+)`", text)))} 个 token')
    print('README 置顶导入链接与路径引用：OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
