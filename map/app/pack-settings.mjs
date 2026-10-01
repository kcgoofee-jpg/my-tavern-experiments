// Settings -> Advanced -> "Map pack" (docs/zero-config.md §2.2, §2.6, §9; K-R90, K-R99, K-R103): the pack running for this card (title, source, trust, problems), the choice list
// (automatic, the shipped index packs, an https address, a file) and the go-live switch of a foreign pack's model text. A choice only posts `eden-map:pack-pick`; the script in the
// tavern validates, stores and restarts (tavern/pack-gate.mjs), and a refusal comes back as `eden-map:th-state` { result: { pack: { ok: false, problems } } }.
// Export (K-R98): the current foreign pack (grown nodes, the user's own names, card credits) as a file or as the text of a worldbook entry; core/pack-export.mjs does the work.
// Text that comes from a pack or from the user reaches the page through textContent only.
import { $ } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { LANG } from './i18n.mjs';
import { getJSON } from './json-cache.mjs';
import { PACK } from './current-pack.mjs';
import { busOn } from './bus.mjs';
import { exportPack } from '../core/pack-export.mjs';
import { placeIndex } from './locate.mjs';
import { cardInfo } from './settings.mjs';

const MAX_FILE = 8 << 20;   // the same cap as the host's (K-R99)
let refused = '';
const tc = () => { try { return window.__tcPack || null; } catch (e) { return null; } };
const T = (k, zh, v) => uiTextOr(k, zh, v);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, on, pressed) => { const b = el('button', 'btn', text); b.type = 'button'; if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed)); b.addEventListener('click', on); return b; };
const send = msg => post({ type: 'eden-map:pack-pick', ...msg });
const row = (...kids) => { const r = el('div', 'hrow'); r.append(...kids); return r; };
const SRC = { default: ['pack.src_default', '内置默认'], choice: ['pack.src_choice', '你的选择'], baked: ['pack.src_baked', '脚本内置'], card: ['pack.src_card', '角色卡自带'], index: ['pack.src_index', '按角色卡匹配'], auto: ['pack.src_auto', '自动'] };
const WHY = { 'not-https': ['pack.why_https', '地址必须是 https'], 'limit-size': ['pack.why_size', '文件太大'], schema: ['pack.why_schema', '只收第 2 版的包'], json: ['pack.why_json', '不是 JSON'], fetch: ['pack.why_fetch', '取不到'], 'index-missing': ['pack.why_index', '没有这个包'] };
const whyText = codes => (codes || []).slice(0, 3).map(c => (WHY[c] ? T(WHY[c][0], WHY[c][1]) : String(c))).join(' / ');

function current(box) {
  const p = tc(), src = p?.source || 'default', trust = p?.trust || 'shipped', n = Array.isArray(p?.problems) ? p.problems.length : 0;
  box.append(row(el('span', null, T('pack.now', '当前')), el('b', null, PACK?.title || p?.manifest?.title || p?.id || '')));
  box.append(el('small', 'na', [T(...SRC[src] || SRC.default), trust === 'foreign' ? T('pack.trust_foreign', '外来包') : T('pack.trust_shipped', '随地图发布'), n ? T('pack.problems', '{n} 条提示', { n }) : ''].filter(Boolean).join(' · ')));
}
function choices(box, idx) {
  const p = tc(), cur = p?.source === 'choice' ? p.id : '', auto = !p || p.source !== 'choice';
  const seg = el('div', 'packpick'); seg.setAttribute('role', 'group');
  seg.append(btn(T('pack.auto', '自动'), () => send({ kind: 'automatic' }), auto));
  for (const r of Array.isArray(idx?.packs) ? idx.packs : []) if (r && typeof r.id === 'string') seg.append(btn(String(r.i18n?.[LANG]?.title || r.title || r.id), () => send({ kind: 'index', id: r.id }), cur === r.id));
  box.append(el('div', null, T('pack.pick', '为这张卡选包')), seg);
  const url = el('input'); url.type = 'url'; url.setAttribute('aria-label', T('pack.url', '包地址（https）')); url.placeholder = 'https://';
  box.append(row(url, btn(T('pack.url_go', '载入'), () => { const v = url.value.trim(); if (v) send({ kind: 'url', url: v }); })));
  const file = el('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    if (f.size > MAX_FILE) return show(['limit-size']);
    try { send({ kind: 'file', text: await f.text() }); } catch (e) { show(['fetch']); }
  });
  box.append(row(btn(T('pack.file', '选择文件'), () => file.click()), file, btn(T('pack.reset', '恢复自动'), () => send({ kind: 'automatic' }))));
}
function llm(box) {
  const l = tc()?.llm; if (tc()?.trust !== 'foreign' || !l?.has) return;
  const sw = el('input'); sw.type = 'checkbox'; sw.setAttribute('role', 'switch'); sw.checked = !!l.on;
  sw.addEventListener('change', () => post({ type: 'eden-map:th', op: 'prefs', prefs: { packLlm: sw.checked } }));
  const lab = el('label', 'row'); lab.append(el('span', null, T('pack.llm', '使用这个包提供的模型文字')), sw); box.append(lab);
  box.append(el('small', null, l.changed ? T('pack.llm_changed', '包的文字自你确认后变过：需要重新确认才会使用') : T('pack.llm_hint', '默认关。关着时用内核的中性文字，不写入任何世界书条目。')));
}
function exportBox(box) {
  const p = tc(); if (!p || p.trust !== 'foreign' || !p.manifest) return;
  const run = () => {
    const names = (placeIndex?.vocab?.entries || []).filter(e => e.user).map(e => ({ word: e.word, node: e.node })), c = cardInfo || {};
    const r = exportPack(tc().manifest, { userAliases: names, card: { name: c.name, creator: c.creator, version: c.version } });
    if (r.problems.length) { show(r.problems.map(x => x.code), 'pack.export_fail', '没有导出：{why}'); return null; }
    return r;
  };
  const save = () => {
    const r = run(); if (!r) return;
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }));
    a.href = url; a.download = p.id + '.pack.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    note(T('pack.export_done', '已保存 {name}（{kb} KB）。{fits}', { name: p.id + '.pack.json', kb: Math.max(1, Math.round(r.bytes / 1024)), fits: r.fitsCard ? T('pack.export_fits', '可以放进角色卡。') : T('pack.export_nofit', '超过 1 MB：太大，放不进角色卡。') }));
  };
  const copy = async () => {
    const r = run(); if (!r) return;
    try { await navigator.clipboard.writeText(r.compact); note(T('pack.copy_done', '已复制。粘贴到一个新的世界书条目，标题写 spatial_os:pack，并让这个条目保持停用。')); } catch (e) { note(T('pack.copy_fail', '复制失败；请改用「导出为设定包」。')); }
  };
  box.append(row(btn(T('pack.export', '导出为设定包'), save), btn(T('pack.export_copy', '复制为世界书条目'), copy)), el('small', 'na', T('pack.export_note', '文件里是地图找到并长出来的地点、你给它们起的叫法和角色卡署名；不含聊天状态。')));
}
const note = text => { refused = text; const n = $('#packNote'); if (n) n.textContent = text; };
function show(codes, key = 'pack.refused', zh = '没有采用：{why}（原来的包照旧）') { note(codes && codes.length ? T(key, zh, { why: whyText(codes) }) : ''); }

export async function renderPackBox() {
  const box = $('#packBox'); if (!box) return;
  box.replaceChildren(el('b', null, T('pack.title', '地图包')));
  if (window.top === window) { box.append(el('small', 'na', T('pack.solo', '单独打开地图时不适用：包由酒馆里的脚本按角色卡选择'))); return; }
  current(box);
  let idx = null; try { idx = await getJSON('packs/index.json'); } catch (e) {}
  if (!box.isConnected) return;
  choices(box, idx); llm(box); exportBox(box);
  const note = el('small', 'na', refused); note.id = 'packNote'; note.setAttribute('role', 'status'); box.append(note);
}

if (typeof window !== 'undefined' && window.top !== window) {
  const css = document.createElement('style'); css.textContent = '.packpick{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}.packpick .btn[aria-pressed=true]{border-color:var(--accent,currentColor)}'; document.head.appendChild(css);
  busOn({ key: 'pack-ui.hostMsg', type: 'message', fn: e => { const r = e.data?.type === 'eden-map:th-state' && e.data.result?.pack; if (r && (window.__isFromHost ? window.__isFromHost(e) : e.source === window.parent)) show(Array.isArray(r.problems) ? r.problems : ['fetch']); } });
}
