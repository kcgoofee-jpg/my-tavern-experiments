// node tools/browser/pack_town.mjs <输出目录> —— 通用化：核心换一个设定包（map/packs/town，虚构小镇 2 层 5 地点 3 类事件）照常运行
// 桌面 1440 + 手机 375：?pack=town 打开 → 首图 = 包的 start、层切换器 2 层、地点数对、跨层链接能走、事件按包的分类上图（图例 = 包的大类）、
// 本机存储写进 tcp.town.* 命名空间（不碰 eden 的 edenMap* 键）；再开一次不带 pack 的查看器，确认 eden 默认照旧（世界图 + 标记）。
import fs from 'node:fs';
import path from 'node:path';
import { BASE, REPO_ROOT, closeAll, ensureServer, newPage, shot, wait } from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { knownFor, probeName, loadKnown } from './known.mjs';
const out = process.argv[2] || '/tmp/pack_town';
const srv = await ensureServer();
const res = []; let fail = 0;
const KNOWN = loadKnown(), PROBE = probeName(), knownPassed = new Set();   // tools/browser/known-failures.json
const ok = (name, cond, extra = {}) => {
  const k = cond ? null : knownFor(PROBE, name, KNOWN);
  if (cond) for (const e of KNOWN) if (e.probe === PROBE && name.includes(e.check)) knownPassed.add(e.check);
  res.push({ name, ok: !!cond, ...(k ? { known: k } : {}), ...extra }); if (!cond && !k) fail++;
};
const tax = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'map/packs/town/events.json'), 'utf8'));
const EV = await import(path.join(REPO_ROOT, 'map/tavern/events-parse.mjs'));
EV.setGeo((await import(path.join(REPO_ROOT, 'tools/eden_geo.mjs'))).packGeo('town'));
const items = EV.collect([{ floor: 5, text: '<span style="display:none">⌖火灾｜雾港镇·码头·鱼市｜2｜鱼市仓库起火｜巡夜队</span>' },
  { floor: 6, text: '<span style="display:none">⌖集市日｜山上·集市广场｜1｜周末集市开张</span>' }], 6);
EV.setGeo(null);
ok('node：包分类解析出 2 条事件，层 / 地点 / 大类都按包', items.length === 2 && items.some(e => e.layer === '码头' && e.place === '鱼市' && e.grp === '灾害') && items.some(e => e.cat === '节庆' && e.layer === '山上'), { items: items.map(e => [e.cat, e.layer, e.place, e.grp]) });
try {
  for (const preset of ['desktop', 'phone']) {
    const P = await newPage(preset); const pg = P.page;
    await pg.goto(BASE + 'viewer.html?pack=town', { waitUntil: 'commit' });
    await pg.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {});
    await wait(1200);
    await pg.evaluate(() => localStorage.setItem('tcp.town.Hint', '1'));
    const s1 = await pg.evaluate(() => ({ cur: ViewerDebug.currentMapId, pack: document.documentElement.dataset.pack, marks: document.querySelectorAll('.mk').length,
      layers: [...document.querySelectorAll('#layers button')].map(b => b.dataset.go), names: [...document.querySelectorAll('.mk')].map(e => e.dataset.name) }));
    ok(`${preset}：首图 = town_hill，3 个地点，层切换器 2 层`, s1.cur === 'town_hill' && s1.pack === 'town' && s1.marks === 3 && s1.layers.length === 2, s1);
    await shot(pg, out, `town_hill_${preset}`);
    await pg.evaluate(ev => EventsView.set({ type: 'eden-map:events', items: ev, floor: 6 }), items.map(e => ({ ...e, isNew: true })));
    await wait(800);
    const s2 = await pg.evaluate(() => ({ approx: document.querySelectorAll('.ev.approx').length, leg: [...document.querySelectorAll('.evleg button')].map(b => b.dataset.g), evs: document.querySelectorAll('.ev').length }));
    ok(`${preset}：事件图例是包的大类（有事件的 市政 / 灾害），山上的事件上图`, ['市政', '灾害'].every(g => s2.leg.includes(g)) && !s2.leg.includes('空防') && s2.evs >= 1, s2);
    await shot(pg, out, `town_events_${preset}`);
    await pg.evaluate(() => ViewerDebug.go('town_harbour')); await wait(2000);
    const s3 = await pg.evaluate(() => ({ cur: ViewerDebug.currentMapId, marks: [...document.querySelectorAll('.mk')].map(e => e.dataset.name) }));
    ok(`${preset}：切到码头，2 个地点`, s3.cur === 'town_harbour' && s3.marks.length === 2, s3);
    await shot(pg, out, `town_harbour_${preset}`);
    const s4 = await pg.evaluate(() => { LocalStore.set('edenMapFog', '1'); return Object.keys(localStorage).filter(k => k.startsWith('tcp.town.') || k === 'edenMapFog'); });
    ok(`${preset}：本机存储在 tcp.town.* 命名空间`, s4.includes('tcp.town.Fog') && !s4.includes('edenMapFog'), { keys: s4 });
    ok(`${preset}：没有脚本错误 / 404`, !P.errors.length, { errors: P.errors });
    await P.ctx.close();
    // eden 默认：同一个 origin，不带 pack
    const E = await newPage(preset);
    await E.page.goto(BASE + 'viewer.html', { waitUntil: 'commit' });
    await E.page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {});
    await wait(1200);
    const e1 = await E.page.evaluate(() => ({ cur: ViewerDebug.currentMapId, pack: document.documentElement.dataset.pack || 'eden', n: document.querySelectorAll('.mk, .realm, .place').length }));
    ok(`${preset}：不带 pack = eden 世界图照旧`, e1.cur === 'world' && e1.pack === 'eden' && e1.n > 0 && !E.errors.length, { ...e1, errors: E.errors });
    await E.ctx.close();
  }
  // 宿主（卡内脚本 eden-map.js）带包：聊天原文里的标签按包分类解析、注入句用包的标签、聊天变量写 tc_town、面板里是包的首图
  for (const preset of ['desktop', 'phone']) {
    const P = await newPage(preset);
    const pack = { id: 'town', chatVar: 'tc_town', manifest: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'map/packs/town/manifest.json'), 'utf8')), events: tax };
    await P.ctx.addInitScript(() => { try { localStorage.setItem('tcp.town.Line', 'vpn'); localStorage.setItem('tcp.town.Hint', '1'); localStorage.setItem('tcp.town.SplashSeen', 'dev'); } catch (e) {} });
    const H = await openHost(P, { here: '码头·鱼市', pack, msgs: [{ message_id: 3, message: '夜里。<span style="display:none">⌖火灾｜码头·鱼市｜2｜鱼市仓库起火｜巡夜队</span>' }] });
    await H.open(); await wait(1500);
    const vf = await H.viewer();
    if (vf) { await vf.evaluate(() => document.getElementById('hereGo')?.click()); await wait(2500); }
    const v = vf ? await vf.evaluate(() => ({ cur: ViewerDebug.currentMapId, pack: document.documentElement.dataset.pack, marks: document.querySelectorAll('.mk').length, here: document.querySelector('.mk.here')?.dataset.name || '' })) : null;
    const inj = await H.injected(), vars = await H.vars();
    ok(`${preset} 宿主：面板里是包的地图；「当前位置」跳到码头并高亮鱼市`, v?.pack === 'town' && /^town_/.test(v.cur) && v.here === '鱼市', v || {});
    ok(`${preset} 宿主：注入句用包的分类与标签`, /雾港镇事态/.test(inj) && /火灾/.test(inj) && !/天城/.test(inj), { inj });
    ok(`${preset} 宿主：聊天变量只写 tc_town`, vars && !('eden_map' in vars) && ('tc_town' in vars), { keys: Object.keys(vars || {}) });
    const keys = await P.page.evaluate(() => Object.keys(localStorage).filter(k => /^edenMap/.test(k) && k !== 'edenMapLang' && k !== 'edenMapHint' && k !== 'edenMapSplashSeen'));
    ok(`${preset} 宿主：没写 eden 的本机键`, !keys.length, { keys });
    ok(`${preset} 宿主：没有脚本错误`, !P.errors.length, { errors: P.errors });
    await shot(P.page, out, `host_town_${preset}`);
    await P.ctx.close();
  }
} catch (e) { fail++; res.push({ error: String(e?.stack || e) }); }
fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(res, null, 1));
for (const r of res) console.log(r.ok ? '✓' : r.known ? '~ KNOWN' : '✗', r.name || r.error, r.ok ? '' : JSON.stringify(r).slice(0, 400));
for (const c of knownPassed) console.log(`FIXED：${PROBE} / ${c} 现在通过了——从 tools/browser/known-failures.json 里删掉这一条`);
await closeAll(); srv.stop();
console.log(fail ? `有失败：${fail}` : '全部通过'); process.exit(fail ? 1 : 0);
