#!/usr/bin/env python3
"""check_readme.py 的自测：确认它真的会拦，而不是「0 个 token 所以通过」的空过。

2026-09-29 的教训：语言门控第一版对「基线之后没有任何新文档」的仓库也是绿的——空过等于没测。
所以这里用临时文件喂各种坏状态，逐个断言退出码，最后确认 --fix 能修回来。

用法：python3 tools/test_readme.py
"""
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = os.path.join(ROOT, 'tools', 'check_readme.py')


def run(path, *args):
    r = subprocess.run([sys.executable, CHECK, '--file', path, *args],
                       capture_output=True, text=True, cwd=ROOT)
    return r.returncode, (r.stdout + r.stderr)


def main():
    # 用真实仓库的事实拼一份「正确」的样本（仓库名 / 版本 / 标签都从仓库里取）
    tag = subprocess.run(['git', 'tag', '--list', 'map-v*'], cwd=ROOT,
                         capture_output=True, text=True).stdout.split()
    tag = sorted(tag, key=lambda t: [int(x) for x in re.match(r'map-v(\d+)\.(\d+)\.(\d+)', t).groups()])[-1]
    version = open(os.path.join(ROOT, 'VERSION'), encoding='utf-8').read().strip()
    remote = subprocess.run(['git', 'remote', 'get-url', 'origin'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    slug = re.search(r'[:/]([^/:]+/[^/]+?)(?:\.git)?$', remote).group(1)
    imp = f"https://cdn.jsdelivr.net/gh/{slug}@{tag}/map/tavern/eden-map.js"

    good = (
        "# 标题\n\n"
        "## 一\n\n## 二\n\n"
        f"当前发布版本 `{version}`（标签 `{tag}`）\n\n"
        "## 三\n\n"
        f"| 安装 | `import '{imp}'` |\n\n"
        "## 四\n\n"
        "- 相关：[`tools/smoke.sh`](tools/smoke.sh)、`map/viewer.html`、`docs/todo.md`\n\n"
        "## 五\n\n## 六\n"
    )
    cases = [
        ('正确的样本应通过', good, {}, 0),
        ('钉的标签过期 → 拦', good.replace(f'@{tag}/map', '@map-v0.0.1/map'), {}, 1),
        ('仓库名写错 → 拦', good.replace(slug, 'other/map-repo'), {}, 1),
        ('线路域名不在实测表里 → 拦', good.replace('https://cdn.jsdelivr.net/gh/', 'https://cdn.statically.io/gh/'), {}, 1),
        ('分支地址不能当正式版导入行 → 拦', good.replace(f'@{tag}/map', '@preview/map'), {}, 1),
        ('缺 import 地址 → 拦', good.replace(imp, 'https://example.org/x.js'), {}, 1),
        ('正文版本号对不上 → 拦', good.replace(f'`{version}`', '`9.9.9`'), {}, 1),
        ('提到不存在的路径 → 拦', good + '- 还在用 `map/estate3d/index.html`\n', {}, 1),
        ('通配与占位不算路径 → 通过', good + '- 中间产物在 `map/props/*/*_tex/`、`map/art/gallery/<roomId>/`\n', {}, 0),
        ('小节数不对 → 拦', good + '\n## 七\n', {}, 1),
        ('链接目标不存在 → 拦', good + '\n[坏链](docs/nope-404.md)\n', {}, 1),
        ('外链与锚点不查 → 通过', good + '\n[外](https://example.org/x.md) [锚](#三)\n', {}, 0),
        ('--fix 能把标签修回来', good.replace(f'@{tag}/map', '@map-v0.0.1/map'), {'fix': True}, 0),
    ]

    fail = 0
    with tempfile.TemporaryDirectory() as d:
        for name, body, opts, want in cases:
            p = os.path.join(d, 'README.md')
            open(p, 'w', encoding='utf-8').write(body)
            rc, out = run(p, *(['--fix'] if opts.get('fix') else []))
            ok = rc == want
            # --fix 那条还要确认真的改对了
            if ok and opts.get('fix'):
                after = open(p, encoding='utf-8').read()
                ok = imp in after
            print(('  OK   ' if ok else '  FAIL ') + name + ('' if ok else f'（退出码 {rc}，期望 {want}）'))
            if not ok:
                fail += 1
                print('       ' + out.strip().replace('\n', '\n       ')[:400])

    if fail:
        print(f'自测失败 {fail} 项', file=sys.stderr)
        return 1
    print(f'自测通过（{len(cases)} 项：会拦，也能修）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
