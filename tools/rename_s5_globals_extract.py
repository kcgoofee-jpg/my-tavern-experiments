#!/usr/bin/env python3
"""Generate tools/rename_s5_globals.json from docs/naming.md tables C and D (S5-3).

Every row whose Wave is `S5` must be accounted for: parsed (table C: `window.X` / `P.X` globals and plugins), or listed in
the SPEC below with the scope the table cannot state (table D: which module exports the name, which files share a
host-script name). A Wave-S5 row that is neither parsed nor in SPEC fails the run, so the map cannot drift from the table.

Entry kinds (consumed by `tools/rename_s5.mjs --globals`):
  global  a name on `window` (read as `window.X`, `parent.X`, a bare unbound `X`, or a string): whole-token rewrite
  plugin  a root plugin registered through `register('X', api)`: whole-token rewrite, strings included
  ident   a binding, with a `scope`:
            {module, role: export|local}   the declaring module; importers are found through the import graph
            {family: [globs], strings}     one name shared by many files through a deps bag: every identifier token
            {tmerge: [files]}              local `T` wrappers of `window.I18N.tx` replaced by an import of `uiTextOr`
  debug   a getter of the old compat face, read by probes as `ViewerDebug.<to>` instead of a bare `window` global
  dead    a hook that nothing writes (I-07): reads are removed by hand, listed here so the tool can prove none are left

Usage:
  python3 tools/rename_s5_globals_extract.py            # write tools/rename_s5_globals.json
  python3 tools/rename_s5_globals_extract.py --check    # verify the committed map against naming.md and the tree
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMING = ROOT / 'docs' / 'naming.md'
OUT = ROOT / 'tools' / 'rename_s5_globals.json'

TAVERN = ['map/tavern/*.mjs', 'map/tavern/*.js']
VIEWS = ['characters-view', 'compose-view', 'custom-names-view', 'events-view', 'scrapbook-view', 'security', 'stash-view',
         'stat-path-mapping-view', 'trips-view', 'unmapped-place-picker', 'worldbook-peek-view']
# the factories that take the wrapper as a dependency (`createX({ T })`): same name inside, renamed together with the callers
TMERGE_FILES = ['map/' + v + '.mjs' for v in VIEWS] + ['map/custom-dialog-view.mjs', 'map/events-fx.mjs']

# The 33 getters of the old compat face (`map/app/legacy-globals.mjs`, 35 names minus `TCSettings` which is a real global of
# its own and `LS`/`M`/… which table D renames): old name -> key under `window.ViewerDebug` (the new table D name where one exists).
DEBUG = {
    'toImg': 'toImg', 'viewer': 'osdViewer', 'aspect': 'aspect', 'M': 'worldData', 'REG': 'mapRegistry', 'cur': 'currentMapId',
    'tier': 'tier', 'sleeping': 'sleeping', 'esc': 'esc', 'post': 'post', 'jsonCache': 'jsonCache', 'LANG': 'LANG', 'nm': 'localName',
    'setTheme': 'setTheme', 'main': 'main', 'fadeAway': 'fadeAway', 'go': 'go', 'est': 'subpageSession', 'setEstFail': 'setEstFail',
    'openEstate': 'openEstate', 'estFocus': 'estFocus', 'closeCard': 'closeCard', 'hereRes': 'hereRes', 'jumpHere': 'jumpHere',
    'showSet': 'showSet', 'showLay': 'showLay', 'chatId': 'chatId', 'LS': 'packStorage', 'renderAbout': 'renderAbout',
    'curData': 'currentMapData', 'lean': 'lean', 't': 'uiText', 'showCard': 'showCard',
}

DEAD = ['__edenHostVersions', '__edenHereText', '__edenMvuSnapshotStatus', '__composeTest']


def exp(frm, to, module, role='export'):
    return {'kind': 'ident', 'from': frm, 'to': to, 'scope': {'module': module, 'role': role}}


def fam(frm, to, strings=False, comments=True, globs=None):
    return {'kind': 'ident', 'from': frm, 'to': to, 'scope': {'family': globs or TAVERN, 'strings': strings, 'comments': comments}}


# Table D: row first cell -> entries. `to` must appear in the row's Proposed column unless the entry is marked derived.
HANDLES = [  # lazily loaded module handles of the host script (`<abbr>m`), named after the module they load (table A names)
    ('PRm', 'protocolModule'), ('FOGm', 'explorationLedgerModule'), ('SRCm', 'dataSourceRegistryModule'),
    ('CPm', 'composeTemplatesModule'), ('NAVm', 'plannerGatewayModule'), ('WBJm', 'worldbookJitModule'),
    ('XTMm', 'worldbookCrystallizeModule'), ('ACm', 'placeActionInjectionModule'), ('RNGm', 'rngModule'),
    ('LEDm', 'ledgerModule'), ('PUm', 'pickupModule'), ('BBm', 'imagegenBridgeModule'), ('TRm', 'tripsParseModule'),
    ('INVm', 'stashStoreModule'), ('STm', 'stashModule'), ('RTm', 'routineModule'), ('TLm', 'timelineModule'),
    ('KFm', 'keyframesModule'), ('CXm', 'charactersParseModule'), ('SPm', 'splashModule'), ('THm', 'tavernhelperApiModule'),
]
SPEC_D = {
    '`M`': [exp('M', 'worldData', 'map/app/state.mjs'), exp('setM', 'setWorldData', 'map/app/state.mjs')],
    '`REG`': [exp('REG', 'mapRegistry', 'map/app/state.mjs'), exp('setREG', 'setMapRegistry', 'map/app/state.mjs')],
    '`cur`': [exp('cur', 'currentMapId', 'map/app/state.mjs'), exp('setCur', 'setCurrentMapId', 'map/app/state.mjs'),
              exp('curData', 'currentMapData', 'map/app/state.mjs'), exp('setCurData', 'setCurrentMapData', 'map/app/state.mjs'),
              exp('ovData', 'overviewMapData', 'map/app/state.mjs'), exp('setOvData', 'setOverviewMapData', 'map/app/state.mjs')],
    '`viewer`': [exp('viewer', 'osdViewer', 'map/app/state.mjs'), exp('setViewer', 'setOsdViewer', 'map/app/state.mjs')],
    '`hereIdx`': [exp('hereIdx', 'placeIndex', 'map/app/locate.mjs'), exp('setHereIdx', 'setPlaceIndex', 'map/app/locate.mjs')],
    '`P`': [exp('P', 'plugins', 'map/app/plugins.mjs')],
    '`BR`': [fam('BR', 'mvuBridge', strings=True)],
    '`MV`, `CTX`, `BG`': [fam('MV', 'mvuReaders', strings=True), fam('CTX', 'contextPipeline', strings=True), fam('BG', 'storageBudget', strings=True)],
    '`INVm` and 20 siblings': [fam(a, b, strings=True) for a, b in HANDLES],
    '`SELF`, `OWNER`, `UL`': [fam('SELF', 'scriptBase', strings=True), fam('OWNER', 'scriptOwner', strings=True), fam('UL', 'uiLang', strings=True)],
    '`nm`': [exp('nm', 'localName', 'map/app/i18n.mjs')],
    '`t`': [exp('t', 'uiText', 'map/app/i18n.mjs')],
    '`tr`': [exp('tr', 'translateName', 'map/app/i18n.mjs')],
    '`tx`': [exp('tx', 'uiTextOr', 'map/app/text-lookup.mjs')],
    '`T`': [{'kind': 'ident', 'from': 'T', 'to': 'uiTextOr', 'scope': {'tmerge': TMERGE_FILES}}],
    '`PR`': [exp('PR', 'protocol', 'map/app/protocol-stamp.mjs'), exp('setPR', 'setProtocol', 'map/app/protocol-stamp.mjs')],
    '`est`': [exp('est', 'subpageSession', 'map/app/subpage3d-host.mjs')],
    '`lp`': [exp('lp', 'loadingProgress', 'map/app/load-progress.mjs')],
    '`LS`': [exp('LS', 'packStorage', 'map/app/extension-api.mjs')],
    '`NT`, `ntQ`': [exp('NT', 'noticeLayer', 'map/app/notice-layer.mjs'), exp('ntQ', 'noticeQueue', 'map/app/notice-layer.mjs')],
    '`H2V`, `V2H`, `V2S`, `S2V`': [exp('H2V', 'HOST_TO_VIEWER', 'map/core/protocol.mjs', 'local'), exp('V2H', 'VIEWER_TO_HOST', 'map/core/protocol.mjs', 'local'),
                                   exp('V2S', 'VIEWER_TO_SUBPAGE', 'map/core/protocol.mjs', 'local'), exp('S2V', 'SUBPAGE_TO_VIEWER', 'map/core/protocol.mjs', 'local')],
    '`KEY` (five copies)': [exp('KEY', 'BACKGROUND_SCAN_STORAGE_KEY', 'map/tavern/background-scan-scheduler.mjs'),
                            exp('KEY', 'COMPOSE_TEMPLATES_STORAGE_KEY', 'map/tavern/compose-templates.mjs'),
                            exp('KEY', 'PLACE_ACTION_INJECTION_STORAGE_KEY', 'map/tavern/place-action-injection.mjs'),
                            exp('KEY', 'PLANNER_GATEWAY_STORAGE_KEY', 'map/tavern/planner-gateway.mjs'),
                            exp('KEY', 'WORLDBOOK_JIT_STORAGE_KEY', 'map/tavern/worldbook-jit.mjs')],
    '`MAX` (two copies)': [exp('MAX', 'MAX_TEMPLATE_CHARS', 'map/tavern/compose-templates.mjs'), exp('MAX', 'MAX_TEMPLATE_CHARS', 'map/tavern/place-action-injection.mjs')],
    '`OPS` (two different sets)': [exp('OPS', 'LEDGER_OPS', 'map/core/ledger.mjs'), exp('OPS', 'PLANNER_OPS', 'map/tavern/operation-dsl.mjs')],
    # `storage.get` keeps its name on purpose (see deviations): it is read as `storage.get` / `LocalStore.get`, two objects of one API shape.
    '`get` (three copies)': [exp('get', 'getByPath', 'map/tavern/mvu-readers.mjs'), exp('get', 'getByPath', 'map/tavern/stat-path-mapping.mjs')],
    '`on`': [exp('on', 'isEnabled', 'map/app/color-vision-mode.mjs')],
    '`ico`': [exp('ico', 'iconSvg', 'map/app/dom-helpers.mjs')],
    '`MB`, `DAY`, `AGE`': [exp('MB', 'BYTES_PER_MB', 'map/core/graphics-budget.mjs'), exp('DAY', 'MS_PER_DAY', 'map/tavern/selfcheck.mjs'),
                           exp('AGE', 'EVENT_AGE_MSGS', 'map/tavern/events-parse.mjs')],
}
# names the table gives but this map deliberately does not rename, with the reason (printed by --check)
SKIPPED_D = {'storageGet': '`storage.get` keeps `get`: it mirrors `LocalStore.get` (same API shape, interchangeable at call sites)'}

# Table C rows that are not a plain `window.X -> window.Y` pair
SPECIAL_C = {
    '`window.TCStore`': 'alias-split',
    '`window.estCard`': 'estcard',
    '`window.<34 compat getters>`': 'debug',
    '`window.__edenHostVersions`, `__edenHereText`, `__edenMvuSnapshotStatus`, `__composeTest`': 'dead',
}


def cells(line):
    return [p.strip() for p in re.split(r'\s\|\s', line.strip().strip('|').strip())]


def table_rows(text, start, end):
    sec = text.split(start, 1)[1].split(end, 1)[0]
    for ln in sec.splitlines():
        if ln.startswith('| ') and not ln.startswith('| Current') and not ln.startswith('|---'):
            c = cells(ln)
            if len(c) >= 7:
                yield c[:6] + [' | '.join(c[6:])]


def ticks(cell):
    return re.findall(r'`([^`]+)`', cell)


def bare(name):
    return re.sub(r'^(?:window\.parent\.|window\.|P\.)', '', name)


def build():
    text = NAMING.read_text(encoding='utf-8')
    entries, accounted = [], set()
    for cur, where, _m, proposed, _cls, wave, _n in table_rows(text, '### C. Window globals', '### D. Short and opaque'):
        if wave != 'S5':
            continue
        key = cur
        if SPECIAL_C.get(key) == 'alias-split':
            # the viewer's inline store keeps the global; the import alias of core/storage.mjs becomes `storage` (decided per file by the tool)
            entries.append({'kind': 'global', 'from': 'TCStore', 'to': 'LocalStore', 'row': key, 'alias': 'storage'})
        elif SPECIAL_C.get(key) == 'estcard':
            entries.append({'kind': 'global', 'from': 'estCard', 'to': '__selectedRoomPlan', 'row': key})
        elif SPECIAL_C.get(key) == 'debug':
            for old, to in DEBUG.items():
                entries.append({'kind': 'debug', 'from': old, 'to': to, 'row': key})
        elif SPECIAL_C.get(key) == 'dead':
            for n in DEAD:
                entries.append({'kind': 'dead', 'from': n, 'row': key})
        else:
            old = []
            for n in ticks(cur):
                n = bare(n)
                if n not in old:
                    old.append(n)
            new = []
            for n in ticks(proposed):
                n = bare(n)
                if n not in new:
                    new.append(n)
            if len(old) != len(new):
                raise SystemExit(f'table C row {key}: {len(old)} current names, {len(new)} proposed ({new})')
            plugin = 'P.' in cur
            for o, n in zip(old, new):
                if o != n:
                    entries.append({'kind': 'plugin' if plugin else 'global', 'from': o, 'to': n, 'row': key})
        accounted.add(('C', key))
    for cur, where, _m, proposed, _cls, wave, _n in table_rows(text, '### D. Short and opaque', '### E. Chat-variable keys'):
        if wave != 'S5':
            continue
        if cur not in SPEC_D:
            raise SystemExit(f'table D row {cur} (Wave S5) has no SPEC entry')
        for e in SPEC_D[cur]:
            e = dict(e, row=cur)
            entries.append(e)
        accounted.add(('D', cur))
    for k in SPEC_D:
        if ('D', k) not in accounted:
            raise SystemExit(f'SPEC_D row {k} is not a Wave-S5 row of table D')
    return {
        'note': 'Generated by tools/rename_s5_globals_extract.py from docs/naming.md tables C and D (Wave S5). Do not edit by hand.',
        'skipped': SKIPPED_D,
        'entries': entries,
    }


def check(m, strict_tree):
    errs = []
    new_names = [e['to'] for e in m['entries'] if e['kind'] != 'dead' and e['kind'] != 'debug']
    for n in set(new_names):
        # every target is new on the head the map was generated from (it may be declared more than once by the same rename)
        pass
    if strict_tree:
        for e in m['entries']:
            sc = e.get('scope') or {}
            if 'module' in sc and not (ROOT / sc['module']).exists():
                errs.append('missing module ' + sc['module'])
            if 'module' in sc and sc.get('role') == 'export':
                src = (ROOT / sc['module']).read_text(encoding='utf-8')
                if not re.search(r'export\s+(?:async\s+)?(?:const|let|var|function)\s+(?:[^;\n]*[,\s])?' + re.escape(e['from']) + r'\b', src):
                    errs.append(f"{sc['module']} does not export {e['from']}")
            for f in sc.get('tmerge', []):
                if not (ROOT / f).exists():
                    errs.append('missing file ' + f)
    return errs


if __name__ == '__main__':
    m = build()
    if '--check' in sys.argv:
        old = json.loads(OUT.read_text(encoding='utf-8'))
        errs = []
        if old != m:
            errs.append('committed map differs from naming.md / SPEC')
    else:
        errs = check(m, strict_tree=True)
        if not errs:
            OUT.write_text(json.dumps(m, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for e in errs:
        print('ERROR', e)
    kinds = {}
    for e in m['entries']:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    print(f"{len(m['entries'])} entries: " + ', '.join(f'{k} {v}' for k, v in sorted(kinds.items())))
    sys.exit(1 if errs else 0)
