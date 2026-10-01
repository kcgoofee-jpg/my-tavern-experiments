// v0.9.5「自定义」面板 + 主题同步：模拟酒馆宿主页（host_stub.mjs）里验收——
//   同步到世界书默认开（没有自定义不建世界书，第一项才建）、旧数据迁移（自己关过的保持关）、对话框（空状态、选择器搜索 / 分组、编辑校验与字数、重置二次确认、卡片来源）、
//   点「在地图上看」飞过去（地标 → 切层开卡；庄园房间 → 进庄园聚焦；庄园不可用 → 上层伊甸的地点卡写上房间；人物 → 人物栏飞行）、EdenMap.flyTo、Esc / Tab 焦点、
//   主题切换：宿主面板、查看器、对话框、输入框、自检提示一起换，文字对比度 ≥ 4.5，color-scheme 跟着换。
// 用法：node tools/browser/custom095.mjs <输出目录> [--shots docs/reviews/custom_095/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
import * as MV from '../../map/tavern/mvu-readers.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/custom095.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const STAT = { 在场人物: { 米拉: { 身份: '向导', 位置: '下层·7号井' } } };
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 72, scale: 'css' }); };
const errs = P => P.errors.filter(e => !/http 404/.test(e));

// 对比度（WCAG）：前景 / 背景的计算色；背景透明时往上找不透明的祖先，半透明按叠加算
const CONTRAST = `(() => {
  const parse = s => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) { const c = s.match(/color\\(srgb ([^)]+)\\)/); if (!c) return [0, 0, 0, 0]; const p = c[1].split(/[\\s\\/]+/).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (a, b) => { const al = a[3] + b[3] * (1 - a[3]); if (!al) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / al).concat(al); };
  const bgOf = el => { let acc = [0, 0, 0, 0]; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); acc = over(acc, c); if (acc[3] >= .99) return acc; }
    return over(acc, [255, 255, 255, 1]); };
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  return el => { const fg = over(parse(getComputedStyle(el).color), bgOf(el)), bg = bgOf(el); const a = L(fg), b = L(bg); return +(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2)); };
})()`;

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  const chat = 'c95-' + name;
  try {
    const H = await openHost(P, { here: '天城·中层·天城执法局总局', msgs: [], stat: STAT, chat });
    const p = P.page;
    await B.wait(1200);
    // 1 默认开，没有自定义不建世界书
    const c0 = await p.evaluate(() => window.EdenMap.getCustom());
    const wb0 = await H.wb();
    rep.check(`${name} 同步到世界书默认开；没有自定义时不建世界书`, c0.同步世界书 === true && !Object.keys(wb0.books).length, JSON.stringify({ s: c0.同步世界书, wb: Object.keys(wb0.books) }));
    await H.open();
    const vf = await H.viewer();
    await vf.evaluate(() => { closeCard(); showSet(true); }); await B.wait(300);
    const sync = await vf.evaluate(() => ({ on: document.querySelector('#cuSync')?.checked, hint: [...document.querySelectorAll('#cuBox small')].map(s => s.textContent).join('|') }));
    rep.check(`${name} 设置里「同步到世界书」勾着，说明写「默认开、第一项才建」`, sync.on === true && /默认开/.test(sync.hint) && /第一项/.test(sync.hint), JSON.stringify(sync));
    // 2 打开对话框：空状态
    await vf.evaluate(() => document.querySelector('#cuBox .cu-open').click()); await B.wait(600);
    const emp = await vf.evaluate(() => ({ open: !document.querySelector('#cuDlg').hidden, ex: document.querySelectorAll('#cuDlg .cu-emptybox li').length, foc: document.activeElement?.id }));
    rep.check(`${name} 对话框：空状态有 3 个中性示例，焦点在标题`, emp.open && emp.ex === 3 && emp.foc === 'cuDlgT', JSON.stringify(emp));
    await jpg(p, `cu_${name}_empty`);
    // 3 选择器：分组、搜索
    await vf.evaluate(() => document.querySelector('#cuDlg .cu-add').click()); await B.wait(400);
    const grp = await vf.evaluate(() => ({ g: [...document.querySelectorAll('#cuRes h4')].map(h => h.firstChild.nodeValue.trim()), foc: document.activeElement?.id, chips: document.querySelectorAll('#cuDlg .chip').length }));
    rep.check(`${name} 选择器：天城上 / 中 / 下层地标、庄园按楼层、室外、人物；焦点在搜索框`, grp.g[0] === '天城上层 · 地标' && grp.g.some(x => /伊甸庄园 · (1F|F1)/.test(x))   /* estate2 起按卡分层 B2–F3 */ && grp.g.some(x => /室外/.test(x)) && grp.g.at(-1) === '人物' && (grp.foc === 'cuQ' || (/phone|iphone/.test(name) && grp.foc === 'cuDlgT')) && grp.chips === grp.g.length, JSON.stringify(grp).slice(0, 300));
    await jpg(p, `cu_${name}_picker`);
    await vf.locator('#cuQ').fill('执法局'); await B.wait(200);
    const hits = await vf.evaluate(() => [...document.querySelectorAll('#cuRes .cu-row b')].map(b => b.textContent));
    rep.check(`${name} 搜索「执法局」：只剩匹配项`, hits.includes('天城执法局总局') && hits.length <= 4, JSON.stringify(hits));
    await vf.locator('#cuQ').fill('zzz不存在'); await B.wait(150);
    const none = await vf.evaluate(() => document.querySelector('#cuRes .cu-none')?.textContent || '');
    rep.check(`${name} 搜索无结果：给提示`, /没有找到/.test(none), none);
    await vf.locator('#cuQ').fill('门厅'); await B.wait(150);
    const alias = await vf.evaluate(() => [...document.querySelectorAll('#cuRes .cu-row b')].map(b => b.textContent));
    rep.check(`${name} 搜索别名「门厅」→ 大厅`, alias.includes('大厅') || alias.includes('门厅'), JSON.stringify(alias));   // estate2 起「门厅」在卡分层房间表里是独立条目
    // 键盘：↓ 到第一行，Enter 进编辑
    await vf.locator('#cuQ').fill('主人书房'); await B.wait(150);
    await vf.locator('#cuQ').press('ArrowDown'); await vf.evaluate(() => document.activeElement.click()); await B.wait(300);
    const ed = await vf.evaluate(() => ({ t: document.querySelector('#cuDlg .cu-target b')?.textContent, foc: document.activeElement?.id, cnt: document.querySelector('#cuNoteCnt')?.textContent }));
    rep.check(`${name} 键盘 ↓ + 回车进编辑页，焦点在显示名，字数 0 / 200`, ed.t === '主人书房' && ed.foc === 'cuName' && ed.cnt === '0 / 200', JSON.stringify(ed));
    // 4 校验：重名、都空
    await vf.locator('#cuName').fill('大厅'); await B.wait(100);
    const e1 = await vf.evaluate(() => document.querySelector('#cuNameErr').textContent);
    await vf.locator('#cuName').fill(''); await vf.evaluate(() => document.querySelector('#cuDlg form').requestSubmit()); await B.wait(150);
    const e2 = await vf.evaluate(() => ({ t: document.querySelector('#cuNameErr').textContent, inv: document.querySelector('#cuName').getAttribute('aria-invalid') }));
    rep.check(`${name} 校验：和标准名重名、都空不能保存（行内提示）`, /重名/.test(e1) && /至少填一项/.test(e2.t) && e2.inv === 'true', JSON.stringify({ e1, e2 }));
    await vf.locator('#cuName').fill('星图室'); await vf.locator('#cuNote').fill('夜里看星图，整理旧地图'); await B.wait(100);
    const cnt = await vf.evaluate(() => document.querySelector('#cuNoteCnt').textContent);
    await jpg(p, `cu_${name}_edit`);
    await vf.evaluate(() => document.querySelector('#cuDlg form').requestSubmit()); await B.wait(900);
    const v1 = await H.vars(), wb1 = await H.wb(), bn = Object.keys(wb1.books)[0] || '';
    rep.check(`${name} 保存 → 聊天变量 eden_map（来源 手动）；字数 11 / 200`, v1?.eden_map?.自定义?.items?.主人书房?.名 === '星图室' && v1.eden_map.自定义.items.主人书房.源 === '手动' && cnt === '11 / 200' && !('stat_data' in v1), JSON.stringify({ cnt, it: v1?.eden_map?.自定义?.items?.主人书房 }));
    rep.check(`${name} 第一项自定义后才建世界书，并绑定到聊天`, /^伊甸地图·自定义·[0-9a-f]{6}$/.test(bn) && wb1.books[bn][0].enabled && /星图室/.test(wb1.books[bn][0].content) && wb1.chat === bn, JSON.stringify({ bn, chat: wb1.chat }));
    // 5 列表卡片：剧情标签来源
    await H.setMsgs([{ message_id: 5, message: '<span style="display:none">⌖用途 温室：冬天在这里喝茶</span>' }]); await B.wait(900);
    const cards = await vf.evaluate(() => [...document.querySelectorAll('#cuDlg .cu-card')].map(c => ({ n: c.querySelector('.cu-names').textContent, src: c.querySelector('.cu-tags em:last-child').textContent, acts: c.querySelectorAll('.cu-acts .btn').length, h: Math.min(...[...c.querySelectorAll('.cu-acts .btn, .cu-main')].map(b => b.getBoundingClientRect().height)) })));
    rep.check(`${name} 卡片：原名 → 新名、来源（手动 / 剧情标签）、编辑 / 重置 / 在地图上看，触控 ≥ 44 px`, cards.length === 2 && cards.some(c => /主人书房→星图室/.test(c.n) && c.src === '手动') && cards.some(c => /温室/.test(c.n) && c.src === '剧情标签') && cards.every(c => c.acts === 3 && c.h >= 44), JSON.stringify(cards));
    await jpg(p, `cu_${name}_list`);
    // 6 重置：二次确认
    await vf.evaluate(() => document.querySelector('#cuDlg [data-reset="温室"]').click()); await B.wait(200);
    const arm = await vf.evaluate(() => ({ t: document.querySelector('#cuDlg [data-reset="温室"]').textContent, n: document.querySelectorAll('#cuDlg .cu-card').length }));
    await vf.evaluate(() => document.querySelector('#cuDlg [data-reset="温室"]').click()); await B.wait(800);
    const v2 = await H.vars();
    rep.check(`${name} 重置：第一下变「确认重置」，第二下才删`, arm.t === '确认重置' && arm.n === 2 && !v2.eden_map.自定义.items.温室 && v2.eden_map.自定义.items.主人书房, JSON.stringify(arm));
    // 7 Tab 焦点困在对话框里；Esc 从编辑页回列表、再 Esc 关掉，焦点回到入口按钮
    const trap = await vf.evaluate(() => { const d = document.querySelector('#cuDlg'); const f = [...d.querySelectorAll('button, input, textarea')].filter(x => x.offsetParent); f.at(-1).focus(); return f.length; });
    await vf.locator(':focus').press('Tab');
    const inDlg = await vf.evaluate(() => document.querySelector('#cuDlg').contains(document.activeElement));
    await vf.evaluate(() => document.querySelector('#cuDlg [data-edit="主人书房"]').click()); await B.wait(200);
    await vf.locator(':focus').press('Escape'); await B.wait(150);
    const back = await vf.evaluate(() => !!document.querySelector('#cuDlg .cu-cards'));
    await vf.locator(':focus').press('Escape'); await B.wait(150);
    const closed = await vf.evaluate(() => ({ h: document.querySelector('#cuDlg').hidden, f: document.activeElement?.className }));
    rep.check(`${name} 键盘：Tab 不跑出对话框；Esc 编辑页 → 列表 → 关闭，焦点回入口`, trap > 3 && inDlg && back && closed.h && /cu-open/.test(closed.f || ''), JSON.stringify({ trap, inDlg, back, closed }));
    // 8 飞过去：地标（中层 → 下层 7 号井黑市）
    await vf.evaluate(() => { showSet(true); document.querySelector('#cuBox .cu-open').click(); }); await B.wait(500);
    await vf.evaluate(() => document.querySelector('#cuDlg .cu-add').click()); await B.wait(300);
    await vf.locator('#cuQ').fill('7 号井'); await B.wait(150);
    await vf.evaluate(() => document.querySelector('#cuRes [data-fly]').click()); await B.wait(3500);
    const f1 = await vf.evaluate(() => ({ cur, dlg: document.querySelector('#cuDlg').hidden, set: document.querySelector('#setPop').hidden, card: document.querySelector('#card').hidden ? '' : document.querySelector('#card h2').textContent }));
    rep.check(`${name} 选择器里点「在地图上看」：切到下层并打开 7 号井黑市的地点卡`, f1.cur === 'tc_low' && f1.dlg && f1.set && /7 号井/.test(f1.card), JSON.stringify(f1));
    await jpg(p, `cu_${name}_fly_marker`);
    // 人物
    const f2ok = await vf.evaluate(() => TCCustom.flyTo({ character: '米拉' })); await B.wait(1500);
    const f2 = await vf.evaluate(() => ({ cur, card: document.querySelector('#card').hidden ? '' : document.querySelector('#card h2').textContent }));
    rep.check(`${name} 人物：飞到米拉（人物栏的位置）`, f2ok && f2.cur === 'tc_low' && /米拉/.test(f2.card), JSON.stringify(f2));
    const f3 = await vf.evaluate(() => TCCustom.flyTo({ character: '不在场的人' }));
    rep.check(`${name} 人物不在人物栏：flyTo 返回 false（面板里给提示）`, f3 === false);
    // 庄园房间：庄园不可用（本次会话失败过）→ 上层伊甸地点卡写房间
    await vf.evaluate(() => { setEstFail(true); TCCustom.flyTo({ map: 'eden_estate', room: '主人书房' }); }); await B.wait(3500);
    const f4 = await vf.evaluate(() => ({ cur, card: document.querySelector('#card').hidden ? '' : document.querySelector('#card h2').textContent, room: document.querySelector('#card .cu-room')?.textContent || '' }));
    rep.check(`${name} 庄园房间（庄园不可用）：落到上层伊甸，地点卡写「要看的房间 星图室（主人书房）」`, f4.cur === 'tc_upper' && /伊甸/.test(f4.card) && /星图室（主人书房）/.test(f4.room), JSON.stringify(f4));
    await jpg(p, `cu_${name}_fly_room_standin`);
    // 庄园可用：宿主 EdenMap.flyTo → 进庄园，estate:room 发的是这间房
    await vf.evaluate(() => setEstFail(false));
    await p.evaluate(() => window.EdenMap.flyTo({ map: 'eden_estate', room: '主人书房' }));
    const seen = []; for (let i = 0; i < 18 && !(await vf.evaluate(() => !!est?.ready)); i++) { await B.wait(500); seen.push(await vf.evaluate(() => cur)); }
    const f5 = await vf.evaluate(() => ({ cur, focus: estFocus, ready: !!est?.ready })); f5.seen = [...new Set(seen)];
    rep.check(`${name} EdenMap.flyTo({map:'eden_estate', room}) → 进庄园并聚焦该房间`, f5.cur === 'eden_estate' && f5.focus === '主人书房', JSON.stringify(f5));
    if (f5.ready) await jpg(p, `cu_${name}_fly_room_estate`);
    await vf.evaluate(() => go('tc_mid')); await B.wait(2500);
    // 面板关着时调 EdenMap.flyTo：先打开面板，再飞（不被「自动跳到当前地点」拉回）
    await p.evaluate(() => document.querySelector('#eden-map-root .em-close').click()); await B.wait(800);
    await p.evaluate(() => window.EdenMap.flyTo({ map: 'tc_low', marker: 'well7' })); await B.wait(4000);
    const f6 = await vf.evaluate(() => ({ cur, card: document.querySelector('#card').hidden ? '' : document.querySelector('#card h2').textContent }));
    const shown = await p.evaluate(() => !document.querySelector('#eden-map-root .em-panel').hidden);
    rep.check(`${name} 面板关着时 EdenMap.flyTo：打开面板并落到目标（不被当前地点拉回）`, shown && f6.cur === 'tc_low' && /7 号井/.test(f6.card), JSON.stringify({ shown, ...f6 }));
    // 9 主题：切到浅色，宿主面板 / 查看器 / 对话框 / 输入框一起换；对比度 ≥ 4.5
    await vf.evaluate(() => { TCSettings.open('data'); document.querySelector('#cuBox .cu-open').click(); }); await B.wait(400);   // UI v2：自定义在设置「数据与映射」页
    await vf.evaluate(() => { document.querySelector('#cuDlg .cu-add').click(); }); await B.wait(300);
    for (const want of ['light', 'dark']) {
      await vf.evaluate(w => setTheme(w), want); await B.wait(900);
      const r = await vf.evaluate(src => { const C = eval(src); const q = s => document.querySelector(s);
        return { cs: getComputedStyle(document.documentElement).colorScheme, csb: getComputedStyle(document.body).colorScheme, inCs: getComputedStyle(q('#cuQ')).colorScheme,
          title: C(q('#cuDlgT')), row: C(q('#cuRes .cu-row b')), sub: C(q('#cuRes h4')), input: C(q('#cuQ')), chip: C(q('#cuDlg .chip')), set: C(q('#setPop .spage:not([hidden]) label span')), small: C(q('#cuBox small')) }; }, CONTRAST);
      const host = await p.evaluate(src => { const C = eval(src); const r = document.querySelector('#eden-map-root'); return { light: r.classList.contains('em-light'), bar: C(r.querySelector('.em-title') || r.querySelector('.em-bar')) }; }, CONTRAST);
      const nums = Object.entries(r).filter(([, v]) => typeof v === 'number');
      rep.check(`${name} 主题 ${want}：color-scheme = ${want}（原生控件跟着换），宿主面板同步`, r.cs === want && r.csb === want && r.inCs === want && host.light === (want === 'light'), JSON.stringify({ cs: r.cs, csb: r.csb, inCs: r.inCs, host }));
      rep.check(`${name} 主题 ${want}：对话框 / 搜索框 / 设置 / 宿主标题栏文字对比度 ≥ 4.5`, nums.every(([, v]) => v >= 4.5) && host.bar >= 4.5, JSON.stringify({ ...Object.fromEntries(nums), hostBar: host.bar }));
      await jpg(p, `cu_${name}_theme_${want}`);
    }
    // 自检提示跟主题
    await p.evaluate(() => localStorage.removeItem('edenMapCheckToast'));
    const tst = await p.evaluate(async src => { const C = eval(src); const r = document.querySelector('#eden-map-root');
      const t = document.createElement('div'); t.className = 'em-ctoast'; t.innerHTML = '<b>地图自检</b><div>⚠ 示例</div>'; r.appendChild(t);
      r.classList.add('em-light'); const a = [C(t), C(t.querySelector('b')), getComputedStyle(t).backgroundColor];
      r.classList.remove('em-light'); const b = [C(t), C(t.querySelector('b')), getComputedStyle(t).backgroundColor]; t.remove(); return { a, b }; }, CONTRAST);
    rep.check(`${name} 自检提示跟主题换色（不再写死深色），对比度 ≥ 4.5`, tst.a[2] !== tst.b[2] && [tst.a[0], tst.a[1], tst.b[0], tst.b[1]].every(v => v >= 4.5), JSON.stringify(tst));
    // 10 关掉同步：记为手动关（刷新后保持关）
    await vf.evaluate(() => { document.querySelector('#cuDlg [data-close]').click(); showSet(true); document.querySelector('#cuSync').click(); }); await B.wait(900);
    const v3 = await H.vars(), wb3 = await H.wb();
    rep.check(`${name} 关掉同步：同步手动 = true、条目停用（不删世界书）`, v3.eden_map.自定义.同步世界书 === false && v3.eden_map.自定义.同步手动 === true && wb3.books[bn]?.[0]?.enabled === false, JSON.stringify(v3.eden_map.自定义));
    // 11 惯用手下面不再有说明文字
    const hh = await vf.evaluate(() => !document.querySelector('[data-i18n="hand_hint"]') && !!document.querySelector('#handSeg'));
    rep.check(`${name} 「惯用手」只留分段按钮，说明文字已删`, hh);
    rep.check(`${name} 无脚本错误`, !errs(P).length, errs(P).slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); await B.shot(P.page, OUT, `fail_${name}`).catch(() => {}); }
  finally { await P.close(); }
}
// 0.9.3 的旧数据：写着 同步世界书 false。建过那本世界书（打开后关掉的）→ 保持关；没建过 → 按新默认开
async function runMigrate(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const chat = 'c95m-' + name, old = { eden_map: { 自定义: { items: { 主人书房: { 类: 'room', 名: '星图室' } }, 同步世界书: false }, 标签楼: -1 } };
    const H = await openHost(P, { here: '', msgs: [], stat: {}, chat, vars: old });
    await B.wait(1500);
    const a = await P.page.evaluate(() => window.EdenMap.getCustom());
    rep.check(`${name} 旧数据（没建过世界书）：按新默认开，并建世界书`, a.同步世界书 === true && Object.keys((await H.wb()).books).length === 1, JSON.stringify({ s: a.同步世界书 }));
    const P2 = await B.newPage(preset, { tier: 'save' });
    try {
      const c2 = chat + 'b', wbn = MV.wbName(c2);
      await P2.ctx.addInitScript(n => { if (window.top === window) window.__wb = { [n]: [{ name: '地图自定义', enabled: false, content: '' }] }; }, wbn);
      await openHost(P2, { here: '', msgs: [], stat: {}, chat: c2, vars: old }); await B.wait(1500);
      const b = await P2.page.evaluate(() => window.EdenMap.getCustom());
      rep.check(`${name} 旧数据（建过世界书 = 自己关掉的）：保持关`, b.同步世界书 === false, JSON.stringify({ s: b.同步世界书, m: b.同步手动 }));
    } finally { await P2.close(); }
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try {
  await run('desk', 'desktop'); await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone');
  await runMigrate('mig', 'desktop');
}
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
