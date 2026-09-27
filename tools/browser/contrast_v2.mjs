// UI v2 §10.11 对比度实测：深 / 浅 / 高对比（深色 + prefers-contrast: more）× 世界 / 上层 / 中层 / 下层。
// 文字 ≥ 4.5（顶栏、抽屉标签、选中标签、抽屉正文、设置行、说明小字、通知）；非文字 ≥ 3（抽屉柄对抽屉底、选中标签底对抽屉底、开关边框）。
// 用法：node tools/browser/contrast_v2.mjs <输出目录>
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
    tabSelBg: non('#evbar [role=tab][aria-selected=true]', 'backgroundColor', '#evbar'),
    setRow: txt('#setPop:not([hidden]) .spage:not([hidden]) .hrow span'), setSmall: txt('#setPop:not([hidden]) .spage:not([hidden]) small'), setTitle: txt('#setPop:not([hidden]) #setTitle'),
    swBorder: non('#setPop:not([hidden]) .spage:not([hidden]) input[type=checkbox]:not(:checked)', 'borderTopColor', '#setPop'),
  };
};
try {
  for (const [theme, scheme, contrast] of [['dark', 'dark', 'no-preference'], ['light', 'light', 'no-preference'], ['hc', 'dark', 'more']]) {
    const P = await B.newPage('phone', { scheme, tier: 'save' }); await P.page.emulateMedia({ colorScheme: scheme, contrast }).catch(() => P.page.emulateMedia({ colorScheme: scheme }));
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(1200); await B.postEvents(P.page.mainFrame(), EV); await B.wait(800);
    for (const map of ['world', 'tc_upper', 'tc_mid', 'tc_low']) {
      await B.goMap(P.page, map).catch(() => {}); await B.wait(1200);
      await P.page.evaluate(() => { if (!TCSheet.button('ev').hidden) TCSheet.setTab('ev', 'half'); }); await B.wait(400);
      const a = await P.page.evaluate(MEASURE);
      await P.page.evaluate(() => { TCSheet.set('peek'); TCSettings.open('display'); }); await B.wait(300);
      const b = await P.page.evaluate(MEASURE);
      await P.page.evaluate(() => showSet(false));
      const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]])), all = { ...pick(a, ['crumb', 'tab', 'tabSel', 'toggle', 'evRow', 'evSum', 'grip', 'tabSelBg']), ...pick(b, ['setRow', 'setSmall', 'setTitle', 'swBorder']) }, txtKeys = ['crumb', 'tab', 'tabSel', 'toggle', 'evRow', 'evSum', 'setRow', 'setSmall', 'setTitle'], nonKeys = ['grip', 'tabSelBg', 'swBorder'];
      const badT = txtKeys.filter(k => all[k] != null && all[k] < 4.5), badN = nonKeys.filter(k => all[k] != null && all[k] < 3);
      rep.metric(`${theme}_${map}`, all);
      rep.check(`${theme} × ${map}：文字 ≥ 4.5、非文字 ≥ 3`, !badT.length && !badN.length, JSON.stringify(all) + (badT.length || badN.length ? ' 不足：' + [...badT, ...badN].join(',') : ''));
    }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? '全部通过' : '有失败', '→', OUT); process.exit(ok ? 0 : 1);
