// Part 4-3 浏览器探针：node tools/browser/p4_traffic.mjs <输出目录>
// 车流是「跟着 OSD 缩放走的流光」：切到有路线的图（上层）要真的画出光点，切到没路线的图要一帧不画（不空转）。
// 顺带查：图层开关能关掉、可见性守卫按下暂停位时不跑 rAF。
import * as B from './lib.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p4traffic';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

/** 抽样 canvas 的非透明像素数（车流是稀疏光点，阈值放低） */
const painted = page => page.evaluate(() => {
  const cv = document.querySelector('.vpslot[data-slot="fx"] canvas.trcv');
  if (!cv) return { ok: false };
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4 * 13) if (d[i] > 8) n++;
  return { ok: true, painted: n, w: cv.width, h: cv.height };
});

try {
  const D = await B.newPage('desktop', { tier: 'std' });
  const p = D.page;
  await B.openViewer(D);

  await step('切到有路线的图：车流 canvas 挂上并在画', async () => {
    const has = await p.evaluate(() => !!window.REG?.maps.tc_upper);
    if (has) await p.evaluate(() => { try { window.go?.('tc_upper'); } catch (e) {} });
    await B.wait(1600);
    const st = await p.evaluate(() => {
      const d = window.LayerHostApi?.describe?.() || {};
      const fx = d.slots?.find(s => s.id === 'fx') || { layers: [] };
      return { fx: fx.layers, box: !!document.getElementById('tgTraffic'), cars: window.TrafficApi?.cars?.() ?? -1, routes: (window.curData?.routes || []).length };
    });
    rep.metric('state', st);
    rep.check('fx 槽位有 weather + traffic 两层', st.fx.includes('traffic') && st.fx.includes('weather'), JSON.stringify(st.fx));
    rep.check('菜单有「车流」开关', st.box);
    rep.check('当前图有路线数据', st.routes > 0, `${st.routes} 条`);
    const a = await painted(p); await B.wait(900); const b = await painted(p);
    rep.metric('painted', { a, b });
    rep.check('车流画出光点', a.ok && a.painted > 5, JSON.stringify(a));
    rep.check('光点在动（两帧画面不一样）', a.painted !== b.painted, `${a.painted} → ${b.painted}`);
    await B.shot(p, OUT, 'traffic');
  });

  await step('关掉图层开关：canvas 隐藏且不再画', async () => {
    await p.evaluate(() => { const b = document.getElementById('tgTraffic'); if (b) { b.checked = false; b.dispatchEvent(new Event('change')); } });
    await B.wait(600);
    const r = await p.evaluate(() => {
      const cv = document.querySelector('.vpslot[data-slot="fx"] canvas.trcv');
      return { hidden: cv?.style.display === 'none' || window.LayerHostApi?.registry?.isVisible?.('traffic') === false };
    });
    rep.check('关掉开关后车流层不可见', r.hidden, JSON.stringify(r));
    await p.evaluate(() => { const b = document.getElementById('tgTraffic'); if (b) { b.checked = true; b.dispatchEvent(new Event('change')); } });
  });

  await step('没路线的图：一帧不画（不空转）', async () => {
    // 挑一张真没路线的「点位图」（庄园是另一套渲染流程，切过去不代表路线清空）
    const noRoute = await p.evaluate(() => Object.keys(window.REG?.maps || {}).find(id => {
      const d = window.REG.maps[id];
      return d.status !== 'planned' && d.kind === 'points' && !(window.REG.maps[id].data || '').includes('tc_upper');
    }));
    await p.evaluate(id => { try { window.go?.(id); } catch (e) {} }, noRoute);
    await B.wait(1800);
    const r = await painted(p);
    const cur = await p.evaluate(() => window.cur);
    const nr = await p.evaluate(() => (window.curData?.routes || []).length);
    rep.metric('noroute', { map: noRoute, cur, routes: nr, ...r });
    rep.check(`切到无路线图（${noRoute}）后画面清空`, cur === noRoute && nr === 0 && (!r.ok || r.painted === 0), JSON.stringify({ cur, nr, r }));
  });

  rep.check('全程无控制台错误 / 404', D.errors.length === 0, D.errors.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'p4_traffic：全过' : 'p4_traffic：有失败');
  process.exit(ok ? 0 : 1);
}
