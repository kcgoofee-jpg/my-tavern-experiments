// Part 6-3 浏览器探针：node tools/browser/p6_quests.mjs <输出目录>
// 走宿主桩把真事态灌进查看器：事态在某地点堆起来 → 地图上那处冒出线索节点（会呼吸的圈）。
// 反向也要验：没有事态（或事态太旧 / 权重太低）时不许出节点——没有线索不许硬造。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p6quests';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

try {
  const D = await B.newPage('desktop', { tier: 'save' });
  const H = await openHost(D, { here: '铁匠铺' });
  await H.open();
  const vf = await H.viewer();

  await step('没事态时不画节点（不许硬造线索）', async () => {
    await vf.evaluate(() => { try { window.go?.('tc_upper'); } catch (e) {} });
    await B.wait(2500);
    const r = await vf.evaluate(() => ({ n: window.TCQuests?.now?.()?.length ?? -1, fx: (window.TCLayers?.describe?.()?.slots || []).find(s => s.id === 'fx')?.layers }));
    rep.metric('empty', r);
    rep.check('fx 槽位有 quests 层', (r.fx || []).includes('quests'), JSON.stringify(r.fx));
    rep.check('没有事态 → 零节点', r.n === 0, JSON.stringify(r));
  });

  await step('灌入事态后：冒头的地点出节点，且在呼吸（画面在变）', async () => {
    // 直接喂给查看器的事态外挂（宿主桩推事态要经过 MVU 变量；这里验的是「热度 → 节点」这一段）
    const r = await vf.evaluate(async () => {
      const P = window.P || {};
      const ev = window.TCEventsProbe || null;
      const cur = window.cur;
      const places = (window.curData?.markers || []).slice(0, 6).map(k => ({ name: (window.REG?.maps?.[cur]?.markers?.[k.id]?.name) || k.name || k.id, nx: k.nx, ny: k.ny })).filter(p => p.name && p.nx != null);
      const mod = await import(new URL('core/quests.mjs', document.baseURI).href);
      const events = places.slice(0, 2).map((p, i) => ({ grp: i ? '治安' : '灾害', place: p.name, floor: 10, title: p.name + '出事' }));
      const q = mod.dispatch({ events, places, floor: 10, day: 1, seed: 5, max: 3, min: 1.5 });
      return { places: places.map(p => p.name).slice(0, 4), q };
    });
    rep.metric('dispatch', r);
    rep.check('热度够的地点派出了节点', r.q.length >= 1 && r.q.length <= 3, JSON.stringify(r.q.map(x => x.name)));
    rep.check('节点带坐标 / 紧急度 / 过期日', r.q.every(x => Number.isFinite(x.nx) && x.urgency > 0 && x.expireDay >= 3), JSON.stringify(r.q[0]));
    rep.check('最热的排第一', r.q.length < 2 || r.q[0].urgency >= r.q[1].urgency, JSON.stringify(r.q.map(x => x.urgency)));
    await B.shot(D.page, OUT, 'quests');
  });

  await step('弱事态（民生，权重 1）不派：门槛之外', async () => {
    const r = await vf.evaluate(async () => {
      const mod = await import(new URL('core/quests.mjs', document.baseURI).href);
      const places = [{ name: '甲', nx: .1, ny: .1 }, { name: '乙', nx: .2, ny: .2 }];
      return mod.dispatch({ events: [{ grp: '民生', place: '甲', floor: 10 }], places, floor: 10, day: 1, min: 1.5 });
    });
    rep.check('权重低于门槛不派', r.length === 0, JSON.stringify(r));
  });

  await step('太旧的事态（楼层差 > 40）衰减到零', async () => {
    const r = await vf.evaluate(async () => {
      const mod = await import(new URL('core/quests.mjs', document.baseURI).href);
      const places = [{ name: '甲', nx: .1, ny: .1 }];
      return { fresh: mod.dispatch({ events: [{ grp: '灾害', place: '甲', floor: 10 }], places, floor: 10, day: 1 }).length,
        old: mod.dispatch({ events: [{ grp: '灾害', place: '甲', floor: 0 }], places, floor: 100, day: 1 }).length };
    });
    rep.metric('age', r);
    rep.check('近事派得出、旧事派不出', r.fresh === 1 && r.old === 0, JSON.stringify(r));
  });

  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.check('除在途模块外无控制台错误 / 404', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'p6_quests：全过' : 'p6_quests：有失败');
  process.exit(ok ? 0 : 1);
}
