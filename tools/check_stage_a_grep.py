#!/usr/bin/env python3
"""计划 §8 的卡词 grep 做成冒烟门（阶段 A 验收，docs/plans/spatial-os.md §8）。

与 docs/plans/spatial-os.md §8 里的那条 git grep 是同一个词表、同一组路径排除；排除只放「设定包 / 数据 / 庄园页 /
逐道具资产 / 美术元数据 / 原型 / 顶层页面」，引擎（含 map/viewer.html 与 map/props/viewer3d.html）全在扫描面里。
命中行必须逐条登记在 tools/stage_a_grep_allow.txt（`路径:行号<TAB>理由`，理由只能是 S10 拆仓库时随设定包走）；
不在表里的命中 = 失败；表里登记了却已不命中的条目也失败（表只许缩，不许攒过期条目）。

  python3 tools/check_stage_a_grep.py            检查（失败 exit 1）
  python3 tools/check_stage_a_grep.py --self-test 自测：词表 / 排除 / 允许表的解析
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOW = ROOT / 'tools' / 'stage_a_grep_allow.txt'
PATTERN = '母畜|挤奶|庄园|伊甸|天城|外界知情|网络攻击|tiancheng'
PATHSPEC = ['map', ':!map/packs', ':!map/data', ':!map/estate', ':!map/props/*/**', ':!map/art/**',
            ':!map/_proto/**', ':!map/section.js', ':(exclude,glob)map/*.html']


def grep_hits(root=ROOT, pathspec=None):
    """返回 ['路径:行号', ...]（git grep 命中，已排序）。"""
    cmd = ['git', 'grep', '-nE', PATTERN, '--'] + (PATHSPEC if pathspec is None else pathspec)
    r = subprocess.run(cmd, cwd=root, capture_output=True, text=True, encoding='utf-8')
    if r.returncode not in (0, 1):
        raise SystemExit(f'git grep 失败：{r.stderr.strip()}')
    out = []
    for line in r.stdout.splitlines():
        path, lineno, _ = line.split(':', 2)
        out.append(f'{path}:{lineno}')
    return sorted(out)


def load_allow(path=ALLOW):
    """解析允许表：{ '路径:行号': 理由 }；空行与 # 开头的行跳过；缺理由即报错。"""
    allow, bad = {}, []
    if not Path(path).exists():
        return allow, [f'缺允许表 {path}']
    for n, raw in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith('#'):
            continue
        key, _, reason = raw.partition('\t')
        if not key.strip() or not reason.strip():
            bad.append(f'允许表第 {n} 行缺理由（格式：路径:行号<TAB>理由）：{raw!r}')
            continue
        allow[key.strip()] = reason.strip()
    return allow, bad


def verdict(hits, allow):
    fails = [f'未登记的卡词命中 {h}（引擎 / 注释写中性措辞；确属设定包内容的请登记到 tools/stage_a_grep_allow.txt 并写理由）'
             for h in hits if h not in allow]
    fails += [f'允许表里的 {k} 已不命中（删掉这一条）' for k in allow if k not in set(hits)]
    return fails


def main(argv):
    if '--self-test' in argv:
        return self_test()
    allow, fails = load_allow()
    hits = grep_hits()
    fails += verdict(hits, allow)
    if fails:
        print(f'§8 grep：{len(fails)} 处不合规')
        for f in fails:
            print(f'  {f}')
        return 1
    print(f'§8 grep：命中 {len(hits)} 行，全部在允许表里（{len(allow)} 条）')
    return 0


def self_test():
    import tempfile
    ok = True

    def check(name, cond):
        nonlocal ok
        print(('  ✓ ' if cond else '  ✗ ') + name)
        ok = ok and cond

    check('未登记的命中会失败', bool(verdict(['map/app/x.mjs:3'], {})))
    check('登记过的命中放行', not verdict(['map/a:1'], {'map/a:1': 'S10'}))
    check('过期的允许条目会失败', bool(verdict([], {'map/a:1': 'S10'})))
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / 'allow.txt'
        f.write_text('# c\n\nmap/a:1\tS10 reason\nmap/b:2\n', encoding='utf-8')
        allow, bad = load_allow(f)
        check('允许表解析：理由必填', allow == {'map/a:1': 'S10 reason'} and len(bad) == 1)
    with tempfile.TemporaryDirectory() as d:   # 真 git：引擎文件命中、设定包 / 道具资产排除、viewer3d.html 在扫描面里
        def git(*a):
            subprocess.run(['git', '-C', d, *a], check=True, capture_output=True)
        git('init', '-q')
        for rel in ('map/app/a.mjs', 'map/props/viewer3d.html', 'map/packs/eden/m.json', 'map/props/p1/manifest.json',
                    'map/data/x.json', 'map/art/m.meta.json', 'map/world.html'):
            p = Path(d) / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('// 庄园\n', encoding='utf-8')
        git('add', '-A')
        check('扫描面：引擎与 viewer3d.html 在内，设定包 / 数据 / 道具资产 / 美术 / 顶层页面不在',
              grep_hits(d) == ['map/app/a.mjs:1', 'map/props/viewer3d.html:1'])
    print('§8 grep 自测：' + ('全过' if ok else '有失败'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
