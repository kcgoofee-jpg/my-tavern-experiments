// 酒馆助手采纳（docs/tavernhelper-audit.md）+ 交互方式 (a)(d)(e)（docs/interaction-modes.md）在模拟宿主页里验收（桌面）：
// 脚本按钮、getScriptId 身份与孤儿清扫、偏好写脚本变量、initializeGlobal、类宏、eden-map:moved 广播；
// 世界书全自动（host-th.mjs createWbAuto，用户 2026-09-28）：打开聊天空闲时自动建书并挂到当前角色的附加世界书、
// 同版本静默不重写、版本变了静默同步且每个版本只提示一次、总开关关掉不自动做（删过书立墓碑也不再重建）；
// 手动写入照常：看差异 → 第一次点只是「再点一次确认」→ 只写我们的书并按选择绑定；撤销（删书）也要二次确认。
// 用法：node tools/browser/th_adopt.mjs <输出目录>
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { readFileSync } from 'node:fs';
import { shipped as wbShipped } from '../../map/tavern/wbsync.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/th_adopt.mjs <输出目录>'); process.exit(2); }
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);

// 发布物（map/data/worldbook_addon.json）：当前版本号；再造一本内容相同、eden_ver 落后的旧书，给第二个场景测「版本变了静默同步」
let SHIP; try { SHIP = JSON.parse(readFileSync(new URL('../../map/data/worldbook_addon.json', import.meta.url), 'utf8')); } catch (e) { console.error('读 map/data/worldbook_addon.json 失败：', e.message); process.exit(1); }
const SHIP_VER = SHIP.ver;
const SEED_OLD = wbShipped(SHIP).entries.map((e, i) => ({ ...e, uid: i + 1, enabled: true, extra: { ...e.extra, eden_ver: 'test-0.0.0' } }));

// 装进卡片 iframe 的酒馆助手接口（状态都放宿主页 window.__th，测试从这里读）；seedEntries：预装的旧版本附加世界书（runUpd 用）
function install(seedEntries) {
  window.__th = { script: {}, books: { '卡自带世界书': [{ uid: 1, name: '设定', content: '原作', enabled: true }] }, charWb: { primary: null, additional: [] }, global: [], writes: [], removes: [], buttons: [], macros: {}, emitted: [], globals: {}, info: '', inject: {}, chat: [{ is_user: false, swipe_id: 0, variables: [{ stat_data: { 世界: { 当前地点: '天城·中层·霓虹街', 当前时刻: '21:00' }, 在场人物: ['安娜'] } }] }] };
  if (Array.isArray(seedEntries) && seedEntries.length) window.__th.books['伊甸地图·世界书附加条目'] = JSON.parse(JSON.stringify(seedEntries));
  window.__thInstall = w => {
    const T = window.__th, cl = o => JSON.parse(JSON.stringify(o));
    w.getScriptId = () => 'script-eden-1';
    w.SillyTavern.chat = T.chat;
    const gv = w.getVariables; w.getVariables = o => (o && o.type === 'script' ? cl(T.script) : gv(o));
    const uv = w.updateVariablesWith; w.updateVariablesWith = async (f, o) => { if (o && o.type === 'script') { T.script = f(cl(T.script)); return T.script; } return uv(f, o); };
    w.insertOrAssignVariables = async (v, o) => { if (o && o.type === 'script') Object.assign(T.script, cl(v)); };
    w.appendInexistentScriptButtons = b => { for (const x of b) if (!T.buttons.some(y => y.name === x.name)) T.buttons.push(x); };
    w.getButtonEvent = n => 'btn:' + n;
    w.initializeGlobal = (n, v) => { T.globals[n] = !!v; };
    w.replaceScriptInfo = s => { T.info = s; };
    w.eventEmit = (ev, d) => { T.emitted.push([ev, d]); };
    w.registerMacroLike = (re, f) => { T.macros[re.source] = f; return { unregister: () => { delete T.macros[re.source]; } }; };
    w.getTavernHelperVersion = () => '4.3.1'; w.getTavernVersion = () => '1.13.4';
    w.getWorldbookNames = () => Object.keys(T.books);
    w.getWorldbook = async n => cl(T.books[n] || []);
    w.createWorldbook = async (n, l) => { T.writes.push(n); T.books[n] = cl(l).map((e, i) => ({ uid: i + 10, ...e })); return true; };
    w.updateWorldbookWith = async (n, f) => { T.writes.push(n); T.books[n] = cl(await f(cl(T.books[n]))); return T.books[n]; };
    w.replaceWorldbook = async (n, l) => { T.writes.push(n); T.books[n] = cl(l); };
    w.getGlobalWorldbookNames = () => [...T.global]; w.rebindGlobalWorldbooks = async l => { T.writes.push('*global'); T.global = [...l]; };
    w.getCharWorldbookNames = () => cl(T.charWb);   // 附加世界书状态化：全自动挂到这里，只有 rebind 才变
    w.rebindCharWorldbooks = async (c, spec) => { T.charWb = cl(spec); };
    w.deleteWorldbook = async n => { if (!(n in T.books)) return false; T.removes.push(n); delete T.books[n]; T.global = T.global.filter(x => x !== n); T.charWb = { primary: T.charWb.primary === n ? null : T.charWb.primary, additional: T.charWb.additional.filter(x => x !== n) }; return true; };
    w.injectPrompts = a => { for (const x of a) T.inject[x.id] = x; window.__injected = Object.values(T.inject).map(x => x.content).join('\n'); return { uninject() {} }; };
    w.uninjectPrompts = ids => { for (const i of ids) delete T.inject[i]; };
  };
}

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await P.ctx.addInitScript(install, null);
    // 孤儿：上一个实例（别的身份）留下的节点
    await P.ctx.addInitScript(() => { if (window.top === window) document.addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.id = 'orphan'; d.setAttribute('data-eden-owner', 's:dead-instance'); document.body.appendChild(d); }); });
    const H = await openHost(P, { here: '天城·中层·霓虹街', stat: { 在场人物: ['安娜'] }, msgs: [{ message_id: 1, message: '到了。' }], chat: 'th-' + name, ls: { edenMapLine: 'cn', edenMapHand: 'left' } });
    const p = P.page; if (process.env.DBG) p.on('console', m => console.log('[console]', m.text().slice(0, 300))); await B.wait(2500);
    const s1 = await p.evaluate(() => ({ th: window.__th, orphan: !!document.getElementById('orphan'), owner: document.getElementById('eden-map-root')?.getAttribute('data-eden-owner'), ids: Object.keys(window.__edenMapIds || {}) }));
    rep.check(`${name} A2 孤儿清扫 + 本实例打标记`, !s1.orphan && s1.owner === 's:script-eden-1', JSON.stringify({ orphan: s1.orphan, owner: s1.owner }));
    rep.check(`${name} A3 身份 = getScriptId`, s1.ids.length === 1 && s1.ids[0] === 's:script-eden-1', JSON.stringify(s1.ids));
    rep.check(`${name} A4 本机偏好补进脚本变量 eden_prefs`, s1.th.script.eden_prefs?.edenMapLine === 'cn' && s1.th.script.eden_prefs?.edenMapHand === 'left', JSON.stringify(s1.th.script));
    rep.check(`${name} B2 脚本按钮`, s1.th.buttons.map(b => b.name).join() === '地图,地图自检', JSON.stringify(s1.th.buttons));
    rep.check(`${name} B6 initializeGlobal('EdenMap') + 旧别名`, s1.th.globals.EdenMap === true && await p.evaluate(() => !!window.EdenMap), JSON.stringify(s1.th.globals));
    rep.check(`${name} B9 类宏默认关`, !Object.keys(s1.th.macros).length, JSON.stringify(Object.keys(s1.th.macros)));
    // B8：地点变化 → 广播（只有地点字段）
    await p.evaluate(() => { window.__stub.here = '伊甸庄园·书房'; window.__th.chat[0].variables[0].stat_data.世界.当前地点 = '伊甸庄园·书房'; window.__fire('v'); }); await B.wait(900);
    const em = await p.evaluate(() => window.__th.emitted.filter(e => e[0] === 'eden-map:moved'));
    rep.check(`${name} B8 eden-map:moved 只带地点`, em.length === 1 && em[0][1].from === '天城·中层·霓虹街' && em[0][1].to === '伊甸庄园·书房' && Object.keys(em[0][1]).sort().join() === 'at,from,map,source,to', JSON.stringify(em));
    // ---- 世界书全自动：脚本加载空闲时（≈8s）自己把书建好并挂到当前角色附加世界书，不等用户点 ----
    await p.waitForFunction(v => localStorage.getItem('edenMapWbNoticeVer') === v, SHIP_VER, { timeout: 30000 }).catch(() => {});
    const auto1 = await p.evaluate(() => ({ writes: window.__th.writes, book: (window.__th.books['伊甸地图·世界书附加条目'] || []).length, charWb: window.__th.charWb, global: window.__th.global, other: window.__th.books['卡自带世界书'], notice: localStorage.getItem('edenMapWbNoticeVer'), sync: JSON.parse(localStorage.getItem('edenMapWbSync') || 'null') }));
    rep.check(`${name} B1 全自动：书已自动建好、卡自带书不动`, auto1.writes.join() === '伊甸地图·世界书附加条目' && auto1.book === SEED_OLD.length && auto1.other[0].content === '原作', JSON.stringify({ writes: auto1.writes, n: auto1.book }));
    rep.check(`${name} B1 全自动：挂到当前角色的附加世界书（不动全局）`, (auto1.charWb?.additional || []).includes('伊甸地图·世界书附加条目') && !auto1.global.length, JSON.stringify(auto1.charWb));
    rep.check(`${name} B1 全自动：装书提示只出这一次（记下提示版本、自动同步留痕）`, auto1.notice === SHIP_VER && auto1.sync?.auto === true && auto1.sync?.at > 0, JSON.stringify({ notice: auto1.notice, sync: auto1.sync }));
    await p.waitForFunction(() => document.body.innerText.includes('已自动装好地图世界书附加条目'), null, { timeout: 5000 }).catch(() => {});
    const toast0 = await p.evaluate(() => document.body.innerText.includes('已自动装好地图世界书附加条目'));
    rep.check(`${name} B1 全自动：装书提示弹出`, toast0, String(toast0));
    // 同版本再自动一轮（换聊天触发）：静默不重写、不重复提示
    await p.evaluate(() => window.__fire('c')); await B.wait(4500);
    const auto2 = await p.evaluate(() => ({ writes: window.__th.writes.length, notice: localStorage.getItem('edenMapWbNoticeVer'), at: JSON.parse(localStorage.getItem('edenMapWbSync') || 'null')?.at }));
    rep.check(`${name} B1 同版本再自动一轮：不重写、不再提示`, auto2.writes === 1 && auto2.notice === SHIP_VER && auto2.at === auto1.sync.at, JSON.stringify(auto2));
    // 打开地图 → 设置「数据与映射」
    await H.open(); let vf = await H.viewer(); await B.wait(800);
    await vf.evaluate(() => { try { closeCard(); } catch (e) {} TCSettings.open('data'); }); await B.wait(500);
    const has = await vf.evaluate(() => ({ wb: !!document.querySelector('#thWb'), inj: !!document.querySelector('#thInj #thInjOn'), injOn: document.querySelector('#thInjOn')?.checked, adv: !!document.querySelector('#thAdv #thDepth') }));
    rep.check(`${name} 设置：世界书 / 状态注入两栏，注入默认开，深度在高级`, has.wb && has.inj && has.injOn && has.adv, JSON.stringify(has));
    // 全自动建好的书是当前版本：看差异 = 已是最新、没有变化，只写这一本书（看差异后书的状态才进设置，撤销按钮也在这时出现）
    await vf.evaluate(() => document.querySelector('#wbDiff, #wbLook').click()); await B.wait(1500);
    const diff0 = await vf.evaluate(() => ({ box: document.querySelector('#thWb')?.textContent || '', diff: document.querySelector('#thWb .thdiff')?.textContent || '' }));
    rep.check(`${name} B1 全自动后看差异：已是最新、没有变化`, /已是最新/.test(diff0.box) && /没有变化/.test(diff0.diff) && /只写这一本书/.test(diff0.diff), (diff0.box + '｜' + diff0.diff).slice(0, 160));
    const hasUndo = await vf.evaluate(() => !!document.querySelector('#wbUndo'));
    rep.check(`${name} 撤销按钮存在（书已建好）`, hasUndo, String(hasUndo));
    // 总开关（默认开）：关掉写 '0'（本机 + 脚本变量）；关了就不自动做
    await vf.evaluate(() => { const c = document.querySelector('#wbOn'); c.checked = false; c.dispatchEvent(new Event('change')); }); await B.wait(400);
    const post = await p.evaluate(() => ({ ls: localStorage.getItem('edenMapWbOn'), sv: window.__th.script.eden_prefs?.edenMapWbOn }));
    rep.check(`${name} 世界书总开关：可关（本机 + 脚本变量）`, post.ls === '0' && post.sv === '0', JSON.stringify({ post }));
    // 撤销（删书）也要二次确认；删过立墓碑
    await vf.evaluate(() => document.querySelector('#wbUndo').click()); await B.wait(400);
    await vf.evaluate(() => document.querySelector('#wbUndo').click()); await B.wait(1000);
    const del = await p.evaluate(() => ({ removes: window.__th.removes, has: '伊甸地图·世界书附加条目' in window.__th.books, tomb: localStorage.getItem('edenMapWbTomb') }));
    rep.check(`${name} B1 撤销：二次确认删书并立墓碑`, del.removes.join() === '伊甸地图·世界书附加条目' && !del.has && del.tomb === '1', JSON.stringify(del));
    // 总开关关着（+ 墓碑）：再自动一轮也不重建、不同步、不提示
    await p.evaluate(() => window.__fire('c')); await B.wait(4500);
    const offRun = await p.evaluate(() => ({ has: '伊甸地图·世界书附加条目' in window.__th.books, writes: window.__th.writes.length, notice: localStorage.getItem('edenMapWbNoticeVer') }));
    rep.check(`${name} B1 总开关关掉：不自动建、不同步、不提示`, !offRun.has && offRun.writes === 1 && offRun.notice === SHIP_VER, JSON.stringify(offRun));
    // 手动写入照常。先重载一个新脚本实例：自检结果第一次跑完就缓存（checkP memo），只有重载后才重新收集；
    // 此时书已被撤销、总开关关着、有墓碑 → 书不会自动回来 → 自检红线带「一键写入世界书」按钮（书没了才 warn）
    await P.page.reload(); await p.waitForSelector('#eden-map-root .em-fab', { timeout: 15000 }); await B.wait(500);
    await p.evaluate(() => { window.__stub.here = '伊甸庄园·书房'; window.__th.chat[0].variables[0].stat_data.世界.当前地点 = '伊甸庄园·书房'; window.__fire('v'); });   // reload 把桩重置回了初始地点：重演 B8 的地点变化
    await p.evaluate(() => window.EdenMap.selfcheck());   // 等第一次自检跑完（含「世界书缺失」6 秒后的复查）
    await H.open(); vf = await H.viewer(); await B.wait(800);
    await vf.evaluate(() => { TCSettings.open('update'); }); await B.wait(500);
    const sc0 = await vf.evaluate(() => ({ warn: !!document.querySelector('#selfCheck li.warn'), go: !!document.querySelector('#scWbGo'), fb: document.querySelectorAll('.fb-open').length }));
    rep.check(`${name} 自检红线带「一键写入世界书」按钮；反馈按钮只有一个`, sc0.warn && sc0.go && sc0.fb === 1, JSON.stringify(sc0));
    await vf.evaluate(() => document.querySelector('#scWbGo').click()); await B.wait(500);
    const back = await vf.evaluate(() => ({ page: TCSettings.page, wb: !!document.querySelector('#thWb .thdiff') }));
    rep.check(`${name} 点「一键写入世界书」跳到数据与映射并打开看差异`, back.page === 'data' && back.wb, JSON.stringify(back));
    const diff1 = await vf.evaluate(() => document.querySelector('#thWb .thdiff')?.textContent || '');
    rep.check(`${name} B1 写前给差异（新建一本书）`, /新建一本书|New book/.test(diff1) && /只写这一本书|Only this book/.test(diff1), diff1.slice(0, 160));
    await vf.evaluate(() => document.querySelector('#thWb').scrollIntoView()); await B.shot(p, OUT, `${name}_wb_diff`);
    // 第一次点只是「再点一次确认」：总开关关着、没有后台自动写，这个断言是确定性的
    const pre = await p.evaluate(() => window.__th.writes.length);
    await vf.evaluate(() => document.querySelector('#wbGo').click()); await B.wait(300);
    const armed = await vf.evaluate(() => ({ label: document.querySelector('#wbGo')?.textContent || '' }));
    const before = await p.evaluate(() => window.__th.writes.length);
    rep.check(`${name} B1 第一次点只是「再点一次确认」`, before === pre && /再点一次确认/.test(armed.label), JSON.stringify({ pre, before, label: armed.label }));
    // 默认绑定选项现在优先「当前角色」；这里手动选「全局」，再点第二次才真的写
    await vf.evaluate(() => { const r = document.querySelector('input[name="wbWhere"][value="global"]'); if (r) r.checked = true; });
    await vf.evaluate(() => document.querySelector('#wbGo').click()); await B.wait(2000);
    const w = await p.evaluate(() => ({ writes: window.__th.writes, global: window.__th.global, n: (window.__th.books['伊甸地图·世界书附加条目'] || []).length, other: window.__th.books['卡自带世界书'], tomb: localStorage.getItem('edenMapWbTomb') }));
    rep.check(`${name} B1 只写「伊甸地图·世界书附加条目」并绑定全局；卡自带书不动`, w.writes.every(x => x === '伊甸地图·世界书附加条目' || x === '*global') && w.global.includes('伊甸地图·世界书附加条目') && w.n > 4 && w.other[0].content === '原作' && w.tomb === '0', JSON.stringify({ writes: w.writes, global: w.global, n: w.n }));
    // 类宏开关
    await vf.evaluate(() => { const c = document.querySelector('#thMacro'); c.checked = true; c.dispatchEvent(new Event('change')); }); await B.wait(600);
    const mac = await p.evaluate(() => { const f = window.__th.macros['\\{\\{eden_here\\}\\}']; return f ? f({}, '{{eden_here}}') : null; });
    rep.check(`${name} B9 开了类宏：{{eden_here}} = 当前地点`, mac === '伊甸庄园·书房', String(mac));
    // (a) 状态注入：固定 id 只有一条、默认深度 2；高级里改深度 → 同一条换深度；关掉 → 撤掉
    const inj1 = await p.evaluate(() => { window.__fire('g'); return Object.values(window.__th.inject).filter(x => x.id === 'eden-map-state'); });
    rep.check(`${name} (a) 状态注入：一条、深度 2、带地点与在场`, inj1.length === 1 && inj1[0].depth === 2 && /\[地图状态\] 地点：伊甸庄园·书房/.test(inj1[0].content) && /在场：安娜/.test(inj1[0].content), JSON.stringify(inj1));
    await vf.evaluate(() => { TCSettings.open('adv'); const i = document.querySelector('#thDepth'); i.value = '4'; i.dispatchEvent(new Event('change')); }); await B.wait(600);
    const inj2 = await p.evaluate(() => { window.__fire('g'); window.__fire('g'); return Object.values(window.__th.inject).filter(x => x.id === 'eden-map-state'); });
    rep.check(`${name} (a) 改深度 4：仍只有一条`, inj2.length === 1 && inj2[0].depth === 4, JSON.stringify(inj2.map(x => x.depth)));
    await vf.evaluate(() => { TCSettings.open('data'); const c = document.querySelector('#thInjOn'); c.checked = false; c.dispatchEvent(new Event('change')); }); await B.wait(600);
    const inj3 = await p.evaluate(() => { window.__fire('g'); return Object.values(window.__th.inject).filter(x => x.id === 'eden-map-state').length; });
    rep.check(`${name} (a) 关掉 → 撤掉`, inj3 === 0, String(inj3));
    await vf.evaluate(() => { const c = document.querySelector('#thInjOn'); c.checked = true; c.dispatchEvent(new Event('change')); }); await B.wait(400);
    // 自检：卡 / 宿主版本；脚本说明
    await B.wait(1500); const sc = await p.evaluate(async () => (await window.EdenMap.selfcheck()).items.map(i => i.id + ':' + i.status));
    const info = await p.evaluate(() => window.__th.info);
    rep.check(`${name} B4 自检报告宿主版本；B5 脚本说明`, sc.includes('host:info') && /伊甸地图|Eden map/.test(info), JSON.stringify({ sc, info }));
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}

// 第二个场景：预装一本旧版本的附加世界书 → 载入即「版本变了」：静默同步到当前版本，更新提示只出一次；再自动一轮不再提示
async function runUpd(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await P.ctx.addInitScript(install, SEED_OLD);
    const H = await openHost(P, { here: '天城·中层·霓虹街', stat: { 在场人物: ['安娜'] }, msgs: [{ message_id: 1, message: '到了。' }], chat: 'th-upd', ls: { edenMapLine: 'cn' } });
    const p = P.page;
    await p.waitForFunction(v => localStorage.getItem('edenMapWbNoticeVer') === v, SHIP_VER, { timeout: 30000 }).catch(() => {});
    const up = await p.evaluate(() => { const b = window.__th.books['伊甸地图·世界书附加条目'] || []; return { writes: window.__th.writes, ver: b[0]?.extra?.eden_ver, n: b.length, notice: localStorage.getItem('edenMapWbNoticeVer'), global: window.__th.global, charWb: window.__th.charWb, other: window.__th.books['卡自带世界书'] }; });
    rep.check(`${name} 版本变了：静默同步到当前版本，只写这一本书、绑定不动`, up.writes.join() === '伊甸地图·世界书附加条目' && up.ver === SHIP_VER && up.n === SEED_OLD.length && !up.global.length && !(up.charWb?.additional || []).length && up.other[0].content === '原作', JSON.stringify({ writes: up.writes, ver: up.ver, n: up.n }));
    await p.waitForFunction(() => document.body.innerText.includes('地图世界书附加条目已更新'), null, { timeout: 6000 }).catch(() => {});
    const t1 = await p.evaluate(() => document.body.innerText.includes('地图世界书附加条目已更新'));
    rep.check(`${name} 更新提示只出这一次`, t1, String(t1));
    await p.evaluate(() => window.__fire('c')); await B.wait(4500);
    const up2 = await p.evaluate(() => ({ writes: window.__th.writes.length, ver: (window.__th.books['伊甸地图·世界书附加条目'] || [])[0]?.extra?.eden_ver, notice: localStorage.getItem('edenMapWbNoticeVer') }));
    rep.check(`${name} 同版本再自动一轮：不重写、不再提示`, up2.writes === 1 && up2.ver === SHIP_VER && up2.notice === SHIP_VER, JSON.stringify(up2));
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}

try { await run('desk', 'desktop'); await runUpd('wbupd', 'desktop'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
