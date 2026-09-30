// S4-4 one-off generator (kept for the record; re-running it rewrites the same files from the frozen copies).
//   node tools/gen_eden_strings_s44.mjs            T1 + T4: neutral core dictionaries, the first pack's old wording into its manifest `strings`,
//                                                  the English `names` dictionary into the pack (packs/eden/names.en.json + manifest data.names)
//   node tools/gen_eden_strings_s44.mjs --polish   the same, plus the English copy polish of T6 (en only)
// Old values are read from tests/helpers/i18n_s44_frozen/{zh,en}.json (the dictionaries before this step) and moved verbatim, never retyped.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const rd = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8')), wr = (p, o) => fs.writeFileSync(ROOT + p, JSON.stringify(o, null, 2) + '\n');
const FZ = rd('tests/helpers/i18n_s44_frozen/zh.json'), FE = rd('tests/helpers/i18n_s44_frozen/en.json');
const POLISH = process.argv.includes('--polish');

// key: [zh, en, which old values the first pack keeps: 'both' | 'zh' | 'en' | 'none']. 'none' = the value carries a run-time placeholder the call site fills
// with the pack's own name, so the first pack needs no override (the filled text equals the old one).
const NEUTRAL = {
  'um.k_room': ['房间', 'Rooms'], 'um.k_area': ['室外', 'Grounds'],
  'ch.g_members': ['成员', 'Members'], 'ch.rep': ['声望', 'Reputation'], 'ch.m_known': ['知情度', 'Awareness'],
  'char_more_hint': ['人物卡里可展开的一栏：代号、社会身份、身高 / 体重、知情度、饰物（字段在「变量映射」里指定或关闭）',
    'An expandable section on person cards: codename, public identity, height / weight, awareness, accessories (pick or turn off the fields in Variable mapping)'],
  'page_title': ['空间地图', 'Spatial Map'], 'ev.tag': ['事态', 'Events'], 'ring': ['周边', 'Surroundings'],
  'estate.fail': ['三维页面加载失败', 'Failed to load the 3D page'],
  'estate.slow': ['三维模型加载较慢…可以继续等，或先看平面图', 'The 3D model is loading slowly… keep waiting, or view the floor plan'],
  'estate.failed': ['三维模型加载失败：当前网络连不上三维库', 'Could not load the 3D model: this network cannot reach the 3D library'],
  'no_fx_hint': ['出现花屏时不再闪烁、撕裂，只显示「数据链路受扰」文字', 'During glitch effects, no flicker or tearing — only the "Data link disrupted" note'],
  's.cvd_hint': ['事态、图例、人物头像等换成色盲安全配色，并加形状 / 描边区分；同步给子页面与三维页',
    'Switches events, legends, character avatars etc. to a colorblind-safe palette and adds shape / outline cues; also sent to the sub-pages and 3D pages'],
  's.lic_repo': ['空间地图（开源）', 'Spatial Map (open source)'], 'cmp.pv_name': ['示例地点', 'Sample place'],
  'about.how_tag': ['固定版不会自己变：导入新版脚本「{script} v{v}」（同名覆盖）',
    'Pinned scripts don\'t change by themselves: import the new script "{script} v{v}" (it replaces the old one)', 'en'],
  'cu.sync_unbound': ['这个聊天已经绑定了别的聊天世界书：请在世界书设置里手动启用「{book}」',
    'This chat already has another chat lorebook: enable “{book}” manually in lorebook settings', 'none'],
  'cu.sync_hint2': ['默认开：有了第一项自定义才建世界书「{book}」（每个聊天一本，一个常驻条目）。关掉只停用条目，不删世界书',
    'On by default: the lorebook “{book}” (one per chat, one constant entry) is created only once you add something. Turning it off disables the entry and keeps the lorebook', 'none'],
  '_说明': ['查看器界面文字（中文）。键名与 en.json 一致；{x} 是占位符。地名的英文在 maps.json 的 name_en / sub_en / title_en，世界图地名在设定包清单 data.names 指向的英文名表。',
    'Viewer UI strings (English). Same keys as zh.json; {x} are placeholders. Place names in English live in maps.json (name_en / sub_en / title_en); world-map names come from the English name table that the pack manifest names in data.names. Lore quotes on place cards stay in the original Chinese.', 'none'],
};
// new keys; the first pack gets the old wording verbatim (the values the host and the viewer printed before this step)
const NEW = {
  'app.name': ['空间地图', 'Spatial Map', '伊甸地图', 'Eden Map'],
  'app.short': ['空间地图', 'Spatial map', '伊甸地图', 'Eden map'],
  'app.script': ['【地图】空间地图', '[Map] Spatial Map', '【地图】伊甸地图', '[Map] Eden map'],
  'app.report': ['=== 空间地图反馈报告 / Spatial Map feedback report ===', '=== 空间地图反馈报告 / Spatial Map feedback report ===',
    '=== 伊甸地图反馈报告 / Eden Map feedback report ===', '=== 伊甸地图反馈报告 / Eden Map feedback report ==='],
  'ev.toast': ['有新事态', 'New events', '天城有新事态', 'New events in Tiancheng'],
  'vm.known': ['知情度字段', 'Awareness field', '外界知情字段', 'Publicly known field'],
};
// T6: English copy polish (en only; the first pack's strings never override these)
const POLISH_EN = {
  'cu.ex1a': 'Study', 'cu.ex3a': 'Greenhouse',
  'vm.fantasy': 'Add generic fantasy words (flying artifacts, sword flight, earth-burrowing, teleport arrays, blinking, teleporting)',
  's.lic_orig_v': 'Created by {creator} (the Leinao community); the map is an authorized derivative work (since 2026-09-27)',
  'hint.4': '4. Editing history / regenerating: swipes, deleted or edited messages and branches recompute the map automatically. Hand-edited position text on an old message does not; edit the newest message, or branch from that message and regenerate.',
  's.tick_hint': 'While the panel is closed, re-read new messages read-only every 60 s so the next launch is instant; writes nothing, injects nothing, yields during generation',
  'selfcheck.wb_manual': 'You can still import "{book}" manually and set it global in the worldbook',
  'ch.port_hint': 'If a person has no avatar of your own, use the card\'s portraits (author: Yehehua; loaded on demand from the author\'s CDN and two other image hosts). Off in data-saver mode. Only portraits the author declares are used, never the card\'s restricted categories. If one can\'t be fetched, an initial shows instead (not a bug; you can set your own avatar).',
  's.gallery_maintainer_hint': 'Shows "submit to public gallery" and export in the room gallery. This is not access control, only a convenience for the repo owner. GitHub repo permissions decide what enters the public gallery (only the owner can commit map/data/gallery.json). Ordinary users don\'t see this switch; your images stay local.',
  'th.wb_consent': 'When the map updates, "{b}" updates automatically. Only the map\'s own entries in this book change; your edits and additions are kept, no other book is touched, and bindings stay as they are. You can turn this off here any time.',
  's.lic_disc_v': 'The map is a fan interpretation: places and layouts follow the original card; the map only adds to them and is not responsible for their accuracy. 3D textures come from Poly Haven and ambientCG (CC0).',
  's.lic_unknown': 'No author or origin info found in this card: it may be resold or re-uploaded, risking your data and the author\'s rights. Get cards only from the original author or authorized sources.',
  'hint.2': '2. The map opens on the world map. Tap “Current location” to jump to where you are. If a place isn’t recognised, “Not on map: …” appears; tap it to place it.',
  'th.wb_on_hint': 'On: opening the map creates this book and attaches it to the current character\'s additional worldbooks; updates sync silently (one notice per version). Off: nothing runs automatically.',
  'cu.sync_hint2': 'On by default: the lorebook “{book}” (one per chat, one constant entry) is created once you add your first custom item. Turning it off disables the entry and keeps the lorebook.',
};

const zh = structuredClone(FZ), en = structuredClone(FE), strings = {};
const names = en.names; delete en.names;   // T4: the English name dictionary leaves the core dictionary
for (const [k, [z, e, keep = 'both']] of Object.entries(NEUTRAL)) {
  if (!(k in FZ)) throw new Error('unknown key ' + k);
  zh[k] = z; en[k] = e;
  if (k.startsWith('_')) continue;   // documentation keys: no run-time text
  if ((keep === 'both' || keep === 'zh') && FZ[k] !== z) strings[k] = FZ[k];
  if ((keep === 'both' || keep === 'en') && FE[k] !== e) strings[k + '@en'] = FE[k];
  if (strings[k] != null && strings[k + '@en'] == null) strings[k + '@en'] = FE[k];   // t() falls back from `key@en` to `key`: an unchanged English value must not show the Chinese override
}
for (const [k, [z, e, oz, oe]] of Object.entries(NEW)) { zh[k] = z; en[k] = e; strings[k] = oz; strings[k + '@en'] = oe; }
if (POLISH) for (const [k, v] of Object.entries(POLISH_EN)) { if (!(k in en)) throw new Error('unknown polish key ' + k); en[k] = v; }
wr('map/i18n/zh.json', zh); wr('map/i18n/en.json', en);

// the pack: strings + names
wr('map/packs/eden/names.en.json', names);
const man = rd('map/packs/eden/manifest.json');
man.data.names = { en: 'packs/eden/names.en.json' };
const sorted = Object.fromEntries(Object.entries(strings).sort(([a], [b]) => a.localeCompare(b)));
const out = {}; for (const [k, v] of Object.entries(man)) { out[k] = v; if (k === 'theme') out.strings = sorted; }
wr('map/packs/eden/manifest.json', out);
console.log(`core: ${Object.keys(NEUTRAL).length} neutralised, ${Object.keys(NEW).length} new${POLISH ? `, ${Object.keys(POLISH_EN).length} polished` : ''}; eden strings ${Object.keys(strings).length}; names ${Object.keys(names).length}`);
