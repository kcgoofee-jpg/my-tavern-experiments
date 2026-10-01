// 房间图集 UI：自定义显示名 / 简介（本机、纯展示层，不改房间 id 与卡名）+ 一个地点的图集面板：先是设定包自带的图（只读），再是你自己的私人图（上传 / 缩放存 IndexedDB / 增删排序）。
// 私人图只在本机，永远不导出（K-R102）；编辑模式下私人图可以「加入设定包」、包里的图可以移出（K-R100），其余一概没有「公开 / 投稿」之类的东西。
// 纯逻辑（尺寸、配额）在 map/core/room-gallery-logic.mjs；IndexedDB 读写在 map/core/room-gallery-db.mjs；包图片的来源规则在 map/core/pack-media.mjs；这里只管 DOM。
import { MAX_DIM, WEBP_QUALITY, DEFAULT_QUOTA_BYTES, scopeKey, makeImageMeta } from '../core/room-gallery-logic.mjs';
import * as DB from '../core/room-gallery-db.mjs';
import { available as baibaiInstalled } from '../tavern/imagegen-bridge.mjs';   // 柏宝绘桥（可选依赖）：装了才显示「配图」入口

const CUSTOM_KEY = 'edenRoomCustomV1';
const SCOPE_KEY = 'edenGalleryScope';

const STR = {
  zh: {
    renamePh: '自定义名称…', restore: '恢复原名', introPh: '自定义简介（只在本机显示）…', openGallery: '图集 ›', illust: '配图 ›',
    title: '房间图集', close: '关闭', upload: '上传图片',
    scopeChat: '仅本聊天', scopeGlobal: '全部聊天共用',
    scopeChatHint: '仅本聊天 = 只在这个聊天里看得到', scopeGlobalHint: '全部聊天共用 = 你的所有聊天都能看到，但仍然只存在这台设备上',
    scope: '存放范围', empty: '还没有图片。上传的图会缩到 ≤1600px 存在本机浏览器里，只有你自己看得到。', delete: '删除', up: '上移', down: '下移',
    noIdb: 'IndexedDB 不可用（隐私浏览模式或浏览器限制），上传/保存已关闭；下面仍可以看设定包自带的图。',
    quotaFull: '本机存储快满了（作用域已用 {used}，上限 {quota}），继续上传前建议先删几张。',
    packBadge: '设定包', mineBadge: '私人', addToPack: '加入设定包', detach: '移出设定包', linkOff: '用链接给出的图片（设置里开了才加载）', refused: '这张图没有显示', failed: '没成功：{why}',
  },
  en: {
    renamePh: 'Custom name…', restore: 'Restore original', introPh: 'Custom note (shown on this device only)…', openGallery: 'Gallery ›', illust: 'Illustrate ›',
    title: 'Room gallery', close: 'Close', upload: 'Upload images',
    scopeChat: 'This chat only', scopeGlobal: 'Shared across chats',
    scopeChatHint: 'This chat only = visible only inside this one chat', scopeGlobalHint: 'Shared across chats = visible from all your chats, but still only on this device',
    scope: 'Storage scope', empty: 'No pictures yet. Uploads are resized to ≤1600px and kept in this browser, visible only to you.', delete: 'Delete', up: 'Up', down: 'Down',
    noIdb: 'IndexedDB is unavailable (private browsing or a browser limit) — upload/save is disabled; the pack\'s own pictures still show below.',
    quotaFull: 'Local storage for this scope is nearly full ({used} used, {quota} limit) — consider deleting a few before uploading more.',
    packBadge: 'Pack', mineBadge: 'Private', addToPack: 'Add to pack', detach: 'Remove from pack', linkOff: 'A picture given as a link (loaded only when the setting is on)', refused: 'This picture is not shown', failed: 'Not done: {why}',
  },
};
const fmtBytes = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---------------- 自定义名称 / 简介：本机 localStorage，按 roomId 存 ----------------
function readCustomStore() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}'); } catch (e) { return {}; } }
function writeCustomStore(o) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(o)); } catch (e) { /* 存不下就算了，纯展示层 */ } }
export function getCustomName(roomId) { return readCustomStore()[roomId]?.name || ''; }
export function getCustomIntro(roomId) { return readCustomStore()[roomId]?.intro || ''; }
export function setCustomName(roomId, name) { const s = readCustomStore(); s[roomId] = { ...s[roomId], name: name || '' }; writeCustomStore(s); }
export function setCustomIntro(roomId, intro) { const s = readCustomStore(); s[roomId] = { ...s[roomId], intro: intro || '' }; writeCustomStore(s); }
export function clearCustomName(roomId) { const s = readCustomStore(); if (s[roomId]) { delete s[roomId].name; writeCustomStore(s); } }

// ---------------- 卡片里插的自定义 + 图集入口（cardHTML 拼进去用） ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BTN = 'padding:4px 8px;border-radius:var(--r-s,4px);background:var(--surface-2,rgba(255,255,255,.08));font-size:var(--fs-small,12px);white-space:nowrap';
function css(id, text) { if (document.getElementById(id)) return; const s = el('style'); s.id = id; s.textContent = text; document.head.appendChild(s); }
const cardCSS = () => css('rgc-css', `.rgc{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line,rgba(255,255,255,.15));display:flex;flex-direction:column;gap:6px}
.rgc-row{display:flex;gap:6px;align-items:center}
.rgc-name,.rgc-intro{background:var(--surface-2,rgba(255,255,255,.06));border:1px solid var(--line,rgba(255,255,255,.15));border-radius:var(--r-s,4px);color:inherit;padding:4px 6px;font:inherit}
.rgc-name{flex:1;min-width:0}.rgc-intro{resize:vertical}
.rgc-restore,.rgc-open,.ilp-open{all:unset;cursor:pointer;${BTN}}
.rgc-restore:hover,.rgc-open:hover,.ilp-open:hover{background:var(--accent-weak,rgba(255,255,255,.18))}
.rgc-open,.ilp-open{align-self:flex-start}`);
export function roomCustomBlockHTML(roomId, lang = 'zh') {
  cardCSS();
  const t = STR[lang] || STR.zh, name = getCustomName(roomId), intro = getCustomIntro(roomId);
  return `<div class="rgc" data-room="${esc(roomId)}">
    <div class="rgc-row"><input type="text" class="rgc-name" placeholder="${t.renamePh}" value="${esc(name)}" aria-label="${t.renamePh}">${name ? `<button type="button" class="rgc-restore">${t.restore}</button>` : ''}</div>
    <textarea class="rgc-intro" placeholder="${t.introPh}" rows="2" aria-label="${t.introPh}">${esc(intro)}</textarea>
    <button type="button" class="rgc-open" data-room="${esc(roomId)}">${t.openGallery}</button>
    ${baibaiInstalled() ? `<button type="button" class="ilp-open" data-room="${esc(roomId)}">${t.illust}</button>` : ''}
  </div>`;
}
// 事件委托：挂在卡片容器上一次即可（main.js 调用）。pictures(roomName) -> 这个房间的包图片 [{ id, item, url }]（页面自己从宿主发来的数据算）
export function bindRoomCustomEvents(container, { onOpenGallery, base = '../', pictures } = {}) {
  container.addEventListener('change', (e) => {
    const nameIn = e.target.closest('.rgc-name'); if (nameIn) { const room = nameIn.closest('.rgc').dataset.room; setCustomName(room, nameIn.value.trim()); if (onOpenGallery) onOpenGallery.refresh?.(); return; }
    const introIn = e.target.closest('.rgc-intro'); if (introIn) { setCustomIntro(introIn.closest('.rgc').dataset.room, introIn.value); return; }
  });
  container.addEventListener('click', (e) => {
    const restore = e.target.closest('.rgc-restore');
    if (restore) { const room = restore.closest('.rgc').dataset.room; clearCustomName(room); onOpenGallery?.refresh?.(); return; }
    const open = e.target.closest('.rgc-open');
    if (open) { openRoomGalleryPanel(open.dataset.room, { lang: container.dataset.lang || 'zh', base, pictures: pictures && (() => pictures(open.dataset.room)) }); return; }
    const ilp = e.target.closest('.ilp-open');
    if (ilp) {
      // 动态载入配图面板：它要用本文件的 currentScope / 图集库，静态互相 import 会成环
      const lang = container.dataset.lang || 'zh';
      import('./illustration-panel.js').then((m) => m.openIllustPanel(ilp.dataset.room, { lang, base })).catch((err) => console.warn('[illust] 配图面板加载失败', err));
      return;
    }
  });
}

// ---------------- 图集面板 ----------------
let panelEl = null, closeCb = null;
let chatId = '';
export function setGalleryChatId(id) { chatId = id || ''; }
export function galleryChatId() { return chatId; }
export function currentScope() {
  let s = null; try { s = localStorage.getItem(SCOPE_KEY); } catch (e) { }
  if (s !== 'chat' && s !== 'global') s = chatId ? 'chat' : 'global';
  if (s === 'chat' && !chatId) s = 'global';
  return s;
}
function setScope(s) { try { localStorage.setItem(SCOPE_KEY, s); } catch (e) { } }
const panelCSS = () => css('rgp-css', `.rgp{position:fixed;inset:0;z-index:var(--zu-pop,60);background:rgba(8,7,5,.92);display:flex;align-items:center;justify-content:center;color:var(--ink,#eee4cc);font:13px/1.5 system-ui,sans-serif}
.rgp-box{width:min(92vw,760px);max-height:88vh;overflow:auto;background:var(--surface,#151310);border:1px solid var(--line,#3a352c);border-radius:var(--r-m,8px);padding:14px 16px 18px}
.rgp-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.rgp-hd h3{margin:0;font-size:16px;color:var(--gold,#e6c36a)}
.rgp-x,.rgp-item button,.rgp-upload-btn{all:unset;cursor:pointer;min-height:var(--hit,44px);box-sizing:border-box;display:inline-flex;align-items:center;${BTN}}
.rgp-x:hover,.rgp-item button:hover,.rgp-upload-btn:hover{background:var(--accent-weak,rgba(255,255,255,.18))}
.rgp-scope{display:flex;flex-direction:column;gap:2px;margin:6px 0 10px;font-size:12px;color:var(--ink-2,#cabfa8)}.rgp-scope>div:first-child{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rgp-hint,.rgp-note{font-size:11px;color:var(--muted,#8d8267)}
.rgp-warn,.rgp-noidb{border:1px solid var(--alert,#a86a2a);padding:6px 10px;border-radius:var(--r-s,4px);font-size:12px;margin-bottom:8px}
.rgp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin:10px 0}
.rgp-item{position:relative;border:1px solid var(--line,#332e26);border-radius:var(--r-m,6px);overflow:hidden;background:var(--surface-2,#1c1912)}
.rgp-item img,.rgp-ph{width:100%;height:90px;object-fit:cover;display:block}.rgp-ph{display:flex;align-items:center;justify-content:center;padding:4px;box-sizing:border-box;font-size:11px;color:var(--muted,#8d8267);text-align:center}
.rgp-meta{padding:4px 6px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.rgp-badge{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);padding:1px 6px;border-radius:var(--r-s,3px);font-size:10px}`);

export async function openRoomGalleryPanel(key, { lang = 'zh', nodeId, name, pictures, edit = false, addToPack, detach, onClose } = {}) {
  panelCSS(); closeRoomGalleryPanel(); closeCb = onClose;
  const t = STR[lang] || STR.zh, idbOK = DB.indexedDBAvailable(), rooms = [...new Set([nodeId ? `n:${nodeId}` : null, name, key].filter(Boolean))], mine = rooms[0];   // Z-18: records under the node id and under the room name (the key before S9b)
  panelEl = el('div', 'rgp'); panelEl.setAttribute('role', 'dialog'); panelEl.setAttribute('aria-modal', 'true');
  const box = el('div', 'rgp-box'), hd = el('div', 'rgp-hd'), x = el('button', 'rgp-x', t.close); x.type = 'button';
  hd.append(el('h3', null, `${t.title} · ${name || key}`), x); box.append(hd);
  if (!idbOK) box.append(el('div', 'rgp-noidb', t.noIdb));
  const warn = el('div', 'rgp-warn'); warn.hidden = true; const grid = el('div', 'rgp-grid'); let file = null;
  if (idbOK) {
    const sc = el('div', 'rgp-scope'), row = el('div'); row.append(el('span', null, t.scope));
    for (const [v, label] of [['chat', t.scopeChat], ['global', t.scopeGlobal]]) { const lab = el('label'), r = el('input'); r.type = 'radio'; r.name = 'rgp-scope'; r.value = v; r.checked = currentScope() === v; r.disabled = v === 'chat' && !chatId; r.addEventListener('change', () => { if (r.checked) { setScope(v); refresh(); } }); lab.append(r, ' ' + label); row.append(lab); }
    sc.append(row, el('div', 'rgp-hint', `${t.scopeChatHint} · ${t.scopeGlobalHint}`)); box.append(sc);
  }
  box.append(warn);
  if (idbOK) { const lab = el('label', 'rgp-upload-btn', t.upload + ' '); file = el('input'); file.type = 'file'; file.className = 'rgp-file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true; lab.append(file); box.append(lab); }
  box.append(grid); panelEl.append(box); document.body.appendChild(panelEl);
  let objectUrls = [], seq = 0;   // 并发 refresh() 保护：只让最后发起的那次写 DOM；旧 objectURL 在新网格接管后才 revoke（不会先出破图标）
  const say = text => { warn.hidden = !text; warn.textContent = text || ''; };
  const privateList = async scopeK => { const all = []; for (const r of rooms) { try { all.push(...await DB.listImages(scopeK, r)); } catch (e) { console.warn('[room-gallery] 读取本机图片失败', e); } } return all.sort((a, b) => a.order - b.order); };
  const toItem = rec => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res({ src: f.result, w: rec.w, h: rec.h }); f.onerror = rej; f.readAsDataURL(rec.blob); });

  async function refresh() {
    const me = ++seq, scopeK = scopeKey(currentScope(), chatId), list = idbOK ? await privateList(scopeK) : [], packed = typeof pictures === 'function' ? pictures() : [];
    if (me !== seq) return;
    const urls = [], frag = document.createDocumentFragment();
    if (!list.length && !packed.length) frag.append(el('div', 'rgp-note', t.empty));
    for (const p of packed) {   // 设定包自带的图（K-R101）：地址已经过 pack-media 的来源规则；null = 占位
      const it = el('div', 'rgp-item'); it.dataset.pack = p.id;
      if (p.url) { const im = el('img'); im.src = p.url; im.alt = p.item?.note || ''; im.loading = 'lazy'; it.append(im); } else it.append(el('div', 'rgp-ph', p.item?.note || (/^https:/.test(p.item?.src || '') ? t.linkOff : t.refused)));
      it.append(el('span', 'rgp-badge', t.packBadge)); const m = el('div', 'rgp-meta'); if (p.url && p.item?.note) m.append(el('span', null, p.item.note));
      if (edit && detach) { const b = el('button', null, t.detach); b.type = 'button'; b.dataset.act = 'detach'; m.append(b); }
      it.append(m); frag.append(it);
    }
    for (const rec of list) {
      const url = URL.createObjectURL(rec.blob); urls.push(url);
      const it = el('div', 'rgp-item'); it.dataset.id = rec.id; it.dataset.room = rec.roomId; const im = el('img'); im.src = url; im.alt = ''; it.append(im, el('span', 'rgp-badge', t.mineBadge));
      const m = el('div', 'rgp-meta');
      for (const [act, label] of [['up', t.up], ['down', t.down], ['del', t.delete], ...(edit && addToPack ? [['pack', t.addToPack]] : [])]) { const b = el('button', null, label); b.type = 'button'; b.dataset.act = act; m.append(b); }
      it.append(m); frag.append(it);
    }
    grid.replaceChildren(frag); const old = objectUrls; objectUrls = urls; old.forEach(u => URL.revokeObjectURL(u));
    if (idbOK) { const u = await DB.scopeUsageAndCheck(scopeK, 0, DEFAULT_QUOTA_BYTES); if (me === seq) say(u.ok ? '' : t.quotaFull.replace('{used}', fmtBytes(u.usedBytes)).replace('{quota}', fmtBytes(u.quota))); }
  }
  x.addEventListener('click', closeRoomGalleryPanel);
  panelEl.addEventListener('click', (e) => { if (e.target === panelEl) closeRoomGalleryPanel(); });
  file?.addEventListener('change', async () => {
    const files = Array.from(file.files || []); file.value = ''; const scopeK = scopeKey(currentScope(), chatId); let order = (await privateList(scopeK)).length;
    for (const f of files) {
      try { const { blob, w, h } = await DB.resizeToWebp(f, MAX_DIM, WEBP_QUALITY); await DB.putImage(scopeK, makeImageMeta({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 7), roomId: mine, order: order++, w, h, bytes: blob.size }), blob); }
      catch (err) { console.warn('[room-gallery] 上传失败', err); }
    }
    await refresh();
  });
  grid.addEventListener('click', async (e) => {
    const act = e.target.closest('button')?.dataset.act, item = e.target.closest('.rgp-item'); if (!act || !item) return;
    if (act === 'detach') { const r = detach(item.dataset.pack); if (!r?.ok) say(t.failed.replace('{why}', r?.code || '')); await refresh(); return; }
    const scopeK = scopeKey(currentScope(), chatId), id = item.dataset.id, room = item.dataset.room;
    if (act === 'del') { await DB.deleteImage(scopeK, room, id); await refresh(); return; }
    const list = await privateList(scopeK), idx = list.findIndex(r => r.id === id && r.roomId === room);
    if (act === 'pack') { const r = await addToPack(await toItem(list[idx])).catch(() => null); say(r?.ok ? '' : t.failed.replace('{why}', r?.code || 'size')); await refresh(); return; }
    const to = act === 'up' ? idx - 1 : idx + 1; if (idx < 0 || to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(idx, 1)[0]);
    for (let i = 0; i < list.length; i++) await DB.updateMeta(scopeK, list[i].roomId, list[i].id, { order: i });
    await refresh();
  });
  document.addEventListener('keydown', escClose, true);
  await refresh();
  return { refresh };
}
function escClose(e) { if (e.key === 'Escape') closeRoomGalleryPanel(); }
export function closeRoomGalleryPanel() {
  if (!panelEl) return; panelEl.remove(); panelEl = null;
  document.removeEventListener('keydown', escClose, true);
  const cb = closeCb; closeCb = null; try { cb?.(); } catch (e) { /* 只是还焦点 */ }
}
