#!/usr/bin/env python3
"""docs/ARCHITECTURE.md (+ zh) module map gate (stage A close).

  1. Every module row in section 3 (3.1 core ... 3.6 root) names a file that exists in that directory.
  2. Every engine file (tools/check_architecture.py ENGINE_GLOBS) appears in section 3 exactly once.
  3. Every backticked repo path elsewhere in the document (map/ tools/ docs/ tests/ ..., no wildcard or placeholder)
     exists, except the ones listed in GONE (paths the text says are deleted).

  python3 tools/check_arch_doc.py            check both editions (exit 1 on a problem)
  python3 tools/check_arch_doc.py --self-test
"""
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import check_architecture as ca  # noqa: E402

DOCS = ['docs/ARCHITECTURE.md', 'docs/ARCHITECTURE.zh.md']
SECTION_DIR = {'3.1': 'map/core', '3.2': 'map/app', '3.3': 'map/tavern', '3.4': 'map/ui', '3.5': 'map/three', '3.6': 'map'}
PAGES = {'map/viewer.html', 'map/props/viewer3d.html'}
GONE = {'map/here.mjs'}   # named in the text to say it was deleted (S3-3)
PATH_RE = re.compile(r'`((?:map|tools|docs|tests|skills|blender|\.github)/[^`\s]+)`')


def check_text(txt, root=ROOT, engine=None):
    problems, listed, sec = [], Counter(), None
    for line in txt.splitlines():
        m = re.match(r'### (3\.\d)\b', line)
        if m:
            sec = m.group(1)
        elif line.startswith('## '):
            sec = None
        if sec in SECTION_DIR and line.startswith('| `'):
            name = re.match(r'\| `([^`]+)`', line).group(1)
            if '*' in name or '<' in name:
                continue
            rel = f'{SECTION_DIR[sec]}/{name}'
            listed[rel] += 1
            if not (Path(root) / rel).exists():
                problems.append(f'section {sec}: `{name}` is listed but {rel} does not exist')
        elif sec == '3.7' and line.startswith('| `'):
            listed[re.match(r'\| `([^`]+)`', line).group(1)] += 1
    for m in PATH_RE.finditer(txt):
        p = m.group(1).rstrip('.,;:)')
        if p in GONE or any(c in p for c in '*<>…{}') or p.endswith('/'):
            continue
        if not (Path(root) / p).exists():
            problems.append(f'path `{p}` is named but does not exist')
    files = engine if engine is not None else {str(p.relative_to(root)) for p in ca.engine_files(root)}
    for f in sorted(files - set(listed)):
        problems.append(f'engine file {f} is missing from the module map')
    for f, n in sorted(listed.items()):
        if n > 1:
            problems.append(f'{f} is listed {n} times')
        elif f not in files and f not in PAGES and (Path(root) / f).exists():
            problems.append(f'{f} is listed but is not an engine file')
    return problems


def main(argv):
    if '--self-test' in argv:
        return self_test()
    bad = []
    for d in DOCS:
        bad += [f'{d}: {p}' for p in check_text((ROOT / d).read_text(encoding='utf-8'))]
    if bad:
        print(f'architecture doc: {len(bad)} problem(s)')
        for b in bad:
            print(f'  {b}')
        return 1
    print(f'architecture doc: module map matches the engine files ({len(DOCS)} editions)')
    return 0


def self_test():
    import tempfile
    ok = True

    def check(name, cond):
        nonlocal ok
        print(('  ok  ' if cond else '  FAIL ') + name)
        ok = ok and cond

    with tempfile.TemporaryDirectory() as d:
        for rel in ('map/core/a.mjs', 'map/app/b.mjs', 'docs/x.md'):
            p = Path(d) / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('x', encoding='utf-8')
        eng = {'map/core/a.mjs', 'map/app/b.mjs'}
        good = '### 3.1 map/core\n\n| `a.mjs` | r |\n\n### 3.2 map/app\n\n| `b.mjs` | r |\n\nSee `docs/x.md`.\n'
        check('a matching doc has no problem', check_text(good, d, eng) == [])
        check('a listed file that does not exist fails', any('does not exist' in p for p in check_text(good.replace('a.mjs', 'zz.mjs'), d, eng)))
        check('an engine file missing from the map fails', any('missing from the module map' in p for p in check_text(good.replace('| `b.mjs` | r |\n', ''), d, eng)))
        check('a file listed twice fails', any('2 times' in p for p in check_text(good + '\n### 3.2 map/app\n\n| `b.mjs` | r |\n', d, eng)))
        check('a dead path in the text fails', any('docs/gone.md' in p for p in check_text(good + '`docs/gone.md`\n', d, eng)))
    print('architecture doc self-test: ' + ('all passed' if ok else 'FAILED'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
