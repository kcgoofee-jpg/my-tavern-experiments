// Shadow parity of the event taxonomy (S4-1, docs/kernel-schema.md K-R49, K-R50, K-R54, Appendix A.5): every event the event tests and the two session fixtures feed in is
// classified by the old built-in constants (tests/helpers/events_v1_frozen.mjs, a frozen copy of map/tavern/events.mjs at head #165) and by the first pack's events block
// (typeOf over map/packs/eden/overlay.v2.json, through tavern/events.mjs). Compared: type, group, colour, icon, rarity, source, closing words, life, inject; the collected
// lists; the injected event lines (byte for byte).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as NEW from '../map/tavern/events.mjs';
import * as OLD from './helpers/events_v1_frozen.mjs';
import { edenGeo } from './helpers/eden-geo.mjs';
import { recordEventsTest, fixtureFloors } from './helpers/events-corpus.mjs';

const g = edenGeo();
NEW.setGeo(g); OLD.setGeo(g);   // the old code asks the same geo for placement; only the taxonomy differs

const tapped = await recordEventsTest();
NEW.setGeo(g);   // recording re-ran events.test.mjs, which installs the same geo; make it explicit
const fixtures = fixtureFloors(), fixtureTexts = fixtures.flat().map(m => m.text);
const texts = [...tapped.raws.filter(x => typeof x === 'string'), ...fixtureTexts];
const TAXF = e => [e.cat, e.grp, e.color, e.ch, e.rare, e.src];   // type, group, colour, icon, rarity, publisher

test('every mark of the event tests and the session fixtures: same type, group, colour, icon, rarity, publisher; no per-type life or inject override', () => {
  let marks = 0, same = 0, calls = 0; const diff = [];
  for (const raw of texts) {
    const o = OLD.parseMarks(raw), n = NEW.parseMarks(raw); calls++;
    assert.equal(n.length, o.length, raw);
    o.forEach((e, i) => { marks++; if (JSON.stringify(TAXF(e)) === JSON.stringify(TAXF(n[i]))) same++; else diff.push([e, n[i]]); });
    for (const e of n) { assert.equal(e.life, undefined); assert.equal(e.inject, undefined); assert.ok(e.type, 'the type id travels with the event'); }
  }
  console.log(`marks: ${marks} in ${calls} texts (${tapped.raws.length} from events.test, ${fixtureTexts.length} session floors); identical ${same}, different ${diff.length}`);
  assert.deepEqual(diff.map(([e, n]) => [TAXF(e), TAXF(n)]), []);
  assert.ok(marks > 100 && same === marks);
});

test('sweep: every type name, alias and group name, and every category word of the corpus, resolves to the same type', () => {
  const words = new Set([...Object.keys(OLD.CATS), ...Object.keys(OLD.ALIAS_CAT), ...Object.keys(OLD.GROUPS)]);
  for (const raw of texts) for (const m of NEW.marksOf(raw)) words.add(m.cat);
  for (const w of ['装甲部队调动', '以太泄漏事故', '客户数据泄露', '首相出席晚宴', '流星雨', '其他事故', '', '  火灾  ', 'constructor-like']) words.add(w);
  let diff = [];
  for (const w of words) { const o = OLD.catOf(w), n = NEW.classify(w); if (o !== n.cat) diff.push([w, o, n.cat]); }
  console.log(`words: ${words.size}; identical ${words.size - diff.length}, different ${diff.length}`);
  assert.deepEqual(diff, []);
  // the group-only hint ("only the group name was written"): type "other" painted in the group's colour, icon "!"
  for (const name of Object.keys(OLD.GROUPS)) { const o = OLD.parseMarks(`⌖${name}｜某处｜1｜x`)[0], n = NEW.parseMarks(`⌖${name}｜某处｜1｜x`)[0]; assert.deepEqual(TAXF(n), TAXF(o), name); }
});

test('closing words and levels: the same statuses close an event', () => {
  for (const status of ['解除', '已解除', '结束', '已恢复', '扑灭', '已扑灭', '已控制', '平息', '发生中', '进行中', '预告', '', '未解决']) {
    const tag = `<span data-tcmap="类型=火灾;地点=中层 霓虹街;标题=x;等级=2;状态=${status}"></span>`;
    assert.equal(NEW.parseMarks(tag)[0].lvl, OLD.parseMarks(tag)[0].lvl, status);
  }
});

test('collected lists of the session fixtures: the same events (ids, keys, places, tiers, counts) floor by floor', () => {
  let lists = 0, items = 0;
  for (const msgs of fixtures) for (let k = 0; k < msgs.length; k++) {
    const part = msgs.slice(0, k + 1), now = part.at(-1).floor, o = OLD.collect(part, now), n = NEW.collect(part, now);
    const strip = e => { const { type, fx, ...rest } = e; return rest; };
    assert.deepEqual(n.map(strip), o, `floor ${now}`); lists++; items += n.length;
  }
  console.log(`collect: ${lists} lists, ${items} items; identical ${lists}`);
  assert.ok(items > 0);
});

test('the injected event lines of both session fixtures are byte-identical', () => {
  let lines = 0, nonEmpty = 0;
  for (const msgs of fixtures) for (let k = 0; k < msgs.length; k++) {
    const part = msgs.slice(0, k + 1), now = part.at(-1).floor, o = OLD.collect(part, now), n = NEW.collect(part, now);
    for (const layer of ['', '上层', '中层', '下层']) for (const max of [80, 200]) {
      const a = OLD.summarize(o, layer, max), b = NEW.summarize(n, layer, max); lines++; if (a) nonEmpty++;
      assert.equal(b, a, `floor ${now} layer ${layer}`);
    }
  }
  console.log(`injected lines: ${lines} compared, ${nonEmpty} non-empty, byte-identical ${lines}`);
  assert.ok(nonEmpty > 0);
});

test('the other taxonomy values: life defaults, the glitch preset and the default-off type come from the block', () => {
  assert.deepEqual(NEW.AGE, OLD.AGE);
  const tx = NEW.taxonomy();
  assert.deepEqual(tx.life, { live: 7, after: 20, fade: 40, merge: 15, per_msg: 3 });
  assert.deepEqual(NEW.defaultOff(), ['降雨']);
  const glitch = Object.values(tx.types).filter(t => t.fx);
  assert.deepEqual(glitch.map(t => [t.label, t.fx]), [['网络攻击', 'glitch']]);
  assert.deepEqual(NEW.parseMarks('⌖网络攻击｜中层·商业区｜2｜x')[0].fx, { block: 'glitch', 'x-messages': 3 });
  assert.equal(NEW.parseMarks('⌖火灾｜中层·商业区｜2｜x')[0].fx, undefined);
  assert.equal(OLD.CFG.tag, '天城事态'); assert.match(NEW.summarize(NEW.collect([{ floor: 1, text: '⌖火灾｜中层·霓虹街｜2｜x' }], 2), '中层'), /^\[天城事态·/);
  assert.deepEqual(NEW.examples().filter(x => !OLD.EXAMPLES.has(x)), ['⌖类别｜地点｜等级｜一句话｜发布方']);   // the kernel's own grammar line, added to the pack's 20
  assert.equal(NEW.examples().length, OLD.EXAMPLES.size + 1);
});

test('pinned divergence Q-13 (merge key = type + node, K-R54): places that resolve to the same node within the window merge; nothing else differs on the synthetic stream', () => {
  // the events.test texts as consecutive floors (a stress stream, not a chat): old key = type + layer + place text, new key = type + node
  const msgs = [...new Set(tapped.raws.filter(x => typeof x === 'string'))].map((text, i) => ({ floor: i + 1, text })).slice(0, 200), now = msgs.at(-1).floor;
  const o = OLD.collect(msgs, now), n = NEW.collect(msgs, now), ids = new Set(n.map(e => e.id));
  const lost = o.filter(e => !ids.has(e.id));
  console.log(`stream: old ${o.length} events, new ${n.length}; merged away ${lost.length}`);
  assert.equal(o.length - n.length, lost.length);
  // each merged-away event shares its type and node with another event of the old list: the new key folded them together (the survivor may have aged out since)
  for (const e of lost) assert.ok(o.some(x => x !== e && x.cat === e.cat && x.node === e.node), `${e.cat} ${e.place} has a same-type, same-node neighbour`);
  assert.deepEqual(lost.map(e => [e.cat, e.layer, e.place]).sort(), [['检查点管控', '中层', '霓虹街后巷'], ['火灾', '中层', 'B'], ['火灾', '中层', 'C']]);
});
