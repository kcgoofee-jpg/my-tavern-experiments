// PLACE-1b（docs/place-record.md §5.1）：一个地点一个编辑器，地点 / 房间 / 区域 / 建筑 / 人物卡共用。
// 字段：名称、用途、说明、事实、叫法。每个字段下面浅色显示包里的原文，每个字段有「恢复成包里的」（只清这一项，不动别的）。
// 保存走 eden-map:place-edit（宿主写进 <聊天变量>.自定义 并同步本聊天的自定义书；单独打开地图时写本机那一份），
// 撤销走 eden-map:place-undo（撤销列表在聊天变量里）。这里不判断对错：字数与格式由 core/custom-record.mjs 兜住。
import { uiTextOr } from './text-lookup.mjs';
import { post } from './protocol-stamp.mjs';
import { plugins } from './plugins.mjs';
import { busOn } from './bus.mjs';
import { h, recordOf } from './place-sources.mjs';
import { baseOf } from '../core/custom-record.mjs';
import { refreshCard } from './place-card.mjs';

const T = (k, zh, v) => uiTextOr(k, zh, v);
const MAX = { name: 40, use: 200, desc: 400 };
const CSS = `
#prDlg{position:fixed;inset:0;z-index:var(--zu-dialog);display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 55%,transparent);color:var(--ink);font-family:var(--font-ui)}
#prDlg[hidden]{display:none}
#prDlg .pr-sheet{width:min(560px,calc(100vw - 32px));max-height:min(86vh,760px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-l);box-shadow:var(--sh-3);overflow:hidden}
#prDlg header{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);border-bottom:1px solid var(--line)}
#prDlg header h2{flex:1;margin:0;font-size:var(--fs-title);font-weight:600;outline:none}
#prDlg .pr-x{flex:none;width:var(--hit,44px);height:var(--hit,44px);display:grid;place-items:center;border:0;border-radius:var(--r-m);background:none;color:var(--ink-2);cursor:pointer}
#prDlg .pr-x:hover{background:var(--surface-2);color:var(--ink)}
#prDlg .pr-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:var(--sp-5)}
#prDlg .pr-target{margin:0 0 var(--sp-5);padding:0 0 var(--sp-5);border-bottom:1px solid var(--line);font-size:var(--fs-small);color:var(--muted)}
#prDlg .pr-target b{display:block;font-size:var(--fs-title);color:var(--ink);font-weight:600}
#prDlg .pr-f{margin:0 0 var(--sp-5)}
#prDlg .pr-f>label{display:flex;align-items:baseline;gap:var(--sp-3);font-size:var(--fs-small);color:var(--ink-2);margin-bottom:var(--sp-2)}
#prDlg .pr-f>label b{color:var(--ink);font-weight:600}
#prDlg .pr-f>label em{margin-left:auto;font-style:normal;color:var(--muted);font-variant-numeric:tabular-nums}
#prDlg input[type=text],#prDlg textarea{width:100%;box-sizing:border-box;min-height:var(--hit,44px);padding:var(--sp-4) var(--sp-5);font:inherit;font-size:16px;color:var(--ink);background:var(--bg);border:1px solid var(--line-strong);border-radius:var(--r-m)}
#prDlg textarea{resize:vertical;line-height:1.5}
#prDlg .pr-org{margin:var(--sp-2) 0 0;font-size:var(--fs-micro);color:var(--muted);line-height:1.5}
#prDlg .pr-restore{display:inline-flex;align-items:center;min-height:32px;border:0;background:none;padding:0;font:inherit;font-size:var(--fs-micro);color:var(--accent);cursor:pointer;text-decoration:underline}
#prDlg .pr-li{display:flex;gap:var(--sp-3);margin-bottom:var(--sp-3)}
#prDlg .pr-li input{flex:1;min-width:0}
#prDlg .pr-li button{flex:none;width:var(--hit,44px);border:1px solid var(--line);border-radius:var(--r-m);background:var(--surface-2);color:var(--ink-2);cursor:pointer;font-size:var(--fs-control)}
#prDlg .pr-add{border:1px solid var(--line);border-radius:var(--r-m);background:none;color:var(--ink-2);font:inherit;font-size:var(--fs-small);min-height:36px;padding:0 var(--sp-4);cursor:pointer}
#prDlg .pr-add:hover{border-color:var(--line-strong);color:var(--ink)}
#prDlg .pr-acts{display:flex;gap:var(--sp-4);margin-top:var(--sp-5);position:sticky;bottom:calc(-1 * var(--sp-5));padding:var(--sp-4) 0 var(--sp-5);background:var(--surface);border-top:1px solid var(--line)}
#prDlg .pr-acts .btn{flex:1}
#prDlg .a11y{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){#prDlg{place-items:stretch}#prDlg .pr-sheet{width:100vw;max-height:none;height:100dvh;border:0;border-radius:0;padding-bottom:env(safe-area-inset-bottom)}}`;

let dlg = null, cur = null, opener = null, onSaved = null;
const say = s => { const l = dlg?.querySelector('.pr-live'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = s; }, 30); } };
const text = (value, ph) => { const i = h('input'); i.type = 'text'; i.value = value || ''; if (ph) i.placeholder = ph; return i; };

/** 一个字段：标题（可带字数）+ 控件 + 包里的原文 + 「恢复成包里的」（清掉这一项） */
function field(label, org, input, o = {}) {
  const f = h('div', 'pr-f'), lb = h('label'), b = h('b', null, label);
  lb.append(b);
  if (o.max) { const c = h('em'); lb.append(c); o.count = c; const upd = () => { c.textContent = `${[...input.value].length} / ${o.max}`; }; input.addEventListener('input', upd); upd(); }
  f.append(lb, input);
  if (org) f.append(h('p', 'pr-org', `${T('pr.pack', '包里的原文')}：${org}`));
  const r = h('button', 'pr-restore', T('pr.restore', '恢复成包里的')); r.type = 'button';
  r.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
  f.append(r);
  return f;
}
/** 可增删的一列（事实 / 叫法）：每条一行，删除只动这一条 */
function listField(label, org, list, o) {
  const box = h('div', 'pr-f'), lb = h('label'); lb.append(h('b', null, label)); box.append(lb);
  const rows = h('div');
  const paint = () => rows.replaceChildren(...list.map((v, i) => {
    const r = h('div', 'pr-li'), i2 = text(v), del = h('button', null, T('pr.remove', '删除'));
    del.type = 'button'; del.setAttribute('aria-label', `${T('pr.remove', '删除')} ${i + 1}`);
    i2.addEventListener('input', () => { list[i] = i2.value; });
    del.addEventListener('click', () => { list.splice(i, 1); paint(); });
    r.append(i2, del); return r;
  }));
  paint(); box.append(rows);
  const add = h('button', 'pr-add', `+ ${label}`); add.type = 'button';
  add.addEventListener('click', () => { if (list.length >= o.max) return; list.push(''); paint(); rows.lastChild?.querySelector('input')?.focus(); });
  box.append(add);
  if (org) box.append(h('p', 'pr-org', `${T('pr.pack', '包里的原文')}：${org}`));
  const r = h('button', 'pr-restore', T('pr.restore', '恢复成包里的')); r.type = 'button';
  r.addEventListener('click', () => { list.length = 0; paint(); });
  box.append(r);
  return box;
}

function build(rec, o) {
  const body = dlg.querySelector('.pr-body'), it = cur.item || {};
  const target = h('p', 'pr-target'); target.append(h('b', null, rec.name));
  if (rec.baseName && rec.baseName !== rec.name) target.append(document.createTextNode(`${T('pr.std', '标准名')}：${rec.baseName}`));
  const form = h('form');
  const name = text(it.名 ?? '', rec.name);
  form.append(field(T('pr.name', '名称'), rec.baseName || rec.name, name, { max: MAX.name }));
  let use = null;
  if (!o.person) { use = text(it.用途 ?? '', T('pr.use_ph', '一句话说明这个地方拿来做什么')); form.append(field(T('pr.use', '用途'), rec.use || '', use, { max: MAX.use })); }
  const desc = h('textarea'); desc.rows = 3; desc.value = it.说明 ?? ''; desc.placeholder = T('pr.desc_ph', '一到三句');
  form.append(field(T('pr.desc', '说明'), rec.desc || '', desc, { max: MAX.desc }));
  const facts = [...(it.事实 || rec.facts || [])], aliases = [...(it.别名 || [])];
  form.append(listField(T('pr.facts', '事实'), (rec.facts || []).join('；'), facts, { max: 12 }));
  form.append(listField(T('pr.aliases', '叫法'), (rec.alias || []).join('、'), aliases, { max: 10 }));
  const acts = h('div', 'pr-acts');
  const save = h('button', 'btn pri', T('pr.save', '保存')); save.type = 'submit';
  const undo = h('button', 'btn', T('pr.undo', '撤销上次改动')); undo.type = 'button';
  undo.addEventListener('click', async () => { await post_('place-undo', { id: cur.id }); await wait(400); onSaved?.(); close(); });
  const cancel = h('button', 'btn', T('close', '关闭')); cancel.type = 'button'; cancel.addEventListener('click', () => close());
  acts.append(save, undo, cancel); form.append(acts);
  form.addEventListener('submit', ev => { ev.preventDefault(); commit(rec, { name, use, desc, facts, aliases }); });
  body.replaceChildren(target, form);
  name.focus({ preventScroll: true });
  prefillLegacy(rec, { name, desc });
}
/** 旧的本机自定义（只读保留，docs/place-record.md §7.2）：这个地点在本聊天还没有改动时，把旧的本机名称 / 简介预填进来；保存后写进本聊天，旧键不再写入也不删 */
async function prefillLegacy(rec, f) {
  if (cur.item?.名 || cur.item?.说明) return;
  const m = await import('../ui/room-gallery-panel.js').catch(e => console.warn('[place] 旧的本机自定义读不到，编辑器少一层预填', e));
  if (!m || !f.name.isConnected) return;
  const key = rec.baseName || rec.name;
  const n = m.getCustomName?.(key), d = m.getCustomIntro?.(key);
  if (n && !f.name.value) f.name.value = n;
  if (d && !f.desc.value) f.desc.value = d;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const post_ = (type, data) => { post({ type: `eden-map:${type}`, ...data }); return true; };

/** The changed fields (a field equal to what the chat already has is not sent). `base` records which pack text the edit was based on. */
async function commit(rec, f) {
  const it = cur.item || {}, p = {};
  const n = f.name.value.trim(); if (n !== (it.名 ?? '')) p.name = n;
  if (f.use) { const u = f.use.value.trim(); if (u !== (it.用途 ?? '')) p.use = u; }
  const dc = f.desc.value.trim(); if (dc !== (it.说明 ?? '')) p.desc = dc;
  const fx = f.facts.map(x => x.trim()).filter(Boolean); if (fx.join('␟') !== (it.事实 || rec.facts || []).join('␟')) p.facts = fx;
  const al = f.aliases.map(x => x.trim()).filter(Boolean); if (al.join('␟') !== (it.别名 || []).join('␟')) p.aliases = al;
  p.base = baseOf({ baseName: rec.baseName ?? rec.name, desc: rec.desc, facts: rec.facts });
  if (Object.keys(p).length <= 1) { close(); return; }   // 只算了指纹 = 什么都没改
  const ok = await savePatch(cur.id, p);
  if (!ok) { say(T('pr.err', '没存上，请再试一次')); return; }
  say(T('pr.saved', '已保存')); onSaved?.(); close();
}

/** 写入：嵌在酒馆里发意图给宿主（聊天变量 + 本聊天的自定义书 + 撤销），单独打开地图时写本机那一份 */
async function savePatch(id, patch) {
  if (window.top !== window) return post_('place-edit', { id, patch });
  const cv = plugins.CustomNamesView; if (!cv?.setCustom) return false;
  return !!(await cv.setCustom(id, patch));
}
function close() { if (!dlg || dlg.hidden) return; dlg.hidden = true; document.body.classList.remove('prdlg'); opener?.focus?.({ preventScroll: true }); opener = null; }

/** Open the editor for one place (`id` = a record id, a standard name or a person). o = { record?, person?, onSaved? }. */
export function openPlaceEditor(id, o = {}) {
  const rec = o.record || recordOf(id) || bareRecord(id);
  if (!dlg) {
    dlg = document.createElement('div'); dlg.id = 'prDlg'; dlg.hidden = true;
    dlg.innerHTML = `<div class="pr-sheet" role="dialog" aria-modal="true" aria-labelledby="prDlgT"><header><h2 id="prDlgT" tabindex="-1"></h2><button type="button" class="pr-x" data-close="1"></button></header><div class="pr-body"></div><p class="pr-live a11y" role="status" aria-live="polite"></p></div>`;
    document.body.append(dlg);
    const st = document.createElement('style'); st.id = 'prDlgCss'; st.textContent = CSS; document.head.append(st);
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
    dlg.addEventListener('keydown', e => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopPropagation(); close(); });
  }
  opener = document.activeElement; onSaved = o.onSaved || refreshCard;
  cur = { id: rec.id, item: itemOf(rec), person: !!o.person };
  dlg.hidden = false; document.body.classList.add('prdlg');
  dlg.querySelector('#prDlgT').textContent = o.person ? T('pr.person', '编辑人物') : T('pr.title', '编辑地点');
  dlg.querySelector('[data-close]').setAttribute('aria-label', T('close', '关闭'));
  build(rec, o);
  return dlg;
}
export const placeEditorOpen = () => !!dlg && !dlg.hidden;
/** 聊天变量里这一项的原样（编辑器预填用） */
function itemOf(rec) {
  const items = plugins.CustomNamesView?.data?.items || {};
  return items[rec.id] || items[rec.baseName || rec.name] || null;
}
/** 认不出记录的地方（人物、自己起的名字）：只由这一项自己拼一条出来 */
function bareRecord(id) {
  const it = itemOf({ id, baseName: id }) || {}, name = it.名 || it.标 || id;
  return { id, name, baseName: it.标 || id, kind: 'place', sub: '', where: '', desc: '', facts: [], storyFacts: [], access: '', rows: [], alias: it.别名 || [], use: it.用途 || '', edited: [], stale: [] };
}
// 宿主推来新的自定义数据：编辑器开着就重画（撤销、剧情标签、别的窗口改的都看得见）
busOn({ key: 'place-editor.custom', type: 'message', fn: e => {
  try { if (placeEditorOpen() && cur && e.data?.type === 'eden-map:custom') { const rec = recordOf(cur.id) || bareRecord(cur.id); cur.item = itemOf(rec); build(rec, { person: cur.person }); } } catch (x) { console.warn('[place-editor] 重画失败', x); }
} });
