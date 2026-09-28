// 模拟酒馆宿主页 + 桩出来的酒馆助手全局函数（Mvu、getChatMessages、injectPrompts……），在里面加载卡内脚本 map/tavern/eden-map.js。
// 用法（给其他脚本 import）：const H = await openHost(P, { here, stat, msgs }); await H.open(); const vf = await H.viewer();
//   here：MVU「世界.当前地点」；stat：额外的 stat_data 字段（例如在场人物）；msgs：[{ message_id, message }] 聊天原文（助手楼）
//   H.injected() 取最后一次 injectPrompts 的内容；H.setMsgs(msgs) 换聊天原文并触发 MESSAGE_RECEIVED
// 桩数据放在宿主页的 window.__stub（addInitScript 注入，中文不经过 srcdoc，WebKit 不会按 Latin-1 解错）；卡片 iframe 的桩脚本读 parent.__stub。
import * as B from './lib.mjs';

const STUB = `<script>
  var S = parent.__stub, H = {}; if (S.pack) window.__tcPack = S.pack;   // 设定包（build_preview_script.py --pack 在导入前写的同一个对象）
  window.Mvu = { getMvuData: function () { if (S.rawStat) return { stat_data: S.stat }; var st = Object.assign({}, S.stat || {}); st.世界 = Object.assign({ 当前地点: S.here }, (S.stat || {}).世界 || {}); return { stat_data: st }; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  // v0.9.3：酒馆助手聊天变量与世界书接口（S.noVars = true 时不提供，测退回本机存储）；写入记在 parent.__vars / parent.__wb
  if (!S.noVars) {
    parent.__vars = parent.__vars || JSON.parse(JSON.stringify(S.vars || {}));
    window.getVariables = function (o) { return o && o.type === 'chat' ? JSON.parse(JSON.stringify(parent.__vars)) : {}; };
    window.updateVariablesWith = async function (f, o) { if (o && o.type === 'chat') parent.__vars = f(JSON.parse(JSON.stringify(parent.__vars))); return parent.__vars; };
    window.createOrReplaceWorldbook = async function (n, e) { (parent.__wb = parent.__wb || {})[n] = e; return true; };
    window.getWorldbookNames = function () { return Object.keys(parent.__wb || {}); };
    window.getChatWorldbookName = function () { return parent.__chatWb || null; };
    window.rebindChatWorldbook = async function (c, n) { parent.__chatWb = n; };
  }
  if (S.charData) window.getCharData = function () { return S.charAsync ? new Promise(function (r) { setTimeout(function () { r(S.charData); }, 50); }) : S.charData; };   // charAsync：宿主 API 返回 Promise（A-8）
  window._ = { get: function (o, p, d) { var v = p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); return v == null ? d : v; } };
  window.SillyTavern = { getContext: function () { return { name1: 'Player', chatId: S.chat || 'stub' }; } };
  window.tavern_events = { CHAT_CHANGED: 'c', MESSAGE_SWIPED: 's', MESSAGE_RECEIVED: 'r', MESSAGE_UPDATED: 'u', MESSAGE_DELETED: 'd', GENERATION_AFTER_COMMANDS: 'g' };
  window.eventOn = function (k, f) { (H[k] = H[k] || []).push(f); }; parent.__fire = function (k) { (H[k] || []).forEach(function (f) { f(); }); };
  window.waitGlobalInitialized = async function () {};
  // 真实酒馆助手按 id 分槽（多处各用自己的 id 调 inject/uninject，互不影响）；早前这里不分 id、整段覆盖，
  // 一处调 uninjectPrompts 会把别处刚注入的内容也冲掉（B14：状态注入 eden-map-state 紧跟事态注入 eden-map-events 之后调用就会复现）。
  parent.__injMap = parent.__injMap || {};
  var recalcInjected = function () { parent.__injected = Object.keys(parent.__injMap).map(function (k) { return parent.__injMap[k]; }).filter(Boolean).join('\\n'); };
  window.injectPrompts = function (a) { a.forEach(function (x) { parent.__injMap[x.id] = x.content; }); recalcInjected(); };
  window.uninjectPrompts = function (ids) { (ids || []).forEach(function (id) { delete parent.__injMap[id]; }); recalcInjected(); };
  window.getLastMessageId = function () { return S.msgs.length ? S.msgs[S.msgs.length - 1].message_id : -1; };
  window.getChatMessages = function () { return S.msgs; };
  if (parent.__thInstall) parent.__thInstall(window);   // 测试可在宿主页 addInitScript 定义 __thInstall(w)，往卡片 iframe 里补更多酒馆助手接口（tools/browser/th_adopt.mjs）
<\/script><script type="module" src="__SCRIPT_BASE__tavern/eden-map.js"><\/script>`;
const HOST = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#2a2a2a;height:100vh;color:#aaa;font:14px sans-serif"><p style="padding:12px">tavern host (stub)</p><textarea id=send_textarea style="position:fixed;left:8px;bottom:8px;width:200px;height:24px"></textarea>
<iframe id=card style="display:none" srcdoc="${STUB.replace(/"/g, '&quot;')}"></iframe></body>`;

export async function openHost(P, { here = '', stat = {}, msgs = [], chat = 'stub', vars = {}, noVars = false, ls = null, charData = null, rawStat = false, splash = false, scriptBase = null, pack = null } = {}) {
  if (!splash) await P.ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__splashSeeded')) { sessionStorage.setItem('__splashSeeded', '1'); localStorage.setItem('edenMapSplashSeen', 'dev'); localStorage.setItem('edenMapHint', '1'); } } catch (e) {} });   // v0.9.5 开场自检卡 + v2 P1 三步上手横幅：别的测试里不弹（横幅盖在面板上会吃掉点击，见 e7_host）
  const p = P.page;
  await P.ctx.addInitScript(s => { if (window.top === window) { window.__stub = s; if (s.ls && !sessionStorage.getItem('__lsSeeded')) { sessionStorage.setItem('__lsSeeded', '1'); for (const [k, v] of Object.entries(s.ls)) localStorage.setItem(k, v); } } }, { here, stat, msgs, chat, vars, noVars, ls, charData, rawStat, pack });
  await p.route(B.BASE + '__stubhost.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HOST.split('__SCRIPT_BASE__').join(scriptBase || B.BASE) }));
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
