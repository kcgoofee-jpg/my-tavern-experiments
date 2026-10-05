// Settings profiles (PROFILE-1, D34): the section at the top of Settings home. Current profile name with a "modified" marker when the live values differ
// from it, a picker (choosing applies), and save / rename / delete / restore-recommended / export / import. Words are fine here: it is a settings page.
// Texts: prof.* (zh + en). Every text goes in through textContent. No dialogs: the name field is inline, delete asks twice on the button itself.
import { $, iconSvg } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { saveTextFile, revealManual } from './transfer.mjs';
import { onBuilt, onShow, placeIn, pageEl } from './settings-pages.mjs';
import { createProfiles } from './profiles.mjs';
import { BUILTIN, REC_ID, cardKey } from '../core/profiles.mjs';
import { cardOf } from './settings.mjs';
import { PACK } from './current-pack.mjs';

const tr = (k, zh, v) => uiTextOr(k, zh, v);
const CSS = `#profBox{margin:var(--sp-3) 0 var(--sp-5)}#profBox .profhead{display:flex;width:100%;align-items:center;gap:var(--sp-3);min-height:var(--hit,44px);text-align:left;justify-content:flex-start}#profBox .profhead .proflab{flex:none;color:var(--muted)}#profBox .profhead .profchev{margin-left:auto;flex:none;transition:transform var(--dur-2)}#profBox.expanded .profhead .profchev{transform:rotate(180deg)}
#profBox .profrow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3);margin:var(--sp-3) 0}#profBox .profrow select,#profBox .profrow input[type=text]{flex:1 1 9em;min-width:0;min-height:var(--hit,44px)}
#profBox .btn{min-height:36px}#profBox .profmod{font-style:normal;font-size:var(--fs-small);color:var(--accent);flex:none}#profBox .profmod::before{content:'· '}
#profBox .profnm{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#profBox .profmsg{color:var(--muted);font-size:var(--fs-small);min-height:1.4em}#profBox .profbody{display:none}#profBox.expanded .profbody{display:block}#profBox .profmore{display:none}#profBox.open .profmore{display:flex}`;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const btn = (id, key, zh, fn) => { const b = el('button', 'btn', tr(key, zh)); b.type = 'button'; b.id = id; b.dataset.i18n = key; b.addEventListener('click', fn); return b; };

const io = { read: k => { try { return LocalStore.get(k); } catch (e) { return null; } }, write: (k, v) => { try { LocalStore.set(k, v); } catch (e) { console.warn('[profile] write', k); } },
  remove: k => { try { LocalStore.remove(k); } catch (e) { console.warn('[profile] remove', k); } }, load: () => io.read('edenMapProfiles'), save: v => io.write('edenMapProfiles', v) };
let box = null, mode = '', delArmed = false;
function setExpanded(on, quiet) { box.classList.toggle('expanded', on); box.querySelector('#profHead').setAttribute('aria-expanded', String(on)); box.querySelector('#profBody').hidden = !on; if (!quiet) { try { LocalStore.set('edenMapProfOpen', on ? '1' : '0'); } catch (e) { console.warn('[map] profile-section: remembering the open state failed', e); } } }
export const api = createProfiles(io, { applied: keys => import('./profile-live.mjs').then(m => m.applyChanged(keys)).catch(e => console.warn('[profile] live', e)) });
const nameOf = p => (p.nameKey ? tr(p.nameKey, p.name) : p.name);
const builtinNames = () => BUILTIN.flatMap(b => [b.name, tr(b.nameKey, b.name)]);
const say = (key, zh, v) => { const m = $('#profMsg'); if (m) m.textContent = tr(key, zh, v); };

export const currentTargetKey = () => {
  const c = cardOf();
  const k = cardKey(c);
  return k !== 'k0' ? k : (PACK?.id || 'eden');
};

/** repaint name, marker, picker and the buttons that only make sense for a user profile */
export function refresh() {
  if (!box) return;
  const { store, profile, modified } = api.current();
  $('#profName').textContent = nameOf(profile); $('#profMod').hidden = !modified; $('#profHead').setAttribute('aria-label', tr('prof.label', '方案：') + nameOf(profile) + (modified ? ' · ' + tr('prof.mod', '已修改') : ''));
  const sel = $('#profSel'); sel.replaceChildren(...[...BUILTIN, ...store.list].map(p => { const o = el('option', '', nameOf(p)); o.value = p.id; return o; })); sel.value = profile.id;
  const user = !profile.builtin; $('#profRen').disabled = !user; $('#profDel').disabled = !user;
  if (!delArmed) $('#profDel').textContent = tr('prof.del', '删除');
  const bBtn = $('#profBind');
  if (bBtn) {
    const tk = currentTargetKey(), bound = store.binds?.[tk];
    const isBoundToCurrent = bound && bound === profile.id;
    bBtn.textContent = isBoundToCurrent ? tr('prof.unbind', '解除卡绑定') : tr('prof.bind', '绑定到这张卡');
    bBtn.dataset.i18n = isBoundToCurrent ? 'prof.unbind' : 'prof.bind';
  }
}
function toggleBind() {
  const { store, profile } = api.current(), tk = currentTargetKey(), bound = store.binds?.[tk];
  if (bound === profile.id) {
    api.unbind(tk);
    refresh();
    say('prof.unbound', '已解除绑定');
  } else {
    api.bind(tk, profile.id);
    refresh();
    say('prof.bound', '已绑定到当前卡');
  }
}
function ask(m, initial) { mode = m; $('#profForm').hidden = false; const i = $('#profIn'); i.value = initial; i.focus(); i.select(); }
function closeForm() { mode = ''; $('#profForm').hidden = true; }
function submit() {
  const v = $('#profIn').value, { profile } = api.current();
  const r = mode === 'rename' ? api.rename(profile.id, v, builtinNames()) : api.saveAs(v, builtinNames());
  if (!r.ok) return say(r.reason === 'taken' ? 'prof.err_taken' : 'prof.err_name', r.reason === 'taken' ? '这个名字已被占用' : '请输入方案名称');
  const was = mode; closeForm(); refresh(); say(was === 'rename' ? 'prof.renamed' : 'prof.saved', was === 'rename' ? '已重命名' : '已保存当前设置');
}
function choose(id) { const r = api.apply(id); closeForm(); refresh(); if (r.ok) say('prof.applied', '已应用，改了 {n} 项', { n: r.changed }); }
function del() {
  const { profile } = api.current(); if (profile.builtin) return;
  if (!delArmed) { delArmed = true; $('#profDel').textContent = tr('prof.del2', '再点一次删除'); setTimeout(() => { delArmed = false; refresh(); }, 4000); return; }
  delArmed = false; api.remove(profile.id); refresh(); say('prof.deleted', '已删除');
}
async function download() {
  const { profile } = api.current(), text = api.exportText(profile.id, nameOf(profile)); if (!text) return;
  const res = await saveTextFile('eden-map-profile.json', text, { type: 'application/json' });   // F3：TT 里 <a download> 被忽略，走复制兜底 / 手动面板
  if (res === 'copied') say('transfer.copied', '这个环境不下载文件：内容已复制到剪贴板，请粘贴到目标位置。');
  if (res === 'manual') { revealManual('eden-map-profile.json', text); say('transfer.manual_shown', '这个环境既不能下载也不能复制：内容已显示在下方，请手动复制并存成 {name}', { name: 'eden-map-profile.json' }); }
}
function upload(file) {
  if (!file) return; const rd = new FileReader();
  rd.onload = () => { const r = api.importText(String(rd.result || ''), builtinNames()); refresh();
    say(r.ok ? 'prof.imp_ok' : 'prof.imp_bad', r.ok ? '已导入「{name}」，忽略了 {n} 项未知设置' : '不是有效的方案文件', r.ok ? { name: r.name, n: r.dropped } : undefined); };
  rd.onerror = () => say('prof.imp_bad', '不是有效的方案文件'); rd.readAsText(file);
}

let lastAppliedKey = null;
/** check and auto-apply profile bound to current card if any */
export function onCardChange() {
  const tk = currentTargetKey();
  if (lastAppliedKey === tk) return;
  lastAppliedKey = tk;
  const boundId = api.boundProfile(tk);
  if (!boundId) return;
  const p = api.store().list.find(x => x.id === boundId) || BUILTIN.find(x => x.id === boundId);
  if (!p) return;
  const nm = nameOf(p);
  api.apply(boundId);
  refresh();
  const title = tr('prof.auto_applied', '已应用卡绑定的方案「{name}」', { name: nm });
  if (typeof window !== 'undefined' && typeof window.showNotice === 'function') {
    window.showNotice({ level: 1, key: 'prof-bind-auto', title });
  } else {
    say('prof.auto_applied', '已应用卡绑定的方案「{name}」', { name: nm });
  }
}

onBuilt('home', () => {
  if (box) return;
  if (!document.getElementById('profCss')) { const s = el('style'); s.id = 'profCss'; s.textContent = CSS; document.head.appendChild(s); }
  box = el('div'); box.id = 'profBox';
  // one collapsed row 「方案：推荐 · 已修改 ▾」 (HEADER-1); it expands in place to the picker, save and manage; the state is remembered per device (not a preference)
  const head = btn('profHead', 'prof.row', '', () => setExpanded(!box.classList.contains('expanded'))); head.className = 'btn profhead'; head.removeAttribute('data-i18n'); head.textContent = ''; head.setAttribute('aria-controls', 'profBody');
  const lab = el('span', 'proflab', tr('prof.label', '方案：')); lab.dataset.i18n = 'prof.label';
  const nm = el('span', 'profnm'); nm.id = 'profName'; const md = el('em', 'profmod', tr('prof.mod', '已修改')); md.id = 'profMod'; md.hidden = true; md.dataset.i18n = 'prof.mod';
  const chev = el('span', 'profchev'); chev.innerHTML = iconSvg('chevD'); head.append(lab, nm, md, chev);
  const body = el('div', 'profbody'); body.id = 'profBody';
  const pick = el('div', 'profrow'), sel = el('select'); sel.id = 'profSel'; sel.setAttribute('aria-label', tr('prof.pick', '选择方案')); sel.addEventListener('change', () => choose(sel.value));
  pick.append(sel, btn('profSave', 'prof.save', '保存当前设置为方案…', () => ask('save', '')));
  const more = el('div', 'profrow profmore');
  const fi = el('input'); fi.type = 'file'; fi.accept = 'application/json,.json'; fi.id = 'profFile'; fi.hidden = true; fi.addEventListener('change', () => { upload(fi.files[0]); fi.value = ''; });
  more.append(btn('profBind', 'prof.bind', '绑定到这张卡', toggleBind), btn('profRen', 'prof.rename', '重命名', () => ask('rename', nameOf(api.current().profile))), btn('profDel', 'prof.del', '删除', del), btn('profRestore', 'prof.restore', '恢复推荐默认', () => choose(REC_ID)),
    btn('profExp', 'prof.export', '导出', download), btn('profImp', 'prof.import', '导入', () => fi.click()), fi);
  const tg = btn('profToggle', 'prof.manage', '管理方案', () => { box.classList.toggle('open'); tg.setAttribute('aria-expanded', box.classList.contains('open')); }); tg.setAttribute('aria-expanded', 'false'); tg.setAttribute('aria-controls', 'profMoreRow'); more.id = 'profMoreRow'; pick.append(tg);
  const form = el('form', 'profrow'); form.id = 'profForm'; form.hidden = true;
  const inp = el('input'); inp.type = 'text'; inp.id = 'profIn'; inp.maxLength = 24; inp.setAttribute('aria-label', tr('prof.name', '方案名称')); inp.setAttribute('placeholder', tr('prof.name', '方案名称'));
  const ok = el('button', 'btn', tr('prof.ok', '保存')); ok.type = 'submit'; ok.dataset.i18n = 'prof.ok'; const no = btn('profNo', 'prof.cancel', '取消', closeForm);
  form.addEventListener('submit', e => { e.preventDefault(); submit(); }); form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeForm(); $('#profSave').focus(); } });
  form.append(inp, ok, no);
  const msg = el('div', 'profmsg'); msg.id = 'profMsg'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  body.append(pick, form, more, msg); box.append(head, body);
  let want = false; try { want = LocalStore.get('edenMapProfOpen') === '1'; } catch (e) { console.warn('[map] profile-section: reading the open state failed', e); }
  setExpanded(want, true);
  placeIn(pageEl('home'), box, 5);
  refresh();
  const pop = $('#setPop'); for (const ev of ['change', 'click']) pop?.addEventListener(ev, () => setTimeout(refresh, 0));   // a switch changed elsewhere on the page: the marker follows
});
onShow('home', refresh);
