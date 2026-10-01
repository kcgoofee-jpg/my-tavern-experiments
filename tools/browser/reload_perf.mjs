// I-29: reload-path performance probe. Host harness (host_stub), three scenarios:
//   cold   = first open of the panel in a fresh context (fab click -> viewer loading overlay done)
//   page   = page reload, then open the panel (script bootstrap + idle preload + open)
//   inmap  = in-map reload action (the loader's retry path: drop html, unload the viewer, load again)
// Records long tasks (PerformanceObserver longtask + long-animation-frame with script attribution on Chromium; a
// requestAnimationFrame gap monitor everywhere, which is the only signal WebKit offers) and, on Chromium, a CDP CPU
// profile aggregated by function. Budgets are asserted for the page / in-map / cold scenarios on Chromium; WebKit
// is measured and reported (rAF gaps) with the same long-task budget.
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
} finally { await B.closeAll(); srv.stop(); }
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + '/reload_perf.json', JSON.stringify(results, null, 1));
process.exit(rep.save() ? 0 : 1);
