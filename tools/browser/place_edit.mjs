// PLACE-1b probe 一个编辑器：改一处说明 → 卡片、档案与本聊天的自定义书三处一致 → 撤销后三处复原。
//   node tools/browser/place_edit.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import * as MV from '../../map/tavern/mvu-readers.mjs';
import { worldbookPrefix } from '../../map/core/pack.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

MV.setWbName(worldbookPrefix(JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../map/packs/eden/manifest.json', import.meta.url)), 'utf8')), 'eden'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/place_edit';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const TEXT = '夜里在这里看星图，桌角那盏灯留着。';
/** 375 px：编辑器在窄屏上是整屏一张，字段一个不少，触控目标够大（截图 + 断言） */
async function phoneEdit(OUT, rep) {
  const Q = await B.newPage('phone', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(Q, { here: '伊甸庄园·惩罚室', msgs: [], chat: 'pe-p' });
    await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => window.EstateShell.fromPage({ type: 'estate:select', room: { name: '主人书房', floor: 'F1', kind: 'owner' }, node: '' }));
    await B.wait(500);
    await vf.evaluate(() => document.querySelector('#card .pr-acts button').click());
    await B.wait(600);
    const d = await vf.evaluate(() => { const x = document.getElementById('prDlg'), f = [...x.querySelectorAll('input,textarea,button')].filter(b => b.offsetParent);
      return { open: !x.hidden, fields: x.querySelectorAll('.pr-f').length, sheet: Math.round(x.querySelector('.pr-sheet').getBoundingClientRect().width), vw: innerWidth,
        over: f.filter(b => b.getBoundingClientRect().right > innerWidth + 1).length, small: f.filter(b => b.getBoundingClientRect().height < 32 && b.tagName === 'BUTTON').length }; });
    rep.check('375: the editor is a full-width sheet with all five fields, nothing overflows and the buttons stay tappable', d.open && d.fields === 5 && d.sheet <= d.vw + 1 && d.over === 0 && d.small === 0, JSON.stringify(d));
    await B.shot(Q.page, OUT, '375-editor');
    await vf.evaluate(t => { const x = document.getElementById('prDlg'); const ta = x.querySelector('textarea'); ta.value = t; ta.dispatchEvent(new Event('input')); x.querySelector('button[type=submit]').click(); }, TEXT);
    await B.wait(1400);
    const v = await H.vars(), item = Object.values(v?.eden_map?.自定义?.items || {})[0] || {};
    rep.check('375: the same save path works on a phone', item.说明 === TEXT && item.标 === '主人书房', JSON.stringify(item));
    await B.shot(Q.page, OUT, '375-card-after-edit');
  } catch (e) { rep.check('375: probe ran', false, e.message.split('\n')[0]); }
  await Q.close();
}
try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '伊甸庄园·惩罚室', msgs: [], chat: 'pe' });
    await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => { const p = window.parent, o = p.postMessage.bind(p); window.__posted = []; p.postMessage = (m, x) => { window.__posted.push(m); return o(m, x); }; });
    await vf.evaluate(() => window.EstateShell.fromPage({ type: 'estate:select', room: { name: '主人书房', floor: 'F1', kind: 'owner' }, node: '' }));
    await B.wait(500);
    const before = await vf.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent || '', desc: document.querySelector('#card .pr-desc')?.textContent || '', edit: !!document.querySelector('#card .pr-acts button') }));
    rep.check('the card is drawn from the record before any edit', before.title === '主人书房' && before.desc.length > 0 && before.edit, JSON.stringify(before));
    // 一个编辑器：卡片上那枚「编辑」
    await vf.evaluate(() => document.querySelector('#card .pr-acts button').click());
    await B.wait(500);
    const dlg = await vf.evaluate(() => {
      const d = document.getElementById('prDlg');
      return { open: d && !d.hidden, title: d?.querySelector('#prDlgT')?.textContent || '', target: d?.querySelector('.pr-target b')?.textContent || '',
        fields: [...d.querySelectorAll('.pr-f > label > b')].map(b => b.textContent), org: [...d.querySelectorAll('.pr-org')].map(p => p.textContent.slice(0, 12)),
        restores: d.querySelectorAll('.pr-restore').length, cu: !!document.querySelector('#cuDlg:not([hidden]) form') };
    });
    rep.check('one editor: 名称 / 用途 / 说明 / 事实 / 叫法, the pack\'s own text under each field, a restore per field, and no second form', dlg.open && dlg.target === '主人书房' && dlg.fields.length === 5 && dlg.org.length >= 3 && dlg.restores >= 5 && !dlg.cu, JSON.stringify(dlg).slice(0, 400));
    await B.shot(P.page, OUT, 'desktop-editor');
    // 改说明 → 保存
    await vf.evaluate(t => { const d = document.getElementById('prDlg'); const ta = d.querySelector('textarea'); ta.value = t; ta.dispatchEvent(new Event('input')); d.querySelector('button[type=submit]').click(); }, TEXT);
    await B.wait(1500);
    const sent = await vf.evaluate(() => (window.__posted || []).filter(m => m && m.type === 'eden-map:place-edit').pop() || null);
    const id = sent?.id || '';
    rep.check('the save goes up as one place-edit intent carrying the record id', !!id && sent.patch.desc === TEXT && !!sent.patch.base, JSON.stringify(sent));
    const v1 = await H.vars(), wb1 = await H.wb();
    const item = v1?.eden_map?.自定义?.items?.[id];
    const book = Object.entries(wb1.books).find(([, es]) => Array.isArray(es) && es.some(e => e.extra && e.extra.eden_place === id));
    const entry = book ? book[1].find(e => e.extra && e.extra.eden_place === id) : null;
    rep.check('saving writes 说明 into the chat variable under the record id, and the pack name travels with it', !!item && item.说明 === TEXT && item.标 === '主人书房' && item.源 === '手动', JSON.stringify(item));
    rep.check('the chat\'s custom book gets one entry for that place, with this chat\'s text winning', !!entry && entry.enabled && /以此为准/.test(entry.content) && entry.content.includes(TEXT) && entry.name === '地点-主人书房', entry ? JSON.stringify(entry).slice(0, 300) : 'no entry');
    const after = await vf.evaluate(() => ({ desc: document.querySelector('#card .pr-desc')?.textContent || '' }));
    rep.check('the open card shows the new text right away', after.desc.includes(TEXT), JSON.stringify(after));
    // 档案里也是同一段
    await vf.evaluate(() => document.querySelector('#card .cu-wb .wb-go').click());
    await B.wait(400);
    await vf.evaluate(([t, rid]) => { window.__isFromHost = () => true; window.dispatchEvent(new MessageEvent('message', { data: { type: 'eden-map:wb-peek', id: rid, name: '主人书房', entries: [{ book: '伊甸地图·自定义·0a1b2c', id: '', name: '地点-主人书房', content: '<地点·主人书房>\n本聊天里以此为准。\n主人书房：伊甸庄园 一层。' + t + '\n</地点·主人书房>', ver: null, state: 'custom' }] } })); }, [TEXT, id]);
    await B.wait(300);
    const arch = await vf.evaluate(() => document.querySelector('#card .cu-wb .wb-out')?.textContent || '');
    rep.check('the archive shows the same text', arch.includes(TEXT), arch.slice(0, 200));
    await B.shot(P.page, OUT, 'desktop-editor-saved');
    // 撤销 → 三处复原
    await vf.evaluate(() => document.querySelector('#card .pr-acts button').click());
    await B.wait(400);
    await vf.evaluate(() => [...document.querySelectorAll('#prDlg .pr-acts button')].find(b => /撤销/.test(b.textContent)).click());
    await B.wait(1500);
    const v2 = await H.vars(), wb2 = await H.wb();
    const item2 = v2?.eden_map?.自定义?.items?.[id];
    const book2 = Object.entries(wb2.books).find(([, es]) => Array.isArray(es) && es.some(e => e.extra && e.extra.eden_place === id));
    const card2 = await vf.evaluate(() => document.querySelector('#card .pr-desc')?.textContent || '');
    rep.check('undo takes the description back in the variable, the book and the card', !item2?.说明 && !book2 && !card2.includes(TEXT), JSON.stringify({ item2, book: !!book2, card2: card2.slice(0, 60) }));
  } catch (e) { rep.check('probe ran', false, e.message.split('\n')[0]); await B.shot(P.page, OUT, 'fail').catch(() => {}); }
  await P.close();
  await phoneEdit(OUT, rep);
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? 'all passed' : 'failures'); process.exit(ok ? 0 : 1);
