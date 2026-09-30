// 空间化图文见闻录 · 查看器侧（Part 5-5，2026-09-30）：把这一局里攒下的图与手记钉在地标上——
// 点开这个地标，除了卡里的原文，还能翻出「我上次在这里留下过什么」。
// 存储按规矩分两处：字节进图集的 IndexedDB（core/room-gallery-db.mjs，roomId = 'sb:' + 地点，与房间图集互不串台），
// 索引（谁钉在哪、第几楼、说明）进本机存储（按聊天分，键 = edenMap:chat:<聊天 id>:scrap，见 core/storage.mjs）。
// 插件模式与 inv.mjs 一致（app/plugins.mjs 的 P.TCScrap；没加载时调用处带守卫）。
// 索引的全部规则（钉 / 摘 / 翻 / 统计）在纯核心 map/core/scrapbook.mjs，node 单测 tests/scrapbook.test.mjs。
import * as SB from './core/scrapbook.mjs';
import * as TCStore from './core/storage.mjs';
import { chatId } from './app/extapi.mjs';
import { esc } from './app/util.mjs';
import { register } from './app/plugins.mjs';

const TCScrap = (() => {
  const T = (k, zh) => window.I18N.tx(k, zh);   // 共享 i18n 服务（viewer.html window.I18N）
  let db = null, meta = SB.norm(null), openPlace = '';

  const key = () => 'edenMap:chat:' + (chatId() || '') + ':scrap';   // 按聊天分（没有聊天 id = 全局那一份）
  const load = () => { try { meta = SB.norm(JSON.parse(TCStore.get(key()) || 'null')); } catch (e) { meta = SB.norm(null); } return meta; };
  const save = () => { try { TCStore.set(key(), JSON.stringify(SB.norm(meta))); } catch (e) {} };
  const gallery = () => (db ??= import('./core/room-gallery-db.mjs').catch(() => null));
  const scope = () => (chatId() ? 'chat:' + chatId() : 'global');

  /** 钉一张图（File / Blob）：缩图转 webp → 图集 → 索引。返回 { ok, reason? } */
  async function pinImage(place, file) {
    const g = await gallery(); if (!g) return { ok: false, reason: 'nodb' };
    const { blob, w, h } = await g.resizeToWebp(file, 1600, .82);
    if (!blob || blob.size > SB.IMAGE_MAX_BYTES) return { ok: false, reason: 'big' };
    const q = await g.scopeUsageAndCheck(scope(), blob.size);
    if (!q.ok) return { ok: false, reason: 'quota' };
    const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await g.putImage(scope(), { roomId: SB.roomIdOf(place), id, order: Date.now(), visibility: 'private', w, h, bytes: blob.size, note: '', createdAt: Date.now() }, blob);
    const r = SB.pin(meta, { place, kind: 'image', ref: id, w, h, bytes: blob.size, map: '', at: 0 });
    if (!r.ok) { try { await g.deleteImage(scope(), SB.roomIdOf(place), id); } catch (e) {} return { ok: false, reason: r.reason }; }
    meta = { items: r.items }; save();
    return { ok: true, id: r.id };
  }
  /** 钉一条手记：{ place, text } */
  function pinNote(place, text) {
    const r = SB.pin(meta, { place, kind: 'note', text });
    if (r.ok) { meta = { items: r.items }; save(); }
    return r;
  }
  /** 摘掉一条：索引先删，字节（图）跟着删 */
  async function unpin(id) {
    const r = SB.unpin(meta, id);
    if (!r.ok) return r;
    meta = { items: r.items }; save();
    if (r.row?.kind === 'image') { const g = await gallery(); try { await g.deleteImage(scope(), SB.roomIdOf(r.row.place), r.row.ref); } catch (e) {} }
    return r;
  }
  /** 某地点的图：从图集里取字节 → objectURL（关卡片时调用方不用管：这些 URL 只在本次列表里用） */
  async function imagesOf(place) {
    const g = await gallery(); if (!g) return [];
    const rows = SB.byPlace(meta, place).filter(r => r.kind === 'image');
    let list = [];
    try { list = await g.listImages(scope(), SB.roomIdOf(place)); } catch (e) {}
    const byId = new Map(list.map(r => [r.id, r]));
    const out = [];
    for (const r of rows) { const img = byId.get(r.ref); if (!img?.blob) continue;
      out.push({ ...r, url: URL.createObjectURL(img.blob) }); }
    return out;
  }

  /** 地点卡装饰（markers.mjs 在 TCInv.decorate 之后调） */
  function decorate(el, title) {
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const ex = c.querySelector('.extra'); if (!ex) return;
    const place = String(title || el?.dataset?.name || '').trim();
    if (!place) return;
    load();
    ex.querySelectorAll('.cu-sb').forEach(n => n.remove());
    const box = document.createElement('div'); box.className = 'cu-sb';
    const cnt = SB.countOf(meta, place);
    const notes = SB.byPlace(meta, place).filter(r => r.kind === 'note');
    box.innerHTML = `<p class="sb-h"><b>${esc(T('sb.title', '见闻录'))}</b> <small>${esc(String(cnt.images))} ${esc(T('sb.imgs', '图'))} · ${esc(String(cnt.notes))} ${esc(T('sb.notes', '手记'))}</small>`
      + `<span class="sb-acts"><button type="button" class="sb-pin" data-act="image">${esc(T('sb.pin_img', '钉一张图'))}</button>`
      + `<button type="button" class="sb-note" data-act="note">${esc(T('sb.pin_note', '写手记'))}</button></span></p><div class="sb-list"></div>`;
    const list = box.querySelector('.sb-list');
    imagesOf(place).then(imgs => {
      for (const im of imgs) {
        const f = document.createElement('figure');
        f.innerHTML = `<img alt="" src="${esc(im.url)}"><figcaption>${esc(im.text || '')}</figcaption><button type="button" class="sb-del" data-id="${esc(im.id)}" aria-label="${esc(T('sb.del', '摘掉'))}">×</button>`;
        list.appendChild(f);
      }
      if (!imgs.length && !notes.length) list.innerHTML = `<p class="sb-empty">${esc(T('sb.empty', '这里还什么都没留下——把插画粘过来（Ctrl+V）或点「钉一张图」。'))}</p>`;
    }).catch(() => {});
    for (const n of notes) {
      const p = document.createElement('p'); p.className = 'sb-note-row';
      p.innerHTML = `<span>${esc(n.text || '')}</span><button type="button" class="sb-del" data-id="${esc(n.id)}" aria-label="${esc(T('sb.del', '摘掉'))}">×</button>`;
      list.appendChild(p);
    }
    box.addEventListener('click', async e => {
      const del = e.target.closest?.('[data-id]');
      if (del) { await unpin(del.dataset.id); render(place); return; }
      const act = e.target.closest?.('[data-act]'); if (!act) return;
      if (act.dataset.act === 'image') { const inp = box.querySelector('.sb-file') || (() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.className = 'sb-file'; i.hidden = true; box.appendChild(i); i.addEventListener('change', async () => { const f = i.files?.[0]; i.value = ''; if (f) { const r = await pinImage(place, f); if (!r.ok) toast(r.reason); } render(place); }); return i; })(); inp.click(); }
      if (act.dataset.act === 'note') { const t = window.prompt(T('sb.note_ask', '写点什么钉在这里（≤500 字）'), ''); if (t && t.trim()) pinNote(place, t); render(place); }
    });
    ex.appendChild(box);
    openPlace = place;
  }
  function render(place) { const c = document.getElementById('card'); if (c && !c.hidden) decorate(null, place || openPlace); }
  const toast = why => { try { window.TCNotify?.toast?.(T('sb.fail', '没钉上：{w}', { w: why || '' })); } catch (e) {} };

  // 粘贴：卡片开着就把剪贴板里的图钉到当前地点（生图插件的图多数是直接复制出来的）
  if (typeof window !== 'undefined') window.addEventListener('paste', async e => {
    try {
      const place = openPlace; if (!place) return;
      const c = document.getElementById('card'); if (!c || c.hidden) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      for (const it of e.clipboardData?.items || []) {
        if (it.kind !== 'file' || !/^image\//.test(it.type || '')) continue;
        const f = it.getAsFile(); if (!f) continue;
        e.preventDefault();
        const r = await pinImage(place, f); if (!r.ok) toast(r.reason);
        render(place);
        break;
      }
    } catch (err) {}
  });

  return {
    decorate, pinImage, pinNote, unpin, imagesOf, load,
    get rows() { return SB.byPlace(meta, ''); },   // 空地点 = 全册子（调试 / 探针用）
    count: place => SB.countOf(meta, place),
    digest: () => SB.digest(meta),
    describe: () => SB.describe(meta),
  };
})();
register('TCScrap', TCScrap);
