// FIX-3 7: model-reply tolerance. One ladder (map/core/model-json.mjs) for everything that reads a model's
// structured reply: parse as it stands -> unwrap a code fence -> take the first object/array and close a truncated
// tail -> give up quietly. A case per feature the prompt named, including the three that turn out not to parse
// model JSON at all (JIT, crystallise, OOC) - those are pinned here so the next session can see why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as J from '../map/core/model-json.mjs';
import * as O from '../map/tavern/operation-dsl.mjs';
import * as X from '../map/tavern/worldbook-crystallize.mjs';
import * as OC from '../map/core/ooc.mjs';
import * as K from '../map/tavern/worldbook-jit.mjs';
import { parseCustomTags } from '../map/tavern/mvu-readers.mjs';

const src = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const F = String.fromCharCode(96).repeat(3);   // a code fence, spelled without writing one

test('the ladder: plain JSON, a fenced reply, prose around it, an array when asked for one', () => {
  assert.deepEqual(J.parseLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(J.parseLoose(F + 'json\n{"a":1}\n' + F), { a: 1 }, 'a fence is unwrapped');
  assert.deepEqual(J.parseLoose('<code>{"a":1}</code>'), { a: 1 });
  assert.deepEqual(J.parseLoose('\u597d\u7684\uff1a\n{"a":1}\n\u5e0c\u671b\u6709\u7528\u3002'), { a: 1 }, 'prose around it is dropped, the first object wins');
  assert.deepEqual(J.parseLoose('[1,2]', { array: true }), [1, 2]);
  assert.equal(J.parseLoose('42'), 42, 'a bare scalar is still a value');
});

test('the ladder: a truncated tail is closed, not thrown away', () => {
  assert.deepEqual(J.parseLoose('{"a":1'), { a: 1 }, 'missing brace');
  assert.deepEqual(J.parseLoose('{"a":1,'), { a: 1 }, 'dangling comma');
  assert.deepEqual(J.parseLoose('{"a":"half a sen'), { a: 'half a sen' }, 'cut inside a string');
  assert.deepEqual(J.parseLoose('{"a":{"b":[1,2'), { a: { b: [1, 2] } }, 'three brackets open at once');
  assert.deepEqual(J.parseLoose('{"a":'), {}, 'cut on a key');
  assert.deepEqual(J.parseLoose('{"a":"}"}'), { a: '}' }, 'a bracket inside a string is not a bracket');
  assert.equal(J.closeBraces('{"a":1}'), '{"a":1}', 'balanced input comes back unchanged');
});

test('the ladder: give up quietly - null, never a throw, and never a half-repaired value', () => {
  for (const bad of ['', '   ', 'no json here', '{ \u8fd9\u4e0d\u662f JSON', '{"a":NaN}', '<html>502</html>', F + '\n' + F])
    assert.equal(J.parseLoose(bad), null, JSON.stringify(bad));
  assert.doesNotThrow(() => J.parseLoose('{"a":' + '"x'.repeat(5000)));
  assert.equal(J.parseLoose('{"a":1').a, 1);
});

test('AI advisor: a reply cut off mid-op still produces the op; unrepairable is dropped and counted, never thrown', () => {
  const cut = O.parse('OP_EVENT {"cat":"\u706b\u707e","place":"7\u53f7\u4e95\u9ed1\u5e02","text":"\u4ed3\u5e93\u8d77\u706b"');
  assert.equal(cut.ops.length, 1, 'the closing quote and brace are added back');
  assert.deepEqual(cut.ops[0], { op: 'OP_EVENT', cat: '\u706b\u707e', place: '7\u53f7\u4e95\u9ed1\u5e02', text: '\u4ed3\u5e93\u8d77\u706b', lvl: 2 });
  assert.equal(cut.dropped, 0);
  // \u8865\u5f97\u4e0a\u4f46\u5b57\u6bb5\u4e0d\u5408\u683c\uff1a\u4ecd\u7136 throw-not-coerce\uff0c\u4e22\u5f03\u5e76\u8ba1\u6570\uff08\u5bb9\u9519\u4e0d\u662f\u653e\u884c\uff09
  const badType = O.parse('OP_EVENT {"cat":"\u706b\u707e","place":"7\u53f7\u4e95\u9ed1\u5e02","text":123');
  assert.equal(badType.ops.length, 0); assert.equal(badType.dropped, 1);
  const junk = O.parse('OP_SUGGEST { \u8fd9\u91cc\u4e0d\u662f JSON');
  assert.equal(junk.ops.length, 0); assert.equal(junk.dropped, 1);
  assert.doesNotThrow(() => O.parse('OP_CLUE {"name":"\u8840\u8ff9","nx":0.3,'));
  // \u65ad\u5c3e\u4e4b\u540e\u4e0d\u8fde\u5750\uff1a\u540e\u9762\u7684\u566a\u58f0\u4e0d\u4f1a\u88ab\u5f53\u6210\u53e6\u4e00\u6761 op
  assert.equal(O.parse('OP_SUGGEST {"text":"\u6ca1\u95ed\u5408\nOP_SUGGEST {"text":"\u566a\u58f0"}').ops.length, 0);
});

test('crystallise: no model JSON at all - the reply arrives as a tag; a fenced or cut-off floor still reads', () => {
  const msgs = [
    { floor: 1, text: '\u2316\u4e8b\u5b9e 7\u53f7\u4e95\u9ed1\u5e02\uff1a\u9ed1\u5e02\u7684\u8001\u89c4\u77e9\u662f\u5148\u95ee\u4ef7\u3002' },
    { floor: 2, text: F + '\n\u2316\u4e8b\u5b9e \u8d2b\u6c11\u7a74\uff1a\u8fd9\u6761\u662f\u793a\u8303\uff0c\u4e0d\u8981\u6536\n' + F },
    { floor: 3, text: '\u2316\u4e8b\u5b9e \u8d2b\u6c11\u7a74\uff1a\u68da\u6237\u533a\u9760\u9ed1\u5e02\u6d3b\u7740' },
    { floor: 4, text: '\u2316\u4e8b\u5b9e \u94f6\u51a0\uff1a\u9a91\u58eb\u56e2' },
  ];
  const facts = X.collectFacts(msgs, parseCustomTags);
  assert.deepEqual(facts.map(f => [f.key, f.text, f.floor]), [
    ['7\u53f7\u4e95\u9ed1\u5e02', '\u9ed1\u5e02\u7684\u8001\u89c4\u77e9\u662f\u5148\u95ee\u4ef7', 1],
    ['\u8d2b\u6c11\u7a74', '\u68da\u6237\u533a\u9760\u9ed1\u5e02\u6d3b\u7740', 3],
    ['\u94f6\u51a0', '\u9a91\u58eb\u56e2', 4],
  ], 'newest floor last, the fenced one never entered, a cut-off floor still reads');
  assert.deepEqual(parseCustomTags('\u2316\u4e8b\u5b9e \u7532\uff1a<code>\u4e59</code>'), [], 'a value inside a code block is a quotation: the wrapper goes with its content');
  assert.deepEqual(parseCustomTags('\u2316\u4e8b\u5b9e \u7532\uff1a\u4e59'), [{ op: 'fact', key: '\u7532', value: '\u4e59' }], 'a plain tag is read');
  assert.deepEqual(parseCustomTags('\u2316\u4e8b\u5b9e \u7532\uff1a'), [], 'an empty value is dropped, no throw');
  assert.deepEqual(X.drafts(facts, { cap: 2 }).map(d => d.strategy.keys[0]), ['\u8d2b\u6c11\u7a74', '\u94f6\u51a0'], 'LRU keeps the last two');
});

test('OOC: also tag-shaped, not JSON - a broken segment gives up quietly and the rest of the floor reads', () => {
  assert.deepEqual(OC.floorCorrections(7, '\uff08OOC \u5730\u56fe\uff1a\u73b0\u5728\u5728 \u8d2b\u6c11\u7a74\uff09\u6211\u63a8\u5f00\u95e8\u3002'), [{ floor: 7, kind: 'place', place: '\u8d2b\u6c11\u7a74' }]);
  assert.deepEqual(OC.floorCorrections(7, '\uff08OOC \u5730\u56fe\uff1a\uff09'), [], 'a correction with no body gives up quietly');
  assert.deepEqual(OC.floorCorrections(7, '\uff08OOC \u5730\u56fe\uff1a\u73b0\u5728\u5728 \u8d2b\u6c11\u7a74'), [], 'an unterminated segment is not a segment: nothing is invented');
  assert.equal(OC.stripOoc('\uff08OOC \u5730\u56fe\uff1a\u73b0\u5728\u5728 \u8d2b\u6c11\u7a74'), '\uff08OOC \u5730\u56fe\uff1a\u73b0\u5728\u5728 \u8d2b\u6c11\u7a74', 'and the text is left as written');
  assert.doesNotThrow(() => OC.floorCorrections(7, '\uff08OOC \u5730\u56fe\uff1a\uff08\uff08\uff08'));
  assert.equal(OC.stripOoc('\uff08OOC \u5730\u56fe\uff1a\u73b0\u5728\u5728 \u8d2b\u6c11\u7a74\uff09\u6211\u63a8\u5f00\u95e8\u3002').trim(), '\u6211\u63a8\u5f00\u95e8\u3002');
  assert.equal(OC.activePlace(null, {}), null);
});

test('JIT: no model JSON either - names against a book, and a broken input changes nothing', () => {
  const entries = [{ name: 'a', enabled: true, strategy: { type: 'selective', keys: ['\u7532'] }, extra: { eden_id: 'e1' } }];
  assert.deepEqual(K.planActivation(entries, new Set(['\u7532'])).enable, []);
  assert.deepEqual(K.planActivation(entries, new Set(['\u4e59'])).disable, ['e1']);
  for (const junk of [null, undefined, 0, 'x', {}, []]) assert.deepEqual(K.planActivation(junk, new Set(['\u7532'])).enable, [], JSON.stringify(junk));
  assert.deepEqual(K.applyPlan(entries, K.planActivation(entries, new Set(['\u4e59']))), [{ id: 'e1', enabled: false, extra: { eden_jit: 1 } }]);
});

test('the gate: only the ladder itself parses model text, and it stays a pure core leaf', () => {
  for (const f of ['../map/tavern/operation-dsl.mjs', '../map/tavern/worldbook-jit.mjs', '../map/tavern/worldbook-crystallize.mjs', '../map/core/ooc.mjs'])
    assert.doesNotMatch(src(f), /JSON\.parse/, f + ' must go through core/model-json.mjs (or not parse JSON at all)');
  const m = src('../map/core/model-json.mjs'), body = m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(body, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  assert.ok(m.split('\n').length < 400, m.split('\n').length + ' lines');
});
