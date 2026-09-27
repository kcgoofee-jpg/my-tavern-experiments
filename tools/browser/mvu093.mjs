// v0.9.3 MVU 联动：模拟酒馆宿主页（host_stub.mjs）里验收——世界时间（标题栏 + 夜色开关）、着装（本人地点卡 + getOutfit / on('outfit')）、
// 人物位置来源（MVU / 标签 / 推断）、自定义名称与用途（聊天变量 eden_map、旧叫法迁移、设置栏编辑 / 重置、剧情标签 + 一次性提示、同步世界书、注入摘要）、
// 没有变量接口时退回本机存储 + 自检提示。
// 用法：node tools/browser/mvu093.mjs <输出目录> [--shots docs/reviews/mvu_093/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/mvu093.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const HERE = '天城·中层·天城执法局总局';
const STAT = {
  世界: { 当前日期: '新历2088年01月12日', 当前时刻: '23:30', 当日时段: '就寝' },
  主角: { 着装: { 衣服: '深灰风衣', 裤子: '黑色长裤', 鞋子: '短靴' } },
  在场人物: { 米拉: { 身份: '向导', 位置: '下层·7号井' }, 卡尔: { 身份: '司机' }, 奥托: { 身份: '书记员' } },
};
const MSGS = [{ message_id: 40, message: '<span style="display:none">⌖人物 卡尔 @ 中层·霓虹街</span>' }];
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 70, scale: 'css' }); };
const errs = P => P.errors.filter(e => !/http 404/.test(e));

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  const chat = 'c93-' + name;
  try {
    const H = await openHost(P, { here: HERE, msgs: MSGS, stat: STAT, chat, ls: { [`edenMap:chat:${chat}:custom`]: JSON.stringify({ rooms: { 星图室: '书房' } }) } });
    const p = P.page;
    await B.wait(1500);
    // 4 世界时间：标题栏
    const clk = await p.evaluate(() => { const c = document.querySelector('#eden-map-root .em-clock'); return { t: c.textContent, hid: c.hidden, full: c.title }; });
    rep.check(`${name} 标题栏世界时间（紧凑，全文在 title）`, clk.t === '01.12 23:30' && !clk.hid && /就寝/.test(clk.full), JSON.stringify(clk));
    // 2 旧叫法迁移进聊天变量
    const v0 = await H.vars();
    rep.check(`${name} 旧本机叫法迁移到聊天变量 eden_map（不在 stat_data）`, v0?.eden_map?.自定义?.items?.书房?.名 === '星图室' && !('stat_data' in (v0 || {})), JSON.stringify(v0).slice(0, 160));
    await H.open();
    const vf = await H.viewer();
    await vf.evaluate(() => { closeCard(); go('tc_mid'); }); await B.wait(2500);
    // 4 夜色：中层有、下层没有、开关关掉没有
    const n1 = await vf.evaluate(() => document.body.classList.contains('nighttint'));
    await vf.evaluate(() => go('tc_low')); await B.wait(2000);
    const n2 = await vf.evaluate(() => document.body.classList.contains('nighttint'));
    await vf.evaluate(() => go('tc_mid')); await B.wait(2000);
    rep.check(`${name} 夜色：中层加、下层不加`, n1 && !n2, JSON.stringify({ n1, n2 }));
    await jpg(p, `mvu_${name}_night`);
    // 5 着装：本人地点卡
    const card = await vf.evaluate(() => { const el = [...document.querySelectorAll('.mk.here')][0]; if (!el) return null; el._open(); const c = document.querySelector('#card'); return { h: c.querySelector('h2').textContent, o: c.querySelector('.cu-outfit')?.textContent || '' }; });
    rep.check(`${name} 本人地点卡显示「着装：…」`, card && /^着装：深灰风衣 \/ 黑色长裤 \/ 短靴/.test(card.o), JSON.stringify(card));
    await jpg(p, `mvu_${name}_outfit_card`);
    const go1 = await p.evaluate(() => window.EdenMap.getOutfit());
    rep.check(`${name} EdenMap.getOutfit()`, go1?.text === '深灰风衣 / 黑色长裤 / 短靴' && go1.items.鞋子 === '短靴', JSON.stringify(go1));
    // 1 人物来源
    await vf.evaluate(() => { closeCard(); document.querySelector('#evbar .chtab')?.click(); }); await B.wait(400);
    const src = await vf.evaluate(() => Object.fromEntries(TCChars.items.map(c => [c.name, c.src + '@' + c.place])));
    const lab = await vf.evaluate(() => [...document.querySelectorAll('#evbar .chpane .chsrc')].map(x => x.textContent));
    rep.check(`${name} 人物位置：MVU > 标签 > 推断，列表标来源`, src.米拉 === 'mvu@下层·7号井' && src.卡尔 === 'tag@中层·霓虹街' && /^infer@/.test(src.奥托 || '') && ['MVU', '标签', '推断'].every(x => lab.includes(x)), JSON.stringify({ src, lab }));
    await jpg(p, `mvu_${name}_people`);
    // 2 EdenMap.setCustom：地标改名 + 用途 → 聊天变量、地图标签、注入摘要
    // 换聊天后的迁移：全局旧键只在聊天还没有 eden_map 时并入一次（不会把重置过的项每次刷新都加回来）
    const ok = await p.evaluate(() => window.EdenMap.setCustom('天城执法局总局', { name: '蓝塔', note: '接头地点', kind: 'landmark' })); await B.wait(700);
    const v1 = await H.vars(), lb = await vf.evaluate(() => [...document.querySelectorAll('.mk')].find(e => e.dataset.name === '天城执法局总局')?.querySelector('.lab')?.firstChild?.nodeValue);
    await p.evaluate(() => window.__fire('r')); await B.wait(700);
    const inj = await H.injected();
    rep.check(`${name} setCustom → 聊天变量 + 地图标签换名 + 注入摘要`, ok && v1.eden_map.自定义.items.天城执法局总局.名 === '蓝塔' && lb === '蓝塔' && /天城执法局总局→蓝塔（接头地点）/.test(inj), JSON.stringify({ ok, lb, inj: inj.slice(-90) }));
    const al = await p.evaluate(async () => [await window.EdenMap.setRoomAlias('小书斋', '书房'), (await window.EdenMap.getRooms()).alias]);
    rep.check(`${name} 旧名 setRoomAlias / getRooms 仍可用`, al[0] === true && al[1].小书斋 === '书房', JSON.stringify(al));
    // 2 剧情标签 → 更新 + 一次性提示
    await H.setMsgs([...MSGS, { message_id: 41, message: '<span style="display:none">⌖改名 客房 → 画室</span><span style="display:none">⌖用途 客房：放画架</span>' }]); await B.wait(900);
    const v2 = await H.vars(), tt = await vf.evaluate(() => { const t = document.getElementById('cuToast'); return t && !t.hidden ? t.textContent : ''; });
    rep.check(`${name} 剧情标签 ⌖改名 / ⌖用途：写入并提示一次`, v2.eden_map.自定义.items.客房?.名 === '画室' && v2.eden_map.自定义.items.客房?.用途 === '放画架' && v2.eden_map.标签楼 === 41 && /客房 改名为「画室」/.test(tt), JSON.stringify({ tt, f: v2.eden_map.标签楼 }));
    await jpg(p, `mvu_${name}_toast`);
    const T41 = '<span style="display:none">⌖改名 客房 → 画室</span><span style="display:none">⌖用途 客房：放画架</span>';
    await H.setMsgs([...MSGS, { message_id: 41, message: T41 }, { message_id: 42, message: '无标签' }]); await B.wait(700);
    rep.check(`${name} 已处理的标签不重复提示`, (await H.vars()).eden_map.自定义.items.客房.名 === '画室');
    // 重 roll：那一楼的原文变了 → 撤销旧标签，按新原文重扫
    await H.setMsgs([...MSGS, { message_id: 41, message: '⌖改名 客房 → 琴房' }, { message_id: 42, message: '无标签' }]); await B.wait(900);
    const sw = (await H.vars()).eden_map.自定义.items.客房 || null;
    await H.setMsgs([...MSGS, { message_id: 41, message: '这一楼没有标签了' }, { message_id: 42, message: '无标签' }]); await B.wait(900);
    const sw2 = (await H.vars()).eden_map.自定义.items.客房 || null;
    rep.check(`${name} 重 roll 撤销：改成琴房（用途撤回），再重 roll 掉标签后恢复原样`, sw?.名 === '琴房' && !sw.用途 && sw2 === null, JSON.stringify({ sw, sw2 }));
    await H.setMsgs([...MSGS, { message_id: 41, message: T41 }, { message_id: 42, message: '无标签' }]); await B.wait(900);
    const sw3 = (await H.vars()).eden_map.自定义.items.客房 || null;
    rep.check(`${name} 再 roll 回带标签的原文：重新生效`, sw3?.名 === '画室' && sw3.用途 === '放画架', JSON.stringify(sw3));
    // 2 设置栏：编辑 / 重置 / 添加
    await vf.evaluate(() => showSet(true)); await B.wait(300);
    const rows = await vf.evaluate(() => document.querySelectorAll('#cuBox li').length);
    await vf.evaluate(() => document.querySelector('#cuBox [data-add]').click()); await B.wait(200);
    await vf.evaluate(() => { const f = document.querySelector('#cuBox form'); f.elements.key.value = '主卧'; f.elements.name.value = '东卧'; f.elements.note.value = '朝东，早上有光'; f.requestSubmit(); }); await B.wait(700);
    const v3 = await H.vars();
    await vf.evaluate(() => document.querySelector('#cuBox [data-reset="客房"]').click()); await B.wait(700);
    const v4 = await H.vars(), rows2 = await vf.evaluate(() => document.querySelectorAll('#cuBox li').length);
    rep.check(`${name} 设置「自定义」：列表、添加（类=房间）、重置`, rows === 3 && v3.eden_map.自定义.items.主卧?.名 === '东卧' && v3.eden_map.自定义.items.主卧.类 === 'room' && !v4.eden_map.自定义.items.客房 && rows2 === 3, JSON.stringify({ rows, rows2 }));
    await vf.evaluate(() => document.querySelector('#setPop').scrollTop = 9999);
    await jpg(p, `mvu_${name}_settings`);
    // 2 同步到世界书（默认关，打开才建）
    const wb0 = await H.wb();
    await vf.evaluate(() => document.querySelector('#cuSync').click()); await B.wait(900);
    const wb1 = await H.wb(), bn = Object.keys(wb1.books)[0] || '', e = wb1.books[bn]?.[0];
    const inj2 = await p.evaluate(async () => { window.__fire('r'); await new Promise(r => setTimeout(r, 700)); return window.__injected || ''; });
    rep.check(`${name} 同步到世界书：默认不建；打开后建「伊甸地图·自定义·<聊天>」并绑定到聊天，注入不再重复摘要`, !Object.keys(wb0.books).length && /^伊甸地图·自定义·[0-9a-f]{6}$/.test(bn) && e?.name === '地图自定义' && e.enabled && /东卧/.test(e.content) && wb1.chat === bn && !/地图自定义/.test(inj2), JSON.stringify({ bn, chat: wb1.chat, c: e?.content?.slice(0, 60) }));
    await vf.evaluate(() => document.querySelector('#cuSync').click()); await B.wait(900);
    const wb2 = await H.wb();
    rep.check(`${name} 关掉同步：条目停用（不删世界书）`, wb2.books[bn]?.[0]?.enabled === false, JSON.stringify(wb2.books[bn]?.[0]?.enabled));
    // 文字原样显示、不当 HTML
    await p.evaluate(() => window.EdenMap.setCustom('餐厅', { name: '<img src=x onerror="window.__xss=1">', note: '<b>粗</b>' })); await B.wait(700);
    const xss = await vf.evaluate(() => ({ x: !!window.__xss || !!parent.__xss, img: !!document.querySelector('#cuBox img'), txt: [...document.querySelectorAll('#cuBox li b')].some(b => b.textContent.includes('<img')) }));
    rep.check(`${name} 自定义文字按纯文本显示（不执行、不插入元素）`, !xss.x && !xss.img && xss.txt, JSON.stringify(xss));
    // 夜色开关
    await vf.evaluate(() => { const c = document.querySelector('#optNight'); c.click(); }); await B.wait(200);
    const n3 = await vf.evaluate(() => document.body.classList.contains('nighttint'));
    await vf.evaluate(() => document.querySelector('#optNight').click());
    rep.check(`${name} 夜色开关关掉即去掉`, !n3);
    // 自检
    const sc = await p.evaluate(() => window.EdenMap.selfcheck()); const ids = Object.fromEntries((sc?.items || []).map(i => [i.id, i.status]));
    rep.check(`${name} 自检：MVU 字段、聊天变量`, ids.mvu_fields === 'ok' && ids.vars === 'ok', JSON.stringify(ids));
    rep.check(`${name} 无脚本错误`, !errs(P).length, errs(P).slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
// 没有变量接口、没有着装 / 时间字段：退回本机存储，功能安静缺席，自检说明
async function runLean(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: '伊甸庄园·书房', msgs: [], stat: { 在场人物: '甲、乙' }, chat: 'c93lean-' + name, noVars: true });
    const p = P.page; await B.wait(1500);
    const clk = await p.evaluate(() => document.querySelector('#eden-map-root .em-clock').hidden);
    const ok = await p.evaluate(() => window.EdenMap.setCustom('书房', { name: '星图室' })); await B.wait(300);
    const ls = await p.evaluate(k => localStorage.getItem(k), `edenMap:chat:c93lean-${name}:custom2`);
    const out = await p.evaluate(() => window.EdenMap.getOutfit());
    const sc = await p.evaluate(() => window.EdenMap.selfcheck()); const it = Object.fromEntries((sc?.items || []).map(i => [i.id, i]));
    rep.check(`${name} 缺字段：不显示时间、着装为空；在场人物是字符串也认`, clk && out.items === null && (await p.evaluate(() => window.EdenMap.getCharacters())).items.length === 2);
    rep.check(`${name} 没有变量接口：存本机；自检提示`, ok && /星图室/.test(ls || '') && /"类":"room"/.test(ls || '') && it.vars?.status === 'warn' && it.mvu_fields?.status === 'skip', JSON.stringify({ ls, v: it.vars?.status, f: it.mvu_fields?.zh }));
    rep.check(`${name} 无脚本错误`, !errs(P).length, errs(P).slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await runLean('lean', 'desktop'); await runLean('leanwk', 'desktopWk'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
