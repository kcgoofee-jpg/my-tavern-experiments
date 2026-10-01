// UI v2 §10.11 对比度实测：深 / 浅 / 高对比（深色 + prefers-contrast: more）× 世界 / 上层 / 中层 / 下层。
// 文字 ≥ 4.5（顶栏、抽屉标签、选中标签、抽屉正文、设置行、说明小字、通知）；非文字 ≥ 3（抽屉柄对抽屉底、选中标签底对抽屉底、开关边框）。
// 手动跑（不在 smoke 里，要开浏览器）。用法：node tools/browser/contrast_v2.mjs <输出目录>
import * as B from './lib.mjs';
const OUT = process.argv[2] || '/tmp/contrast_v2';
const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const EV = ['⌖火灾｜中层·大学｜3｜实验楼起火', '⌖盗窃｜下层·7号井｜2｜失窃', '⌖巡空令｜上层·伊甸｜1｜巡空'].map((text, i) => ({ floor: 100 + i, text }));
const MEASURE = () => {
  const rgb = s => { const m = s.match(/[\d.]+/g); if (!m) return null; let [r, g, b, a = 1] = m.map(Number); if (/^color\(srgb/.test(s)) { r *= 255; g *= 255; b *= 255; } return [r, g, b, a]; };   // color-mix() 算出来是 color(srgb 0–1)
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const mix = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
  const bgOf = el => { const st = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { st.push(c); if (c[3] >= 1) break; } }
    let base = [16, 20, 24]; for (const c of st.reverse()) base = mix(c, base); return base; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const txt = sel => { const el = document.querySelector(sel); if (!el || !el.getClientRects().length) return null; const c = rgb(getComputedStyle(el).color), bg = bgOf(el); return +ratio(mix(c, bg), bg).toFixed(2); };
  const non = (sel, prop = 'backgroundColor', against) => { const el = document.querySelector(sel); if (!el || !el.getClientRects().length) return null; const bg = bgOf(against ? document.querySelector(against) : el.parentElement);
    const c = rgb(getComputedStyle(el)[prop]); return c ? +ratio(mix(c, bg), bg).toFixed(2) : null; };
  return {
    crumb: txt('#crumbs b'), tab: txt('#evbar [role=tab][aria-selected=false]:not([hidden])'), tabSel: txt('#evbar [role=tab][aria-selected=true]'), toggle: txt('#evbar .uis-tog'),
    evRow: txt('#evbar li b'), evSum: txt('#evbar .evsum .sum'),
    grip: (() => { const i = document.querySelector('#evbar .uis-grip i'); if (!i || !i.getClientRects().length) return null; const bg = bgOf(document.querySelector('#evbar')), c = rgb(getComputedStyle(i).backgroundColor); return +ratio(mix(c, bg), bg).toFixed(2); })(),
    tabSelBg: (() => { const el = document.querySelector('#evbar [role=tab][aria-selected=true]'); if (!el || !el.getClientRects().length) return null; const m = getComputedStyle(el).boxShadow.match(/(rgba?\([^)]*\)|color\(srgb[^)]*\))/); const c = m && rgb(m[1]); return c ? +ratio(c, bgOf(document.querySelector('#evbar'))).toFixed(2) : null; })(),   // S7-2 selection grammar: the accent bar on the leading edge is the non-text cue (3 px inset shadow)
    setRow: txt('#setPop:not([hidden]) .spage:not([hidden]) .hrow span'), setSmall: txt('#setPop:not([hidden]) .spage:not([hidden]) small'), setTitle: txt('#setPop:not([hidden]) #setTitle'),
    swBorder: non('#setPop:not([hidden]) .spage:not([hidden]) input[type=checkbox]:not(:checked)', 'borderTopColor', '#setPop'),
  };
};
// S7-2 (P4-1): every glass surface over black, over white and over the 95th-percentile-luminance pixel of the shown map; --ink / --ink-2 >= 4.5, the accent and the focus ring >= 3 on the glass-1
// composites, --muted >= 4.5 on glass-2 (opaque; muted never sits on glass-1). The chrome token set is the same in every view, so a pair that passes here passes on every pack view.
const GLASS = () => {
  const cv = document.createElement('canvas').getContext('2d'), col = v => { const el = document.createElement('i'); el.style.color = v; document.body.appendChild(el); const c = getComputedStyle(el).color; el.remove(); cv.fillStyle = '#000'; cv.clearRect(0, 0, 1, 1); const m = c.match(/[\d.]+/g).map(Number), k = /^color\(srgb/.test(c) ? 255 : 1; return m.length >= 3 ? [m[0] * k, m[1] * k, m[2] * k, m[3] ?? 1] : [0, 0, 0, 1]; };   // color-mix() computes to color(srgb 0..1 ...)
  const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }, L = ([r, g, b]) => .2126 * f(r) + .7152 * f(g) + .0722 * f(b), R = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
  let p95 = [128, 128, 128]; try { const c = document.querySelector('.openseadragon-canvas canvas'), g = c.getContext('2d'), px = []; for (let k = 0; k < 600; k++) { const d = g.getImageData(Math.floor(Math.random() * c.width), Math.floor(Math.random() * c.height), 1, 1).data; px.push([d[0], d[1], d[2]]); } px.sort((a, b) => L(a) - L(b)); p95 = px[Math.floor(px.length * .95)]; } catch (e) {}
  const g1 = col('var(--glass-1)'), g2 = col('var(--glass-2)'), ink = col('var(--ink)'), ink2 = col('var(--ink-2)'), muted = col('var(--muted)'), acc = col('var(--accent)'), foc = col('var(--focus)');
  const out = { p95: p95.map(Math.round).join(',') }, bad = [];
  for (const [nm, back] of [['black', [0, 0, 0]], ['white', [255, 255, 255]], ['p95', p95]]) {
    const bg = over(g1, back);
    const r = { ink: R(over(ink, bg), bg), ink2: R(over(ink2, bg), bg), accent: R(acc, bg), focus: R(foc, bg) }; out[nm] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(2)]));
    if (r.ink < 4.5 || r.ink2 < 4.5) bad.push(`${nm}: ink ${r.ink.toFixed(2)} / ink-2 ${r.ink2.toFixed(2)}`); if (r.accent < 3 || r.focus < 3) bad.push(`${nm}: accent ${r.accent.toFixed(2)} / focus ${r.focus.toFixed(2)}`);
  }
  const m2 = R(muted, g2); out.mutedOnGlass2 = +m2.toFixed(2); if (m2 < 4.5) bad.push('muted on glass-2 ' + m2.toFixed(2));
  return { out, bad };
};
try {
  for (const [theme, scheme, contrast] of [['dark', 'dark', 'no-preference'], ['light', 'light', 'no-preference'], ['hc', 'dark', 'more']]) {
    const P = await B.newPage('phone', { scheme, tier: 'save' }); await P.page.emulateMedia({ colorScheme: scheme, contrast }).catch(() => P.page.emulateMedia({ colorScheme: scheme }));
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(1200); await B.postEvents(P.page.mainFrame(), EV); await B.wait(800);
    for (const map of ['world', 'tc_upper', 'tc_mid', 'tc_low']) {
      await B.goMap(P.page, map).catch(() => {}); await B.wait(1200);
      await P.page.evaluate(() => { if (!ViewerDrawer.button('ev').hidden) ViewerDrawer.setTab('ev', 'half'); }); await B.wait(400);
      const a = await P.page.evaluate(MEASURE);
      await P.page.evaluate(() => { ViewerDrawer.set('peek'); SettingsApi.open('display'); }); await B.wait(300);
      const b = await P.page.evaluate(MEASURE);
      await P.page.evaluate(() => ViewerDebug.showSet(false));
      const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]])), all = { ...pick(a, ['crumb', 'tab', 'tabSel', 'toggle', 'evRow', 'evSum', 'grip', 'tabSelBg']), ...pick(b, ['setRow', 'setSmall', 'setTitle', 'swBorder']) }, txtKeys = ['crumb', 'tab', 'tabSel', 'toggle', 'evRow', 'evSum', 'setRow', 'setSmall', 'setTitle'], nonKeys = ['grip', 'tabSelBg', 'swBorder'];
      const badT = txtKeys.filter(k => all[k] != null && all[k] < 4.5), badN = nonKeys.filter(k => all[k] != null && all[k] < 3);
      rep.metric(`${theme}_${map}`, all);
      const gl = await P.page.evaluate(GLASS); rep.check(`${theme} × ${map}：毛玻璃叠在黑 / 白 / 地图 95 分位亮度上，ink ≥ 4.5、强调色与焦点环 ≥ 3、muted 在 glass-2 上 ≥ 4.5`, !gl.bad.length, JSON.stringify(gl.out) + (gl.bad.length ? ' 不足：' + gl.bad.join('; ') : ''));
      rep.check(`${theme} × ${map}：文字 ≥ 4.5、非文字 ≥ 3`, !badT.length && !badN.length, JSON.stringify(all) + (badT.length || badN.length ? ' 不足：' + [...badT, ...badN].join(',') : ''));
    }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? '全部通过' : '有失败', '→', OUT); process.exit(ok ? 0 : 1);
