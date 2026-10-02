// 浏览器测试公共库（Playwright，ESM）。用法见 tools/browser/README.md；示例 accept.mjs。
// 来源：E4 / E4b 人设测试（ui/weak/lib.mjs、harness.mjs、fix/run.mjs）与 C3 庄园门控（c3/gate.mjs）里反复用到的片段。
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracker } from './known.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 端口：EDEN_PORT 优先；否则按本工作树路径哈希到 5200–5999（每个 worktree 固定、互不相同），不再默认共用 5178——
// 以前 worktree 里的测试会悄悄打到主 checkout / 别的 worktree 起的服务上。PORT / BASE 是 live binding，ensureServer 可能改它们。
const MAP_ROOT = fs.realpathSync(path.join(REPO_ROOT, 'map'));
const hashPort = s => { let h = 2166136261; for (const c of Buffer.from(s)) h = Math.imul(h ^ c, 16777619) >>> 0; return 5200 + h % 800; };
export let PORT = +(process.env.EDEN_PORT || hashPort(MAP_ROOT));
export let BASE = process.env.EDEN_BASE || `http://localhost:${PORT}/`;
export const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- Playwright：先找 tools/browser/node_modules，再找 PLAYWRIGHT_DIR，最后找 npx 缓存 ----------
function findPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = [() => req.resolve('playwright')];
  if (process.env.PLAYWRIGHT_DIR) tries.push(() => req.resolve(process.env.PLAYWRIGHT_DIR));
  const npx = path.join(os.homedir(), '.npm/_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, 'node_modules/playwright');
    if (fs.existsSync(path.join(p, 'package.json'))) tries.push(() => req.resolve(p));
  }
  for (const t of tries) { try { return req(t()); } catch (e) {} }
  throw new Error('找不到 playwright：cd tools/browser && npm install（或设 PLAYWRIGHT_DIR）；浏览器：npx playwright install chromium webkit');
}
export const pw = findPlaywright();

// ---------- 安静期锁（tools/quiet.sh）：开浏览器前先等 ----------
export function quietWait() {
  const r = spawnSync('bash', [path.join(REPO_ROOT, 'tools/quiet_wait.sh')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('quiet_wait 失败，退出码 ' + r.status);
}

// ---------- 本地服务：端口上已有服务且 /__root 就是本工作树的 map/ 才复用；否则起 tools/cors_server.py ----------
// 端口被别的目录的服务占着：EDEN_PORT 显式指定时照用并警告；默认端口时往后找空端口自己起。EDEN_BASE 指定时不校验。
export async function ensureServer() {
  const up = async b => { try { const r = await fetch(b + 'viewer.html', { method: 'HEAD' }); return r.ok; } catch (e) { return false; } };
  const root = async b => { try { const r = await fetch(b + '__root'); return r.ok ? (await r.text()).trim() : null; } catch (e) { return null; } };
  const busy = async p => { try { await fetch(`http://localhost:${p}/`, { method: 'HEAD' }); return true; } catch (e) { return false; } };
  if (process.env.EDEN_BASE) { if (await up(BASE)) return { started: false, stop() {} }; throw new Error(`${BASE} 连不上`); }
  if (await up(BASE)) {
    const r = await root(BASE);
    if (r === MAP_ROOT) return { started: false, stop() {} };
    if (process.env.EDEN_PORT) { console.warn(`[lib] 端口 ${PORT} 上的服务不是本工作树（${r || '未知目录'}），按 EDEN_PORT 照用`); return { started: false, stop() {} }; }
  }
  for (let i = 0; i < 40 && await busy(PORT); i++) { PORT = 5200 + (PORT - 5200 + 1) % 800; BASE = `http://localhost:${PORT}/`; }
  const p = spawn('python3', [path.join(REPO_ROOT, 'tools/cors_server.py'), String(PORT), MAP_ROOT], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 50; i++) { await wait(200); if (await up(BASE) && await root(BASE) === MAP_ROOT) return { started: true, stop() { try { process.kill(-p.pid); } catch (e) { p.kill(); } } }; }
  p.kill(); throw new Error('本地服务起不来：python3 tools/cors_server.py ' + PORT + ' map');
}

// ---------- 浏览器与设备 ----------
// desktop：Chromium 1440×900；phone：Chromium 375×812 触屏 DPR 3；iphone：WebKit iPhone 13 配置、视口 375×812
export const PRESETS = {
  desktop: { engine: 'chromium', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  phone: { engine: 'chromium', ctx: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' } },
  desktopWk: { engine: 'webkit', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  iphone: { engine: 'webkit', ctx: () => ({ ...pw.devices['iPhone 13'], viewport: { width: 375, height: 812 } }) },
};
const browsers = {};
export async function browser(engine = 'chromium') {
  if (!browsers[engine]) browsers[engine] = await pw[engine].launch(engine === 'chromium' && process.env.GPU === '1'
    ? { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
  return browsers[engine];
}
export async function closeAll() { for (const k of Object.keys(browsers)) { await browsers[k].close().catch(() => {}); delete browsers[k]; } }

// 新页面：preset + 语言 / 主题 / 清晰度档位（写进 localStorage，只对当前 BASE 的 origin 生效）+ 网络统计 + 错误收集
// opts: { lang: 'zh'|'en', scheme: 'dark'|'light', tier: 'save'|'std'|'hd'|'auto', init: [fn, arg] }
export async function newPage(preset = 'desktop', opts = {}) {
  const P = PRESETS[preset]; if (!P) throw new Error('未知 preset ' + preset);
  const b = await browser(P.engine);
  const ctx = await b.newContext({ ...(typeof P.ctx === 'function' ? P.ctx() : P.ctx), colorScheme: opts.scheme || 'dark', locale: opts.lang === 'en' ? 'en-US' : 'zh-CN' });
  await ctx.addInitScript(o => {
    try { if (location.port === o.port) { localStorage.setItem('edenMapLang', o.lang); if (o.tier) localStorage.setItem('edenMapTierV2', o.tier); if (!o.hint) localStorage.setItem('edenMapHint', '1'); } } catch (e) {}   // 大版本 2 首次三步提示：默认当已看过（opts.hint = true 时照常出）
    // 庄园第一帧时间点（map/estate/main.js 会置 window.__estateFirstFrame = true）
    let ff = false; Object.defineProperty(window, '__estateFirstFrame', { configurable: true, get: () => ff, set: v => { ff = v; if (v && !window.__ffAt) window.__ffAt = performance.now(); } });
  }, { port: String(PORT), lang: opts.lang || 'zh', tier: opts.tier || null, hint: !!opts.hint });
  if (opts.init) await ctx.addInitScript(...opts.init);
  const page = await ctx.newPage();
  const net = track(page);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + String(e).slice(0, 200) + (e?.stack ? ' @ ' + String(e.stack).split('\n')[1]?.trim().slice(0, 160) : '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
  return { page, ctx, net, errors, preset, async close() { await ctx.close(); } };
}

// 网络：请求数、传输字节（响应体 + 头）、第一张瓦片到达时间（相对 net.mark()）
export function track(page) {
  const net = { bytes: 0, n: 0, list: [], t0: Date.now(), firstTileAt: null,
    mark() { this.bytes = 0; this.n = 0; this.list = []; this.t0 = Date.now(); this.firstTileAt = null; },
    top(k = 8) { return [...this.list].sort((a, b) => b[1] - a[1]).slice(0, k); } };
  page.on('requestfinished', async rq => {
    const t = Date.now() - net.t0;
    if (net.firstTileAt == null && /_files\/\d+\//.test(rq.url())) net.firstTileAt = t;
    try { const s = await rq.sizes(); net.bytes += s.responseBodySize + s.responseHeadersSize; net.n++; net.list.push([rq.url().replace(/^https?:\/\/[^/]+/, ''), s.responseBodySize]); } catch (e) {}
  });
  return net;
}

export async function shot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.png');
  await page.screenshot({ path: f, timeout: 60000 }).catch(e => console.log('  截图失败', name, e.message.split('\n')[0]));
  return f;
}

// ---------- 查看器 ----------
// 打开 viewer.html（可带 ?map= / ?here=），返回 { loadingDoneMs, firstTileMs, bytes, requests }：
//   loadingDoneMs = 导航开始 → 加载遮罩 #loading 变 done（首张底图画出来）；firstTileMs = 第一张瓦片请求完成
export async function openViewer(P, { map, here, timeout = 30000 } = {}) {
  const q = new URLSearchParams(); if (map) q.set('map', map); if (here) q.set('here', here);
  P.net.mark();
  await P.page.goto(BASE + 'viewer.html' + (q.size ? '?' + q : ''), { waitUntil: 'commit' });
  const t0 = P.net.t0;
  await P.page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout, polling: 50 }).catch(() => {});
  const loadingDoneMs = Date.now() - t0;
  return { loadingDoneMs, firstTileMs: P.net.firstTileAt, bytes: P.net.bytes, requests: P.net.n };
}
export const viewerState = page => page.evaluate(() => ({
  map: typeof ViewerDebug !== 'undefined' ? ViewerDebug.currentMapId : document.body.dataset.map,
  base: (() => { try { const s = ViewerDebug.osdViewer.world.getItemAt(0)?.source; return s?.tilesUrl || s?.url || ''; } catch (e) { return ''; } })(),
  card: document.querySelector('#card')?.hidden === false ? document.querySelector('#card h2')?.textContent || '' : null,
  estateOn: !!document.querySelector('#estate.on'),
  layers: (window.CrumbMenuApi?.levels() || []).map(l => ({ go: l.id, on: l.on, disabled: l.planned })),   // HEADER-1: the levels live in the breadcrumb menu (no floating strip)
}));
/** HEADER-1: switch level the way a user does: open the breadcrumb menu, pick the level */
export async function pickLevel(page, id) {
  if (await page.evaluate(id => ViewerDebug.currentMapId === id, id)) return;   // already there: the current level has no link in the menu
  if (!(await page.evaluate(() => !!window.CrumbMenuApi?.isOpen()))) await page.locator('#crumbs .cur').click();
  await page.locator(`#crumbMenu [data-go="${id}"]`).click();
}
// 切到某张图，等底图第一张瓦片画出（庄园等 #estate.on）；返回用时 ms
export async function goMap(page, id, timeout = 30000) {
  const t0 = Date.now();
  const k = await page.evaluate(id => ViewerDebug.currentMapId === id ? 'same' : ViewerDebug.mapRegistry.maps[id]?.kind === 'estate' ? 'estate' : ViewerDebug.mapRegistry.maps[id] ? 'map' : 'none', id);
  if (k === 'same') return 0;
  if (k === 'none') throw new Error('没有地图 ' + id);
  if (k === 'estate') { await page.evaluate(id => ViewerDebug.go(id), id); await page.waitForFunction(() => document.querySelector('#estate.on'), null, { timeout }).catch(() => {}); }
  else await page.evaluate(([id, to]) => new Promise(res => { let d = false; const fin = () => { if (!d) { d = true; res(); } };
    ViewerDebug.osdViewer.addOnceHandler('open', () => ViewerDebug.osdViewer.addOnceHandler('tile-drawn', fin)); ViewerDebug.go(id); setTimeout(fin, to); }), [id, timeout]);
  return Date.now() - t0;
}

// 滚轮以光标为中心（OpenSeadragon）：记下光标处图像坐标，滚轮后投影回屏幕，看偏移像素
export async function wheelDriftViewer(page, x, y, ticks = 5) {
  const before = await page.evaluate(([x, y]) => { const v = ViewerDebug.osdViewer.viewport, r = ViewerDebug.osdViewer.container.getBoundingClientRect();
    window.__wp = v.pointFromPixel(new OpenSeadragon.Point(x - r.left, y - r.top), true); return v.getZoom(true); }, [x, y]);
  await page.mouse.move(x, y); for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, -120); await wait(60); } await wait(1500);
  const after = await page.evaluate(() => { const v = ViewerDebug.osdViewer.viewport, r = ViewerDebug.osdViewer.container.getBoundingClientRect(); const p = v.pixelFromPoint(window.__wp, true);
    return { zoom: v.getZoom(true), sx: p.x + r.left, sy: p.y + r.top }; });
  return { zoom0: +before.toFixed(3), zoom1: +after.zoom.toFixed(3), drift_px: +Math.hypot(after.sx - x, after.sy - y).toFixed(2) };
}

// ---------- 庄园（map/estate/index.html，three.js）----------
// frame：庄园所在的 Frame（独立打开时就是 page.mainFrame()；嵌在查看器里用 estateFrame(page)）
// 三维页热点编号：等 placePins 真跑过（#pins[data-placed]）且连续两次测量（间隔 ≥2 帧）一致才返回，最长 timeout；超时返回最后一次（调用方的数量 / 间距断言照常判失败）
export const pinCenters = frame => frame.evaluate(() => [...document.querySelectorAll('.pin:not([hidden])')].map(e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
export async function settledPins(frame, timeout = 15000) {
  const t0 = Date.now(); let prev = null, cur = [];
  while (Date.now() - t0 < timeout) {
    await frame.evaluate(() => document.fonts?.ready).catch(() => {});
    if (await frame.evaluate(() => !!document.getElementById('pins')?.dataset.placed).catch(() => false)) {
      await frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
      cur = await pinCenters(frame);
      if (prev && prev.length === cur.length && cur.every((c, i) => c[0] === prev[i][0] && c[1] === prev[i][1])) return cur;
      prev = cur;
    }
    await wait(100);
  }
  return cur;
}
export function minPinDist(pins) { let m = Infinity; for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) m = Math.min(m, Math.hypot(pins[i][0] - pins[j][0], pins[i][1] - pins[j][1])); return m; }
export const estateFrame = async page => (await page.$('#estate'))?.contentFrame() || null;   // 查看器里嵌着的庄园 iframe
export async function openEstate(P, { stats = true, tier } = {}) {
  P.net.mark();
  await P.page.goto(BASE + 'estate/index.html?' + (stats ? 'stats=1' : '') + (tier != null ? '&tier=' + tier : ''), { waitUntil: 'commit' });
  await P.page.waitForFunction(() => window.__ffAt, null, { timeout: 90000 });
  return { firstFrameMs: Math.round(await P.page.evaluate(() => window.__ffAt)), bytes: P.net.bytes, requests: P.net.n };
}
export const estateStats = frame => frame.evaluate(() => { const s = window.__estate.stats(); return { calls: s.calls, tris: s.triangles, tier: s.tier, firstFrameMs: s.firstFrameMs, allBuiltMs: s.allBuiltMs }; });
export async function wheelDriftEstate(page, x, y, frame = page.mainFrame(), ticks = 5) {
  const before = await frame.evaluate(([x, y]) => { const { camera: c, renderer: r } = window.__estate; const rc = r.domElement.getBoundingClientRect();
    window.__w = c.position.clone().set(((x - rc.left) / rc.width) * 2 - 1, -((y - rc.top) / rc.height) * 2 + 1, 0).unproject(c); return c.zoom; }, [x, y]);
  const off = frame === page.mainFrame() ? { x: 0, y: 0 } : await (await frame.frameElement()).boundingBox();
  await page.mouse.move(x + off.x, y + off.y);
  await page.keyboard.down('Control');   // 9718673c：庄园滚轮分工——普通滚轮 = 平移，ctrl+滚轮（触控板捏合）= 缩放到光标，缩放测试得带 ctrlKey
  for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, -120); await wait(60); } await page.keyboard.up('Control'); await wait(500);
  const after = await frame.evaluate(() => { const { camera: c, renderer: r } = window.__estate; const rc = r.domElement.getBoundingClientRect(); const v = window.__w.clone().project(c);
    return { zoom: c.zoom, sx: (v.x + 1) / 2 * rc.width + rc.left, sy: (1 - v.y) / 2 * rc.height + rc.top }; });
  return { zoom0: +before.toFixed(3), zoom1: +after.zoom.toFixed(3), drift_px: +Math.hypot(after.sx - x, after.sy - y).toFixed(2) };
}

// ---------- 死区探针：加载完后按网格 elementFromPoint ----------
// 「死区」= 最上层元素既不是地图画布（#osd / #estate / canvas），也不是可交互控件，却挡在画面上（如透明的 #loading 文字层）。
// 返回 { points, dead, bySelector: {选择器: 个数}, samples }
export const deadZones = (frame, { step = 40, margin = 8 } = {}) => frame.evaluate(({ step, margin }) => {
  const OK = 'button,a,input,select,textarea,label,summary,[role=button],[role=link],[tabindex],#card,header,nav,#layers,#evbar,#crumbs,#setPop,.pop,#zoom,#foot,#credit,#status,.mk,.ev,.em-fab';
  const MAP = '#osd,#estate,canvas,.openseadragon-container';
  const sel = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '');
  const out = { points: 0, dead: 0, bySelector: {}, samples: [] };
  for (let y = margin; y < innerHeight - margin; y += step) for (let x = margin; x < innerWidth - margin; x += step) {
    out.points++; const e = document.elementFromPoint(x, y); if (!e) continue;
    if (e.closest(MAP) || e.closest(OK) || e === document.body || e === document.documentElement) continue;
    const cs = getComputedStyle(e); if (cs.pointerEvents === 'none') continue;
    out.dead++; const k = sel(e) + (e.parentElement ? ' < ' + sel(e.parentElement) : ''); out.bySelector[k] = (out.bySelector[k] || 0) + 1;
    if (out.samples.length < 12) out.samples.push([x, y, k]);
  }
  return out;
}, { step, margin });

// ---------- 嵌入测试：很高、可滚动的宿主页里放一个 iframe，滚轮 / 触摸不应带动宿主页 ----------
export async function openInHost(P, src = BASE + 'viewer.html', { hostPath = '__host.html', frameH } = {}) {
  const h = frameH || P.page.viewportSize().height - 140;
  const html = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#222;height:3000px"><div style="height:120px;color:#aaa">host</div><iframe id=f src="${src}" style="border:0;width:100%;height:${h}px"></iframe></body>`;
  await P.page.route(BASE + hostPath, r => r.fulfill({ contentType: 'text/html', body: html }));
  await P.page.goto(BASE + hostPath);
  const fr = () => P.page.frames().find(f => f.url().startsWith(src.split('?')[0]));
  for (let i = 0; i < 100 && !fr(); i++) await wait(100);
  return fr();
}
// 在 (x, y)（宿主页坐标）上滚动 n 下，返回宿主页 scrollY（0 = 没被带着滚）
export async function parentScrollY(page, x, y, n = 6) {
  await page.evaluate(() => scrollTo(0, 0)); await page.mouse.move(x, y);
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, 200); await wait(80); } await wait(400);
  const s = await page.evaluate(() => scrollY); await page.evaluate(() => scrollTo(0, 0)); return s;
}

// ---------- 事件 ----------
// 用卡内脚本同一套解析（map/tavern/events-parse.mjs 的 collect）把聊天原文变成事态，发给查看器，并飞到 fly
// fly：true = 第一条；函数 = items.find(fly)；字符串 = 事件 id。返回 { items, fly }
export async function postEvents(frame, texts, fly) {
  const { collect, setGeo } = await import(path.join(REPO_ROOT, 'map/tavern/events-parse.mjs')), { packGeo } = await import(path.join(REPO_ROOT, 'tools/eden_geo.mjs'));
  setGeo(packGeo('eden'));   // 落点由节点树定（首个包的 v1 数据 + overlay.v2.json）
  const floor = Math.max(...texts.map(t => t.floor));
  const items = collect(texts, floor).map(e => ({ ...e, isNew: true }));
  const id = fly === true ? items[0]?.id : typeof fly === 'function' ? items.find(fly)?.id : fly;
  // 嵌入时走 postMessage（卡内脚本的协议）；独立打开的查看器不监听 message，直接交给 EventsView.set
  await frame.evaluate(m => window.top !== window ? window.postMessage(m, '*') : EventsView.set(m), { type: 'eden-map:events', items, floor, fly: id });
  return { items, fly: id };
}

// ---------- 结果 ----------
export function reporter(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const R = { when: new Date().toISOString(), base: BASE, blender: spawnSync('pgrep', ['-f', '[M]acOS/Blender -b']).status === 0, checks: [], metrics: {} };
  const known = tracker();   // tools/browser/known-failures.json: a listed failure prints KNOWN and does not fail the run
  return {
    R,
    check(name, pass, detail = '') {
      const k = known.judge(name, pass);
      R.checks.push({ name, pass: !!pass, detail, ...(k ? { known: k } : {}) });
      console.log(`${pass ? '✓' : k ? '~ KNOWN' : '✗'} ${name}${detail ? '  ' + detail : ''}${k ? `  [${k.owner_step}: ${k.reason}]` : ''}`);
    },
    metric(k, v) { R.metrics[k] = v; },
    save() {
      fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(R, null, 1));
      const md = [`# 浏览器验收 ${R.when}`, '', `服务 ${R.base}；后台 Blender：${R.blender ? '在渲（计时偏慢）' : '无'}`, '',
        '| 检查 | 结果 | 说明 |', '|---|---|---|', ...R.checks.map(c => `| ${c.name} | ${c.pass ? '✓' : c.known ? 'KNOWN' : '✗'} | ${String(c.detail).replace(/\|/g, '/')} |`), ''].join('\n');
      fs.writeFileSync(path.join(outDir, 'summary.md'), md);
      const nKnown = R.checks.filter(c => !c.pass && c.known).length;
      if (nKnown) console.log(`KNOWN（已登记的既有失败，不影响退出码）：${nKnown}`);
      for (const k of known.fixed()) console.log(`FIXED：${k.probe} / ${k.check} 现在通过了——从 tools/browser/known-failures.json 里删掉这一条`);
      return R.checks.every(c => c.pass || c.known);
    },
  };
}

// S7-1: settings sub-pages are built when first opened; probes that read a control on any page build them all first.
export const buildAllSettingsPages = vf => vf.evaluate(async () => { for (const pg of ['map', 'people', 'data', 'update', 'license', 'adv', 'home']) { SettingsApi.open(pg); await new Promise(r => setTimeout(r, 120)); } });
