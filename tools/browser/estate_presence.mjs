// S7-3 T8 probe: presence in the 3D building (docs/ui-refactor.md U-27 / U-28). In the tavern host stub a chat tag places a character in a room of B1; the estate view opens inside the
// main shell; within 5 s a chip with the name is in the page's DOM on floor B1 and inside the room's screen rect (+- 40 px); switching 「在地图上显示人物」 off removes it, on brings it
// back; tapping it opens the character card in the viewer; with the view still for 2 s the page asks for no animation frame (rAF/s = 0); the shell has one card element and the strip shows the floors.
//   node tools/browser/estate_presence.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/estate_presence';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const WHO = '艾琳', ROOM = '主调教室', NODE = 'room_b1_17';
const MSGS = [{ message_id: 1, message: `<span style="display:none">⌖人物 ${WHO} @ 伊甸庄园·${ROOM}</span>` }];
const chips = ef => ef.evaluate(() => [...document.querySelectorAll('.pc')].map(b => b.dataset.name));
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: `伊甸庄园·${ROOM}`, msgs: MSGS, chat: 'ep-' + w }); await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('eden_estate'));
      const ef = await until(async () => { const el = await vf.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => !!window.__estate && window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 60000);
      rep.check(`${w}: the estate page opens in shell mode`, !!ef && await ef.evaluate(() => document.body.classList.contains('shell')), '');
      if (!ef) throw new Error('no estate frame');
      await B.wait(1500);
      const got = await until(async () => (await chips(ef)).includes(WHO), 5000);
      const st = await ef.evaluate(([node]) => ({ mode: window.__estate.mode(), rect: window.__estate.rect(node), chip: (() => { const b = document.querySelector(`.pc[data-name="${'艾琳'}"]`); const r = b?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; })() }), [NODE]);
      rep.check(`${w}: a chip with the located person's name is in the page within 5 s`, got, JSON.stringify(await chips(ef)));
      rep.check(`${w}: it is on floor B1 (the floors view on B1, D38)`, st.mode === 1, JSON.stringify({ mode: st.mode }));
      const inRect = st.chip && st.rect && st.chip.x >= st.rect.x0 - 40 && st.chip.x <= st.rect.x1 + 40 && st.chip.y >= st.rect.y0 - 40 && st.chip.y <= st.rect.y1 + 40;
      rep.check(`${w}: the chip is inside the room's screen rect +- 40 px`, !!inRect, JSON.stringify(st));
      const cm = await ef.evaluate(() => { const b = document.querySelector('.pc'); const i = b.querySelector('i').getBoundingClientRect(), r = b.getBoundingClientRect(); return { tag: b.tagName, i: Math.round(i.width), w: r.width, h: r.height, label: b.getAttribute('aria-label') }; });
      rep.check(`${w}: the chip is a button, 32 px visible in a >= 44 px hit area, named "<name>, <room>"`, cm.tag === 'BUTTON' && cm.i === 32 && cm.w >= 44 && cm.h >= 44 && /，|, /.test(cm.label || ''), JSON.stringify(cm));
      const cv = await ef.evaluate(() => { const c = window.__estate.renderer.domElement; return { role: c.getAttribute('role'), label: c.getAttribute('aria-label') }; });
      rep.check(`${w}: the canvas is an image named <building>, <floor>, <n> people`, cv.role === 'img' && /伊甸家族府邸/.test(cv.label) && /1 人$/.test(cv.label), JSON.stringify(cv));
      const sh = await vf.evaluate(() => ({ seg: !!document.querySelector('#v3seg [aria-checked=true]'), strip: [...document.querySelectorAll('#layers [data-floor]')].map(b => b.dataset.floor), card: document.querySelectorAll('#card:not([hidden])').length, dock: getComputedStyle(document.getElementById('dock')).display, tab: document.getElementById('estate').tabIndex, evbar: !document.getElementById('evbar').hidden }));
      rep.check(`${w}: the viewer's shell serves the 3D page: the view segment or menu, the level strip lists the five floors, the iframe is out of the Tab order`, sh.strip.join() === 'F3,F2,F1,B1,B2' && sh.tab === -1 && sh.dock !== 'none', JSON.stringify(sh));
      await B.shot(P.page, OUT, `${w}-presence`);
      // switch the people layer off / on
      await vf.evaluate(() => { document.querySelector('#evbar .chtab').click(); }); await B.wait(400);
      const toggle = on => vf.evaluate(on => { const i = document.querySelector('#evbar .chpane .chall input'); if (i.checked !== on) { i.checked = on; i.dispatchEvent(new Event('change', { bubbles: true })); } return i.checked; }, on);
      await toggle(false); const gone = await until(async () => !(await chips(ef)).includes(WHO), 4000);
      rep.check(`${w}: 「在地图上显示人物」 off removes the chip`, gone, JSON.stringify(await chips(ef)));
      await toggle(true); const back = await until(async () => (await chips(ef)).includes(WHO), 4000);
      rep.check(`${w}: switched on again the chip is back`, back, '');
      // tap the chip: the character card opens in the viewer (one card element, titled with the name)
      await vf.evaluate(() => { document.querySelector('#evbar .uis-tog')?.click?.(); }); await B.wait(300);
      await ef.evaluate(n => document.querySelector(`.pc[data-name="${n}"]`).click(), WHO); await B.wait(1200);
      const card = await vf.evaluate(() => ({ shown: [...document.querySelectorAll('#card')].filter(e => !e.hidden).length, title: document.getElementById('cardTitle')?.textContent }));
      rep.check(`${w}: tapping the chip opens the shared character card in the viewer (one card, titled with the name)`, card.shown === 1 && card.title.includes(WHO), JSON.stringify(card));
      await B.shot(P.page, OUT, `${w}-person-card`);
      // hover never moves the selection: select a room from the viewer's list, hover another room in the page, the card still names the selected one
      await vf.evaluate(() => { document.querySelectorAll('#cardEmpty .v3rooms details').forEach(d => d.setAttribute('open', '')); window.ViewerDrawer.setTab('pl', 'half'); }); await B.wait(300);
      await vf.evaluate(() => [...document.querySelectorAll('#cardEmpty .v3room')].find(b => b.textContent === '体能训练室')?.click()); await B.wait(1200);
      const sel0 = await vf.evaluate(() => document.getElementById('cardTitle').textContent);
      const other = await ef.evaluate(() => { const r = window.__estate.rect('room_b1_18'); return r && { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
      const off = await (await vf.$('#estate')).boundingBox();
      if (other) { await P.page.mouse.move(off.x + other.x, off.y + other.y, { steps: 4 }); await B.wait(700); }
      const sel1 = await vf.evaluate(() => ({ title: document.getElementById('cardTitle').textContent, cards: [...document.querySelectorAll('#card')].filter(e => !e.hidden).length }));
      const sel2 = await ef.evaluate(() => ({ pinned: window.__estate.pinned()?.name, tip: document.getElementById('tip').textContent }));
      rep.check(`${w}: hover never changes the selection: the card keeps the selected room, one card element`, sel0.includes('体能训练室') && sel1.title === sel0 && sel1.cards === 1 && sel2.pinned === '体能训练室', JSON.stringify({ sel0, sel1, sel2 }));
      // occlusion: from a low angle the labels behind the walls are display: none; from above none are
      await ef.evaluate(() => { window.__estate.setMode('ext'); }); await B.wait(2500);
      await ef.evaluate(() => { window.__estate.view(-0.25, 0.05); }); await B.wait(1200);
      const top = await ef.evaluate(() => ({ occl: document.querySelectorAll('.lbl.occl').length, ms: window.__estate.occl?.ms }));
      await ef.evaluate(() => { window.__estate.view(-0.25, 1.33); }); await B.wait(1200);
      const low = await ef.evaluate(() => ({ occl: [...document.querySelectorAll('.lbl.occl')].filter(e => getComputedStyle(e).display === 'none').length, ms: window.__estate.occl?.ms, rounds: window.__estate.occl?.rounds }));
      rep.check(`${w}: an occluded label has display: none (exterior from a low camera: labels behind the house), none are hidden from above, a round costs <= 2 ms`, top.occl === 0 && low.occl > 0 && low.ms <= 2, JSON.stringify({ top, low }));
      // 楼层视图（D38：x 光已移除）：视图分段恰好「外观 / 楼层」两个按钮，键 2 → 楼层、键 1 → 外观
      await ef.evaluate(() => window.__estate.setMode('ext')); await B.wait(600);
      const seg = await vf.evaluate(() => [...document.querySelectorAll('#v3seg button')].map(b => `${b.dataset.v}:${b.textContent}`));
      rep.check(`${w}: the view segment has exactly 外观 / 楼层 (x-ray removed, D38)`, seg.length === 2 && seg[0] === 'ext:外观' && seg[1] === 'sect:楼层', JSON.stringify(seg));
      await P.page.keyboard.press('2'); await B.wait(1200);
      const k2 = await ef.evaluate(() => ({ mode: window.__estate.mode() }));
      await P.page.keyboard.press('1'); await B.wait(1200);
      const k1 = await ef.evaluate(() => ({ mode: window.__estate.mode() }));
      rep.check(`${w}: key 2 → the floors view (the last floor cut open), key 1 → the exterior (keys 1 / 2, D38)`, Number.isInteger(k2.mode) && k1.mode === 'ext', JSON.stringify({ k1, k2 }));
      const xr = await ef.evaluate(() => document.body.innerHTML.includes('xray'));
      rep.check(`${w}: no xray in the page DOM or view state (D38)`, !xr, String(xr));
      // idle: no animation frame for 2 s
      await vf.evaluate(() => ViewerDebug.closeCard?.()); await P.page.mouse.move(2, 2);
      await ef.evaluate(() => { window.__raf = 0; const o = window.requestAnimationFrame; window.requestAnimationFrame = f => { window.__raf++; return o.call(window, f); }; });
      await B.wait(1200); await ef.evaluate(() => { window.__raf = 0; }); await B.wait(2000);
      const raf = await ef.evaluate(() => ({ raf: window.__raf, renders: window.__estate.renders }));
      rep.check(`${w}: the estate view still for 2 s asks for no animation frame (rAF/s = 0)`, raf.raf === 0, JSON.stringify(raf));
    } catch (e) { rep.check(`${w}: run`, false, String(e?.message || e).split('\n')[0]); }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? '全部通过' : '有失败'); process.exit(ok ? 0 : 1);
