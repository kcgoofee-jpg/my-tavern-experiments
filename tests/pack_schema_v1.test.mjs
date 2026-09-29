// 设定包清单 schema v1 冻结守门（docs/pack-schema-v1.md）：v1 字段只增不改；所有包的清单过 JSON Schema 与运行时 validate。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as PK from '../map/core/pack.mjs';

const ROOT = new URL('..', import.meta.url);
const rd = p => readFileSync(new URL(p, ROOT), 'utf8');
const S = JSON.parse(rd('map/data/schema/pack.schema.json'));

// v1 快照：新增可选字段时在这里补；删 / 改名 / 改必填 = 升 schema 2（见文档 §1）
const V1 = {
  required: ['id', 'schema', 'title', 'data'],
  top: ['$schema', 'id', 'schema', 'title', 'title_en', 'chat', 'data', 'preload', 'vars', 'cdn', 'theme', 'features', 'strings', 'worldbook'],
  nested: { chat: ['var'], data: ['maps', 'world', 'derived', 'rooms', 'events', 'worldbook', 'security', 'roster'], cdn: ['repo', 'npm'], theme: ['accent'], worldbook: ['addon'] },
  dataRequired: ['maps'],
};

test('schema v1 冻结：必填集不变、v1 字段都还在（只许新增可选字段）', () => {
  assert.equal(S.properties.schema.const, 1);
  assert.deepEqual([...S.required].sort(), [...V1.required].sort());
  assert.deepEqual([...S.properties.data.required].sort(), V1.dataRequired);
  for (const k of V1.top) assert.ok(k in S.properties, `顶层字段 ${k} 不能删 / 改名`);
  for (const [o, ks] of Object.entries(V1.nested)) for (const k of ks) assert.ok(k in S.properties[o].properties, `${o}.${k} 不能删 / 改名`);
  const extra = Object.keys(S.properties).filter(k => !V1.top.includes(k));
  for (const k of extra) assert.ok(!S.required.includes(k), `新增字段 ${k} 必须是可选的`);
  assert.equal(S.additionalProperties, false);
  assert.match(rd('docs/pack-schema-v1.md'), /已冻结/);
});

test('所有包的清单：运行时 validate 通过、id = 目录名、schema = 1', () => {
  const ids = readdirSync(new URL('map/packs/', ROOT), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  assert.ok(ids.includes('eden') && ids.includes('town'));
  for (const id of ids) {
    const m = JSON.parse(rd(`map/packs/${id}/manifest.json`));
    assert.deepEqual(PK.validate(m), [], id); assert.equal(m.id, id); assert.equal(m.schema, 1);
  }
});

test('校验器拒绝：schema ≠ 1、缺必填、外链 / 上跳路径、未知顶层键（JSON Schema 侧）', () => {
  const ok = JSON.parse(rd('map/packs/town/manifest.json'));
  assert.ok(PK.validate({ ...ok, schema: 2 }).length);
  assert.ok(PK.validate({ ...ok, title: '' }).length);
  assert.ok(PK.validate({ ...ok, data: { maps: '../x.json' } }).length);
  assert.ok(PK.validate({ ...ok, data: { maps: 'https://e.com/x.json' } }).length);
  const py = `import json,sys; sys.path.insert(0,'tools'); from jsonschema_lite import validate
S=json.load(open('map/data/schema/pack.schema.json',encoding='utf-8')); m=json.load(open('map/packs/town/manifest.json',encoding='utf-8'))
bad=[dict(m,surprise=1), dict(m,schema=2), {k:v for k,v in m.items() if k!='data'}, dict(m,data={'maps':'/abs.json'})]
print(json.dumps([len(validate(m,S))]+[len(validate(b,S)) for b in bad]+[len(validate(dict(m,_note='x'),S))]))`;
  const r = JSON.parse(execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' }));
  assert.equal(r[0], 0, '示例包应通过'); for (const n of r.slice(1, 5)) assert.ok(n > 0); assert.equal(r[5], 0, '_ 开头的注释键允许');
});
