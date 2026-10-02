// S2-B 探针：从庄园的农场区域下钻进挤奶厅，再返回（拓扑下钻，不留孤立入口）。
// 用法：node tools/browser/topo_dairy.mjs [输出目录] [--shots 截图目录]
// 走的是真实交互：区域卡上的「进入三维」按钮、双击区域、上一级按钮、面包屑；等待一律用条件，不用固定延时。
import * as B from './lib.mjs';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/topo_dairy';
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null;
B.quietWait();
await B.ensureServer();
const rep = B.reporter(out);
const T = 90000;
const P = await B.newPage('desktop'), p = P.page;
const snap = async name => { if (SHOTS) await B.shot(p, SHOTS, name); };
// 三维页就绪：庄园（__estate）或通用三维查看器（__viewer3dProbe.ready）
const ready = id => p.waitForFunction(id => { if (ViewerDebug.currentMapId !== id || document.querySelectorAll('#stage iframe').length !== 1) return false; const f = document.querySelector('#estate.on'); try { return !!(f && (f.contentWindow.__estate || f.contentWindow.__viewer3dProbe?.ready)); } catch (e) { return false; } }, id, { timeout: T });
const frame = () => B.estateFrame(p);
const crumbs = () => p.evaluate(() => ({ links: [...document.querySelectorAll('#crumbs a')].map(a => a.dataset.go), here: document.querySelector('#crumbs b')?.textContent || '' }));
const live = () => p.evaluate(() => ({ frames: document.querySelectorAll('#stage iframe').length, lease: window.Lease3dApi?.live() }));
/** S7-3: the zone card is the viewer's shared place card (the page only reports the pick): pick the zone as a user tap would, then read the card in the viewer */
const pickZone = async id => { await focusZone(id); await p.evaluate(id => document.querySelector('#estate').contentWindow.__estate.pick(id), id); };
const viewerCard = () => p.evaluate(() => ({ h3: document.getElementById('cardTitle')?.textContent || '', n: document.querySelectorAll('#card:not([hidden]) .extra [data-go]').length, btn: document.querySelector('#card:not([hidden]) .extra [data-go]')?.textContent || '' }));
const focusZone = id => p.evaluate(id => document.querySelector('#estate').contentWindow.postMessage({ type: 'estate:room', name: id }, '*'), id);   // 宿主发给三维页的那条消息，按区域 id
// 读当前那个 iframe（不握旧的 frame 句柄：返回庄园时三维页换 iframe，CI 上旧句柄可能已脱离；S7-2 后 CI 偶发 'pinned' of undefined）
const pinnedZone = () => p.evaluate(() => { try { return document.querySelector('#estate')?.contentWindow?.__estate?.pinned?.()?.id ?? null; } catch (e) { return null; } });
const waitPinned = id => p.waitForFunction(id => { try { return document.querySelector('#estate')?.contentWindow?.__estate?.pinned?.()?.id === id; } catch (e) { return false; } }, id, { timeout: 40000 }).catch(() => {});

try {
  // ---- 拓扑：没有孤立入口 ----
  await B.openViewer(P, { map: 'world' });
  const topo = await p.evaluate(() => {
    const M = ViewerDebug.mapRegistry.maps, links = [];
    for (const [k, m] of Object.entries(M)) for (const [mk, v] of Object.entries(m.markers || {})) if (v?.link?.map === 'dairy') links.push(k + '/' + mk);
    return { links, test: M.dairy.test, parent: M.dairy.parent, group: M.dairy.group ?? null, goEls: document.querySelectorAll('[data-go="dairy"]').length };
  });
  rep.check('no_marker_links_to_dairy', topo.links.length === 0, JSON.stringify(topo.links));
  rep.check('dairy_is_child_of_estate', topo.parent === 'eden_estate' && topo.test === undefined && topo.group === null, JSON.stringify(topo));
  rep.check('no_top_level_link_on_world', topo.goEls === 0, String(topo.goEls));
  await p.evaluate(() => SettingsApi.open('home')); await p.waitForSelector('#setPop:not([hidden])', { timeout: 5000 }).catch(() => {});
  const setHas = await p.evaluate(() => { const t = document.getElementById('setPop')?.innerHTML || ''; return { go: /data-go="dairy"/.test(t), name: /挤奶厅|Dairy parlour/i.test(t), test: /测试入口|test entry/i.test(t) }; });
  rep.check('no_settings_entry', !setHas.go && !setHas.name && !setHas.test, JSON.stringify(setHas));
  await p.keyboard.press('Escape');

  // ---- 进入庄园：农场区域卡带「进入三维」----
  await p.evaluate(() => ViewerDebug.go('eden_estate')); await ready('eden_estate');
  const F = await frame();
  await pickZone('dairy');
  await p.waitForSelector('#card:not([hidden]) .extra [data-go]', { timeout: 10000 }).catch(() => {});
  const cardTxt = await viewerCard();
  rep.check('farm_card_has_enter_action', cardTxt.n === 1 && /进入三维/.test(cardTxt.btn), JSON.stringify(cardTxt));
  await F.evaluate(() => window.__estate.pick('主楼')); await B.wait(800);
  const other = await viewerCard();
  rep.check('other_zone_has_no_action', other.n === 0, JSON.stringify(other));
  await pickZone('dairy');
  await p.waitForSelector('#card:not([hidden]) .extra [data-go]', { timeout: 10000 });
  await snap('estate_farm_card');

  // ---- 进入：卡上的按钮 ----
  await p.locator('#card .extra [data-go]').click();
  await ready('dairy');
  let c = await crumbs();
  rep.check('enter_by_button_breadcrumb', JSON.stringify(c.links) === '["world","tc_upper","eden_estate"]' && c.here === (await p.evaluate(() => ViewerDebug.mapRegistry.maps.dairy.title)), JSON.stringify(c));
  let l = await live(); rep.check('single_gl_context_in_dairy', l.frames === 1 && l.lease === 1, JSON.stringify(l));
  await snap('dairy_view');

  // ---- 返回：上一级按钮 → 庄园，聚焦农场 ----
  const up = await p.evaluate(() => { const b = document.getElementById('upBtn'); return { go: b.dataset.go, focus: b.dataset.focus || '', hidden: b.hidden }; });
  rep.check('up_button_targets_estate_and_farm', up.go === 'eden_estate' && up.focus === 'dairy' && !up.hidden, JSON.stringify(up));
  await p.locator('#upBtn').click();
  await ready('eden_estate');
  await waitPinned('dairy');
  rep.check('back_focuses_farm', (await pinnedZone()) === 'dairy', String(await pinnedZone()));
  l = await live(); rep.check('single_gl_context_back', l.frames === 1 && l.lease === 1, JSON.stringify(l));
  await snap('estate_back_on_farm');

  // ---- 进入：双击区域 ----
  const F2 = await frame();
  // 从农场返回后镜头就停在农场上：等镜头稳住（投影坐标连续两次不变且在画面内），再双击区域中心
  const proj = () => F2.evaluate(async () => {
    const z = (await fetch('model/zones.json').then(r => r.json())).zones.find(z => z.id === 'dairy'), { camera: c } = window.__estate;
    const v = c.position.clone().set(z.x, z.z + 1, -z.y).project(c); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, w: innerWidth, h: innerHeight };
  });
  let xy = await proj();
  for (let i = 0; i < 40; i++) { const n = await proj(); const still = Math.abs(n.x - xy.x) < .5 && Math.abs(n.y - xy.y) < .5; xy = n; if (still && n.x > 0 && n.x < n.w && n.y > 0 && n.y < n.h) break; await F2.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
  const off = await (await F2.frameElement()).boundingBox();
  await p.waitForFunction(() => document.getElementById('upBtn'), null, { timeout: 5000 });
  await p.mouse.dblclick(off.x + xy.x, off.y + xy.y);
  await ready('dairy').catch(() => {});
  rep.check('enter_by_double_click', await p.evaluate(() => ViewerDebug.currentMapId === 'dairy'), JSON.stringify(xy));
  // ---- 返回：面包屑里的伊甸庄园 ----
  await p.locator('#crumbs a[data-go="eden_estate"]').click();
  await ready('eden_estate');
  await waitPinned('dairy');
  rep.check('back_by_crumb_focuses_farm', (await pinnedZone()) === 'dairy', String(await pinnedZone()));
  // 返回后宿主又推一次同一个当前地点（慢机器上常落在聚焦之后）：落点区域不能被当前地点盖掉
  await p.evaluate(() => document.querySelector('#here').dispatchEvent(new Event('input'))); await B.wait(1500);   // 同值刷新：markHere → estateRoom
  rep.check('focus_survives_location_refresh', (await pinnedZone()) === 'dairy', String(await pinnedZone()));
  // 直接返回上层不带落点：庄园之外的面包屑不带 data-focus
  await p.evaluate(() => ViewerDebug.go('tc_upper')); await p.waitForFunction(() => ViewerDebug.currentMapId === 'tc_upper', null, { timeout: T });
  rep.check('flat_crumbs_carry_no_focus', await p.evaluate(() => !document.querySelector('#crumbs a[data-focus]') && !document.getElementById('upBtn').dataset.focus));
  // 375 px 一次
  await p.setViewportSize({ width: 375, height: 812 });
  await p.evaluate(() => ViewerDebug.go('eden_estate')); await ready('eden_estate');
  await frame(); await pickZone('dairy');
  await p.waitForSelector('#card:not([hidden]) .extra [data-go]', { state: 'attached', timeout: 10000 }).catch(() => {});
  rep.check('phone_card_has_action', await p.evaluate(() => !!document.querySelector('#card:not([hidden]) .extra [data-go]')));
  await snap('estate_farm_card_375');
  await p.evaluate(() => document.querySelector('#card .extra [data-go]').click()); await ready('dairy');
  rep.check('phone_enter_ok', await p.evaluate(() => ViewerDebug.currentMapId === 'dairy'));
  await snap('dairy_view_375');
} catch (e) { rep.check('probe_ran', false, String(e.message).split('\n')[0]); }
const errs = P.errors.filter(x => !/favicon|ERR_BLOCKED|net::/i.test(x));
rep.check('no_page_errors', errs.length === 0, errs.slice(0, 3).join(' | '));
const ok = rep.save();
await B.closeAll();
process.exit(ok ? 0 : 1);
