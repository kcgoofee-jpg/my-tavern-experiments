// S4-4 text parity: every visible text of the viewer, state by state, written as JSON so two trees can be diffed line by line.
//   node tools/browser/text_dump.mjs --out <dir> [--pack eden|town] [--lang zh|en]     dump (1440x900, no host)
//   node tools/browser/text_dump.mjs --diff <before> <after>                            per state, the lines that changed
//   node tools/browser/text_dump.mjs --grep <dir> [--terms a,b,c]                        list states whose text carries a card term (default: the watchdog term list)
// One JSON per state: { title, lines (innerText), attrs (aria-label / title / placeholder / alt), i18n (data-i18n* elements, hidden ones included), dict }.
// States: each map, every drawer tab, every settings page (all <details> opened), the legend, the events list with posted events, a glitch,
// the people page with a posted roster, a person card, the custom-names panel, the unmapped panel, the feedback report, and the whole dictionary through I18N.t.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import * as B from './lib.mjs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].replace(/^~/, os.homedir()) : null; };
const ONLY = arg('--only')?.split(','), OUT = arg('--out'), PACK = arg('--pack') || 'eden', LANG = arg('--lang') || 'zh', DIFF = process.argv.indexOf('--diff'), GREP = arg('--grep');
const slug = s => String(s).replace(/[^\w.-]+/g, '_');

// --- fixtures: neutral words only (they are posted as data, not typed into the engine) ---
const EV_EDEN = ['⌖火灾｜中层·大学｜3｜实验楼起火', '⌖盗窃｜下层·7号井｜2｜失窃', '⌖巡空令｜上层·伊甸｜1｜巡空'];
const EV_TOWN = ['⌖火灾｜雾港镇·码头·鱼市｜2｜鱼市仓库起火｜巡夜队', '⌖集市日｜山上·集市广场｜1｜周末集市开张'];
const GLITCH_TOWN = '<span style="display:none">⌖火灾｜雾港镇·码头·鱼市｜3｜仓库起火</span>';   // the second pack's own words: a card word posted as a fixture would show up in its dump
const GLITCH = '<span style="display:none">⌖网络攻击｜中层·商业区｜3｜全息广告被劫持</span>';
const ROSTER = {
  present: { items: [{ name: '甲一', identity: '园丁', src: 'mvu', more: { code: 'A-1', social: '访客', height: 170, weight: 60, known: true, accessory: '项链' } }] },
  members: { items: [{ name: '甲二', identity: '厨师', stage: '第二步', grade: 'B', core: 72 }, { name: '甲三', identity: '司机' }] },
  targets: { items: [{ name: '丙一', identity: '商人', stage: '第二步' }] },
};
const FLOOR = 7;
const CHARS = { type: 'eden-map:chars', floor: FLOOR, items: [{ name: '甲一', place: '', floor: FLOOR, present: true, src: 'mvu' }], rosters: ROSTER, stageOrder: ['第一步', '第二步', '第三步', '第四步'], portraits: {} };

const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}#status,#tierState{visibility:hidden!important}';

async function collect(p, extra = {}) {
  const r = await p.evaluate(() => {
    const sel = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.dataset?.i18n ? '[' + e.dataset.i18n + ']' : (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''));
    const attrs = [];
    document.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach(e => { for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const v = e.getAttribute(a); if (v) attrs.push(`${sel(e)} @${a}=${v}`); } });
    const i18n = [];
    for (const [ds, at] of [['i18n', 'text'], ['i18nTitle', 'title'], ['i18nPh', 'placeholder'], ['i18nAria', 'aria-label']])
      document.querySelectorAll('[data-' + ds.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + ']').forEach(e => i18n.push(`${e.dataset[ds]} @${at}=${at === 'text' ? e.textContent.trim() : e.getAttribute(at === 'aria-label' ? 'aria-label' : at) ?? (e[at] ?? '')}`));
    const lines = (document.body.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    return { title: document.title, lines, attrs: [...new Set(attrs)].sort(), i18n: [...new Set(i18n)].sort() };
  });
  return { ...r, ...extra };
}

async function dump() {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await B.ensureServer(); let n = 0; const errs = [];
  const { packGeo } = await import(path.join(B.REPO_ROOT, 'tools/eden_geo.mjs')), EVM = await import(path.join(B.REPO_ROOT, 'map/tavern/events-parse.mjs'));
  const geo = packGeo(PACK), EVT = PACK === 'town' ? EV_TOWN : EV_EDEN;
  const P = await B.newPage('desktop', { lang: LANG, tier: 'save', scheme: 'dark', init: [o => { try { if (o.pack !== 'eden') { localStorage.setItem(`tcp.${o.pack}.Lang`, o.lang); localStorage.setItem(`tcp.${o.pack}.Hint`, '1'); localStorage.setItem(`tcp.${o.pack}.TierV2`, 'save'); } } catch (e) {} }, { pack: PACK, lang: LANG }] });
  const p = P.page;
  const state = async (name, extra) => { await p.addStyleTag({ content: FREEZE }).catch(() => {}); await B.wait(350); fs.writeFileSync(path.join(OUT, slug(name) + '.json'), JSON.stringify(await collect(p, extra), null, 1)); n++; };
  try {
    await p.goto(B.BASE + 'viewer.html' + (PACK === 'eden' ? '' : '?pack=' + PACK), { waitUntil: 'commit' });
    await p.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {});
    await B.wait(1500); await p.evaluate(() => document.body.classList.add('nofx'));
    const lang = await p.evaluate(() => document.documentElement.lang); if (LANG === 'en' && lang !== 'en') await p.evaluate(() => setLang('en'));
    // the whole dictionary, read through the service the add-on scripts use (pack strings first, as t() does)
    // {book} / {script} are filled the way the call sites fill them (the pack's worldbook prefix + the custom-book suffix; the pack's script name), so the dump does not depend on where a name lives
    const dict = await p.evaluate(async () => {
      const d = await (await fetch('i18n/zh.json')).json(), o = {}, pk = (await import('./app/current-pack.mjs')).PACK, wp = (await import('./core/pack.mjs')).worldbookPrefix, sc = window.I18N.t('app.script');
      const vars = { v: '{v}', book: wp(pk, pk?.id) + '·自定义', script: sc === 'app.script' ? '' : sc };
      for (const k of Object.keys(d).sort()) if (k !== 'names' && !k.startsWith('_')) o[k] = window.I18N.t(k, vars);   // `_…` keys are notes for the file's readers
      return o; });
    fs.writeFileSync(path.join(OUT, 'dict.json'), JSON.stringify({ title: '', lines: Object.entries(dict).map(([k, v]) => `${k} = ${v}`), attrs: [], i18n: [] }, null, 1)); n++;
    if (ONLY?.join() === 'dict') return;   // --only dict: just the dictionary (seconds), for comparing a tree without waiting for the maps
    const maps = await p.evaluate(() => Object.keys(REG.maps));
    for (const m of maps) { try { await B.goMap(p, m); } catch (e) { continue; } await B.wait(1000); await state('map_' + m); }
    // drawer tabs on the first flat map
    const flat = await p.evaluate(() => Object.keys(REG.maps).find(k => REG.maps[k].kind !== 'estate' && k !== 'world') || Object.keys(REG.maps)[0]);
    await B.goMap(p, flat); await B.wait(800);
    // events + roster, posted the way the host posts them
    const items = (() => { EVM.setGeo(geo); const r = EVM.collect(EVT.map((text, i) => ({ floor: 100 + i, text })), 102).map(e => ({ ...e, isNew: true })); EVM.setGeo(null); return r; })();
    await p.evaluate(m => TCEvents.set(m), { type: 'eden-map:events', items, floor: 102 }); await B.wait(700);
    await p.evaluate(m => TCChars.set(m), CHARS); await B.wait(700);
    for (const tab of ['pl', 'ev', 'ch', 'lg']) {
      const vis = await p.evaluate(t => { try { const b = TCSheet.button(t); if (!b || b.hidden) return false; TCSheet.setTab(t, 'half'); return true; } catch (e) { return false; } }, tab);
      if (vis) { await B.wait(500); await state('tab_' + tab); }
    }
    await p.evaluate(() => TCSheet.set('peek'));
    // a person card (the "more data" rows)
    await p.evaluate(() => { try { TCChars.cardOf('甲一'); } catch (e) {} }); await B.wait(700); await state('card_person');
    await p.evaluate(() => { try { closeCard(); } catch (e) {} });
    // a glitch (the notice text), then back to the plain events
    if (PACK === 'eden') await B.postEvents(p.mainFrame(), [{ floor: 50, text: GLITCH }], true).catch(() => {});
    else await p.evaluate(m => TCEvents.set(m), { type: 'eden-map:events', items: (() => { EVM.setGeo(geo); const r = EVM.collect([{ floor: 50, text: GLITCH_TOWN }], 50).map(e => ({ ...e, isNew: true })); EVM.setGeo(null); return r; })(), floor: 50 }).catch(() => {}); await B.wait(700); await state('glitch');
    await p.evaluate(m => TCEvents.set(m), { type: 'eden-map:events', items, floor: 102 }); await B.wait(500);
    // settings: every page, every <details> open
    const pages = await p.evaluate(() => [...document.querySelectorAll('#setPop .spage')].map(e => e.dataset.page));
    for (const pg of pages) {
      await p.evaluate(g => { TCSettings.open(g); document.querySelectorAll('#setPop details').forEach(d => { d.open = true; }); }, pg); await B.wait(500);
      await state('settings_' + pg);
    }
    await p.evaluate(() => showSet(false));
    // the custom-names panel and the unmapped panel
    await p.evaluate(() => { try { TCCustom.openDlg(null, 'list'); } catch (e) {} }); await B.wait(900); await state('custom_dlg');
    await p.evaluate(() => { try { document.querySelector('#cuDlg .cu-x, #cuDlg [data-close]')?.click(); } catch (e) {} }); await p.keyboard.press('Escape'); await B.wait(300);
    await p.evaluate(() => { try { TCUnmapped.open(); } catch (e) {} }); await B.wait(700); await state('unmapped_dlg');
    await p.keyboard.press('Escape'); await B.wait(300);
    // the feedback report: the text area, without the clock and the log lines
    await p.evaluate(() => { TCSettings.open('update'); }); await B.wait(400);
    await p.evaluate(() => { document.querySelector('.fb-open')?.click(); }); await B.wait(700);
    const rep = await p.evaluate(() => document.querySelector('#fbText')?.value || '');
    const repLines = rep.split('\n').filter(l => !/^(时间 \/ time|\[\d\d:\d\d:\d\d\])/.test(l));
    fs.writeFileSync(path.join(OUT, 'feedback_report.json'), JSON.stringify({ title: '', lines: repLines, attrs: [], i18n: [] }, null, 1)); n++;
    await p.evaluate(() => { document.querySelector('#fbClose')?.click(); });
    if (P.errors.length) errs.push(...P.errors.slice(0, 5));
  } finally { await P.close(); await B.closeAll(); srv.stop(); }
  if (ONLY) { console.log('states', n, '->', OUT); return; }
  if (errs.length) console.log('  page errors:', errs);
  fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify({ pack: PACK, lang: LANG, states: n }, null, 1));
  console.log('states', n, '->', OUT);
}

function diff(a, b) {
  const list = d => fs.readdirSync(d).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort();
  const A = list(a), C = list(b); let same = 0, changed = 0;
  for (const f of new Set([...A, ...C])) {
    if (!A.includes(f)) { console.log(`${f.replace('.json', '')}: NEW in after`); changed++; continue; }
    if (!C.includes(f)) { console.log(`${f.replace('.json', '')}: MISSING in after`); changed++; continue; }
    const x = JSON.parse(fs.readFileSync(path.join(a, f), 'utf8')), y = JSON.parse(fs.readFileSync(path.join(b, f), 'utf8')), out = [];
    for (const k of ['title', 'lines', 'attrs', 'i18n']) {
      const xs = [].concat(x[k] ?? []), ys = [].concat(y[k] ?? []), sx = new Set(xs), sy = new Set(ys);
      for (const l of xs) if (!sy.has(l)) out.push(`  - [${k}] ${l}`);
      for (const l of ys) if (!sx.has(l)) out.push(`  + [${k}] ${l}`);
    }
    if (f === 'dict.json') {   // keys the before tree did not have are additions, not changes: listed once, the state still counts as identical when nothing else moved
      const had = new Set(x.lines.map(l => l.split(' = ')[0])), fresh = out.filter(l => l.startsWith('  + ') && !had.has(l.slice(12).split(' = ')[0]));
      if (fresh.length) { console.log(`dict: ${fresh.length} new key${fresh.length > 1 ? 's' : ''} (no existing value changed)${fresh.length === out.length ? '' : ', plus other changes'}`); for (const l of fresh) console.log(l); }
      out.splice(0, out.length, ...out.filter(l => !fresh.includes(l)));
    }
    if (out.length) { changed++; console.log(`${f.replace('.json', '')}: ${out.length} changed lines`); for (const l of out) console.log(l); } else same++;
  }
  console.log(`states ${same + changed}, identical ${same}, changed ${changed}`);
}

function grep(dir) {
  const terms = (arg('--terms') ? arg('--terms').split(',') : JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'" + path.join(B.REPO_ROOT, 'tools') + "');import check_architecture as c;print(json.dumps(c.term_list()))"], { encoding: 'utf8' })));
  let hits = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of ['title', 'lines', 'attrs', 'i18n']) for (const l of [].concat(j[k] ?? [])) for (const t of terms) if (l.includes(t)) { hits++; console.log(`${f.replace('.json', '')} [${k}] 「${t}」 ${l}`); break; }
  }
  console.log(`card-term hits: ${hits} (${terms.length} terms)`);
  return hits;
}

if (DIFF > 0) diff(process.argv[DIFF + 1], process.argv[DIFF + 2]);
else if (GREP) process.exit(grep(GREP) ? 1 : 0);
else if (OUT) { await dump(); process.exit(0); }
else { console.log('usage: --out <dir> [--pack eden|town] [--lang zh|en] | --diff <before> <after> | --grep <dir>'); process.exit(2); }
