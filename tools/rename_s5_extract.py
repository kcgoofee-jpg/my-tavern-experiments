#!/usr/bin/env python3
"""Generate tools/rename_s5_map.json from docs/naming.md tables A and B (S5-2).

Rows whose Wave is `S5` become a file rename (current path -> proposed path, both relative to the repo root), a delete
with a redirect (the forwarder `tavern/routine.mjs`), a specifier rename (the 3D import-map alias) or a split target.
The util / shell / depth splits are designed in S5-2 T3 and listed here as data (SPLITS) so the collision check sees
their new names. Checks: every source exists (or is a split source), no target collides with an existing file or with
another target, no source is an external contract.

Usage:
  python3 tools/rename_s5_extract.py            # write tools/rename_s5_map.json
  python3 tools/rename_s5_extract.py --check    # verify the committed map (before the codemod: sources exist)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMING = ROOT / 'docs' / 'naming.md'
OUT = ROOT / 'tools' / 'rename_s5_map.json'

# Files a saved page or an imported script requests by path; none of them may move (they are S10).
EXTERNAL = {
    'map/tavern/eden-map.js': 'the entry file the user imports; changes only in S10',
    'map/viewer.html': 'the viewer page a saved page embeds; S10 if anything',
    'map/world.html': 'standalone page',
    'map/tiancheng.html': 'standalone page',
}

# Rows of table A / B that are not a plain file rename, with the reason (T1 report).
SPECIAL = {
    'core/depth.mjs (fog-visit part)': 'split',
    'import-map alias `three/map/`': 'specifier',
}

# S5-2 T3 splits: job modules replace the source (`keep` = the source stays and only gives up the listed exports).
# Export -> module mapping; tools/split_s5.mjs rewrites every importer from it.
SPLITS = [
    {'from': 'map/app/util.mjs', 'keep': False, 'to': {
        'map/app/coordinates.mjs': ['toImg'],
        'map/app/dom-helpers.mjs': ['$', 'esc', 'ico', 'afterLoadIdle'],
        'map/app/viewport-mode.mjs': ['narrow', 'setNarrow', 'coarse'],
        'map/app/protocol-stamp.mjs': ['PROTO', 'PR', 'setPR', 'post', 'SUB_ORIGIN'],
        'map/app/screen-reader-announce.mjs': ['srQ', 'srT', 'setSrQ', 'announce'],
        'map/app/json-cache.mjs': ['jsonCache', 'getJSON'],
        'map/app/text-lookup.mjs': ['tx'],
    }},
    {'from': 'map/app/shell.mjs', 'keep': False, 'to': {
        'map/app/control-column.mjs': ['makeDock', 'paintLbl', 'toggleLabels', 'setActs'],
        'map/app/drawer-glue.mjs': ['placeLayers', 'sheetVis', 'placeEmpty', 'cardSheet', 'initShell'],
        'map/app/notice-layer.mjs': ['NT', 'ntQ', 'ntActs', 'noticeRefresh', 'firstRunHint'],
        'map/app/status-dot.mjs': ['stDotLabel', 'flashOk'],
        'map/app/one-hand-mode.mjs': ['initE7'],
        'map/app/quick-zoom.mjs': [],
    }},
    {'from': 'map/core/depth.mjs', 'keep': True, 'to': {
        'map/core/exploration-ledger.mjs': ['MAX_MAPS', 'MAX_PER_MAP', 'MAX_NAME', 'norm', 'visit', 'known', 'count'],
    }},
]


def cells(line):
    parts = re.split(r'\s\|\s', line.strip().strip('|').strip())
    return [p.strip() for p in parts]


def strip_ticks(s):
    m = re.search(r'`([^`]+)`', s)
    return m.group(1) if m else s.strip()


def table_rows(text, start, end):
    sec = text.split(start, 1)[1].split(end, 1)[0]
    rows = []
    for ln in sec.splitlines():
        if not ln.startswith('| ') or ln.startswith('| Current') or ln.startswith('|---'):
            continue
        c = cells(ln)
        if len(c) >= 7:
            rows.append(c[:6] + [' | '.join(c[6:])])
    return rows


def build():
    text = NAMING.read_text(encoding='utf-8')
    rows = [('A', r) for r in table_rows(text, '### A. Engine files', '### B. Same-name file pairs')]
    rows += [('B', r) for r in table_rows(text, '### B. Same-name file pairs', '### C. Window globals')]
    renames, deletes, specifiers, excluded = [], [], [], []
    for tab, (cur, where, _meaning, proposed, _cls, wave, _notes) in rows:
        if wave != 'S5':
            if wave == 'S10':
                excluded.append({'from': 'map/' + strip_ticks(cur), 'reason': 'Wave S10 (moves with the first pack)'})
            continue
        if cur.startswith('`') and '(fog-visit part)' in cur:
            continue                                            # a split, listed in SPLITS
        if cur.startswith('import-map alias'):
            specifiers.append({'from': 'three/map/', 'to': 'engine3d/', 'table': tab, 'file': 'map/props/viewer3d.html'})
            continue
        src = strip_ticks(where).rsplit(':', 1)[0]            # the Where column has the real path (e.g. map/app/here-v2.mjs)
        if proposed == '(delete)':
            deletes.append({'from': src, 'redirect': 'map/core/routine.mjs', 'table': tab})
            continue
        prop = strip_ticks(proposed)
        prop = prop.split(' ')[0]                              # drop trailing prose ("(moves with ...)")
        if '/' in prop:
            dst = 'map/' + prop
        else:
            dst = str(Path(src).parent / prop)
        if src in EXTERNAL:
            excluded.append({'from': src, 'reason': EXTERNAL[src]})
            continue
        renames.append({'from': src, 'to': dst, 'table': tab})
    for p, why in EXTERNAL.items():
        excluded.append({'from': p, 'reason': why})
    return {
        'note': 'Generated by tools/rename_s5_extract.py from docs/naming.md tables A and B (Wave S5). Do not edit by hand.',
        'renames': renames, 'deletes': deletes, 'specifiers': specifiers, 'splits': SPLITS, 'excluded': excluded,
    }


def check(m):
    errs = []
    srcs = [r['from'] for r in m['renames']] + [d['from'] for d in m['deletes']]
    for s in srcs:
        if not (ROOT / s).exists():
            errs.append('missing source ' + s)
        if s in EXTERNAL:
            errs.append('external contract in sources ' + s)
    tgts = [r['to'] for r in m['renames']]
    for t in tgts:
        if (ROOT / t).exists() and t not in srcs:
            errs.append('target exists ' + t)
    for a in set(tgts):
        if tgts.count(a) > 1:
            errs.append('duplicate target ' + a)
    split_t = [t for sp in SPLITS for t in sp['to']]
    for t in split_t:
        if t in tgts or (ROOT / t).exists():
            errs.append('split target collides ' + t)
    for d in m['deletes']:
        if not (ROOT / d['redirect']).exists():
            errs.append('redirect target missing ' + d['redirect'])
    return errs


if __name__ == '__main__':
    m = build()
    errs = check(m)
    if '--check' in sys.argv:
        old = json.loads(OUT.read_text(encoding='utf-8'))
        if old != m:
            errs.append('committed map differs from naming.md')
    else:
        OUT.write_text(json.dumps(m, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for e in errs:
        print('ERROR', e)
    print(f"{len(m['renames'])} renames (A {sum(1 for r in m['renames'] if r['table']=='A')}, B {sum(1 for r in m['renames'] if r['table']=='B')}), "
          f"{len(m['deletes'])} delete, {len(m['specifiers'])} specifier, {len(m['splits'])} split, {len(m['excluded'])} excluded")
    sys.exit(1 if errs else 0)
