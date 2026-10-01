// S4-3 shadow parity: screenshots of the viewer before / after moving special cases into pack data.
//   node tools/browser/s43_parity.mjs --out <dir>                  take 1440x900 shots (every map x dark / light, plus panels)
//   node tools/browser/s43_parity.mjs --diff <before> <after> [--out <dir>]
//        count pixels whose luminance differs by > 12 (as p9_daynight_fx.mjs); one line per shot; diff PNG for any change
// Animated layers are frozen (body.nofx + no animation / transition) so the diff is deterministic.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as B from './lib.mjs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].replace(/^~/, os.homedir()) : null; };
const DIFF = process.argv.indexOf('--diff'), ONLY = arg('--only')?.split(',') || null;   // --only a,b: take just those shots (debugging a difference)
const SKIP = arg('--skip')?.split(',') || [], SCHEMES = arg('--schemes')?.split(',') || ['dark', 'light'];   // --skip a,b: leave those shots out; --schemes dark: one theme only
const want = n => (!ONLY || ONLY.includes(n)) && !SKIP.includes(n);
const EV = ['⌖火灾｜中层·大学｜3｜实验楼起火', '⌖盗窃｜下层·7号井｜2｜失窃', '⌖巡空令｜上层·伊甸｜1｜巡空'].map((text, i) => ({ floor: 100 + i, text }));
const GLITCH = [{ floor: 50, text: '<span style="display:none">⌖网络攻击｜中层·商业区｜3｜全息广告被劫持</span>' }];
// the load state text ("loaded") in the header shows for a while after a map opens: a timing effect, not a rendering one, so it is hidden too
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}#status,#tierState{visibility:hidden!important}.cl-drift{visibility:hidden!important}';   // drifting clouds are placed at random: hidden in the pixels, their presence is recorded in flags.json

async function settle(p, ms = 900) {
  await p.evaluate(() => document.body.classList.add('nofx'));
  await p.addStyleTag({ content: FREEZE }).catch(() => {});
  await B.wait(ms);
}

async function take(out) {
  fs.mkdirSync(out, { recursive: true });
  const srv = await B.ensureServer(); let n = 0; const flags = {};
  const snap = async (p, name) => { if (!want(name)) return; await settle(p, 500); await B.shot(p, out, name); n++; };
  try {
    for (const scheme of SCHEMES) {
      const P = await B.newPage('desktop', { scheme, tier: 'save' }), p = P.page;
      await B.openViewer(P, { map: 'world' }); await B.wait(1200);
      await p.evaluate(s => { try { ViewerDebug.setTheme(s); } catch (e) {} }, scheme).catch(() => {});
      const maps = await p.evaluate(() => Object.keys(ViewerDebug.mapRegistry.maps));
      for (const m of maps) {
        if (!want(`map_${m}_${scheme}`)) continue;
        try { await B.goMap(p, m); } catch (e) { continue; }
        await B.wait(1200);
        flags[`${m}_${scheme}`] = await p.evaluate(() => ({ clouds: !!document.querySelector('.cl-drift:not([hidden])'), glow: document.body.dataset.glow || '', tint: document.body.classList.contains('nighttint'), legend: !document.querySelector('#evbar .lgtab')?.hidden }));   // the data-driven behaviours the pixels cannot show
        await snap(p, `map_${m}_${scheme}`);
      }
      if (scheme === 'dark') {
        await B.goMap(p, 'world'); await B.wait(1000);
        const has = await p.evaluate(() => { const ph = ViewerDebug.mapRegistry.maps.world; return !!document.querySelector('.mk'); });
        // world map with the hunting_camp card open (only exists once T7 landed)
        const opened = await p.evaluate(() => { const mk = [...document.querySelectorAll('.mk')].find(e => /hunting|猎季|猎营|狩猎/i.test((e.dataset.id || '') + (e.textContent || '') + (e.getAttribute('aria-label') || ''))); if (!mk) return false; (mk._open || (() => mk.click()))(); return true; });   // the marker's own opener (the OSD tracker does not hear a synthetic click)
        if (opened) { await B.wait(700); await snap(p, 'world_hunting_camp_card'); await p.evaluate(() => { try { ViewerDebug.closeCard(); } catch (e) {} }); }
        else console.log('  (no hunting_camp marker on the world map; shot skipped)', has);
        for (const pg of ['update', 'license']) { await p.evaluate(g => { SettingsApi.open(g); }, pg); await B.wait(500); await snap(p, `settings_${pg}`); await p.evaluate(() => ViewerDebug.showSet(false)); }
        await B.goMap(p, 'tc_mid'); await B.wait(1000);
        await p.evaluate(() => { ViewerDrawer.setTab('lg', 'half'); }); await B.wait(400); await snap(p, 'legend_panel');
        await p.evaluate(() => { ViewerDrawer.set('peek'); });
        await B.postEvents(p.mainFrame(), GLITCH, true); await B.wait(800); await snap(p, 'glitch_active');
        await B.postEvents(p.mainFrame(), EV, true); await B.wait(800);
        await p.evaluate(() => { const b = document.querySelector('#cvdSeg button[data-cvd="rg"]'); b && b.click(); }); await B.wait(500);
        await p.evaluate(() => { if (!ViewerDrawer.button('ev').hidden) ViewerDrawer.setTab('ev', 'half'); }); await B.wait(500); await snap(p, 'cvd_rg_events');
      }
      if (P.errors.length) console.log('  page errors', scheme, P.errors.slice(0, 3));
      await P.close();
    }
  } finally { await B.closeAll(); srv.stop(); }
  fs.writeFileSync(path.join(out, 'flags.json'), JSON.stringify(flags, null, 1));
  console.log('shots', n, '->', out);
}

async function diff(a, b, out) {
  fs.mkdirSync(out, { recursive: true });
  const names = fs.readdirSync(a).filter(f => f.endsWith('.png')).sort();
  const srv = await B.ensureServer(); const P = await B.newPage('desktop'); const rows = [];
  try {
    await P.page.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' });
    for (const f of names) {
      const fb = path.join(b, f);
      if (!fs.existsSync(fb)) { rows.push({ name: f, missing: true }); console.log(f.replace('.png', ''), 'MISSING in after'); continue; }
      const r = await P.page.evaluate(async ([x, y]) => {
        const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
        const A = await load(x), C = await load(y), w = Math.max(A.width, C.width), h = Math.max(A.height, C.height);
        const px = i => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, w, h).data; };
        const da = px(A), dc = px(C), oc = document.createElement('canvas'); oc.width = w; oc.height = h; const og = oc.getContext('2d'), od = og.createImageData(w, h);
        const lum = (d, i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; let n = 0;
        for (let i = 0; i < da.length; i += 4) { const ch = Math.abs(lum(da, i) - lum(dc, i)) > 12; if (ch) n++; od.data[i] = ch ? 255 : dc[i] >> 2; od.data[i + 1] = ch ? 0 : dc[i + 1] >> 2; od.data[i + 2] = ch ? 0 : dc[i + 2] >> 2; od.data[i + 3] = 255; }
        og.putImageData(od, 0, 0); return { n, total: w * h, png: n ? oc.toDataURL('image/png').split(',')[1] : null, dim: A.width !== C.width || A.height !== C.height };
      }, [fs.readFileSync(path.join(a, f)).toString('base64'), fs.readFileSync(fb).toString('base64')]);
      const pct = (100 * r.n / r.total).toFixed(3);
      console.log(`${f.replace('.png', '')} changed=${r.n} (${pct}%)${r.dim ? ' DIM-MISMATCH' : ''}`);
      rows.push({ name: f.replace('.png', ''), changed: r.n, pct: +pct });
      if (r.png) fs.writeFileSync(path.join(out, 'diff_' + f), Buffer.from(r.png, 'base64'));
    }
    for (const f of fs.readdirSync(b).filter(f => f.endsWith('.png') && !names.includes(f))) { console.log(f.replace('.png', ''), 'NEW in after (no before)'); rows.push({ name: f, added: true }); }
  } finally { await B.closeAll(); srv.stop(); }
  const fa = path.join(a, 'flags.json'), fb = path.join(b, 'flags.json');
  if (fs.existsSync(fa) && fs.existsSync(fb)) {   // the behaviours the pixels cannot show: clouds mounted, glow view, period tint, legend tab, per map
    const A = JSON.parse(fs.readFileSync(fa, 'utf8')), C = JSON.parse(fs.readFileSync(fb, 'utf8')), d = Object.keys({ ...A, ...C }).filter(k => JSON.stringify(A[k]) !== JSON.stringify(C[k]));
    console.log(`flags ${Object.keys(A).length} maps, ${d.length} differ${d.length ? ': ' + d.join(', ') : ''}`); rows.push({ name: 'flags', differ: d });
  }
  fs.writeFileSync(path.join(out, 'parity.json'), JSON.stringify(rows, null, 1));
  const bad = rows.filter(r => r.changed > 0 || r.missing);
  console.log(`shots ${rows.length}, identical ${rows.filter(r => r.changed === 0).length}, changed ${bad.length}`);
}

if (DIFF > 0) await diff(process.argv[DIFF + 1], process.argv[DIFF + 2], arg('--out') || '/tmp/s43_diff');
else await take(arg('--out') || '/tmp/s43_shots');
process.exit(0);
