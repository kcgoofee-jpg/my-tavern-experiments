// 房间图集 UI：自定义显示名 / 简介（本机、纯展示层，不改房间 id 与卡名）+ 图集面板（上传 / 缩放存 IndexedDB / 增删排序 / 自用-公开 / 导出投稿包）。
// 纯逻辑（尺寸、配额、导出结构）在 map/core/room-gallery-logic.mjs；IndexedDB 读写在 map/core/room-gallery-db.mjs；这里只管 DOM。
import { MAX_DIM, WEBP_QUALITY, DEFAULT_QUOTA_BYTES, scopeKey, makeImageMeta, reorder, buildExportManifest, buildIssueUrl } from '../core/room-gallery-logic.mjs';
import * as DB from '../core/room-gallery-db.mjs';

const REPO = 'kcgoofee-jpg/my-tavern-experiments';   // 导出投稿的 GitHub issue 仓库；换卡/换仓库时改这里
const CUSTOM_KEY = 'edenRoomCustomV1';
const SCOPE_KEY = 'edenGalleryScope';

const STR = {
  zh: {
    renamePh: '自定义名称…', restore: '恢复原名', introPh: '自定义简介（只在本机显示）…', openGallery: '图集 ›',
    title: '房间图集', close: '关闭', upload: '上传图片', scopeChat: '仅本聊天', scopeGlobal: '全部聊天共用',
    scope: '存放范围', empty: '还没有图片。上传的图会缩到 ≤1600px 存在本机浏览器里。', delete: '删除', up: '上移', down: '下移',
    private: '自用', public: '公开', exportBtn: '导出公开图片', exportNone: '还没有标「公开」的图片，先切几张。',
    exportNote: '不会自动上传：导出的是 manifest.json + 图片文件，作者收到投稿后手动合并进仓库。', openIssue: '打开投稿 issue',
    noIdb: 'IndexedDB 不可用（隐私浏览模式或浏览器限制），上传/保存已关闭；下面仍可以看仓库公开的图。',
    quotaFull: '本机存储快满了（作用域已用 {used}，上限 {quota}），继续上传前建议先删几张。',
    publicBadge: '公开（仓库）', dragHint: '拖拽排序，或用上下按钮',
  },
  en: {
    renamePh: 'Custom name…', restore: 'Restore original', introPh: 'Custom note (shown on this device only)…', openGallery: 'Gallery ›',
    title: 'Room gallery', close: 'Close', upload: 'Upload images', scopeChat: 'This chat only', scopeGlobal: 'Shared across chats',
    scope: 'Storage scope', empty: 'No images yet. Uploads are resized to ≤1600px and kept in this browser.', delete: 'Delete', up: 'Up', down: 'Down',
    private: 'Private', public: 'Public', exportBtn: 'Export public images', exportNone: 'No images marked public yet — toggle some first.',
    exportNote: "Nothing uploads automatically: this downloads manifest.json + the image files; the maintainer merges approved ones into the repo.", openIssue: 'Open submission issue',
    noIdb: 'IndexedDB is unavailable (private browsing or a browser limit) — upload/save is disabled; the repo\'s public images still show below.',
    quotaFull: 'Local storage for this scope is nearly full ({used} used, {quota} limit) — consider deleting a few before uploading more.',
    publicBadge: 'Public (repo)', dragHint: 'Drag to reorder, or use the up/down buttons',
  },
};

function fmtBytes(n) { if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB'; return Math.round(n / 1024) + ' KB'; }

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
function ensureCardCSS() {
  if (document.getElementById('rgc-css')) return;
  const s = document.createElement('style'); s.id = 'rgc-css';
  s.textContent = `.rgc{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.15);display:flex;flex-direction:column;gap:6px}
.rgc-row{display:flex;gap:6px;align-items:center}
.rgc-name{flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:inherit;padding:4px 6px;font:inherit}
.rgc-restore,.rgc-open{all:unset;cursor:pointer;padding:4px 8px;border-radius:4px;background:rgba(255,255,255,.08);font-size:12px;white-space:nowrap}
.rgc-restore:hover,.rgc-open:hover{background:rgba(255,255,255,.18)}
.rgc-intro{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:inherit;padding:4px 6px;font:inherit;resize:vertical}
.rgc-open{align-self:flex-start}`;
  document.head.appendChild(s);
}
export function roomCustomBlockHTML(roomId, lang = 'zh') {
  ensureCardCSS();
  const t = STR[lang] || STR.zh;
  const name = getCustomName(roomId), intro = getCustomIntro(roomId);
  return `<div class="rgc" data-room="${esc(roomId)}">
    <div class="rgc-row"><input type="text" class="rgc-name" placeholder="${t.renamePh}" value="${esc(name)}" aria-label="${t.renamePh}">${name ? `<button type="button" class="rgc-restore">${t.restore}</button>` : ''}</div>
    <textarea class="rgc-intro" placeholder="${t.introPh}" rows="2" aria-label="${t.introPh}">${esc(intro)}</textarea>
    <button type="button" class="rgc-open" data-room="${esc(roomId)}">${t.openGallery}</button>
  </div>`;
}
// 事件委托：挂在卡片容器上一次即可（main.js 调用）
export function bindRoomCustomEvents(container, { onOpenGallery, base = '../' } = {}) {
  container.addEventListener('change', (e) => {
    const nameIn = e.target.closest('.rgc-name'); if (nameIn) { const room = nameIn.closest('.rgc').dataset.room; setCustomName(room, nameIn.value.trim()); if (onOpenGallery) onOpenGallery.refresh?.(); return; }
    const introIn = e.target.closest('.rgc-intro'); if (introIn) { setCustomIntro(introIn.closest('.rgc').dataset.room, introIn.value); return; }
  });
  container.addEventListener('click', (e) => {
    const restore = e.target.closest('.rgc-restore');
    if (restore) { const room = restore.closest('.rgc').dataset.room; clearCustomName(room); onOpenGallery?.refresh?.(); return; }
    const open = e.target.closest('.rgc-open');
    if (open) { openRoomGalleryPanel(open.dataset.room, { lang: container.dataset.lang || 'zh', base }); return; }
  });
}

// ---------------- 图集面板 ----------------
let panelEl = null;
let chatId = '';
export function setGalleryChatId(id) { chatId = id || ''; }
function currentScope() {
  let s = null; try { s = localStorage.getItem(SCOPE_KEY); } catch (e) { }
  if (s !== 'chat' && s !== 'global') s = chatId ? 'chat' : 'global';
  if (s === 'chat' && !chatId) s = 'global';
  return s;
}
function setScope(s) { try { localStorage.setItem(SCOPE_KEY, s); } catch (e) { } }

let galleryJsonCache = null;
async function fetchPublicGallery(base) {
  if (galleryJsonCache) return galleryJsonCache;
  try { galleryJsonCache = await fetch(base + 'data/gallery.json').then((r) => r.ok ? r.json() : { rooms: {} }); }
  catch (e) { galleryJsonCache = { rooms: {} }; }
  return galleryJsonCache;
}

function ensureCSS() {
  if (document.getElementById('rgp-css')) return;
  const s = document.createElement('style'); s.id = 'rgp-css';
  s.textContent = `
.rgp{position:fixed;inset:0;z-index:60;background:rgba(8,7,5,.92);display:flex;align-items:center;justify-content:center;color:#eee4cc;font:13px/1.5 system-ui,sans-serif}
.rgp-box{width:min(92vw,760px);max-height:88vh;overflow:auto;background:#151310;border:1px solid #3a352c;border-radius:8px;padding:14px 16px 18px}
.rgp-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.rgp-hd h3{margin:0;font-size:16px;color:var(--gold,#e6c36a)}
.rgp-x{all:unset;cursor:pointer;padding:6px 10px;border-radius:4px}.rgp-x:hover{background:rgba(255,255,255,.1)}
.rgp-scope{display:flex;gap:10px;align-items:center;margin:6px 0 10px;font-size:12px;color:#cabfa8}
.rgp-warn{background:#4a2f16;border:1px solid #a86a2a;color:#f0d9b0;padding:6px 10px;border-radius:4px;font-size:12px;margin-bottom:8px}
.rgp-noidb{background:#3a2020;border:1px solid #a04040;color:#f0c0c0;padding:8px 10px;border-radius:4px;font-size:12px;margin-bottom:10px}
.rgp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin:10px 0}
.rgp-item{position:relative;border:1px solid #332e26;border-radius:6px;overflow:hidden;background:#1c1912}
.rgp-item img{width:100%;height:90px;object-fit:cover;display:block}
.rgp-item .rgp-meta{padding:4px 6px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.rgp-item button{all:unset;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:3px;background:rgba(255,255,255,.08)}
.rgp-item button:hover{background:rgba(255,255,255,.18)}
.rgp-item .rgp-vis.on{background:var(--gold,#e6c36a);color:#241d0f}
.rgp-item .rgp-badge{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);padding:1px 6px;border-radius:3px;font-size:10px}
.rgp-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;border-top:1px solid #2c2820;padding-top:10px}
.rgp-foot button, .rgp-upload-btn{all:unset;cursor:pointer;padding:6px 12px;border-radius:4px;background:rgba(255,255,255,.08);font-size:12px}
.rgp-foot button:hover, .rgp-upload-btn:hover{background:rgba(255,255,255,.18)}
.rgp-note{font-size:11px;color:#a89b82;margin-top:4px;width:100%}
`;
  document.head.appendChild(s);
}

export async function openRoomGalleryPanel(roomId, { lang = 'zh', base = '../' } = {}) {
  ensureCSS();
  closeRoomGalleryPanel();
  const t = STR[lang] || STR.zh;
  const idbOK = DB.indexedDBAvailable();
  const scope = currentScope();

  panelEl = document.createElement('div'); panelEl.className = 'rgp'; panelEl.setAttribute('role', 'dialog'); panelEl.setAttribute('aria-modal', 'true');
  panelEl.innerHTML = `<div class="rgp-box">
    <div class="rgp-hd"><h3>${esc(t.title)} · ${esc(roomId)}</h3><button type="button" class="rgp-x">${esc(t.close)}</button></div>
    ${idbOK ? '' : `<div class="rgp-noidb">${esc(t.noIdb)}</div>`}
    ${idbOK ? `<div class="rgp-scope"><span>${esc(t.scope)}</span>
      <label><input type="radio" name="rgp-scope" value="chat" ${scope === 'chat' ? 'checked' : ''} ${chatId ? '' : 'disabled'}> ${esc(t.scopeChat)}</label>
      <label><input type="radio" name="rgp-scope" value="global" ${scope === 'global' ? 'checked' : ''}> ${esc(t.scopeGlobal)}</label>
    </div>` : ''}
    <div class="rgp-warn" style="display:none"></div>
    ${idbOK ? `<label class="rgp-upload-btn">${esc(t.upload)} <input type="file" accept="image/*" multiple style="display:none" class="rgp-file"></label>` : ''}
    <div class="rgp-grid"></div>
    <div class="rgp-foot">
      <button type="button" class="rgp-export">${esc(t.exportBtn)}</button>
      <div class="rgp-note">${esc(t.exportNote)}</div>
    </div>
  </div>`;
  document.body.appendChild(panelEl);

  const grid = panelEl.querySelector('.rgp-grid');
  const warn = panelEl.querySelector('.rgp-warn');
  const objectUrls = [];
  let refreshSeq = 0;   // 并发 refresh() 保护：上传 / 删除等操作可能在「打开面板时的第一次 refresh」还没跑完（等公开清单 fetch）时就再触发一次 refresh，
                         // 旧的那次后完成会用过期数据把新数据覆盖掉——只让最后发起的那次真正写 DOM。

  async function refresh() {
    const seq = ++refreshSeq;
    const sc = currentScope();
    let localList = [];
    if (idbOK) { try { localList = await DB.listImages(scopeKey(sc, chatId), roomId); } catch (e) { localList = []; } }
    const pub = (await fetchPublicGallery(base))?.rooms?.[roomId]?.images || [];
    if (seq !== refreshSeq) return;   // 已经有更新的 refresh() 发起过了，这次的结果作废
    grid.innerHTML = '';
    objectUrls.forEach((u) => URL.revokeObjectURL(u)); objectUrls.length = 0;
    if (!localList.length && !pub.length) grid.innerHTML = `<div class="rgp-note">${esc(t.empty)}</div>`;
    for (const img of localList) {
      const url = URL.createObjectURL(img.blob); objectUrls.push(url);
      const el = document.createElement('div'); el.className = 'rgp-item'; el.dataset.id = img.id;
      el.innerHTML = `<img src="${url}" alt=""><div class="rgp-meta">
        <button type="button" class="rgp-vis ${img.visibility === 'public' ? 'on' : ''}" data-act="vis">${img.visibility === 'public' ? t.public : t.private}</button>
        <button type="button" data-act="up">${t.up}</button><button type="button" data-act="down">${t.down}</button>
        <button type="button" data-act="del">${t.delete}</button></div>`;
      grid.appendChild(el);
    }
    for (const f of pub) {
      const el = document.createElement('div'); el.className = 'rgp-item';
      el.innerHTML = `<span class="rgp-badge">${esc(t.publicBadge)}</span><img src="${base}art/gallery/${encodeURIComponent(roomId)}/${encodeURIComponent(f.file)}" alt="" loading="lazy"><div class="rgp-meta">${esc(f.note || '')}</div>`;
      grid.appendChild(el);
    }
    if (idbOK) {
      const usage = await DB.scopeUsageAndCheck(scopeKey(sc, chatId), 0, DEFAULT_QUOTA_BYTES);
      if (!usage.ok) { warn.style.display = ''; warn.textContent = t.quotaFull.replace('{used}', fmtBytes(usage.usedBytes)).replace('{quota}', fmtBytes(usage.quota)); }
      else warn.style.display = 'none';
    }
  }

  panelEl.querySelector('.rgp-x').addEventListener('click', closeRoomGalleryPanel);
  panelEl.addEventListener('click', (e) => { if (e.target === panelEl) closeRoomGalleryPanel(); });
  panelEl.querySelectorAll('input[name="rgp-scope"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { setScope(r.value); refresh(); } }));

  const fileIn = panelEl.querySelector('.rgp-file');
  if (fileIn) fileIn.addEventListener('change', async () => {
    const files = Array.from(fileIn.files || []); fileIn.value = '';
    const sc = currentScope();
    let existing = []; try { existing = await DB.listImages(scopeKey(sc, chatId), roomId); } catch (e) { }
    let order = existing.length;
    for (const f of files) {
      try {
        const { blob, w, h } = await DB.resizeToWebp(f, MAX_DIM, WEBP_QUALITY);
        const meta = makeImageMeta({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 7), roomId, order: order++, visibility: 'private', w, h, bytes: blob.size });
        await DB.putImage(scopeKey(sc, chatId), meta, blob);
      } catch (err) { console.warn('[room-gallery] 上传失败', err); }
    }
    await refresh();
  });

  grid.addEventListener('click', async (e) => {
    const item = e.target.closest('.rgp-item'); if (!item || !item.dataset.id) return;
    const act = e.target.closest('button')?.dataset.act; if (!act) return;
    const sc = currentScope(), key = scopeKey(sc, chatId), id = item.dataset.id;
    if (act === 'del') { await DB.deleteImage(key, roomId, id); await refresh(); return; }
    if (act === 'vis') {
      const list = await DB.listImages(key, roomId); const cur = list.find((x) => x.id === id);
      await DB.updateMeta(key, roomId, id, { visibility: cur?.visibility === 'public' ? 'private' : 'public' }); await refresh(); return;
    }
    if (act === 'up' || act === 'down') {
      const list = await DB.listImages(key, roomId);
      const idx = list.findIndex((x) => x.id === id); const to = act === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= list.length) return;
      const next = reorder(list, id, to);
      await DB.reorderImages(key, roomId, next.map((x) => x.id)); await refresh(); return;
    }
  });

  panelEl.querySelector('.rgp-export').addEventListener('click', async () => {
    const sc = currentScope(), key = scopeKey(sc, chatId);
    let list = []; if (idbOK) { try { list = await DB.listImages(key, roomId); } catch (e) { } }
    const { manifest, files, count } = buildExportManifest({ roomId, images: list });
    if (!count) { alert(t.exportNone); return; }
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    downloadBlob(manifestBlob, `${roomId}_manifest.json`);
    for (let i = 0; i < files.length; i++) {
      const rec = list.find((x) => x.id === files[i].id);
      if (rec) setTimeout(() => downloadBlob(rec.blob, files[i].file), i * 250);
    }
    window.open(buildIssueUrl({ repo: REPO, roomId, count }), '_blank', 'noopener');
  });

  document.addEventListener('keydown', escClose, true);
  panelEl.__refresh = refresh;
  await refresh();
  const api = { refresh };
  return api;
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'); const u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
function escClose(e) { if (e.key === 'Escape') closeRoomGalleryPanel(); }
export function closeRoomGalleryPanel() {
  if (!panelEl) return; panelEl.remove(); panelEl = null;
  document.removeEventListener('keydown', escClose, true);
}
