// Part 5 浏览器探针：node tools/browser/p5_sandbox.mjs [输出目录]
// 沙盒机制四块在真实宿主（tools/browser/host_stub.mjs）里的落地情况：
//   ① 世界藏物 → 地图上的发光拾取物，点一下把 id 报给宿主（宿主写背包 + 注入）；
//   ② 巡逻环 → 视野锥（上层），走过锥的直线会算出一次潜行难度；
//   ③ 人物标记换地方是滑过去的（漫游层在册）；
//   ④ 见闻录：往地标上钉手记 / 图，地点卡里翻得到。
// 不验画面好看不好看，只验「数据到了 → 东西画出来 → 点得动 → 消息回到宿主」。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p5sandbox';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

try {
  const D = await B.newPage('desktop', { tier: 'save' });
  await D.ctx.addInitScript(() => {   // 父页这边收查看器发出来的所有消息
    window.__msgs = [];
    addEventListener('message', e => { try { window.__msgs.push(e.data); } catch (err) {} });
  });
  const H = await openHost(D, { here: '天城执法局总局', ls: { edenMapInject: 'sys', 'edenMapOn:scrap': '1' } });
  await H.open();
  const vf = await H.viewer();
  const toViewer = async msg => { await D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); }, msg); await B.wait(500); };

  await step('三个新图层都注册进 LayerRegistry（菜单里有开关）', async () => {
    await vf.evaluate(() => { try { window.ViewerDebug?.go?.('tc_mid'); } catch (e) {} });
    await B.wait(2500);
    const r = await vf.evaluate(() => ({
      ids: window.LayerHostApi?.registry?.ordered?.().map(x => x.id) || [],
      menu: [...document.querySelectorAll('#layList span')].map(s => s.textContent.trim()),
      api: { loot: !!window.StashMarkersApi, vision: !!window.VisionApi, wander: !!window.WanderApi },
    }));
    rep.check('图层注册：藏物 / 视野锥 / 漫游', ['loot', 'vision', 'wander'].every(k => r.ids.includes(k)), r.ids.filter(i => ['loot', 'vision', 'wander'].includes(i)).join());
    rep.check('图层菜单里有这三行', ['藏物', '视野锥', '漫游'].every(k => r.menu.includes(k)), r.menu.join('/'));
    rep.check('窗口面（探针 / 自检）都在', r.api.loot && r.api.vision && r.api.wander, JSON.stringify(r.api));
  });

  await step('① 世界藏物表 → 地上出现可点的光点；暗格里的要人走到才画', async () => {
    const rows = [
      { id: 't1', map: 'tc_mid', marker: 'enforcement_hq', place: '天城执法局总局', name: '探针·值班表' },
      { id: 't2', map: 'tc_mid', marker: 'enforcement_hq', place: '天城执法局总局', name: '探针·夹层文件', hidden: '值班柜夹层' },
    ];
    await toViewer({ type: 'eden-map:here', v: 2, value: '旧公寓楼' });   // 人在别处：暗格里的东西不该露
    await toViewer({ type: 'eden-map:stash', v: 2, items: rows });
    const away = await vf.evaluate(() => [...document.querySelectorAll('.loot b')].map(b => b.textContent));
    rep.check('明面上的东西画出来了', away.includes('探针·值班表'), away.join('/'));
    rep.check('暗格里的没画（人还没走到）', !away.includes('探针·夹层文件'), away.join('/'));
    await toViewer({ type: 'eden-map:here', v: 2, value: '天城执法局总局' });
    const near = await vf.evaluate(() => [...document.querySelectorAll('.loot b')].map(b => b.textContent));
    rep.check('人到了：暗格里的东西也露出来', near.includes('探针·夹层文件'), near.join('/'));
  });

  await step('① 点光点 → 宿主收到 eden-map:loot（写背包 / 注入那一步由宿主按设置做）', async () => {
    await vf.evaluate(() => { const el = [...document.querySelectorAll('.loot')].find(e => e.dataset.id === 't1'); el?.click(); });
    await B.wait(600);
    const got = await D.page.evaluate(() => (window.__msgs || []).filter(m => m?.type === 'eden-map:loot'));
    rep.check('宿主收到 eden-map:loot', got.length === 1, JSON.stringify(got[0] || {}));
    rep.check('消息带藏物表的 id 与名字', got[0]?.id === 't1' && got[0]?.name === '探针·值班表', JSON.stringify(got[0] || {}));
  });

  await step('② 上层巡逻环 → 视野锥在动；穿过锥的直线判得出难度', async () => {
    await vf.evaluate(() => { try { window.ViewerDebug?.go?.('tc_upper'); } catch (e) {} });
    await B.wait(2800);
    const r = await vf.evaluate(() => {
      const a = window.VisionApi?.cones?.(0) || [], b = window.VisionApi?.cones?.(6) || [];
      const moved = a.length && b.length ? Math.hypot(b[0].x - a[0].x, b[0].y - a[0].y) : 0;
      // 走过锥的判定（几何与难度在 core/vision.mjs，单测覆盖）：这里只验接线——接口在、地标认得出
      const api = { move: typeof window.VisionApi?.tryMove === 'function', of: typeof window.VisionApi?.markerOf === 'function' };
      const hit = window.VisionApi?.markerOf?.('银冠堡');   // 上层的一个地标
      return { n: a.length, moved, api, hit: hit?.id || '' };
    });
    rep.check('巡逻环上有锥', r.n > 0, `共 ${r.n} 个`);
    rep.check('时间推进锥在走', r.moved > 1e-6, `位移 ${r.moved}`);
    rep.check('移动判定接口在，地标认得出（走过锥心会报 DC）', r.api.move && r.api.of && !!r.hit, JSON.stringify(r.api) + ' 上层地标 ' + r.hit);
  });

  await step('③ 漫游层在册：有位置记录表，切图会清', async () => {
    const r = await vf.evaluate(() => ({ size: window.WanderApi?.now?.() ?? -1, reset: typeof window.WanderApi?.reset === 'function' }));
    rep.check('漫游补间接上了', r.reset && r.size >= 0, `记录 ${r.size} 条`);
  });

  await step('④ 见闻录：钉一条手记，地点卡里翻得到', async () => {
    await vf.evaluate(() => { try { window.ViewerDebug?.go?.('tc_mid'); } catch (e) {} });
    await B.wait(2200);
    const pinned = await vf.evaluate(async () => { await window.ScrapbookView?.pinNote?.('天城执法局总局', '探针：门口换了新锁');
      return { count: window.ScrapbookView?.count?.('天城执法局总局'), key: window.ScrapbookView?.key?.(), raw: (window.LocalStore?.get?.(window.ScrapbookView?.key?.()) || '').slice(0, 120), desc: window.ScrapbookView?.describe?.() }; });
    rep.check('钉进去了（索引 + 本机存储里都有）', pinned?.count?.notes >= 1 && /新锁/.test(pinned.raw || ''), JSON.stringify(pinned.count) + ' ' + pinned.raw);
    const card = await vf.evaluate(() => {
      const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === '天城执法局总局');
      el?._open?.();
      const sb = document.querySelector('#card .cu-sb');
      return { has: !!sb, text: (sb?.textContent || '').trim().slice(0, 80), list: [...document.querySelectorAll('#card .cu-sb .sb-note-row span')].map(s => s.textContent) };
    });
    rep.check('地点卡上有见闻录那一格', card.has, card.text);
    rep.check('手记出现在卡片里', card.list.some(t => /新锁/.test(t)), card.list.join('/'));
  });

  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.check('除已知 404 外无控制台错误', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? `\n全部通过 → ${OUT}` : `\n有失败 → ${OUT}`);
  process.exit(ok ? 0 : 1);
}
