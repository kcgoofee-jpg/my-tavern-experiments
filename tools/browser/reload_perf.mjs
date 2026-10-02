// I-29: reload-path performance probe. Host harness (host_stub), three scenarios:
//   cold   = first open of the panel in a fresh context (fab click -> viewer loading overlay done)
//   page   = page reload, then open the panel (script bootstrap + idle preload + open)
//   inmap  = in-map reload action (the loader's retry path: drop html, unload the viewer, load again)
// Records long tasks (PerformanceObserver longtask + long-animation-frame with script attribution on Chromium; a
// requestAnimationFrame gap monitor everywhere, which is the only signal WebKit offers) and, on Chromium, a CDP CPU
// profile aggregated by function. Budgets are asserted for the page / in-map / cold scenarios on Chromium; WebKit
// is measured and reported (rAF gaps) with the same long-task budget.
// Also: in-place restarts (query / new-build import): live listeners, intervals, observers, iframes, host handlers and prompt hooks must not grow; DOM documents and heap are reported. Note: Playwright element handles (locator clicks, waitForSelector results) keep the old panel alive until disposed, so documents / heap read high here; I-34 (the clock popup's document listeners) was found by taking handles out of the loop.
// Usage: node tools/browser/reload_perf.mjs <outdir> [--engines chromium,webkit] [--chat 300] [--profile] [--json]
// Defaults: 3000-floor chat, Chromium CPU throttled 4x. Budgets below are for that setting on a dev laptop; CI factor 2 (env CI set -> every time budget x2).
// Reference numbers (before / after the I-29 fixes) are in docs/plans/spatial-os-log.md RESULT I-29.
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'logs/reload_perf';
const ENGINES = arg('--engines', 'chromium').split(',');
const CHAT = +arg('--chat', 3000);
const PROFILE = process.argv.includes('--profile');
const TRACE = process.argv.includes('--trace');   // Chromium: devtools.timeline trace; prints the heaviest event names inside long tasks
const CPU = +arg('--cpu', 4);   // Chromium CPU throttle: 4x stands in for a slow laptop / WKWebView inside a busy host page; the budgets below are for this default
const FACTOR = process.env.CI ? 2 : 1;
// budgets (ms, headless Chromium 1440x900, no GPU, 4x CPU throttle); x FACTOR on CI
const BUD = { maxLong: 200, totalLong: 600, firstFrame: 3000 };   // after the fixes: max ~90, total ~360, done ~1000 (throttled)
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);

const INSTR = () => {
  const L = window.__perf = { lt: [], loaf: [], gaps: [], mk: {} };
  window.__mark = k => { L.mk[k] = performance.timeOrigin + performance.now(); };
  const abs = t => performance.timeOrigin + t;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) L.lt.push({ at: abs(e.startTime), dur: e.duration, src: location.pathname.split('/').pop() || location.protocol }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) L.loaf.push({ at: abs(e.startTime), dur: e.duration, blocking: e.blockingDuration, scripts: (e.scripts || []).map(s => ({ fn: s.sourceFunctionName || s.invoker, url: String(s.sourceURL || '').replace(/^.*\/map\//, ''), line: s.sourceCharPosition, dur: s.duration, forced: s.forcedStyleAndLayoutDuration })) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  // rAF gap monitor: frames that take > 50 ms (works on WebKit, where longtask does not exist)
  let last = 0; const tick = t => { if (last && t - last > 50) L.gaps.push({ at: abs(t), dur: t - last, src: location.pathname.split('/').pop() || location.protocol }); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // ---- leak counters (I-29): live registrations per frame, summed by leakCounts() ----
  const K = window.__leak = { ev: new Map(), iv: new Set(), to: new Set(), obs: new Set(), gl: 0 };
  const tname = t => t === window ? 'window' : t === document ? 'document' : t === document.documentElement ? 'html' : t === document.body ? 'body' : null;
  const addE = EventTarget.prototype.addEventListener, remE = EventTarget.prototype.removeEventListener, fid = new WeakMap(); let fn_ = 0;
  const idOf = f => { if (!fid.has(f)) fid.set(f, ++fn_); return fid.get(f); };
  EventTarget.prototype.addEventListener = function (type, fn, o) { const n = tname(this); if (n && fn) K.ev.set(`${n}:${type}:${idOf(fn)}:${typeof o === 'object' ? !!o?.capture : !!o}`, 1); return addE.call(this, type, fn, o); };
  EventTarget.prototype.removeEventListener = function (type, fn, o) { const n = tname(this); if (n && fn) K.ev.delete(`${n}:${type}:${idOf(fn)}:${typeof o === 'object' ? !!o?.capture : !!o}`); return remE.call(this, type, fn, o); };
  const si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
  window.setInterval = function (f, ...a) { const id = si.call(this, f, ...a); K.iv.add(id); return id; };
  window.clearInterval = function (id) { K.iv.delete(id); return ci.call(this, id); };
  window.setTimeout = function (f, ms, ...a) { if (typeof f !== 'function') return st.call(this, f, ms, ...a); const id = st.call(this, (...x) => { K.to.delete(id); return f(...x); }, ms, ...a); if (ms > 2000) K.to.add(id); return id; };   // only long timers matter for accumulation
  window.clearTimeout = function (id) { K.to.delete(id); return ct.call(this, id); };
  for (const N of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { const O = window[N]; if (!O) continue;
    window[N] = class extends O { observe(...a) { if (!this.__wr) K.obs.add(this.__wr = new WeakRef(this)); return super.observe(...a); } disconnect() { if (this.__wr) K.obs.delete(this.__wr); return super.disconnect(); } }; }   // weak: the probe must not keep observers (and their frames) alive
  const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { const c = gc.call(this, t, ...a); if (c && /webgl/.test(t)) this.__gl = 1; return c; };
  // tavern-helper event bus in the host page: handlers are registered and removed through it, so leaks show as a live count
  if (window.top === window) window.__thInstall = w => { const H = window.__H = {}; let n = 0;
    w.eventOn = (k, f) => { (H[k] ||= []).push(f); return { stop() { w.eventRemoveListener(k, f); } }; };
    w.eventRemoveListener = (k, f) => { H[k] = (H[k] || []).filter(x => x !== f); };
    window.__fire = k => (H[k] || []).slice().forEach(f => f()); };
};
const leakCounts = async page => {
  const out = { listeners: 0, intervals: 0, longTimers: 0, observers: 0, iframes: 0, webgl: 0, owners: 0, handlers: 0, hooks: 0, frames: 0 };
  for (const f of page.frames()) {
    let r; try { r = await f.evaluate(() => { const K = window.__leak; if (!K) return null; const ev = {}; for (const k of K.ev.keys()) { const t = k.split(':').slice(0, 2).join(':'); ev[t] = (ev[t] || 0) + 1; }
      return { ev, iv: K.iv.size, to: K.to.size, obs: [...K.obs].filter(w => w.deref()).length, ifr: document.querySelectorAll('iframe').length, gl: [...document.querySelectorAll('canvas')].filter(c => c.__gl).length,
        own: document.querySelectorAll('[data-eden-owner]').length, h: window.top === window ? Object.values(window.__H || {}).reduce((a, b) => a + b.length, 0) : 0, hk: window.top === window ? Object.fromEntries(Object.entries(window.__H || {}).map(([k, v]) => [k, v.length])) : null, inj: window.top === window ? Object.keys(window.__injMap || {}).length : 0 }; }); } catch (e) {}
    if (!r) continue; out.frames++;
    out.listeners += Object.values(r.ev).reduce((a, b) => a + b, 0); out.intervals += r.iv; out.longTimers += r.to; out.observers += r.obs; out.iframes += r.ifr; out.webgl += r.gl; out.owners += r.own; out.handlers += r.h; out.hooks += r.inj;
    if (r.hk) out.handlerEvents = r.hk; (out.byType ||= {}); for (const [k, v] of Object.entries(r.ev)) out.byType[k] = (out.byType[k] || 0) + v;
  }
  return out;
};

const msgs = Array.from({ length: CHAT }, (_, i) => ({ message_id: i, message: i % 7 === 0 ? `⌖火灾｜中层·霓虹街｜${i % 5}｜仓库起火 ${i}` : `她走进房间，窗外下着雨。第 ${i} 段叙述，一些普通的文字。`.repeat(1 + i % 4) }));

async function collect(P, t0) {
  const out = { lt: [], loaf: [], gaps: [], mk: {} };
  for (const f of P.page.frames()) {
    let r; try { r = await f.evaluate(() => window.__perf && JSON.parse(JSON.stringify(window.__perf))); } catch (e) {}
    if (!r) continue;
    out.lt.push(...r.lt); out.loaf.push(...r.loaf); out.gaps.push(...r.gaps); Object.assign(out.mk, r.mk);
  }
  const rel = a => a.filter(e => e.at >= t0).map(e => ({ ...e, at: Math.round(e.at - t0), dur: Math.round(e.dur) })).sort((a, b) => a.at - b.at);
  return { lt: rel(out.lt), loaf: rel(out.loaf), gaps: rel(out.gaps), mk: out.mk };
}

async function profile(P, fn) {   // Chromium only: CDP sampling profile of the whole scenario, self time by function
  if (!PROFILE || P.page.context().browser().browserType().name() !== 'chromium') return { r: await fn(), top: null };
  const cdp = await P.ctx.newCDPSession(P.page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  const r = await fn();
  const { profile: pr } = await cdp.send('Profiler.stop');
  const by = new Map(); const byId = new Map(pr.nodes.map(n => [n.id, n]));
  pr.samples.forEach((id, i) => { const n = byId.get(id), d = (pr.timeDeltas[i] || 0) / 1000, cf = n.callFrame;
    if (cf.functionName === '(idle)' || cf.functionName === '(program)') return;
    const k = `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\/map\//, '')}:${cf.lineNumber + 1}`; by.set(k, (by.get(k) || 0) + d); });
  return { r, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +v.toFixed(1)]) };
}

const summarize = (c, tEnd) => {
  const sig = [...c.lt, ...(c.lt.length ? [] : c.gaps)].filter(e => e.at <= tEnd);   // longtask where supported, else rAF gaps
  return { n: sig.length, max: Math.max(0, ...sig.map(e => e.dur)), total: sig.reduce((s, e) => s + e.dur, 0), list: sig.slice(0, 25) };
};

async function openAndWait(P, H) {   // fab click -> loading done; returns marks relative to the click (ms)
  const p = P.page, t0 = Date.now(), marks = {};
  const reqs = []; const onReq = r => { if (/viewer\.html/.test(r.url())) marks.viewerHtml = Date.now() - t0; if (/_files\/\d+\//.test(r.url()) && marks.firstTile == null) marks.firstTile = Date.now() - t0; };
  p.on('requestfinished', onReq);
  await p.evaluate(() => performance.mark('open-click'));
  await p.locator('#eden-map-root .em-fab').click();
  await p.waitForFunction(() => { const f = document.querySelector('#eden-map-root .em-frame'); try { return f?.contentDocument?.getElementById('loading')?.classList.contains('done'); } catch (e) { return false; } }, null, { timeout: 60000, polling: 25 }).catch(() => {});
  marks.done = Date.now() - t0;
  await B.wait(1500);   // let the post-ready idle work (scans, preload, gallery) land inside the window
  p.off('requestfinished', onReq);
  return marks;
}

function traceSummary(f) {   // heaviest complete events (>= 8 ms) on the main thread, by name
  const ev = JSON.parse(fs.readFileSync(f)).traceEvents.filter(e => e.ph === 'X' && e.dur >= 8000 && !/^(RunTask|ThreadControllerImpl::RunTask|MessageLoop::RunTask|TaskQueueManager::ProcessTaskFromWorkQueue)$/.test(e.name));
  const by = {}; for (const e of ev) { const k = e.name + (e.args?.data?.url ? ' ' + String(e.args.data.url).replace(/^.*\/map\//, '') : ''); (by[k] ||= []).push(Math.round(e.dur / 1000)); }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0)).slice(0, 14)) console.log(`   trace ${k}: ${v.join(',')} ms`);
}
async function scenario(engine, name) {
  const preset = engine === 'webkit' ? 'desktopWk' : 'desktop';
  const P = await B.newPage(preset, { tier: 'save', init: [INSTR] });
  try {
    if (CPU > 1 && engine === 'chromium') await (await P.ctx.newCDPSession(P.page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const H = await openHost(P, { here: '天城中层·霓虹街', msgs, chat: 'rp' });
    let t0, marks, prof, traceOn = false;
    const startTrace = async () => { if (TRACE && engine === 'chromium') { traceOn = true; await (await B.browser('chromium')).startTracing(P.page, { categories: ['devtools.timeline', 'v8.execute', 'blink', 'disabled-by-default-devtools.timeline'] }); } };
    if (name === 'cold') {
      await B.wait(500);   // fab present; let the launcher's own idle work settle so the open itself is measured
      await startTrace(); t0 = Date.now(); await P.page.evaluate(() => { window.__perf.lt.length = window.__perf.gaps.length = window.__perf.loaf.length = 0; });
      prof = await profile(P, () => openAndWait(P, H)); marks = prof.r;
    } else if (name === 'page') {
      await H.open(); await startTrace();
      t0 = Date.now();
      prof = await profile(P, async () => {
        await P.page.reload(); await P.page.waitForSelector('#eden-map-root .em-fab', { timeout: 30000 });
        const mFab = Date.now() - t0; const m = await openAndWait(P, H); return { fab: mFab, ...m };
      }); marks = prof.r;
    } else {   // inmap
      await H.open(); await B.wait(500);
      await startTrace(); t0 = Date.now(); await P.page.evaluate(() => { window.__perf.lt.length = window.__perf.gaps.length = window.__perf.loaf.length = 0; });
      prof = await profile(P, async () => {
        await P.page.evaluate(() => document.querySelector('#eden-map-root .em-load .retry')?.click());
        await B.wait(60);
        await P.page.waitForFunction(() => { const f = document.querySelector('#eden-map-root .em-frame'); try { return f?.contentDocument?.getElementById('loading')?.classList.contains('done'); } catch (e) { return false; } }, null, { timeout: 60000, polling: 25 }).catch(() => {});
        const m = { done: Date.now() - t0 }; await B.wait(1500); return m;
      }); marks = prof.r;
    }
    if (traceOn) { const f = `${OUT}/trace_${name}.json`; fs.mkdirSync(OUT, { recursive: true }); await (await B.browser('chromium')).stopTracing().then(b => fs.writeFileSync(f, b)); traceSummary(f); }
    const c = await collect(P, t0);
    const end = (marks.done || 5000) + 1500;
    const s = summarize(c, end);
    return { engine, name, cpu: CPU, chat: CHAT, marks, long: s, loaf: c.loaf.slice(0, 12), top: prof.top, errors: P.errors.slice(0, 5) };
  } finally { await P.close(); }
}

// In-place restarts (card switch, "reload to load" on a followed branch): the entry is imported again in the card iframe and the
// takeover path must retire the previous instance. Live listeners / intervals / observers / iframes / WebGL canvases / host event
// handlers / prompt hooks must not grow with the number of restarts (compared after 1, 3 and 5), and each restart stays within the long-task budget.
async function restartScenario(engine, mode = 'query') {   // mode 'switch' imports the entry under a fresh path (__shaN/), so the whole module graph is new, as when a followed branch moves to a new commit
  const P = await B.newPage(engine === 'webkit' ? 'desktopWk' : 'desktop', { tier: 'save', ...(process.env.NOINSTR ? {} : { init: [INSTR] }) });
  try {
    if (CPU > 1 && engine === 'chromium') await (await P.ctx.newCDPSession(P.page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const H = await openHost(P, { here: '天城中层·霓虹街', msgs, chat: 'rp' });
    if (mode === 'switch') await P.ctx.route(/__sha\d+\//, async r => { try { r.fulfill({ response: await r.fetch({ url: r.request().url().replace(/__sha\d+\//, '') }) }); } catch (e) { r.abort(); } });
    const heapDom = [];
    const cdp = engine === 'chromium' ? await P.ctx.newCDPSession(P.page) : null;
    const heap = async () => { if (!cdp) return null; for (let i = 0; i < 4; i++) { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await B.wait(250); }   /* cross-heap (Oilpan + V8) cycles of a detached frame need a few rounds */
      const d = await cdp.send('Memory.getDOMCounters'); heapDom.push(`${d.documents}d/${d.nodes}n/${d.jsEventListeners}l`); return Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576); };
    await H.open();
    const snaps = { 0: { ...await leakCounts(P.page), heapMB: await heap() } }, long = []; let n = 0;
    for (const target of [1, 3, 5]) {
      while (n < target) {
        n++; const t0 = Date.now(); const card = await (await P.page.$('#card')).contentFrame();
        const t1 = Date.now(); await card.evaluate(u => import(u), mode === 'switch' ? `${B.BASE}__sha${n}/tavern/eden-map.js` : `${B.BASE}tavern/eden-map.js?k=probe&r=${n}`);
        await P.page.waitForSelector('#eden-map-root .em-fab', { timeout: 30000 });
        const tFab = Date.now() - t1; if (!process.env.NOOPEN) await H.open(); const c = await collect(P, t0); long.push({ ...summarize(c, 4000), tFab });
      }
      if (process.env.WAITMS) await B.wait(+process.env.WAITMS);
      snaps[target] = { ...await leakCounts(P.page), heapMB: await heap() };
    }
    return { engine, name: mode === 'switch' ? 'switch' : 'restart', heapDom, snaps, long: { max: Math.max(...long.map(l => l.max)), total: Math.max(...long.map(l => l.total)), fabMs: long.map(l => l.tFab) }, errors: P.errors.slice(0, 5) };
  } finally { await P.close(); }
}

const results = [];
try {
  for (const engine of ENGINES) for (const name of ['cold', 'page', 'inmap']) {
    const r = await scenario(engine, name); results.push(r);
    const k = `${engine} ${name}`, f = FACTOR;
    console.log(`\n== ${k}: marks ${JSON.stringify(r.marks)}  long tasks n=${r.long.n} max=${r.long.max} total=${r.long.total} ms`);
    for (const e of r.long.list) console.log(`   ${String(e.at).padStart(5)} +${e.dur} ms  ${e.src || ''}`);
    for (const e of r.loaf) console.log(`   LoAF @${e.at} ${e.dur} ms (blocking ${Math.round(e.blocking)}): ${e.scripts.map(s => `${s.fn || '?'} ${s.url}:${s.line} ${Math.round(s.dur)}ms`).join(' | ').slice(0, 300)}`);
    if (r.top) for (const [fn, v] of r.top.slice(0, 15)) console.log(`   cpu ${String(v).padStart(7)} ms  ${fn}`);
    rep.check(`${k}: no long task > ${BUD.maxLong * f} ms`, r.long.max <= BUD.maxLong * f, `max ${r.long.max}`);
    rep.check(`${k}: total long-task time <= ${BUD.totalLong * f} ms`, r.long.total <= BUD.totalLong * f, `total ${r.long.total}`);
    if (r.name !== 'inmap') rep.check(`${k}: loading overlay done <= ${BUD.firstFrame * f} ms after the click`, (r.marks.done || 1e9) <= BUD.firstFrame * f, `done ${r.marks.done}`);
    rep.check(`${k}: no page errors`, !r.errors.length, r.errors.join(' / '));
    rep.metric(k, { marks: r.marks, long: { n: r.long.n, max: r.long.max, total: r.long.total } });
  }

  for (const engine of ENGINES) for (const mode of ['query', 'switch']) {
    const r = await restartScenario(engine, mode); results.push(r); const k = `${engine} ${r.name}`;
    console.log(`\n== ${k}: long tasks per restart max=${r.long.max} total(max of runs)=${r.long.total} ms; import -> fab ms per restart ${r.long.fabMs}; heap MB after 0/1/3/5: ${[0, 1, 3, 5].map(i => r.snaps[i].heapMB).join(' / ')}; DOM documents/nodes/listeners ${r.heapDom.join(' | ')}`);
    for (const key of ['listeners', 'intervals', 'longTimers', 'observers', 'iframes', 'webgl', 'owners', 'handlers', 'hooks', 'frames']) {
      const v = [0, 1, 3, 5].map(i => r.snaps[i][key]); console.log(`   ${key.padEnd(10)} after 0/1/3/5 restarts: ${v.join(' / ')}`);
      if (key !== 'frames' && key !== 'longTimers') rep.check(`${k}: live ${key} do not grow (1 -> 3 -> 5)`, v[3] <= v[2] && v[2] <= v[1], v.join(' / '));
    }
    if (r.snaps[5].handlerEvents) console.log('   handlers by event after 5:', JSON.stringify(r.snaps[5].handlerEvents));
    const grown = Object.entries(r.snaps[5].byType || {}).filter(([t, c]) => c > (r.snaps[1].byType?.[t] || 0)); if (grown.length) console.log('   grown listener types:', JSON.stringify(grown.map(([t, c]) => [t, r.snaps[1].byType?.[t] || 0, c])));
    rep.check(`${k}: no long task > ${BUD.maxLong * FACTOR} ms`, r.long.max <= BUD.maxLong * FACTOR, `max ${r.long.max}`);
    rep.check(`${k}: no page errors`, !r.errors.length, r.errors.join(' / '));
    if (r.snaps[1].heapMB != null) rep.check(`${k}: JS heap after 5 restarts <= heap after 1 + 30 MB (old instances are collectable)`, r.snaps[5].heapMB <= r.snaps[1].heapMB + 30, `${r.snaps[1].heapMB} -> ${r.snaps[5].heapMB} MB`);
    rep.metric(k, { snaps: [0, 1, 3, 5].map(i => ({ ...r.snaps[i], byType: undefined })), long: r.long });
  }
} finally { await B.closeAll(); srv.stop(); }
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + '/reload_perf.json', JSON.stringify(results, null, 1));
process.exit(rep.save() ? 0 : 1);
