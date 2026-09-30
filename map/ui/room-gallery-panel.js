// 房间图集 UI：自定义显示名 / 简介（本机、纯展示层，不改房间 id 与卡名）+ 图集面板（上传 / 缩放存 IndexedDB / 增删排序 / 自用-公开 / 导出投稿包）。
// 纯逻辑（尺寸、配额、导出结构）在 map/core/room-gallery-logic.mjs；IndexedDB 读写在 map/core/room-gallery-db.mjs；这里只管 DOM。
import {
  MAX_DIM, WEBP_QUALITY, DEFAULT_QUOTA_BYTES, scopeKey, makeImageMeta, reorder, buildExportManifest, buildIssueUrl,
  safeGalleryImagePath, readMaintainerMode, MAINTAINER_MODE_KEY,
} from '../core/room-gallery-logic.mjs';
import * as DB from '../core/room-gallery-db.mjs';
import { currentId as currentPackId, load as loadPack } from '../core/pack.mjs';
import { available as baibaiInstalled } from '../tavern/baibai.mjs';   // 柏宝绘桥（可选依赖）：装了才显示「配图」入口

const REPO = 'kcgoofee-jpg/my-tavern-experiments';   // 导出投稿的 GitHub issue 仓库；换卡/换仓库时改这里
const CUSTOM_KEY = 'edenRoomCustomV1';
const SCOPE_KEY = 'edenGalleryScope';

// 「维护者模式」：本机 localStorage 开关，默认关闭。只有仓库所有者自己在 设置→高级 打开它，才会看到「投稿到公开图集」「导出」这些 UI。
// 这不是身份验证——客户端脚本没法安全鉴权任何人，真正把关的是 GitHub：只有仓库所有者能提交 map/data/gallery.json，查看器
// 只显示那份清单里、且落在 map/art/gallery/ 目录下的图（见 safeGalleryImagePath）。普通用户看不到这个开关，对他们来说
// 「公开」这个概念根本不存在：他们的图永远只在本机、只在私有作用域里。
export function isMaintainerMode() { try { return readMaintainerMode(localStorage); } catch (e) { return false; } }
export function setMaintainerMode(on) { try { localStorage.setItem(MAINTAINER_MODE_KEY, on ? '1' : '0'); } catch (e) { /* 存不下就算了 */ } }

const STR = {
  zh: {
    renamePh: '自定义名称…', restore: '恢复原名', introPh: '自定义简介（只在本机显示）…', openGallery: '图集 ›', illust: '配图 ›',
    title: '房间图集', close: '关闭', upload: '上传图片',
    scopeChat: '仅本聊天', scopeGlobal: '全部聊天共用',
    scopeChatHint: '仅本聊天 = 只在这个聊天里看得到', scopeGlobalHint: '全部聊天共用 = 你的所有聊天都能看到，但仍然只存在这台设备上',
    scope: '存放范围', empty: '还没有图片。上传的图会缩到 ≤1600px 存在本机浏览器里。', delete: '删除', up: '上移', down: '下移',
    visLabel: '可见性', visSelf: '仅自己', visSubmit: '投稿到公开图集',
    visSelfHint: '仅自己：只留在这个浏览器里，别人永远看不到。',
    visSubmitHint: '投稿：只是打上「想公开」的标记，不会自动上传任何东西；是否收录由仓库所有者决定。',
    exportBtn: '导出投稿包', exportNone: '还没有标「投稿」的图片，先切几张。',
    exportNote: '不会自动上传：导出的是 manifest.json + 图片文件，仓库所有者收到后手动合并进仓库。', openIssue: '打开投稿 issue',
    noIdb: 'IndexedDB 不可用（隐私浏览模式或浏览器限制），上传/保存已关闭；下面仍可以看仓库公开的图。',
    quotaFull: '本机存储快满了（作用域已用 {used}，上限 {quota}），继续上传前建议先删几张。',
    publicBadge: '公开（仓库）', dragHint: '拖拽排序，或用上下按钮',
    maintainerOnlyNote: '「投稿到公开图集」「导出」只在设置→高级 打开「维护者模式」后才显示，普通用户看不到、也用不上——你的图永远只在本机。',
  },
  en: {
    renamePh: 'Custom name…', restore: 'Restore original', introPh: 'Custom note (shown on this device only)…', openGallery: 'Gallery ›', illust: 'Illustrate ›',
    title: 'Room gallery', close: 'Close', upload: 'Upload images',
    scopeChat: 'This chat only', scopeGlobal: 'Shared across chats',
    scopeChatHint: 'This chat only = visible only inside this one chat', scopeGlobalHint: 'Shared across chats = visible from all your chats, but still only on this device',
    scope: 'Storage scope', empty: 'No images yet. Uploads are resized to ≤1600px and kept in this browser.', delete: 'Delete', up: 'Up', down: 'Down',
    visLabel: 'Visibility', visSelf: 'Only me', visSubmit: 'Submit to public gallery',
    visSelfHint: 'Only me: stays only in this browser; nobody else can ever see it.',
    visSubmitHint: 'Submit: only marks it as a candidate for the public gallery — nothing is uploaded automatically; the repo owner decides.',
    exportBtn: 'Export submission package', exportNone: 'No images marked "submit" yet — toggle some first.',
    exportNote: "Nothing uploads automatically: this downloads manifest.json + the image files; the repo owner merges approved ones into the repo.", openIssue: 'Open submission issue',
    noIdb: 'IndexedDB is unavailable (private browsing or a browser limit) — upload/save is disabled; the repo\'s public images still show below.',
    quotaFull: 'Local storage for this scope is nearly full ({used} used, {quota} limit) — consider deleting a few before uploading more.',
    publicBadge: 'Public (repo)', dragHint: 'Drag to reorder, or use the up/down buttons',
    maintainerOnlyNote: '"Submit to public gallery" and export only appear after turning on "Maintainer mode" in Settings → Advanced — ordinary users never see or need it; your images stay local only.',
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
.rgc-restore,.rgc-open,.ilp-open{all:unset;cursor:pointer;padding:4px 8px;border-radius:4px;background:rgba(255,255,255,.08);font-size:12px;white-space:nowrap}
.rgc-restore:hover,.rgc-open:hover,.ilp-open:hover{background:rgba(255,255,255,.18)}
.ilp-open{align-self:flex-start;margin-top:2px;background:rgba(120,190,255,.14)}
.ilp-open:hover{background:rgba(120,190,255,.28)}
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
    ${baibaiInstalled() ? `<button type="button" class="ilp-open" data-room="${esc(roomId)}">${t.illust}</button>` : ''}
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
    const ilp = e.target.closest('.ilp-open');
    if (ilp) {
      // 动态载入配图面板：它要用本文件的 currentScope / 图集库，静态互相 import 会成环
      const lang = container.dataset.lang || 'zh';
      import('./illust-panel.js')
        .then((m) => m.openIllustPanel(ilp.dataset.room, { lang, base }))
        .catch((err) => console.warn('[illust] 配图面板加载失败', err));
      return;
    }
  });
}

// ---------------- 图集面板 ----------------
let panelEl = null;
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

let galleryJsonCache = null;
async function fetchPublicGallery(base) {   // 公开图集清单的路径取自包清单 data.gallery（没声明 = 没有公开图，静默）
  if (galleryJsonCache) return galleryJsonCache;
  galleryJsonCache = { rooms: {} };
  try {
    const R = await loadPack(currentPackId(window), { fetchJSON: (u) => fetch(base + u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))) });
    if (R.data.gallery) galleryJsonCache = await fetch(base + R.data.gallery).then((r) => r.ok ? r.json() : { rooms: {} });
  } catch (e) { galleryJsonCache = { rooms: {} }; }
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
.rgp-scope{display:flex;flex-direction:column;gap:2px;margin:6px 0 10px;font-size:12px;color:#cabfa8}
.rgp-scope>div:first-child{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rgp-scope-hint{font-size:11px;color:#8d8267}
.rgp-warn{background:#4a2f16;border:1px solid #a86a2a;color:#f0d9b0;padding:6px 10px;border-radius:4px;font-size:12px;margin-bottom:8px}
.rgp-noidb{background:#3a2020;border:1px solid #a04040;color:#f0c0c0;padding:8px 10px;border-radius:4px;font-size:12px;margin-bottom:10px}
.rgp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin:10px 0}
.rgp-item{position:relative;border:1px solid #332e26;border-radius:6px;overflow:hidden;background:#1c1912}
.rgp-item img{width:100%;height:90px;object-fit:cover;display:block}
.rgp-item .rgp-meta{padding:4px 6px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.rgp-item button{all:unset;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:3px;background:rgba(255,255,255,.08)}
.rgp-item button:hover{background:rgba(255,255,255,.18)}
.rgp-item .rgp-badge{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);padding:1px 6px;border-radius:3px;font-size:10px}
.rgp-vis-row{display:flex;align-items:center;gap:4px;padding:4px 6px 0;font-size:11px}
.rgp-vis-label{color:#a89b82;white-space:nowrap}
.rgp-seg{display:flex;border:1px solid #3a352c;border-radius:4px;overflow:hidden}
.rgp-seg-btn{all:unset;cursor:pointer;padding:2px 6px;font-size:11px}
.rgp-seg-btn.on{background:var(--gold,#e6c36a);color:#241d0f}
.rgp-seg-btn:not(.on):hover{background:rgba(255,255,255,.1)}
.rgp-vis-hint{padding:2px 6px 0;font-size:10px;color:#8d8267;line-height:1.3}
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
  const maintainer = isMaintainerMode();   // 「投稿」「导出」只在维护者模式下出现；普通用户完全看不到公开相关 UI（见文件顶部说明）

  panelEl = document.createElement('div'); panelEl.className = 'rgp'; panelEl.setAttribute('role', 'dialog'); panelEl.setAttribute('aria-modal', 'true');
  panelEl.innerHTML = `<div class="rgp-box">
    <div class="rgp-hd"><h3>${esc(t.title)} · ${esc(roomId)}</h3><button type="button" class="rgp-x">${esc(t.close)}</button></div>
    ${idbOK ? '' : `<div class="rgp-noidb">${esc(t.noIdb)}</div>`}
    ${idbOK ? `<div class="rgp-scope">
      <div><span>${esc(t.scope)}</span>
        <label><input type="radio" name="rgp-scope" value="chat" ${scope === 'chat' ? 'checked' : ''} ${chatId ? '' : 'disabled'}> ${esc(t.scopeChat)}</label>
        <label><input type="radio" name="rgp-scope" value="global" ${scope === 'global' ? 'checked' : ''}> ${esc(t.scopeGlobal)}</label>
      </div>
      <div class="rgp-scope-hint">${esc(t.scopeChatHint)} · ${esc(t.scopeGlobalHint)}</div>
    </div>` : ''}
    <div class="rgp-warn" style="display:none"></div>
    ${idbOK ? `<label class="rgp-upload-btn">${esc(t.upload)} <input type="file" accept="image/*" multiple style="display:none" class="rgp-file"></label>` : ''}
    <div class="rgp-grid"></div>
    <div class="rgp-foot">
      ${maintainer ? `<button type="button" class="rgp-export">${esc(t.exportBtn)}</button><div class="rgp-note">${esc(t.exportNote)}</div>` : `<div class="rgp-note">${esc(t.maintainerOnlyNote)}</div>`}
    </div>
  </div>`;
  document.body.appendChild(panelEl);

  const grid = panelEl.querySelector('.rgp-grid');
  const warn = panelEl.querySelector('.rgp-warn');
  let objectUrls = [];   // 当前网格里正在用的 objectURL——下一次 refresh() 成功写完新网格后才整批 revoke 旧的，
                          // 不在函数开头提前 revoke：避免旧网格的 <img> 还没被替换掉时 src 先失效，出现「破图标」。
  let refreshSeq = 0;   // 并发 refresh() 保护：上传 / 删除等操作可能在「打开面板时的第一次 refresh」还没跑完（等公开清单 fetch）时就再触发一次 refresh，
                         // 旧的那次后完成会用过期数据把新数据覆盖掉——只让最后发起的那次真正写 DOM、revoke 上一批 URL。

  async function refresh() {
    const seq = ++refreshSeq;
    const sc = currentScope();
    const scopeK = scopeKey(sc, chatId);   // 读写用同一把 key（chatId 相同则 chat 作用域必然一致，避免「上传时的 chatId」与「显示时的 chatId」不一致导致 key 对不上）
    let localList = [];
    if (idbOK) { try { localList = await DB.listImages(scopeK, roomId); } catch (e) { console.warn('[room-gallery] 读取本机图片失败', e); localList = []; } }
    const pubRaw = (await fetchPublicGallery(base))?.rooms?.[roomId]?.images || [];
    // 守卫：公开图只认 gallery.json 里落在 map/art/gallery/<roomId>/ 下、文件名合法的条目；不显示任何别的来源（见 safeGalleryImagePath）
    const pub = pubRaw.map((f) => ({ ...f, _src: safeGalleryImagePath(roomId, f?.file) })).filter((f) => f._src);
    if (seq !== refreshSeq) return;   // 已经有更新的 refresh() 发起过了，这次的结果作废，也不 revoke（旧结果没写过 DOM）

    const newUrls = [];
    const frag = document.createDocumentFragment();
    if (!localList.length && !pub.length) {
      const empty = document.createElement('div'); empty.className = 'rgp-note'; empty.textContent = t.empty; frag.appendChild(empty);
    }
    for (const img of localList) {
      const url = URL.createObjectURL(img.blob); newUrls.push(url);
      const el = document.createElement('div'); el.className = 'rgp-item'; el.dataset.id = img.id;
      const isSubmit = img.visibility === 'public';
      el.innerHTML = `<img src="${url}" alt="">
        <div class="rgp-vis-row">
          <span class="rgp-vis-label">${esc(t.visLabel)}：</span>
          <div class="rgp-seg" role="group">
            <button type="button" class="rgp-seg-btn ${isSubmit ? '' : 'on'}" data-act="vis-self" ${maintainer ? '' : 'data-hide-if-not-maintainer'}>${esc(t.visSelf)}</button>
            ${maintainer ? `<button type="button" class="rgp-seg-btn ${isSubmit ? 'on' : ''}" data-act="vis-submit">${esc(t.visSubmit)}</button>` : ''}
          </div>
        </div>
        <div class="rgp-vis-hint">${esc(isSubmit ? t.visSubmitHint : t.visSelfHint)}</div>
        <div class="rgp-meta">
          <button type="button" data-act="up">${t.up}</button><button type="button" data-act="down">${t.down}</button>
          <button type="button" data-act="del">${t.delete}</button>
        </div>`;
      frag.appendChild(el);
    }
    for (const f of pub) {
      const el = document.createElement('div'); el.className = 'rgp-item';
      el.innerHTML = `<span class="rgp-badge">${esc(t.publicBadge)}</span><img src="${base}${f._src}" alt="" loading="lazy"><div class="rgp-meta">${esc(f.note || '')}</div>`;
      frag.appendChild(el);
    }
    grid.innerHTML = '';
    grid.appendChild(frag);
    const oldUrls = objectUrls; objectUrls = newUrls;
    oldUrls.forEach((u) => URL.revokeObjectURL(u));   // 新网格已经接管 DOM，旧 URL 不再被任何 <img> 引用，这时候 revoke 才安全
    if (idbOK) {
      const usage = await DB.scopeUsageAndCheck(scopeK, 0, DEFAULT_QUOTA_BYTES);
      if (seq !== refreshSeq) return;
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
    const sc = currentScope(), scopeK = scopeKey(sc, chatId);
    let existing = []; try { existing = await DB.listImages(scopeK, roomId); } catch (e) { }
    let order = existing.length;
    for (const f of files) {
      try {
        const { blob, w, h } = await DB.resizeToWebp(f, MAX_DIM, WEBP_QUALITY);
        const meta = makeImageMeta({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 7), roomId, order: order++, visibility: 'private', w, h, bytes: blob.size });
        await DB.putImage(scopeK, meta, blob);
      } catch (err) { console.warn('[room-gallery] 上传失败', err); }
    }
    await refresh();
  });

  grid.addEventListener('click', async (e) => {
    const item = e.target.closest('.rgp-item'); if (!item || !item.dataset.id) return;
    const act = e.target.closest('button')?.dataset.act; if (!act) return;
    const sc = currentScope(), key = scopeKey(sc, chatId), id = item.dataset.id;
    if (act === 'del') { await DB.deleteImage(key, roomId, id); await refresh(); return; }
    if (act === 'vis-self' || act === 'vis-submit') {
      await DB.updateMeta(key, roomId, id, { visibility: act === 'vis-submit' ? 'public' : 'private' }); await refresh(); return;
    }
    if (act === 'up' || act === 'down') {
      const list = await DB.listImages(key, roomId);
      const idx = list.findIndex((x) => x.id === id); const to = act === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= list.length) return;
      const next = reorder(list, id, to);
      await DB.reorderImages(key, roomId, next.map((x) => x.id)); await refresh(); return;
    }
  });

  panelEl.querySelector('.rgp-export')?.addEventListener('click', async () => {
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
