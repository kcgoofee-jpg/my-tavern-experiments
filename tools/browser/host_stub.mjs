// 模拟酒馆宿主页 + 桩出来的酒馆助手全局函数（Mvu、getChatMessages、injectPrompts……），在里面加载卡内脚本 map/tavern/eden-map.js。
// 用法（给其他脚本 import）：const H = await openHost(P, { here, stat, msgs }); await H.open(); const vf = await H.viewer();
//   here：MVU「世界.当前地点」；stat：额外的 stat_data 字段（例如在场人物）；msgs：[{ message_id, message }] 聊天原文（助手楼）
//   H.injected() 取最后一次 injectPrompts 的内容；H.setMsgs(msgs) 换聊天原文并触发 MESSAGE_RECEIVED
// 桩数据放在宿主页的 window.__stub（addInitScript 注入，中文不经过 srcdoc，WebKit 不会按 Latin-1 解错）；卡片 iframe 的桩脚本读 parent.__stub。
import * as B from './lib.mjs';

const STUB = `<script>
  var S = parent.__stub, H = {};
  window.Mvu = { getMvuData: function () { var st = Object.assign({}, S.stat || {}); st.世界 = Object.assign({ 当前地点: S.here }, (S.stat || {}).世界 || {}); return { stat_data: st }; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  // v0.9.3：酒馆助手聊天变量与世界书接口（S.noVars = true 时不提供，测退回本机存储）；写入记在 parent.__vars / parent.__wb
  if (!S.noVars) {
    parent.__vars = parent.__vars || JSON.parse(JSON.stringify(S.vars || {}));
    window.getVariables = function (o) { return o && o.type === 'chat' ? JSON.parse(JSON.stringify(parent.__vars)) : {}; };
    window.updateVariablesWith = async function (f, o) { if (o && o.type === 'chat') parent.__vars = f(JSON.parse(JSON.stringify(parent.__vars))); return parent.__vars; };
    window.createOrReplaceWorldbook = async function (n, e) { (parent.__wb = parent.__wb || {})[n] = e; return true; };
    window.getChatWorldbookName = function () { return parent.__chatWb || null; };
    window.rebindChatWorldbook = async function (c, n) { parent.__chatWb = n; };
  }
  window._ = { get: function (o, p, d) { var v = p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); return v == null ? d : v; } };
  window.SillyTavern = { getContext: function () { return { name1: 'Player', chatId: S.chat || 'stub' }; } };
  window.tavern_events = { CHAT_CHANGED: 'c', MESSAGE_SWIPED: 's', MESSAGE_RECEIVED: 'r', MESSAGE_UPDATED: 'u', MESSAGE_DELETED: 'd' };
  window.eventOn = function (k, f) { (H[k] = H[k] || []).push(f); }; parent.__fire = function (k) { (H[k] || []).forEach(function (f) { f(); }); };
  window.waitGlobalInitialized = async function () {};
  window.injectPrompts = function (a) { parent.__injected = a.map(function (x) { return x.content; }).join('\\n'); }; window.uninjectPrompts = function () { parent.__injected = ''; };
  window.getLastMessageId = function () { return S.msgs.length ? S.msgs[S.msgs.length - 1].message_id : -1; };
  window.getChatMessages = function () { return S.msgs; };
<\/script><script type="module" src="${B.BASE}tavern/eden-map.js"><\/script>`;
const HOST = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#2a2a2a;height:100vh;color:#aaa;font:14px sans-serif"><p style="padding:12px">tavern host (stub)</p>
<iframe id=card style="display:none" srcdoc="${STUB.replace(/"/g, '&quot;')}"></iframe></body>`;

export async function openHost(P, { here = '', stat = {}, msgs = [], chat = 'stub', vars = {}, noVars = false, ls = null } = {}) {
  const p = P.page;
  await P.ctx.addInitScript(s => { if (window.top === window) { window.__stub = s; if (s.ls && !sessionStorage.getItem('__lsSeeded')) { sessionStorage.setItem('__lsSeeded', '1'); for (const [k, v] of Object.entries(s.ls)) localStorage.setItem(k, v); } } }, { here, stat, msgs, chat, vars, noVars, ls });
  await p.route(B.BASE + '__stubhost.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HOST }));
  await p.goto(B.BASE + '__stubhost.html');
  await p.waitForSelector('#eden-map-root .em-fab', { timeout: 15000 });
  const H = {
    async open() {
      await p.locator('#eden-map-root .em-fab').click();
      await p.waitForFunction(() => { const f = document.querySelector('#eden-map-root .em-frame'); try { return f?.contentDocument?.getElementById('loading')?.classList.contains('done'); } catch (e) { return false; } }, null, { timeout: 40000 }).catch(() => {});
      await B.wait(1200);
    },
    async viewer() { return (await p.$('#eden-map-root .em-frame')).contentFrame(); },
    injected: () => p.evaluate(() => window.__injected || ''),
    vars: () => p.evaluate(() => window.__vars || null),
    wb: () => p.evaluate(() => ({ books: window.__wb || {}, chat: window.__chatWb || null })),
    async setMsgs(m, stat) { await p.evaluate(([m, st]) => { window.__stub.msgs = m; if (st) window.__stub.stat = st; window.__fire('r'); window.__fire('v'); }, [m, stat || null]); await B.wait(700); },
  };
  return H;
}
