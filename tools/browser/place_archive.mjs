// PLACE-1b probe 房间卡的「世界书档案」：按记录的 id 查（请求里带 id 与标准名），回话里画条目名、条目正文、一行同步状态；
// 三种状态（已同步 / 酒馆里改过 / 还没同步）与本聊天的改动合并显示都在。宿主那一侧离线，所以回话由探针按协议形状注入。
//   node tools/browser/place_archive.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/place_archive';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
// 一条真的记录（tools/place_records.mjs 那一间）与它的条目正文
const ENTRY = { book: '伊甸地图·世界书附加条目', id: 'map.room.room-f1-30', name: '地点-主楼梯（塔楼）', content: '<地点·主楼梯（塔楼）>\n主楼梯（塔楼）：伊甸庄园 一层 / 二层 / 三层。通上下的旋梯，梯井一直通到屋顶。出入：主人 / 访客 / 住客。\n</地点·主楼梯（塔楼）>', ver: '0.9.8 · 2026-10-02 (id 98435f09)', state: 'synced' };
const ask = (vf, entries, extra = {}) => vf.evaluate(([e, x]) => {
  const box = document.querySelector('#card .cu-wb');
  window.__isFromHost = () => true;
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'eden-map:wb-peek', id: (box && box.dataset.wb) || '', name: '主楼梯（塔楼）', entries: e, ...x } }));
  return true;
}, [entries, extra]);
const read = vf => vf.evaluate(() => {
  const b = document.querySelector('#card .cu-wb');
  return { id: (b && b.dataset.wb) || '', btn: b?.querySelector('.wb-go')?.textContent || '', out: b?.querySelector('.wb-out')?.textContent || '',
    names: [...b.querySelectorAll('.wb-item b')].map(x => x.textContent), state: [...b.querySelectorAll('.wb-state span')].map(x => x.textContent),
    bodies: [...b.querySelectorAll('.wb-item pre')].map(x => x.textContent), details: [...b.querySelectorAll('.wb-item summary')].map(x => x.textContent) };
});
/** 375 px：同一块档案与同一个编辑器（截图 + 窄屏断言） */
async function phone(OUT, rep) {
  const Q = await B.newPage('phone', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(Q, { here: '伊甸庄园·惩罚室', msgs: [], chat: 'pa-p' });
    await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => window.EstateShell.fromPage({ type: 'estate:select', room: { name: '主楼梯（塔楼）', floor: 'F1', kind: 'circ' }, node: 'room_f1_30' }));
    await B.wait(500);
    await vf.evaluate(() => document.querySelector('#card .cu-wb .wb-go').click());
    await B.wait(400);
    await ask(vf, [ENTRY], { syncAt: Date.parse('2026-10-02T14:05:00Z') });
    await B.wait(300);
    const a = await read(vf);
    rep.check('375: the same archive on a phone: the entry, its body and the status line', a.names[0] === '地点-主楼梯（塔楼）' && a.bodies.length === 1 && a.state.length >= 2, JSON.stringify(a).slice(0, 200));
    await vf.evaluate(() => document.querySelector('#card .cu-wb').scrollIntoView({ block: 'center' }));
    await B.shot(Q.page, OUT, '375-archive');
    await vf.evaluate(() => document.querySelector('#card .pr-acts button').click());
    await B.wait(500);
    const d = await vf.evaluate(() => { const x = document.getElementById('prDlg'); return { open: !x.hidden, w: Math.round(x.querySelector('.pr-sheet').getBoundingClientRect().width), vw: innerWidth, over: [...x.querySelectorAll('input,textarea,button')].filter(b => b.getBoundingClientRect().right > innerWidth + 1).length }; });
    rep.check('375: the editor is a full-width sheet and nothing overflows sideways', d.open && d.w <= d.vw + 1 && d.over === 0, JSON.stringify(d));
    await B.shot(Q.page, OUT, '375-editor');
  } catch (e) { rep.check('375: probe ran', false, e.message.split('\n')[0]); }
  await Q.close();
}
try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '伊甸庄园·惩罚室', msgs: [], chat: 'pa' });
    await H.open(); const vf = await H.viewer();
    // 记下查看器往宿主发的每一条消息（档案那一条要带记录 id）
    await vf.evaluate(() => { const p = window.parent, orig = p.postMessage.bind(p); window.__posted = []; p.postMessage = (m, o) => { window.__posted.push(m); return orig(m, o); }; });
    // 打开主楼梯（塔楼）的房间卡（三维页点房间走的就是这一条）
    await vf.evaluate(() => window.EstateShell.fromPage({ type: 'estate:select', room: { name: '主楼梯（塔楼）', floor: 'F1', kind: 'circ' }, node: 'room_f1_30' }));
    await B.wait(600);
    const card = await vf.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent || '', sub: document.querySelector('#card .sub')?.textContent || '', acts: [...document.querySelectorAll('#card .pr-acts button')].map(b => b.textContent) }));
    rep.check('the room card is drawn from the record: its name, its floor line and the two actions', card.title === '主楼梯（塔楼）' && /一层/.test(card.sub) && card.acts.length === 2, JSON.stringify(card));
    await vf.evaluate(() => document.querySelector('#card .cu-wb .wb-go').click());
    await B.wait(500);
    const sent = await vf.evaluate(() => (window.__posted || []).filter(m => m && m.type === 'eden-map:th' && m.op === 'wb-peek').pop() || null);
    rep.check('the archive asks the host by record id (and the pack name), not by fuzzy name', !!sent && sent.id === 'room_f1_30' && sent.name === '主楼梯（塔楼）', JSON.stringify(sent));
    await ask(vf, [ENTRY], { syncAt: Date.parse('2026-10-02T14:05:00Z') });
    await B.wait(300);
    let a = await read(vf);
    rep.check('synced: the entry name, its body without the wrapping tag, and one status line with the version', a.names[0] === '地点-主楼梯（塔楼）' && a.bodies[0].includes('主楼梯（塔楼）：伊甸庄园 一层 / 二层 / 三层。') && !a.bodies[0].includes('<地点·') && a.state.some(s => /已同步/.test(s)) && a.state.some(s => /0\.9\.8/.test(s)), JSON.stringify(a).slice(0, 400));
    rep.check('the sync line says when this device last synced', /本机上次自动同步：\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(a.out), a.out.slice(0, 200));
    rep.check('the archive button carries no emoji', !/[📚📖✦★⚑]/u.test(a.btn) && a.btn.includes('世界书档案'), a.btn);
    await ask(vf, [{ ...ENTRY, state: 'edited', content: '<地点·主楼梯（塔楼）>\n主楼梯（塔楼）：伊甸庄园 一层 / 二层 / 三层。我在梯井的第三级踏板上刻了一行字，谁也没说。\n</地点·主楼梯（塔楼）>', upstream: ENTRY.content }]);
    await B.wait(300);
    a = await read(vf);
    rep.check('edited in the tavern: the state says so and the pack\'s newer text is kept in a closed detail', a.state.some(s => /酒馆里改过/.test(s)) && a.details.some(s => /包里更新后的原文/.test(s)) && a.bodies[0].includes('刻了一行字'), JSON.stringify(a).slice(0, 400));
    await ask(vf, [{ ...ENTRY, state: 'pending', content: ENTRY.content }]);
    await B.wait(300);
    a = await read(vf);
    rep.check('not synced yet: the state says so and the text to be written is shown', a.state.some(s => /还没同步/.test(s)) && a.state.some(s => /下次打开地图时写入/.test(s)) && a.bodies[0].length > 0, JSON.stringify(a).slice(0, 300));
    await ask(vf, [ENTRY, { book: '伊甸地图·自定义·0a1b2c', id: '', name: '地点-主楼梯（塔楼）', content: '<地点·主楼梯（塔楼）>\n本聊天里以此为准。\n主楼梯（塔楼）：这一段梯子只有 {{user}} 走过，扶手上有一道刻痕。\n</地点·主楼梯（塔楼）>', ver: null, state: 'custom' }]);
    await B.wait(300);
    a = await read(vf);
    rep.check('this chat\'s own text comes first, the pack\'s entry below it, and both are shown', a.bodies.length === 2 && a.bodies[0].includes('只有 {{user}} 走过') && a.bodies[1].includes('通上下的旋梯') && /本聊天里改过的文字以这里为准/.test(a.out), JSON.stringify(a).slice(0, 400));
    await B.shot(P.page, OUT, 'desktop-archive');
    await phone(OUT, rep);
  } catch (e) { rep.check('probe ran', false, e.message.split('\n')[0]); await B.shot(P.page, OUT, 'fail').catch(() => {}); }
  await P.close();
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? 'all passed' : 'failures'); process.exit(ok ? 0 : 1);
