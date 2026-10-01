// S4-4 text parity: the core dictionaries are neutral, the first pack gets its exact wording back through its manifest `strings`.
// For every key of the dictionaries as they were before this step (tests/helpers/i18n_s44_frozen), t(key) with the first pack's strings over the new dictionary equals the old value:
// zh for every key; en for every key except the English copy polish of T6 (listed below, each of them must really differ). With the second pack (no strings) no card term is left in any value.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withStrings, packStrings, dictOf } from './helpers/eden-strings.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const FZ = { zh: J('tests/helpers/i18n_s44_frozen/zh.json'), en: J('tests/helpers/i18n_s44_frozen/en.json') };
const NEW_KEYS = ['app.name', 'app.short', 'app.script', 'app.report', 'ev.toast', 'vm.known', 'ch.gal'];   // ch.gal: S9b-2 (K-R106), the first pack's strings rename it
// T6: the English values that change on purpose (key -> why); everything else in English is byte-identical for the first pack
const T6 = {
  'cu.ex1a': 'Chinese left in an English value', 'cu.ex3a': 'Chinese left in an English value', 'vm.fantasy': 'Chinese example words translated', 's.lic_orig_v': 'Chinese community name',
  's.tick_hint': '"floors" for chat messages', 'selfcheck.wb_manual': 'takes {book} like the Chinese text',
  'ch.port_hint': 'tightened (> 160 characters)', 'th.wb_consent': 'tightened (> 160 characters)', 's.lic_disc_v': 'tightened (> 160 characters)',
  's.lic_unknown': 'tightened (> 160 characters)', 'hint.2': 'tightened (> 160 characters)', 'th.wb_on_hint': 'tightened (> 160 characters)', 'cu.sync_hint2': 'tightened (> 160 characters), takes {book}',
};
// S7-1 (docs/settings-ia.md §2, §6, §7, §8): the settings regrouping, the hint fixes and the AI advisor rename change these keys on purpose. A removed key must be gone; a changed key must
// have exactly the value pinned here (zh, en) for the first pack. Every other key is still byte-identical to the frozen dictionaries.
const S7 = {
  removed: ['s.display', 's.display_sub', 's.kbd', 's.kbd_group', 'ch.from_card', 'hint.1b', 'hint.4', 'th.inj', 'th.inj_next', 'th.inj_none', 'th.inj_r_off', 'th.inj_r_skipped', 'th.inj_r_empty', 'th.inj_on', 'th.inj_note', 'th.macros', 'th.ledger_write', 'th.dice', 'th.spatial', 'th.wbjit', 'th.wbxtal', 'th.nav_cfg'],   // the rows they labelled became feature cards (fc.*), the first-run hint lost its 4th item, the shortcut heading and row became one row
  changed: {
    's.people': ['人物与物品', 'People & items'], 's.people_sub': ['数值 · 更多资料 · 头像 · 图鉴', 'Stats · more info · portraits · gallery'],
    's.adv_sub': ['地图包 · 编辑模式 · 快捷键 · 开发者', 'Map pack · edit mode · shortcuts · developer'], 's.update_sub': ['head #{n} · {d}', 'head #{n} · {d}'],
    'th.nav': ['AI 参谋', 'AI advisor'], 'nav.layer': ['AI 参谋标注', 'AI advisor marks'], 'nav.layer_title': ['AI 参谋在后台给出的线索与标注（只在本次会话里显示）', 'Clues and marks from the AI advisor (shown for this session only)'], 'nav.hint': ['AI 参谋建议', 'AI advisor suggestion'],
    // T7 hints (settings-ia section 6): a label names the thing, the state lives in the switch, defaults are not written next to a switch; plain words for the background read and the three first-run steps
    // S7-2 U-18: the home button of the zoom column locates the player
    'zoom_home': ['定位到我', 'Locate me'],
    "s.keys": ["单字母快捷键（L、M、/、? 与事态操作字母角标）", "Single-key shortcuts (L, M, /, ? and letter badges on event actions)"], "s.minimap_hint": ["地图角落显示当前视野在全图中的位置", "Shows the current view's position on the full map"], "s.inject_hint": ["点卡片上的入口时把一句话送进聊天流。填入输入框只填不发，注入系统指令走 /sys", "Send one line into the chat from a card action. Fill input never sends; system injection uses /sys"], "cu.sync_hint2": ["有了第一项自定义才建世界书「{book}」（每个聊天一本，一个常驻条目）。关掉只停用条目，不删世界书", "The lorebook “{book}” (one per chat, one constant entry) is created after your first custom item. Turning it off disables the entry, not the lorebook."], "s.tick": ["预先读取新消息", "Read new messages ahead"], "s.tick_hint": ["面板关着时，地图会先读一遍新消息，下次打开更快；只读，不改变任何东西，也不发给模型。", "While the map is closed it reads new messages so it opens faster; read only, changes nothing and sends nothing to the model."], "hint.1": ["点地图上的地标看介绍。", "Tap a landmark on the map to read about it."], "hint.2": ["下方的抽屉里有事态和人物；想看你现在在哪，点「当前位置」。", "The drawer below lists events and people; tap “Current location” to see where you are."], "hint.3": ["设置（图层、人物、三维画质）在右下角的 ⋯ 里。", "Settings (layers, people, 3D quality) are inside ⋯ at the bottom right."], "hint.3d": ["设置（图层、人物、三维画质）在右上角。", "Settings (layers, people, 3D quality) are at the top right."],
    'cu.night': ['按时段给地图加色调、切换昼夜底图（清晨 / 傍晚 / 夜间）', 'Tint the map and switch day / night base maps by time (dawn / dusk / night)'],
  },
};
const BOOK = '伊甸地图·自定义';   // what the viewer fills {book} with for the first pack (worldbook prefix + 「·自定义」, app/custom.mjs)
const fill = (s, script) => String(s).split('{book}').join(BOOK).split('{script}').join(script);

for (const lang of ['zh', 'en']) {
  test(`the first pack sees ${lang} exactly as before (${lang === 'en' ? 'except the T6 polish' : 'every key'})`, () => {
    const dict = withStrings(dictOf(lang), packStrings('eden'), lang), script = withStrings(dictOf('zh'), packStrings('eden'), 'zh')['app.script'];
    const miss = [], diff = [];
    for (const [k, old] of Object.entries(FZ[lang])) {
      if (k === 'names' || k.startsWith('_')) continue;   // `names` moved to the pack (names_pack.test.mjs); `_…` are notes for the file's readers, not text the viewer shows
      if (S7.removed.includes(k)) { assert.ok(!(k in dict), k + ' is removed by S7-1'); continue; }
      if (!(k in dict)) { miss.push(k); continue; }
      if (k in S7.changed) { assert.equal(dict[k], S7.changed[k][lang === 'zh' ? 0 : 1], k + ' has its S7-1 value'); continue; }
      const now = fill(dict[k], script), was = fill(old, script);   // the old zh text of a key that already took {book} still holds the placeholder
      if (lang === 'en' && k in T6) { assert.notEqual(now, was, `${k} is on the T6 list and must differ`); continue; }
      if (now !== was) diff.push(k);
    }
    assert.deepEqual(miss, []); assert.deepEqual(diff, []);
    if (lang === 'en') for (const k of Object.keys(T6)) assert.ok(k in FZ.en, k);
  });
}

test('the T6 polish: no Chinese left in English values (except the literal markers the user types or sees and the bilingual report header), the tightened values are shorter and keep their placeholders, the fixes hold', () => {
  const en = J('map/i18n/en.json'), zh = J('map/i18n/zh.json'), KEEP = new Set(['here_ph', 'th.wbxtal', 'app.report', '_092', '_093', '_095', '_E7', '_E5', '_uiv2', 's.src_vars']);
  const cjk = Object.entries(en).filter(([k, v]) => typeof v === 'string' && /[一-鿿]/.test(v) && !KEEP.has(k)).map(([k]) => k);
  assert.deepEqual(cjk, []);
  for (const k of Object.keys(T6)) {
    const ph = v => [...String(v).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
    assert.equal(ph(en[k]), ph(zh[k]), `${k}: same placeholders as the Chinese text`);
  }
  assert.ok(!en['ch.port_hint'].includes('Yehehua') && !zh['ch.port_hint'].includes('Yehehua'), 'the core text carries no card name (agent brief rule 1)');
  assert.ok(packStrings('eden')['ch.port_hint@en'].includes('Yehehua') && packStrings('eden')['ch.port_hint'].includes('Yehehua'), 'the first pack brings the author credit back through its strings');
  assert.equal(en['cu.ex1a'], 'Study'); assert.equal(en['cu.ex3a'], 'Greenhouse');
  assert.doesNotMatch(en['s.tick_hint'], /buildings|history floors/);   // hint.4 was removed in S7-1 (the first-run hint has three steps)
  assert.match(en['selfcheck.wb_manual'], /\{book\}/);
  for (const k of Object.keys(T6)) assert.ok(en[k].length < FZ.en[k].length || !/tightened/.test(T6[k]) , `${k} is shorter than before`);
});

test('with the second pack (no strings) the dictionaries carry no card term in any value, in either language; the first pack\'s strings hold the card words', () => {
  const roster = J('map/data/fallback_roster.json').members.map(m => m.name).filter(Boolean);
  const TERMS = ['母畜', '挤奶', '庄园', '伊甸', '天城', '外界知情', '网络攻击', 'Tiancheng', 'Eden Map', 'Eden map', 'Eden Manor', 'Manor rooms', 'Manor grounds', 'Estate members', 'Estate reputation', ...roster];
  const town = J('map/packs/town/manifest.json');
  for (const lang of ['zh', 'en']) {
    const dict = withStrings(dictOf(lang), town.strings || {}, lang);
    const bad = Object.entries(dict).filter(([, v]) => typeof v === 'string' && TERMS.some(t => v.includes(t))).map(([k]) => k);
    assert.deepEqual(bad, [], lang);
  }
  assert.ok(JSON.stringify(packStrings('eden')).includes('庄园'));
  const strings = packStrings('eden'), keys = Object.keys(strings).map(k => k.replace(/@en$/, ''));
  for (const k of keys) assert.ok(k in FZ.zh || NEW_KEYS.includes(k), `strings key ${k} is a dictionary key`);
  for (const k of NEW_KEYS) assert.ok(k in dictOf('zh') && k in dictOf('en'), k + ' in both dictionaries');
});
