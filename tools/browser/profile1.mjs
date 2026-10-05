// PROFILE-1 probe (D34): the settings-profile section on Settings home at 1440 and 375 px.
//   node tools/browser/profile1.mjs [out dir]
import * as B from './lib.mjs';

const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || '/tmp/profile1';
const rep = B.reporter(OUT);
B.quietWait();
await B.ensureServer();
const PREF = ['edenMapTheme', 'edenMapRM', 'edenMapLayers', 'edenMapNoFx', 'edenMapPortraits', 'edenMapTierV2', 'edenMap3dQ'];
async function run(preset, shotName) {
  const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
  try {
    await B.openViewer(P, {}); const p = P.page;
    await p.evaluate(() => { LocalStore.remove('edenMapTierV2'); SettingsApi.open('home'); }); await B.wait(500);   // the probe preset stores a picture tier: start from a clean preference set
    const q = s => p.evaluate(s2 => { const e = document.querySelector(s2); return e ? { text: e.textContent, hidden: e.hidden, w: e.getBoundingClientRect().width } : null; }, s);
    const tag = `[${preset}]`;
    const name = await q('#profName'); rep.check(`${tag} section shows the recommended profile, not modified`, name?.text === '推荐' && (await q('#profMod'))?.hidden === true, JSON.stringify(name));
    // HEADER-1: one collapsed row 「方案：推荐 ▾」 (one line), expanded in place and remembered; the search sits in the sheet header
    const row = await p.evaluate(() => { const h = document.getElementById('profHead').getBoundingClientRect(); return { h: Math.round(h.height), bodyHidden: document.getElementById('profBody').hidden, expanded: document.getElementById('profHead').getAttribute('aria-expanded') }; });
    rep.check(`${tag} the profile row is one collapsed line by default`, row.bodyHidden && row.expanded === 'false' && row.h <= 56, JSON.stringify(row));
    const srch = await p.evaluate(() => { const h = document.querySelector('#setPop .sheet-h').getBoundingClientRect(), q = document.getElementById('setQ'), b = document.querySelector('#setPop .hqbtn'); const vis = e => e && e.offsetParent !== null; return { inHeader: !!q.closest('.sheet-h'), headTop: Math.round(h.top), reach: vis(q) || vis(b) }; });
    rep.check(`${tag} the search (or its icon on a phone) is reachable in the header at the top`, srch.inHeader && srch.reach, JSON.stringify(srch));
    await p.click('#profHead'); await B.wait(150);
    rep.check(`${tag} the row expands in place and the state is remembered`, await p.evaluate(() => !document.getElementById('profBody').hidden && LocalStore.get('edenMapProfOpen') === '1'));
    rep.check(`${tag} no horizontal overflow on the settings sheet`, await p.evaluate(() => { const s = document.getElementById('setPop'); return s.scrollWidth <= s.clientWidth + 1; }));
    // choose the lean profile: stored keys change, marker stays off, a message says how many
    await p.selectOption('#profSel', 'lean'); await B.wait(600);
    const st = await p.evaluate(keys => Object.fromEntries(keys.map(k => [k, LocalStore.get(k)])), PREF);
    rep.check(`${tag} choosing 精简 writes its keys and applies without a reload`, st.edenMapRM === 'on' && st.edenMapNoFx === '1' && st.edenMapTierV2 === 'save' && /weather/.test(st.edenMapLayers || '') && await p.evaluate(() => document.body.classList.contains('nofx') && document.documentElement.classList.contains('rm')), JSON.stringify(st));
    rep.check(`${tag} name follows and the marker is off`, (await q('#profName'))?.text === '精简' && (await q('#profMod'))?.hidden === true);
    rep.check(`${tag} weather layer switched off live`, await p.evaluate(() => window.LayerHostApi.registry.has('weather') ? !window.LayerHostApi.registry.isVisible('weather') : true));
    // change one setting by hand: the marker appears
    await p.click('#themeSeg button[data-th="light"]'); await B.wait(300);
    rep.check(`${tag} marker 已修改 appears after a manual change`, (await q('#profMod'))?.hidden === false);
    // save under a name (inline field), reload the choice
    await p.click('#profSave'); await B.wait(100);
    rep.check(`${tag} the name field is inline and focused`, await p.evaluate(() => document.activeElement?.id === 'profIn'));
    await p.fill('#profIn', '我的方案'); await p.keyboard.press('Enter'); await B.wait(300);
    rep.check(`${tag} saved: current name is the new profile, not modified`, (await q('#profName'))?.text === '我的方案' && (await q('#profMod'))?.hidden === true);
    await p.click('#profToggle'); await B.wait(100);
    await p.click('#profRestore'); await B.wait(600);
    const back = await p.evaluate(keys => Object.fromEntries(keys.map(k => [k, LocalStore.get(k)])), PREF);
    rep.check(`${tag} 恢复推荐默认 clears every preference key`, ['edenMapRM', 'edenMapNoFx', 'edenMapPortraits', 'edenMap3dQ'].every(k => back[k] === null) && !/"0"/.test(back.edenMapLayers || '') && (back.edenMapTierV2 ?? 'auto') === 'auto' && (await q('#profName'))?.text === '推荐', JSON.stringify(back));
    await p.selectOption('#profSel', await p.evaluate(() => [...document.querySelectorAll('#profSel option')].find(o => o.textContent === '我的方案').value)); await B.wait(600);
    rep.check(`${tag} choosing the saved profile restores its values`, (await p.evaluate(() => LocalStore.get('edenMapTheme'))) === 'light' && (await p.evaluate(() => LocalStore.get('edenMapRM'))) === 'on');
    // PROFILE-2: bind to card button exists and toggles
    const bindBtn = await q('#profBind');
    rep.check(`${tag} bind button exists in manage section`, bindBtn !== null && bindBtn.text.includes('绑定'));
    await p.click('#profBind'); await B.wait(200);
    const afterBind = await q('#profBind');
    rep.check(`${tag} bind button toggles to unbind`, afterBind?.text.includes('解除'));
    await p.click('#profBind'); await B.wait(200);
    const afterUnbind = await q('#profBind');
    rep.check(`${tag} unbind toggles back to bind`, afterUnbind?.text.includes('绑定'));
    rep.check(`${tag} no page errors`, P.errors.filter(e => /profile/i.test(String(e))).length === 0, String(P.errors.slice(0, 2)));
  } finally { await P.ctx.close().catch(() => {}); }
}
try { await run('desktop', 'profile-1440'); await run('phone', 'profile-375'); } finally { await B.closeAll(); }
process.exit(rep.save() ? 0 : 1);
