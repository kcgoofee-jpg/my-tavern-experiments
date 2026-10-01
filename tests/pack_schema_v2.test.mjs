// 设定包 schema 2（docs/kernel-schema.md，S1-design）：最小包过 v2 schema 与 tools/check_pack.py 的树 / 引用检查；坏例一律被拦；
// v2 schema 只用 tools/jsonschema_lite.py 认得的关键字（否则校验器会在没走到的分支上悄悄失效）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const py = src => JSON.parse(execFileSync('python3', ['-c', src], { cwd: ROOT, encoding: 'utf8' }));

test('最小包（schema 2）过 check_pack', () => {
  const out = execFileSync('python3', ['tools/check_pack.py', 'minimal'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /minimal：通过/);
});

test('v2 校验器拦下坏例（内联全部块后逐项弄坏）', () => {
  const r = py(`import json, sys, os, copy
sys.path.insert(0, 'tools'); import check_pack as C
d = 'map/packs/minimal'; m = json.load(open(d + '/manifest.json', encoding='utf-8'))
for k in C.BLOCKS2:
    if isinstance(m.get(k), str): m[k] = json.load(open(os.path.join(d, m[k]), encoding='utf-8'))
def run(f):
    x = copy.deepcopy(m); f(x); return len(C.check_v2('minimal', d, x))
N = lambda x, i: x['nodes'][i]
ok = [
  lambda x: None,
  lambda x: x.update({'x-note': 1, '_c': 2}),
  lambda x: x['nodes'].append({'id': 'isle', 'name': 'Isle'}),
  lambda x: N(x, 3).update({'alias': ['the inn'], 'hints': ['Gull & Lantern Inn']}),
  lambda x: x['ui']['theme'].update({'tokens': {'--accent': 'var(--ink)', '--r-s': '4px', '--fs-body': '1.1rem', '--line': '#c0c0c0'}}),
  lambda x: x['ui'].update({'levels': {'brindle': ['docks', 'market']}}),
  lambda x: x.update({'layers': [{'id': 'patrol', 'type': 'flow', 'slot': 'routes', 'source': 'inline', 'applies': {'views': ['harrow']}, 'style': {'color': '#9ad0f5', 'speed': 0.05, 'path': {'width': 1.4, 'dash': [10, 4]}}, 'data': {'features': [{'view': 'harrow', 'pts': [[0.1, 0.1], [0.5, 0.5]]}]}, 'menu': {'label': 'Patrol', 'i18n': {'en': {'label': 'Patrol'}}}, 'legend': [{'label': 'Patrol'}]}, {'id': 'routes', 'menu': {'order': 5}, 'off': True}]}),
]
bad = [
  lambda x: x.pop('title'),
  lambda x: x.update({'surprise': 1}),
  lambda x: x.update({'schema': 3}),
  lambda x: N(x, 4).update({'id': 'docks'}),
  lambda x: N(x, 3).update({'parent': 'nowhere'}),
  lambda x: (N(x, 0).update({'parent': 'inn'})),
  lambda x: N(x, 3).update({'view': 'missing'}),
  lambda x: N(x, 1).update({'enter': 'inn'}),
  lambda x: N(x, 3).update({'id': 'Inn'}),
  lambda x: N(x, 3).update({'canon': 'card'}),
  lambda x: N(x, 3).update({'alias': ['the inn']}),
  lambda x: N(x, 3).update({'at': {'x': 0.5, 'y': 0.5, 'view': 'nope'}}),
  lambda x: x['views'].update({'harrow': {'kind': 'panorama'}}),
  lambda x: x['views']['harrow'].update({'open': 'always'}),
  lambda x: x['events']['types']['fire'].update({'group': 'nope'}),
  lambda x: x['events']['types']['fire'].update({'fx': 'sparkle'}),
  lambda x: x['items']['stash'][0].update({'node': 'nowhere'}),
  lambda x: x['entities']['fields'][1].update({'kind': 'bar'}),
  lambda x: x['entities'].update({'avatar': {'from': ['card-script'], 'hosts': ['com']}}),
  lambda x: x.update({'layers': [{'id': 'patrol', 'type': 'line', 'slot': 'sky'}]}),
  lambda x: x['vars']['periods'][0].update({'start': '25:00'}),
  lambda x: x['vars']['periods'][0].update({'start': '23:00'}),
  lambda x: x['ui'].update({'start': 'nowhere'}),
  lambda x: x['ui'].update({'levels': {'brindle': ['docks', 'nowhere']}}),
  lambda x: x['ui']['theme'].update({'tokens': {'--accent': 'url(https://x)'}}),
  lambda x: x['ui']['theme'].update({'tokens': {'--accent': '"red"'}}),
  lambda x: x['ui']['theme'].update({'tokens': {'--z-top': '1'}}),
  lambda x: x['llm']['worldbook']['entries'][0].update({'keys': ['/a+/i']}),
  lambda x: x.update({'cdn': {'npm': '../evil'}}),
  lambda x: x.update({'layers': '%2e%2e/evil.json'}),
  lambda x: x.update({'layers': [{'id': 'a', 'type': 'point', 'slot': 'markers', 'source': 'view:nope'}]}),
  lambda x: x.update({'layers': [{'id': 'a', 'type': 'point', 'slot': 'markers', 'source': 'inline', 'menu': {'label': ''}}]}),
  lambda x: x.update({'layers': [{'id': 'a', 'type': 'point', 'slot': 'markers', 'source': 'inline', 'style': {'color': 'red', 'surprise': 1}}]}),
]
print(json.dumps({'ok': [run(f) for f in ok], 'bad': [run(f) for f in bad]}))`);
  r.ok.forEach((n, i) => assert.equal(n, 0, `合法例 ${i} 应通过`));
  r.bad.forEach((n, i) => assert.ok(n > 0, `坏例 ${i} 应被拦`));
  assert.equal(r.bad.length, 33);
});

test('v2 schema 只用 jsonschema_lite 认得的关键字', () => {
  const bad = py(`import json, glob, sys
sys.path.insert(0, 'tools'); from jsonschema_lite import KNOWN
bad = []
def walk(s, where):
    if not isinstance(s, dict): return
    bad.extend(f'{where}:{k}' for k in s if k not in KNOWN)
    for k in ('$defs', 'properties', 'patternProperties'):
        for n, v in (s.get(k) or {}).items(): walk(v, f'{where}/{n}')
    for k in ('items', 'additionalProperties', 'propertyNames'):
        if isinstance(s.get(k), dict): walk(s[k], f'{where}/{k}')
    for k in ('allOf', 'anyOf', 'oneOf'):
        for i, v in enumerate(s.get(k) or []): walk(v, f'{where}/{k}{i}')
files = sorted(glob.glob('map/data/schema/v2/*.schema.json'))
for f in files: walk(json.load(open(f, encoding='utf-8')), f)
print(json.dumps({'n': len(files), 'bad': bad}))`);
  assert.equal(bad.n, 14, '14 个 v2 schema 文件（S8-1 加了 scene3d，S9b 加了 media，S8-4a 加了 transit，S7-3 加了 rooms）');
  assert.deepEqual(bad.bad, []);
});

test('3D 清单 schema（K-R104）：随仓的每份清单都过，坏清单被拦', () => {
  const r = py(`import json, glob, sys
sys.path.insert(0, 'tools'); from jsonschema_lite import validate
sch = json.load(open('map/data/schema/v2/scene3d.schema.json', encoding='utf-8'))
files = ['map/estate/model/manifest.json'] + sorted(glob.glob('map/props/*/manifest.json'))
errs = {f: validate(json.load(open(f, encoding='utf-8')), sch) for f in files}
good = {'id': 'x', 'glb': {'site': {'std': 'a.glb', 'low': 'b.glb'}, 'house': {'std': 'c.glb'}}, 'floors': ['f1', {'id': 'f2'}], 'flows': [{'color': '#aabbcc'}], 'unknown': 1}
bads = [{'glb': 'a.glb'}, {'id': 'x'}, {'id': 'x', 'glb': 5}, {'id': 'x', 'glb': {'site': {'low': 'b.glb'}}}, {'id': 'x', 'glb': 'a.glb', 'flows': [{'color': 'red'}]}, {'id': 'x', 'glb': 'a.glb', 'data': {'rooms': 3}}]
print(json.dumps({'n': len(files), 'bad': {f: e for f, e in errs.items() if e}, 'good': validate(good, sch), 'bads': [len(validate(b, sch)) for b in bads]}))`);
  assert.ok(r.n > 30, '主场景 + 每个地标');
  assert.deepEqual(r.bad, {});
  assert.deepEqual(r.good, []);
  r.bads.forEach((n, i) => assert.ok(n > 0, `坏清单 ${i} 应被拦`));
});
