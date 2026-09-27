// E7 验收：单手（惯用手 左 / 右 / 自动、拇指区停靠栏、底部菜单 / 返回 / 关闭、抽屉下拉关闭）、单指缩放（双击按住上下拖）。
// 用法：EDEN_PORT=5187 node tools/browser/e7.mjs <输出目录> [--shots docs/drafts]
//   Chromium 375 × 812（phone）+ WebKit iPhone（375 / 414）各跑一遍；--shots 时另存 docs/drafts/ui_e7_*.jpg（CSS 像素、JPEG，≤ 300 KB）。
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/e7.mjs <输出目录> [--shots docs/drafts]'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const ONLY = process.env.E7_ONLY;   // 只跑名字里含这些词的步骤（逗号分隔），调试用
const step = async (name, fn) => { if (ONLY && !ONLY.split(',').some(k => name.includes(k))) return; try { await fn(); } catch (e) { rep.check(name, false, '异常：' + e.message.split('\n')[0]); } await B.closeAll(); };   // 同一时刻只开一个浏览器
const IPHONE414 = { engine: 'webkit', ctx: () => ({ ...B.pw.devices['iPhone 11 Pro Max'], viewport: { width: 414, height: 896 } }) };
B.PRESETS.iphone414 = IPHONE414;

// 9 个大类各一条，落在中层（有的落在地标上，有的按城区关键词）
const EV = [
  '⌖巡空令｜中层·核心区｜1｜骑士团巡空', '⌖气候故障｜中层·霓虹街｜2｜酸雨', '⌖盗窃｜中层·C区检查点｜2｜珠宝店失窃', '⌖议会质询｜中层·议会｜1｜质询空防预算',
  '⌖广告劫持｜中层·商业区｜2｜全息广告被劫持', '⌖急救｜中层·外围居住区｜1｜诊所满员', '⌖军事调动｜中层·军营｜2｜装甲进城', '⌖火灾｜中层·大学｜3｜实验楼起火', '⌖公开行程｜中层·星渊｜1｜首相视察',
].map((text, i) => ({ floor: 100 + i, text }));
async function jpg(page, name) {
  if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, `ui_e7_${name}.jpg`);
  for (const q of [72, 60, 48]) { await page.screenshot({ path: f, type: 'jpeg', quality: q, scale: 'css', timeout: 60000 }); if (fs.statSync(f).size <= 300 * 1024) break; }
  console.log('  截图', path.relative(process.cwd(), f), (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
}
// 停靠栏里每个可见控件的位置（相对视口）
// UI v2：控制列 #dock 只有 ⋯ + − ⌂（层切换在抽屉摘要行的层名胶囊里）
const dockBoxes = page => page.evaluate(() => [...document.querySelectorAll('#dock button')].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden')
  .map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.dataset.go || e.getAttribute('aria-label'), l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
const osdCenter = page => page.evaluate(() => { const r = viewer.container.getBoundingClientRect(); return { x: r.left + r.width * .5, y: r.top + r.height * .4 }; });
// 合成触摸指针事件（两个引擎都能跑）：点在 OSD 画布上
const touch = (page, type, x, y, id = 7) => page.evaluate(([type, x, y, id]) => {
  const el = document.elementFromPoint(x, y);
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, buttons: type === 'pointerup' ? 0 : 1 }));
}, [type, x, y, id]);
const zoomNow = page => page.evaluate(() => viewer.viewport.getZoom(true));
const pixOf = (page, p) => page.evaluate(p => { const q = viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(p.x, p.y), true), r = viewer.container.getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top }; }, p);
const ptAt = (page, x, y) => page.evaluate(([x, y]) => { const r = viewer.container.getBoundingClientRect(); const p = viewer.viewport.pointFromPixel(new OpenSeadragon.Point(x - r.left, y - r.top), true); return { x: p.x, y: p.y }; }, [x, y]);

async function phone(preset, hand, tag) {
  const P = await B.newPage(preset, { tier: 'save', init: [h => { try { localStorage.setItem('edenMapHand', h); } catch (e) {} }, hand] });
  const p = P.page, W = p.viewportSize().width, H = p.viewportSize().height;
  await B.openViewer(P, { map: 'tc_mid' }); await B.wait(1200);
  await B.postEvents(p.mainFrame(), EV); await B.wait(800);
  // 1. 拇指区：停靠栏整列贴在惯用手一侧、全部在屏幕下 60%
  const bx = await dockBoxes(p), side = await p.evaluate(() => document.documentElement.dataset.hand);
  const eff = hand === 'auto' ? 'right' : hand;
  const onSide = bx.every(b => eff === 'left' ? b.l < W * .5 && b.l >= 0 : b.r > W * .5 && b.r <= W);
  const inZone = bx.every(b => b.t >= H * .4 && b.b <= H);
  rep.check(`${tag} 停靠栏在${eff === 'left' ? '左' : '右'}手拇指区（下 60%）`, side === eff && onSide && inZone && bx.length >= 2,   // v0.9.6：触屏不显示缩放组、层切换器收成一个胶囊（菜单 + 当前层）
    `${bx.length} 个控件；最高 ${Math.round(Math.min(...bx.map(b => b.t)))} px / ${H}；${eff === 'left' ? '最右 ' + Math.round(Math.max(...bx.map(b => b.r))) : '最左 ' + Math.round(Math.min(...bx.map(b => b.l)))} px / ${W}`);
  const hits = await p.evaluate(() => [...document.querySelectorAll('#dock button, #evbar .uis-lead #layers button')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e, '::before');
    return Math.min(r.width, r.height) + (s.content !== 'none' ? Math.max(0, -parseFloat(s.top) || 0) * 2 : 0); }));
  rep.check(`${tag} 停靠栏触控热区 ≥ 40 px`, Math.min(...hits) >= 40, `最小 ${Math.min(...hits).toFixed(0)} px`);
  // 事态横条不和停靠栏重叠
  const ov = await p.evaluate(() => { const e = document.querySelector('#evbar'), d = document.querySelector('#dock'); if (!e || e.hidden) return 'no-evbar';
    const a = e.getBoundingClientRect(), b = [...d.children].filter(x => x.offsetParent).map(x => x.getBoundingClientRect());
    return b.some(r => a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top) ? 'overlap' : 'ok'; });
  rep.check(`${tag} 抽屉让开控制列`, ov === 'ok', ov);
  await jpg(p, `${tag}_map`);
  // 2. 底部菜单：打开抽屉，里面有「返回世界」；抽屉在下半屏
  await p.locator('#thumbBtn').click(); await B.wait(400);
  const menu = await p.evaluate(() => ({ open: !document.querySelector('#setPop').hidden, up: !document.querySelector('#actUp').hidden ? document.querySelector('#actUp').textContent : '',
    top: document.querySelector('#setPop').getBoundingClientRect().top, exp: document.querySelector('#thumbBtn').getAttribute('aria-expanded'),
    upBox: (() => { const r = document.querySelector('#actUp').getBoundingClientRect(); return [r.left, r.right, r.bottom]; })() }));
  rep.check(`${tag} 底部菜单按钮打开抽屉（含「返回上一级」）`, menu.open && menu.up && menu.exp === 'true', `「${menu.up}」，抽屉顶 ${Math.round(menu.top)} px，按钮 x ${menu.upBox.slice(0, 2).map(Math.round).join('–')}`);
  await p.evaluate(() => document.querySelector('#handSeg').scrollIntoView({ block: 'center' })); await B.wait(200);
  await jpg(p, `${tag}_menu`);
  await p.locator('#actUp').click(); await p.waitForFunction(() => cur === 'world', null, { timeout: 15000 }).catch(() => {});
  rep.check(`${tag} 「返回上一级」到世界图`, await p.evaluate(() => cur === 'world' && document.querySelector('#setPop').hidden));
  await B.goMap(p, 'tc_mid'); await B.wait(1000);
  // 3. 单指缩放：点一下，再按住往下拖 120 px → 放大约 2 倍，按下点不漂；双击不拖 → 放大 2 倍；往上拖 → 缩小
  const c = await osdCenter(p);
  const z0 = await zoomNow(p), ref = await ptAt(p, c.x, c.y);
  await touch(p, 'pointerdown', c.x, c.y); await touch(p, 'pointerup', c.x, c.y); await B.wait(80);
  await touch(p, 'pointerdown', c.x, c.y);
  for (let d = 10; d <= 120; d += 10) { await touch(p, 'pointermove', c.x, c.y + d); await B.wait(16); }
  await touch(p, 'pointerup', c.x, c.y + 120); await B.wait(900);
  const z1 = await zoomNow(p), drift = await pixOf(p, ref);
  rep.check(`${tag} 单指缩放：双击按住往下拖 120 px 放大 ≈ 2×、不平移`, z1 / z0 > 1.7 && z1 / z0 < 2.3 && Math.hypot(drift.x - c.x, drift.y - c.y) < 4,
    `×${(z1 / z0).toFixed(2)}，按下点漂移 ${Math.hypot(drift.x - c.x, drift.y - c.y).toFixed(1)} px`);
  await touch(p, 'pointerdown', c.x, c.y); await touch(p, 'pointerup', c.x, c.y); await B.wait(80);
  await touch(p, 'pointerdown', c.x, c.y);
  for (let d = 10; d <= 120; d += 10) { await touch(p, 'pointermove', c.x, c.y - d); await B.wait(16); }
  await touch(p, 'pointerup', c.x, c.y - 120); await B.wait(900);
  const z2 = await zoomNow(p);
  rep.check(`${tag} 单指缩放：往上拖缩小`, z2 < z1 * .7, `×${(z2 / z1).toFixed(2)}`);
  await touch(p, 'pointerdown', c.x, c.y); await touch(p, 'pointerup', c.x, c.y); await B.wait(80);
  await touch(p, 'pointerdown', c.x, c.y); await touch(p, 'pointerup', c.x, c.y); await B.wait(1200);
  const z3 = await zoomNow(p);
  rep.check(`${tag} 双击（不拖）放大 2×，只放大一次`, z3 / z2 > 1.8 && z3 / z2 < 2.2, `×${(z3 / z2).toFixed(2)}`);
  // 单指拖动仍是平移（不误触发缩放）
  const zb = await zoomNow(p);
  await touch(p, 'pointerdown', c.x, c.y); for (let d = 10; d <= 80; d += 10) { await touch(p, 'pointermove', c.x + d, c.y); await B.wait(16); } await touch(p, 'pointerup', c.x + 80, c.y); await B.wait(700);
  rep.check(`${tag} 普通单指拖动不缩放`, Math.abs(await zoomNow(p) / zb - 1) < .02);
  // 4. 卡片抽屉：打开一个事态卡，关闭按钮在拇指侧，往下拖把手关闭
  await p.evaluate(() => { const e = TCEvents.events[0]; TCEvents.flyTo(e.id); }); await p.waitForFunction(() => !document.querySelector('#card').hidden, null, { timeout: 8000 }).catch(() => {});
  await B.wait(900);
  const xb = await p.evaluate(() => { const r = document.querySelector('#cardX').getBoundingClientRect(); return r.left + r.width / 2; });
  rep.check(`${tag} 卡片关闭按钮在${eff === 'left' ? '左' : '右'}侧`, eff === 'left' ? xb < W / 2 : xb > W / 2, `x ${Math.round(xb)}`);
  await jpg(p, `${tag}_card`);
  // UI v2：卡片在唯一抽屉的「地点」页；拖柄往下 = 抽屉降到收起（地点页留着，点「地点」再展开）
  const g = await p.evaluate(() => { const r = document.querySelector('#evbar .uis-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, st: TCSheet.state }; });
  await touch(p, 'pointerdown', g.x, g.y, 9); for (let d = 20; d <= 240; d += 20) { await touch(p, 'pointermove', g.x, g.y + d, 9); await B.wait(16); } await touch(p, 'pointerup', g.x, g.y + 240, 9); await B.wait(400);
  rep.check(`${tag} 抽屉往下拖收起（${g.st} → 收起）`, await p.evaluate(() => TCSheet.state === 'peek'));
  await p.locator('#evbar .uis-tog').click(); await B.wait(300);
  rep.check(`${tag} 文字按钮「展开」再打开（WCAG 2.5.7）`, await p.evaluate(() => TCSheet.state === 'half' && document.querySelector('#evbar .uis-tog').getAttribute('aria-expanded') === 'true'));
  rep.metric(tag + '_errors', P.errors.slice(0, 10));
  rep.check(`${tag} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  await P.close();
}

try {
  await step('phone right', () => phone('phone', 'right', 'phone375_right'));
  await step('phone left', () => phone('phone', 'left', 'phone375_left'));
  await step('iphone414 left', () => phone('iphone414', 'left', 'iphone414_left'));
  await step('iphone414 right', () => phone('iphone414', 'auto', 'iphone414_auto'));
  await step('iphone375 left', () => phone('iphone', 'left', 'iphone375_left'));

  // 自动：悬浮按钮在左半边 → 左手；设置持久（刷新后仍在）；庄园里停靠栏是底部一行
  await step('自动与持久', async () => {
    const P = await B.newPage('phone', { tier: 'save', init: [() => { try { if (!sessionStorage.getItem('__e7')) { sessionStorage.setItem('__e7', '1'); localStorage.setItem('edenMapFabPos', '[0.05,0.8]'); localStorage.removeItem('edenMapHand'); } } catch (e) {} }] });
    const p = P.page; await B.openViewer(P, { map: 'tc_upper' }); await B.wait(600);
    rep.check('自动：悬浮按钮拖在左半边 → 左手布局', await p.evaluate(() => document.documentElement.dataset.hand) === 'left');
    await p.locator('#thumbBtn').click(); await B.wait(300);
    await p.locator('#setPop .sgroups button[data-page="display"]').click(); await B.wait(200);   // UI v2：惯用手在设置「显示」页
    await p.locator('#handSeg button[data-hand="right"]').click(); await B.wait(300);
    await p.reload(); await p.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 20000 }).catch(() => {});
    const st = await p.evaluate(() => ({ hand: document.documentElement.dataset.hand, pref: localStorage.getItem('edenMapHand') }));
    rep.check('设置记在本机：刷新后仍是右手', st.hand === 'right' && st.pref === 'right', JSON.stringify(st));
    await B.goMap(p, 'eden_estate', 60000); await B.wait(1500);
    // UI v2：三维页自带控制列与抽屉（ui/chrome3d.js），查看器的控制列让开；「⋯」在顶栏
    const row = await p.evaluate(() => ({ dock: getComputedStyle(document.querySelector('#dock')).display, set: !!document.querySelector('#setBtn').offsetParent, sheet: document.querySelector('#evbar').hidden }));
    rep.check('庄园：查看器控制列与抽屉让给三维页，顶栏有「⋯」', row.dock === 'none' && row.set && row.sheet, JSON.stringify(row));
    await jpg(p, 'estate_right');
    await P.close();
  });

  // 嵌入酒馆：抽屉里的「关闭地图」发 eden-map:esc 给宿主（卡内脚本据此关面板）
  await step('嵌入关闭', async () => {
    const P = await B.newPage('phone', { tier: 'save' });
    const f = await B.openInHost(P, B.BASE + 'viewer.html?map=tc_mid', { frameH: 700 });
    await P.page.evaluate(() => { window.__msgs = []; addEventListener('message', e => window.__msgs.push(e.data?.type)); });
    await f.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 20000 }).catch(() => {});
    await f.locator('#thumbBtn').click(); await B.wait(300);
    const vis = await f.evaluate(() => !document.querySelector('#actClose').hidden);
    await f.locator('#actClose').click(); await B.wait(300);
    const msgs = await P.page.evaluate(() => window.__msgs);
    rep.check('嵌入时抽屉里有「关闭地图」，点了发 eden-map:esc', vis && msgs.includes('eden-map:esc'), msgs.filter(m => /esc|state/.test(m || '')).join(','));
    await P.close();
  });

  // 减少动效：双击放大直接到位（没有动画）
  await step('减少动效', async () => {
    const P = await B.newPage('phone', { tier: 'save' }); await P.page.emulateMedia({ reducedMotion: 'reduce' });
    const p = P.page; await B.openViewer(P, { map: 'tc_mid' }); await B.wait(800);
    const c = await osdCenter(p), z0 = await zoomNow(p);
    await touch(p, 'pointerdown', c.x, c.y); await touch(p, 'pointerup', c.x, c.y); await B.wait(60); await touch(p, 'pointerdown', c.x, c.y); await touch(p, 'pointerup', c.x, c.y);
    const z1 = await zoomNow(p);
    rep.check('减少动效：双击放大立即到位', z1 / z0 > 1.8, `立即 ×${(z1 / z0).toFixed(2)}`);
    await P.close();
  });

  // 桌面：控制列在右下（右栏左侧），层切换器在控制列顶上常展开
  await step('桌面布局不变', async () => {
    const P = await B.newPage('desktop', { tier: 'save', init: [() => { try { localStorage.setItem('edenMapHand', 'left'); } catch (e) {} }] });
    const p = P.page; await B.openViewer(P, { map: 'tc_mid' }); await B.wait(600);
    const d = await p.evaluate(() => ({ dock: getComputedStyle(document.querySelector('#dock')).display, thumb: getComputedStyle(document.querySelector('#thumbBtn')).display,
      zoom: document.querySelector('#zoom').getBoundingClientRect().right, lay: document.querySelector('#layers').getBoundingClientRect().left }));
    rep.check('桌面：控制列右下，层切换器在控制列里，没有「⋯」', d.dock === 'flex' && d.thumb === 'none' && d.zoom > 1300 && d.lay > 1200, JSON.stringify(d));
    await P.close();
  });
} finally {
  await B.closeAll(); srv.stop();
}
const ok = rep.save();
console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`);
process.exit(ok ? 0 : 1);
