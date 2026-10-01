// Edit mode, the screen side (docs/kernel-schema.md K-R100; docs/zero-config.md §7): the edit bar, marker drag, the controls on a place card, pictures and "use a picture as this place's map".
// Everything is drawn only while the switch (Settings -> Advanced, `edenMapEdit`, default off) is on. The model is app/pack-edit.mjs; after every change the applied pack is shown again through
// app/pack-live.mjs. Text from a pack or from the user reaches the page through textContent only; the styles use tokens only.
// A schema-1 pack (the first pack) keeps its layout: its markers cannot be moved or reparented here, but pictures can be added to any place and exported as an overlay (K-R98).
import { $ } from './dom-helpers.mjs';
import * as storage from '../core/storage.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { aspect, currentMapId, osdViewer, mapRegistry } from './state.mjs';
import { RT } from './nodes-runtime.mjs';
import { PACK } from './current-pack.mjs';
import { jsonCache } from './json-cache.mjs';
import { basePack, setFilter, reproject, packBase, remoteOn } from './pack-live.mjs';
import { closeCard } from './markers.mjs';
import { createEditor, saveDraft, loadDraft, idbPictures } from './pack-edit.mjs';
import { applyDraft, emptyDraft, overlayText, isEmptyDraft } from '../core/pack-draft.mjs';
import { viewIdsOf } from '../core/nodes.mjs';
import { nodePictures } from '../core/pack-media.mjs';

const T = (k, zh, v) => uiTextOr(k, zh, v);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, on) => { const b = el('button', 'btn', text); b.type = 'button'; b.addEventListener('click', on); return b; };
const S = { on: false, draft: emptyDraft(), armed: null, drag: null };
const store = { get: k => storage.get(k), set: (k, v) => storage.set(k, v), remove: k => storage.remove(k) };
const pid = () => PACK?.id || basePack()?.id || 'pack';
const isV2 = () => !!basePack();   // a schema-2 pack: its layout can be changed live
const shipped = () => window.__tcPack?.trust !== 'foreign';
const nodeNames = () => { const t = RT?.tree; return t ? t.ids().map(id => [id, t.get(id)?.name || id]) : []; };
const note = text => { const n = $('#editNote'); if (n) n.textContent = text || ''; };
const why = r => (r && !r.ok ? T('edit.err', '没成功：{why}', { why: r.code }) : '');
export const currentDraft = async () => (S.on ? S.draft : loadDraft(pid(), { store, pics: idbPictures(pid()) }));

const editor = () => createEditor({ pack: basePack() || { id: pid(), title: '', nodes: RT ? RT.tree.ids().map(id => RT.tree.get(id)) : [], media: RT?.media }, draft: S.draft, onChange: change });
function change(d) {
  S.draft = d; saveDraft(pid(), d, { store, pics: idbPictures(pid()) });
  if (isV2()) reproject(true).catch(() => {});
  const dis = $('#editDiscard'); if (dis) dis.disabled = isEmptyDraft(d);
}
const run = (r, ok) => { note(r.ok ? ok || '' : why(r)); return r; };

// ---- markers: the node id is on the element (data-mid, written by markers.mjs), drag to move (frame views only) ----
const frameView = () => { const t = RT?.tree, id = currentMapId; if (!t || !id) return null; const v = viewIdsOf(t, RT.views, id)[0]; return v && ['tiles', 'image'].includes(RT.views[v]?.kind) ? v : null; };
const nodeOf = e => { const m = e?.dataset?.mid, g = RT?.geo?.(); return m && RT?.tree?.has(m) ? m : g?.place(e?.dataset?.name || '')?.node || null; };
function onDown(e) {
  const m = S.on && isV2() && e.button === 0 && e.target.closest?.('.mk[data-mid]'), v = m && frameView();
  if (!m || !v) return;
  S.drag = { el: m, id: m.dataset.mid, view: v, x: e.clientX, y: e.clientY, moved: false, pt: null }; osdViewer.setMouseNavEnabled(false);
}
function onMove(e) {
  const d = S.drag; if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
  d.moved = true; const r = osdViewer.container.getBoundingClientRect();
  d.pt = osdViewer.viewport.pointFromPixel(new OpenSeadragon.Point(e.clientX - r.left, e.clientY - r.top)); osdViewer.updateOverlay(d.el, d.pt);
}
function onUp() {
  const d = S.drag; if (!d) return; S.drag = null; osdViewer.setMouseNavEnabled(true);
  if (!d.moved || !d.pt) return;
  const x = Math.min(1, Math.max(0, d.pt.x)), y = Math.min(1, Math.max(0, d.pt.y / aspect));
  closeCard(); run(editor().move(d.id, { x, y, view: d.view }), T('edit.moved', '已移动。'));
}
function onCanvas(ev) {   // "New place": the next tap on the map puts the armed place there
  if (!S.on || !S.armed || !ev.quick) return;
  const v = frameView(), name = S.armed; S.armed = null; $('#editNew')?.removeAttribute('aria-pressed');
  if (!v) return note(T('edit.no_frame', '这里是示意图，没有可以落点的画面；先给它一张图作地图。'));
  const p = osdViewer.viewport.pointFromPixel(ev.position), r = editor().addPlace(currentMapId, name, { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y / aspect)), view: v });
  run(r, T('edit.added', '已添加：{name}', { name })); ev.preventDefaultAction = true;
}

// ---- pictures ----
const toUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function pickPicture(maxDim) {   // a file -> { src (WebP data URL), w, h } or null
  const f = await new Promise(res => { const i = el('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp'; i.addEventListener('change', () => res(i.files && i.files[0]), { once: true }); i.addEventListener('cancel', () => res(null), { once: true }); i.click(); });
  if (!f) return null;
  const D = await import('../core/room-gallery-db.mjs'), { blob, w, h } = await D.resizeToWebp(f, maxDim, 0.82);
  return { src: await toUrl(blob), w, h };
}
export const addToPack = async (nodeId, item) => { const E = editor(), p = E.addPicture(item); return p.ok ? E.attach(nodeId, p.id) : p; };
async function childSpots(id) {   // the children's positions on the node's own map (the generated schematic's markers), 0..1
  const m = mapRegistry?.maps?.[id], f = m && (await jsonCache.get(m.data)); const out = {};
  for (const k of f?.markers || []) if (k.id !== id) out[k.id] = { x: k.nx, y: k.ny };
  return out;
}

// ---- the place card ----
function cardBox(c) {
  const id = nodeOf(document.querySelector('.mk.active')); c.querySelector('.editbox')?.remove();
  if (!S.on || !id) return;
  const box = el('div', 'editbox'), n = RT.tree.get(id), v2 = isV2();
  const row = (...k) => { const r = el('div', 'hrow'); r.append(...k); box.append(r); };
  if (v2 && id !== RT.tree.root) {
    const sel = el('select'); sel.setAttribute('aria-label', T('edit.parent', '上级')); const bad = new Set([id, ...RT.tree.ids().filter(x => RT.tree.ancestors(x).includes(id))]);
    for (const [k, nm] of nodeNames()) if (!bad.has(k)) { const o = el('option', null, nm); o.value = k; o.selected = k === RT.tree.parent(id); sel.append(o); }
    sel.addEventListener('change', () => run(editor().reparent(id, sel.value), T('edit.reparented', '已改上级。'))); row(el('span', null, T('edit.parent', '上级')), sel);
  }
  if (v2) { const w = el('input'); w.type = 'text'; w.maxLength = 60; w.placeholder = T('edit.alias_ph', '再加一个叫法'); w.setAttribute('aria-label', w.placeholder);
    row(w, btn(T('edit.alias_add', '加上'), () => { const r = run(editor().addAlias(id, w.value), T('edit.aliased', '已加上。')); if (r.ok) w.value = ''; })); }
  row(btn(T('edit.pic_add', '加图片'), async () => { const p = await pickPicture(1600).catch(() => null); if (p) run(await addToPack(id, p), T('edit.pic_done', '图片已加入这个地点。')); }),
    btn(T('edit.pictures', '图片 ›'), () => openPictures(id, n?.name)));
  if (v2 && !shipped()) row(btn(T('edit.pic_map', '用一张图作这里的地图'), async () => {
    const p = await pickPicture(4096).catch(() => null); if (!p) return;
    const E = editor(), m = E.addPicture(p); if (!m.ok) return note(why(m));
    run(E.useAsMap(id, m.id, await childSpots(id)), T('edit.map_done', '这个地点有了自己的地图。'));
  }));
  c.querySelector('.extra')?.append(box);
}
/** The pictures of a place, in its order: the shown pack's (draft applied while edit mode is on) -> [{ id, item, url }]; url null = a placeholder (a link picture with the switch off, or a refused one). */
export function picturesFor(nodeId) {
  const p = S.on ? editor().applied() : { media: RT?.media, nodes: [RT?.tree?.get(nodeId)].filter(Boolean) }, n = (p.nodes || []).find(x => x.id === nodeId);
  return nodePictures(p.media, n?.media, { base: packBase(), remoteOn: remoteOn() });
}
export async function openPictures(nodeId, name, { onClose } = {}) {
  const { openRoomGalleryPanel } = await import('../ui/room-gallery-panel.js');
  openRoomGalleryPanel(nodeId, { lang: window.I18N?.lang || 'zh', nodeId, name: name || RT?.tree?.get(nodeId)?.name, pictures: () => picturesFor(nodeId), edit: S.on, onClose,
    addToPack: item => addToPack(nodeId, item), detach: m => editor().detach(nodeId, m) });
}

// ---- the bar and the switch ----
const css = () => { if ($('#editCss')) return; const s = el('style'); s.id = 'editCss';
  s.textContent = '#editBar{position:fixed;left:var(--sp-4);bottom:calc(var(--sheet-peek) + var(--sp-4));z-index:var(--zu-pop);display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:center;max-width:calc(100vw - 2 * var(--sp-4));padding:var(--sp-3) var(--sp-4);background:var(--surface-glass);border:1px solid var(--line-strong);border-radius:var(--r-m);color:var(--ink);font-size:var(--fs-small)}#editBar .btn,#card .editbox .btn{min-height:var(--hit)}#editBar input{min-height:var(--hit);box-sizing:border-box;max-width:40vw}.editbox{display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-4);border-top:1px dashed var(--line);padding-top:var(--sp-4)}.editbox input,.editbox select{min-height:var(--hit);box-sizing:border-box;max-width:100%}#editNote{flex-basis:100%;color:var(--muted)}#editMore{display:none}@media (max-width:640px){body.evopen #editMore{display:inline-flex}body.evopen #editBar:not(.open){display:none}#editBar.open{bottom:auto;top:calc(var(--hdr,44px) + var(--sp-3));left:var(--sp-4);right:var(--sp-4);max-width:none}}'; document.head.append(s); };
async function exportNow() {
  const d = await currentDraft(), id = pid();
  if (!shipped()) { const { saveExport } = await import('./pack-settings.mjs'); return note(await saveExport()); }
  const nodes = (basePack()?.nodes) || (RT ? RT.tree.ids().map(k => RT.tree.get(k)) : []), text = overlayText(d, { nodes }), name = `${id}.overlay.json`;
  const a = el('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  note(T('edit.exported', '已保存 {name}（只含你的改动，交给维护者合并）。', { name }));
}
function bar() {
  $('#editBar')?.remove(); $('#editMore')?.remove(); if (!S.on) return;
  const b = el('div'); b.id = 'editBar'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', T('edit.title', '编辑模式'));
  const nm = el('input'); nm.type = 'text'; nm.maxLength = 80; nm.placeholder = T('edit.new_ph', '新地点的名字'); nm.setAttribute('aria-label', nm.placeholder);
  const nw = btn(T('edit.new', '新地点'), () => { const v = nm.value.trim(); if (!v) return; S.armed = v; nm.value = ''; nw.setAttribute('aria-pressed', 'true'); nw.id = 'editNew'; note(T('edit.armed', '点一下地图，把它放在那里。')); });
  const dis = btn(T('edit.discard', '放弃草稿'), async () => { editor().discard(); note(T('edit.discarded', '草稿已清空。')); }); dis.id = 'editDiscard'; dis.disabled = isEmptyDraft(S.draft);
  b.append(el('b', null, T('edit.title', '编辑模式')), ...(isV2() ? [nm, nw, btn(T('edit.start', '从这里开始'), () => run(editor().setStart(currentMapId), T('edit.started', '地图以后从这里打开。')))] : []), btn(T('edit.export', '导出'), () => exportNow().catch(e => note(String(e.message || e)))), dis);
  const n = el('div'); n.id = 'editNote'; n.setAttribute('role', 'status'); n.textContent = isV2() ? T('edit.hint', '拖动图钉调整位置；点开地点卡可以改上级、加叫法、加图片。') : T('edit.hint_fixed', '这张地图的版面是固定的；点开地点卡可以加图片。'); b.append(n);
  document.body.append(b);
  // E-12 (U-20): on a phone with the drawer at half / full the bar folds into a header button (the same actions, a menu): no overlap with the drawer
  const more = btn(T('edit.more', '编辑 ⋯'), () => { const o = b.classList.toggle('open'); more.setAttribute('aria-expanded', o ? 'true' : 'false'); }); more.id = 'editMore'; more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-expanded', 'false');
  $('#setBtn')?.before(more);
}
export async function setEdit(on) {
  if (!!on === S.on) return; S.on = !!on; css();
  if (S.on) {
    S.draft = await loadDraft(pid(), { store, pics: idbPictures(pid()) }).catch(() => emptyDraft());
    if (!S.on) return;   // switched off while loading
    setFilter(p => (S.on ? applyDraft(p, S.draft).pack : p)); document.addEventListener('pointerdown', onDown, true); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
    osdViewer?.addHandler('canvas-click', onCanvas);
    S.mo = new MutationObserver(() => { const c = $('#card'); if (c && !c.hidden && !c.querySelector('.editbox')) cardBox(c); }); S.mo.observe($('#card'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    bar(); if (isV2() && !isEmptyDraft(S.draft)) await reproject(true);
  } else {
    setFilter(null); document.removeEventListener('pointerdown', onDown, true); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); osdViewer?.removeHandler('canvas-click', onCanvas); S.mo?.disconnect(); S.armed = null;
    bar(); $('#card')?.querySelector('.editbox')?.remove(); if (isV2()) await reproject();
  }
}
export const initEdit = () => { if (storage.get('edenMapEdit') === '1') setEdit(true); };
