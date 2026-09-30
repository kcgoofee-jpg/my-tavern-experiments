// maps.json / points 数据 / addon_places.json 的 JSON Schema（map/data/schema/，tools/jsonschema_lite.py）：现有数据通过，典型写错被拦下
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const py = code => JSON.parse(execFileSync('python3', ['-c', `import json, sys; sys.path.insert(0, 'tools'); from jsonschema_lite import validate
S = lambda n: json.load(open('map/data/schema/' + n + '.schema.json', encoding='utf-8'))
D = lambda f: json.load(open('map/data/' + f, encoding='utf-8'))
${code}`], { cwd: ROOT, encoding: 'utf8' }));

test('现有数据全部符合 schema', () => {
  assert.deepEqual(py(`r = D('maps.json'); out = validate(r, S('maps'))
for m in r['maps'].values():
    if m.get('data'): out += validate(json.load(open('map/' + m['data'], encoding='utf-8')), S('points'))
out += validate(D('addon_places.json'), S('addon_places')); print(json.dumps(out))`), []);
});
test('写错的字段、类型、枚举、坐标都报错', () => {
  const errs = py(`import copy; r = D('maps.json'); b = copy.deepcopy(r)
b['maps']['tc_mid']['kind'] = 'point'; b['maps']['tc_mid']['titel'] = 'x'
mk = next(iter(b['maps']['tc_low']['markers'].values())); mk['cls'] = 'castle'; mk['alias'] = []; del mk['src']
mk['link'] = {'marker': 'x'}
p = D('tc_low.json'); p['markers'][0]['nx'] = 1.2
print(json.dumps([validate(b, S('maps')), validate(p, S('points'))]))`);
  const [m, p] = errs, has = (a, re) => assert.ok(a.some(e => re.test(e)), `${re} 不在 ${JSON.stringify(a)}`);
  has(m, /tc_mid\.kind: 应为/); has(m, /tc_mid\.titel: 未登记的字段/); has(m, /\.cls: 应为 \['capital'\]/); has(m, /\.alias: 至少 1 项/); has(m, /缺字段 src/); has(m, /\.link: 缺字段 map/);
  has(p, /markers\[0\]\.nx: 应 ≤ 1/);
});
test('check_maps 接了 schema；schema 用到的关键字校验器都支持', () => {
  assert.match(execFileSync('python3', ['tools/check_maps.py'], { cwd: ROOT, encoding: 'utf8' }), /0 个错误/);
  assert.deepEqual(py(`from jsonschema_lite import KNOWN
def walk(s, out):
    if isinstance(s, dict):
        for k, v in s.items():
            if k not in ('properties', 'patternProperties', '$defs') and k not in KNOWN: out.append(k)
            walk(v, out) if k not in ('properties', 'patternProperties', '$defs') else [walk(x, out) for x in v.values()]
    elif isinstance(s, list): [walk(x, out) for x in s]
    return out
print(json.dumps(sum((walk(S(n), []) for n in ('maps', 'points', 'addon_places')), [])))`), []);
});
