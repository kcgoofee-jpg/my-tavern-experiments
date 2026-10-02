// PLACE-1b probe 「地点」页（3D 剖切 B2、玩家在惩罚室）：第 1 项是当前地点的记录卡，没有署名链接，没有空楼层行，上级链一行，附近一行。1440 与 375 px。
//   node tools/browser/place_tab.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/place_tab';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: '伊甸庄园·惩罚室', msgs: [], chat: 'pt-' + w });
      await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('eden_estate'));
      const ef = await until(async () => { const el = await vf.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => !!window.__estate && window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 60000);
      if (!ef) throw new Error('no estate frame');
      await until(() => vf.evaluate(() => !!document.querySelector('#layers [data-floor="B2"]')), 10000);
      await vf.evaluate(() => document.querySelector('#layers [data-floor="B2"]').click());
      await B.wait(2500);
      await vf.evaluate(() => window.ViewerDrawer.setTab('pl', 'full'));
      await B.wait(900);
      const tab = await vf.evaluate(() => {
        const e = document.getElementById('cardEmpty');
        return {
          um: e?.dataset.um || '', title: e?.querySelector('.pr-title')?.textContent || '', sub: e?.querySelector('.pr-sub')?.textContent || '',
          desc: e?.querySelector('.pr-desc')?.textContent || '', links: [...e.querySelectorAll('a')].map(a => a.textContent),
          chain: [...e.querySelectorAll('.pr-crumb')].map(b => b.textContent), near: [...e.querySelectorAll('.pr-nearline .pr-chip')].map(b => b.textContent),
          all: !!e.querySelector('.pr-all'), acts: [...e.querySelectorAll('.pr-acts button')].map(b => b.textContent), floorRows: e.querySelectorAll('.v3rooms').length,
          empty: e.textContent.trim().length, box: e.getBoundingClientRect().width,
        };
      });
      rep.check(`${w}: the first item of the places tab is the room the player is in (惩罚室), with its own text`, tab.um === '3d' && tab.title === '惩罚室' && /地下二层/.test(tab.sub) && tab.desc.length > 0, JSON.stringify(tab).slice(0, 300));
      rep.check(`${w}: no credits links and no empty floor rows in the places tab`, tab.links.length === 0 && tab.floorRows === 0, JSON.stringify({ links: tab.links, floorRows: tab.floorRows }));
      rep.check(`${w}: the ancestor chain is one row and every level is clickable`, tab.chain.length >= 2 && tab.chain.includes('伊甸庄园') && tab.chain.includes('地下二层'), JSON.stringify(tab.chain));
      rep.check(`${w}: nearby rooms are listed, and all rooms stay one click away`, tab.near.length > 0 && tab.near.length <= 8 && tab.all, JSON.stringify({ near: tab.near, all: tab.all }));
      rep.check(`${w}: the record card carries exactly the two actions (编辑 / 世界书档案)`, tab.acts.length === 2 && tab.acts[0] === '编辑', JSON.stringify(tab.acts));
      rep.check(`${w}: the places tab is not an empty stub`, tab.empty > 0 && tab.box > 0, JSON.stringify({ empty: tab.empty, box: tab.box }));
      await B.shot(P.page, OUT, `${w}-place-tab`);
    } catch (e) { rep.check(`${w}: probe ran`, false, e.message.split('\n')[0]); await B.shot(P.page, OUT, `fail_${w}`).catch(() => {}); }
    await P.close();
  }
  // 二维中层：地点卡也是记录画的（正文 + 两个动作），地点页同样是当前地点 + 上级链 + 附近
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: '天城·中层·天城执法局总局', msgs: [], chat: 'pt2d-' + w });
      await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('tc_mid'));
      await until(() => vf.evaluate(() => !!document.querySelector('#osd .mk')), 12000);
      await vf.evaluate(() => { const m = [...document.querySelectorAll('#osd .mk')].find(e => e.dataset.name === '天城执法局总局') || document.querySelector('#osd .mk'); if (m && m._open) m._open(); else m.click(); });
      await B.wait(1400);
      const card = await vf.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent || '', body: document.querySelector('#card .src')?.textContent || '', acts: [...document.querySelectorAll('#card .pr-acts button')].map(b => b.textContent) }));
      rep.check(`${w} 2D: the place card of a landmark is drawn from the record, with the two actions`, card.title.length > 0 && card.body.length > 0 && card.acts.length === 2, JSON.stringify(card).slice(0, 300));
      await B.shot(P.page, OUT, `${w}-2d-place-card`);
      await vf.evaluate(() => { ViewerDebug.closeCard(); window.ViewerDrawer.setTab('pl', 'full'); });
      await B.wait(1200);
      const tab2 = await vf.evaluate(() => ({ title: document.querySelector('#cardEmpty .pr-title')?.textContent || '', chain: document.querySelectorAll('#cardEmpty .pr-crumb').length, near: document.querySelectorAll('#cardEmpty .pr-nearline .pr-chip').length, all: !!document.querySelector('#cardEmpty .pr-all'), res: window.ViewerDebug.hereRes(document.getElementById('here')?.value || '') }));
      rep.check(`${w} 2D: the places tab is the current place + its ancestors + what is next door (no all-rooms list on a flat map)`, tab2.title.length > 0 && tab2.chain >= 1 && tab2.near > 0 && !tab2.all, JSON.stringify(tab2));
      await B.shot(P.page, OUT, `${w}-2d-place-tab`);
    } catch (e) { rep.check(`${w} 2D: probe ran`, false, e.message.split('\n')[0]); }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? 'all passed' : 'failures'); process.exit(ok ? 0 : 1);
