// 一张卡多个聊天时每个聊天自己的地图数据：重置本聊天、清理已删聊天留下的孤儿（CHAT-ISO，I-33）。
// 每聊天的数据在四处：聊天变量（eden_map）、本机存储行（edenMap:chat:<id>:* / edenMapSeen:<id>）、房间图集 / 见闻录图片（IndexedDB 作用域 chat:<id>）、
// 每聊天自定义世界书（名字由聊天 id 哈希得出；只动带我们条目名的书）。只碰这四处——不碰卡的 stat_data、不碰用户自己的世界书。
// 纯判定（orphanBooks / orphanLocal / orphanScopes）在这里导出，node 单测 tests/chat_data.test.mjs；副作用走 createChatData(host, io)。
import { fnOk, thFn } from './host-tavernhelper.mjs';

/** 我们的每聊天世界书里，聊天已经不在了的书名（书名 = 前缀 + 6 位十六进制；前缀没配 = 没有这类书） */
export function orphanBooks(names, wbName, liveIds) {
  const probe = wbName('x'); if (!probe) return [];
  const pre = probe.slice(0, -6), keep = new Set([...liveIds].map(wbName));
  return (Array.isArray(names) ? names : []).filter(n => typeof n === 'string' && n.startsWith(pre) && /^[0-9a-f]{6}$/.test(n.slice(pre.length)) && !keep.has(n));
}
/** 本机存储里聊天已不在的 id（当前聊天与单独打开查看器用的 local 伪聊天不算） */
export const orphanLocal = (ids, liveIds, cur) => ids.filter(id => id && id !== cur && id !== 'local' && !liveIds.has(id));
/** 图集作用域 chat:<id> 里聊天已不在的（global 与当前聊天不算） */
export const orphanScopes = (scopes, liveIds, cur) => scopes.filter(s => typeof s === 'string' && s.startsWith('chat:') && s.slice(5) !== cur && s.slice(5) !== 'local' && !liveIds.has(s.slice(5)));

export function createChatData(host, io) {
  const { chatId, life } = host, thf = n => thFn(n);
  const R = () => host.mvuReaders, arr = a => (Array.isArray(a) ? a : []);
  let busy = false;
  const budget = () => import(new URL('storage-budget.mjs', import.meta.url).href).catch(() => null);
  const galleryDb = () => import(new URL('../core/room-gallery-db.mjs', import.meta.url).href).catch(() => null);
  const wbSync = () => import(new URL('worldbook-sync.mjs', import.meta.url).href).catch(() => null);
  /** 把书从我们所在的每一处绑定里摘掉（聊天槽 / 角色附加书 / 全局）；别的书原样保留 */
  async function unbind(name) {
    const W = await wbSync(); if (!W?.bindingOf) return;
    const b = await W.bindingOf(thf, name);
    if (b.chat && fnOk('rebindChatWorldbook')) await rebindChatWorldbook('current', '');
    if (b.char && fnOk('rebindCharWorldbooks')) { const c = await getCharWorldbookNames('current'); await rebindCharWorldbooks('current', { primary: c.primary === name ? null : c.primary, additional: arr(c.additional).filter(n => n !== name) }); }
    if (b.global && fnOk('rebindGlobalWorldbooks')) await rebindGlobalWorldbooks(arr(await getGlobalWorldbookNames()).filter(n => n !== name));
  }
  /** 删一本每聊天自定义书；书里没有我们的条目名 = 不是我们的书，一概不动 */
  async function dropBook(name) {
    if (!name || !fnOk('getWorldbook') || !fnOk('deleteWorldbook')) return false;
    try {
      const es = await getWorldbook(name); if (!arr(es).some(e => e?.name === R().WB_ENTRY)) return false;
      await unbind(name);
      return !!(await deleteWorldbook(name));
    } catch (e) { console.warn('[eden-map] 删每聊天世界书失败', name, e); return false; }
  }
  async function removeRecord() {   // 聊天变量里只摘 eden_map 一个键（整块替换，深合并删不掉键）；stat_data 等别的键原样
    const k = R().VAR_ROOT;
    if (fnOk('updateVariablesWith')) await updateVariablesWith(v => { delete v[k]; return v; }, { type: 'chat' });
    else if (fnOk('replaceVariables')) { const all = { ...(getVariables({ type: 'chat' }) || {}) }; delete all[k]; await replaceVariables(all, { type: 'chat' }); }
  }
  /** 「重置本聊天地图数据」：清掉当前聊天的 eden_map、本机行、图集 / 见闻录图片、自定义世界书，然后按聊天楼层从零重算 */
  async function reset() {
    const chat = chatId(), out = { ok: false, images: 0, book: false };
    if (busy || life.dead || !chat || !R()) return out;
    busy = true;
    try {
      host.custom = null;   // 先把内存里的自定义放掉：重置期间飞来的保存不再把旧数据写回去
      if (io.varsOk()) await removeRecord();
      const SB = await budget(); if (SB) SB.dropChat(io.store(), chat);
      try { (io.ls() || localStorage).removeItem('edenMap:chat:' + chat + ':custom2'); } catch (e) { console.warn('[eden-map] reset: local row', e); }
      const G = await galleryDb(); if (G?.indexedDBAvailable()) { try { out.images = await G.deleteScope('chat:' + chat); } catch (e) { console.warn('[eden-map] reset: gallery', e); } }
      out.book = await dropBook(R().wbName(chat));
      io.clearWb();
      console.info('[eden-map] 重置本聊天地图数据：', chat, out.images, '张图', out.book ? '+ 世界书' : '');
      if (chatId() === chat) host.onChatSwitch();   // 与换聊天同一条路径：空记录读回来 → 按楼层重算
      out.ok = true;
    } catch (e) { console.warn('[eden-map] 重置本聊天地图数据失败', e); }
    finally { busy = false; }
    host.post({ type: 'eden-map:chat-reset-result', ok: out.ok, images: out.images, book: out.book });
    return out;
  }
  /** 启动空闲时：丢掉聊天已被删除的本机行 / 图集图片 / 每聊天世界书。宿主读不到聊天列表 = 什么都不做 */
  async function orphanSweep() {
    if (life.dead || !R()) return null;
    const live = await host.mvuBridge.listChatIds(); if (!live) return null;
    const cur = chatId(), res = { local: [], scopes: [], books: [] };
    const SB = await budget(), st = io.store();
    if (SB && st) for (const id of orphanLocal(SB.chatsByAge(st, cur), live, cur)) { SB.dropChat(st, id); res.local.push(id); }
    const G = await galleryDb();
    if (G?.indexedDBAvailable()) { try { for (const s of orphanScopes(await G.listScopes(), live, cur)) { await G.deleteScope(s); res.scopes.push(s); } } catch (e) { console.warn('[eden-map] orphan: gallery', e); } }
    if (fnOk('getWorldbookNames')) { try { for (const n of orphanBooks(await getWorldbookNames(), R().wbName, live)) if (await dropBook(n)) res.books.push(n); } catch (e) { console.warn('[eden-map] orphan: books', e); } }
    if (res.local.length || res.scopes.length || res.books.length) console.info('[eden-map] 清理已删除聊天留下的地图数据：本机', res.local.length, '个聊天，图集', res.scopes.length, '个，世界书', res.books.length, '本');
    return res;
  }
  return { reset, orphanSweep, dropBook };
}
