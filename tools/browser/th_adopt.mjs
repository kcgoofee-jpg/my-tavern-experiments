// 酒馆助手采纳（docs/tavernhelper-audit.md）+ 交互方式 (a)(d)(e)（docs/interaction-modes.md）在模拟宿主页里验收（桌面）：
// 脚本按钮、getScriptId 身份与孤儿清扫、偏好写脚本变量、initializeGlobal、类宏、eden-map:moved 广播、设置「数据与映射」世界书写入（看差异 → 二次确认 → 只写我们的书）、
// 撤销 / 改绑定按钮、自动同步开关（直接切换，不弹确认框；真正的写入仍要走看差异 → 二次确认）、状态注入（固定 id、只一份、按深度）。
// 用法：node tools/browser/th_adopt.mjs <输出目录>
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/th_adopt.mjs <输出目录>'); process.exit(2); }
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);

// 装进卡片 iframe 的酒馆助手接口（状态都放宿主页 window.__th，测试从这里读）
function install() {
  window.__th = { script: {}, books: { '卡自带世界书': [{ uid: 1, name: '设定', content: '原作', enabled: true }] }, global: [], writes: [], buttons: [], macros: {}, emitted: [], globals: {}, info: '', inject: {}, chat: [{ is_user: false, swipe_id: 0, variables: [{ stat_data: { 世界: { 当前地点: '天城·中层·霓虹街', 当前时刻: '21:00' }, 在场人物: ['安娜'] } }] }] };
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
    w.getCharWorldbookNames = () => ({ primary: null, additional: [] });
    w.injectPrompts = a => { for (const x of a) T.inject[x.id] = x; window.__injected = Object.values(T.inject).map(x => x.content).join('\n'); return { uninject() {} }; };
    w.uninjectPrompts = ids => { for (const i of ids) delete T.inject[i]; };
  };
}

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await P.ctx.addInitScript(install);
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
    // 打开地图 → 设置「数据与映射」
    await H.open(); const vf = await H.viewer(); await B.wait(800);
    await vf.evaluate(() => { try { closeCard(); } catch (e) {} TCSettings.open('data'); }); await B.wait(500);
    const has = await vf.evaluate(() => ({ wb: !!document.querySelector('#thWb'), inj: !!document.querySelector('#thInj #thInjOn'), injOn: document.querySelector('#thInjOn')?.checked, adv: !!document.querySelector('#thAdv #thDepth') }));
    rep.check(`${name} 设置：世界书 / 状态注入两栏，注入默认开，深度在高级`, has.wb && has.inj && has.injOn && has.adv, JSON.stringify(has));
    // B1：看差异 → 写入需要二次确认 → 只写我们的书并按选择绑定
    await vf.evaluate(() => document.querySelector('#wbDiff, #wbLook').click()); await B.wait(1500);
    const diff = await vf.evaluate(() => document.querySelector('#thWb .thdiff')?.textContent || document.querySelector('#thWb')?.textContent || '');
    rep.check(`${name} B1 写前给差异`, /新建一本书|New book/.test(diff) && /只写这一本书|Only this book/.test(diff), diff.slice(0, 160));
    await vf.evaluate(() => document.querySelector('#thWb').scrollIntoView()); await B.shot(p, OUT, `${name}_wb_diff`);
    // 自检红线上的「一键写入世界书」按钮：这时书还没建，自检应该报 worldbook:warn 并带这个按钮；点它要跳回「数据与映射」并打开看差异（用户 2026-09-28 UI 小修）
    await p.evaluate(() => window.EdenMap.selfcheck()); await B.wait(300);
    await vf.evaluate(() => { TCSettings.open('update'); }); await B.wait(500);
    const sc0 = await vf.evaluate(() => ({ warn: !!document.querySelector('#selfCheck li.warn'), go: !!document.querySelector('#scWbGo'), fb: document.querySelectorAll('.fb-open').length }));
    rep.check(`${name} 自检红线带「一键写入世界书」按钮；反馈按钮只有一个`, sc0.warn && sc0.go && sc0.fb === 1, JSON.stringify(sc0));
    await vf.evaluate(() => document.querySelector('#scWbGo').click()); await B.wait(500);
    const back = await vf.evaluate(() => ({ page: TCSettings.page, wb: !!document.querySelector('#thWb .thdiff') }));
    rep.check(`${name} 点「一键写入世界书」跳到数据与映射并打开看差异`, back.page === 'data' && back.wb, JSON.stringify(back));
    await vf.evaluate(() => document.querySelector('#wbGo').click()); await B.wait(300);
    const before = await p.evaluate(() => window.__th.writes.length);
    rep.check(`${name} B1 第一次点只是「再点一次确认」`, before === 0, String(before));
    // 默认绑定选项现在优先「当前角色」；这里手动选「全局」，跟原来的断言对齐（char 需要 rebindCharWorldbooks，这个宿主桩没有提供）——第一次点会重绘一次，选择要放在重绘之后
    await vf.evaluate(() => { const r = document.querySelector('input[name="wbWhere"][value="global"]'); if (r) r.checked = true; });
    await vf.evaluate(() => document.querySelector('#wbGo').click()); await B.wait(2000);
    const w = await p.evaluate(() => ({ writes: window.__th.writes, global: window.__th.global, books: Object.keys(window.__th.books), n: (window.__th.books['伊甸地图·世界书附加条目'] || []).length, other: window.__th.books['卡自带世界书'] }));
    rep.check(`${name} B1 只写「伊甸地图·世界书附加条目」并绑定全局；卡自带书不动`, w.writes.every(x => x === '伊甸地图·世界书附加条目' || x === '*global') && w.global.includes('伊甸地图·世界书附加条目') && w.n > 4 && w.other[0].content === '原作', JSON.stringify({ writes: w.writes, global: w.global, n: w.n }));
    // 撤销 / 改绑定：一栏应该在书存在时出现（不测真的删，只测按钮在，且要点两次才生效——同一套二次确认规矩）
    const hasUndo = await vf.evaluate(() => !!document.querySelector('#wbUndo'));
    rep.check(`${name} 撤销按钮存在（书已建好）`, hasUndo, String(hasUndo));
    // 自动同步：直接切换开关（不再要求先同意一个弹框；真正的写入 / 建书永远要走上面「看差异 → 二次确认」）
    await vf.evaluate(() => { const c = document.querySelector('#wbAuto'); c.checked = true; c.dispatchEvent(new Event('change')); }); await B.wait(400);
    const post = await p.evaluate(() => ({ ls: localStorage.getItem('edenMapWbAuto'), sv: window.__th.script.eden_prefs?.edenMapWbAuto }));
    rep.check(`${name} 自动同步：直接开启（本机 + 脚本变量），不再弹确认框`, post.ls === '1' && post.sv === '1', JSON.stringify({ post }));
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
try { await run('desk', 'desktop'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
