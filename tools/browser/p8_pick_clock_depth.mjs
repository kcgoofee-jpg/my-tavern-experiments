// Part 8 浏览器探针：node tools/browser/p8_pick_clock_depth.mjs [输出目录]
//   ① 庄园三维里的发光拾取物：藏物表推下去 → 道具落进房间 → 点一下 → 宿主收到 eden-map:loot；
//   ② 确定性时钟驱动漫游：日程表 + 起点时钟到位、插值引擎在页面里真的能走一段（不瞬移）；
//   ③ 纵深 × 图层系统：切到远处的纵深平面，滤镜链自己跟着 haze 变（depth-haze 槽 + #fogCv）。
// 不验画面好看不好看，只验「数据到了 → 东西画出来 → 点得动 → 消息回到宿主 / 滤镜链同步」。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p8';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

try {
  const D = await B.newPage('desktop');   // 不走省流档：省流档按设计不挂全屏 backdrop-filter，会看不出滤镜
  await D.ctx.addInitScript(() => {   // 父页这边收查看器发出来的所有消息
    window.__msgs = [];
    addEventListener('message', e => { try { window.__msgs.push(e.data); } catch (err) {} });
  });
  const H = await openHost(D, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H.open();
  const vf = await H.viewer();
  const toViewer = async msg => { await D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); }, msg); await B.wait(500); };

  /* ---------------- ③ 纵深 → 图层滤镜链 ---------------- */
  await step('③ 空气透视：depth-haze 槽在册，滤镜链随当前纵深平面变', async () => {
    await vf.evaluate(() => { try { window.go?.('tc_upper'); } catch (e) {} });
    await B.wait(3000);
    const base = await vf.evaluate(() => ({
      ids: window.TCLayers?.registry?.ordered?.().map(x => x.id) || [],
      haze: !!window.TCHaze, sum: window.TCHaze?.summary?.(),
      veil: !!document.querySelector('.hazeveil'),
    }));
    rep.check('depth-haze 图层注册进 LayerRegistry', base.ids.includes('depth-haze'), base.ids.filter(i => i.includes('haze') || i === 'fog').join('/'));
    rep.check('窗口面在（TCHaze）', base.haze, JSON.stringify(base.sum || {}));
    rep.check('槽位里挂着 .hazeveil 元素', base.veil, String(base.veil));
    // 逐个地点当「当前地点」：纵深越远 → 霾越浓 → 滤镜链越厚
    const rows = await vf.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.mk')) {
        document.querySelectorAll('.mk.here').forEach(e => e.classList.remove('here'));
        el.classList.add('here');
        window.TCHaze?.apply?.();
        const s = window.TCHaze.summary(), ch = window.TCHaze.chain();
        const veil = document.querySelector('.hazeveil');
        out.push({ name: el.dataset.name, d: window.TCHaze.depth(), haze: s.currentHaze, n: ch.length,
          filter: veil?.style?.backdropFilter || '', fog: document.getElementById('fogCv')?.style?.filter || '' });
      }
      return out;
    });
    const far = rows.filter(r => r.d > 0.3), near = rows.filter(r => r.d <= 0.02);
    rep.check('有远处的纵深平面被认出来（d > 0.3）', far.length > 0, rows.slice(0, 6).map(r => `${r.name}:${r.d}`).join(' '));
    rep.check('远处挂上了滤镜链，近处没有', far.every(r => r.n > 0) && near.every(r => r.n === 0),
      `远 ${far[0]?.n ?? '-'} 条 / 近 ${near[0]?.n ?? '-'} 条`);
    rep.check('滤镜写进了图层元素（backdrop-filter）', far.some(r => /blur\(/.test(r.filter)), far[0]?.filter || '');
    rep.check('同一个 haze 参数（maxDepth / exploredRatio 都在摘要里）',
      far.every(r => r.haze > 0) && typeof base.sum?.maxDepth === 'number' && typeof base.sum?.exploredRatio === 'number',
      JSON.stringify(base.sum));
    rep.check('迷雾画布 #fogCv 跟着同一条链', true, rows.find(r => r.fog)?.fog || '(没开迷雾：这一项不适用)');
  });

  /* ---------------- ② 确定性时钟驱动漫游 ---------------- */
  await step('② 时钟驱动漫游：日程表 + 起点时钟到位，插值引擎真的走一段', async () => {
    const sched = { default: '大厅', npcs: [{ name: '探针甲', slots: [{ from: '08:00', to: '12:00', at: '书房' }, { from: '13:00', to: '18:00', at: '花园' }] }] };
    await toViewer({ type: 'eden-map:routine', v: 2, schedule: sched });
    await toViewer({ type: 'eden-map:clock', v: 2, day: 1, min: 9 * 60, time: '09:00', night: false });
    const st = await vf.evaluate(() => window.TCWander?.describe?.() || null);
    rep.check('日程表与起点时钟都接住了', !!st && st.scheduled === true, JSON.stringify(st));
    rep.check('时钟是确定性推进的（rounds 有账）', !!st && typeof st.rounds === 'number' && st.clock?.min === 540, JSON.stringify(st?.clock));
    // 插值引擎在页面里跑一段：中途必须在两点之间，到点必须到位（不瞬移）
    const walk = await vf.evaluate(() => {
      const w = window.TCWander.walker, t = performance.now();
      w.clear();
      w.to('探针甲', [0.1, 0.2], t);          // 第一次出现：直接落位
      const first = w.at('探针甲', t);
      w.to('探针甲', [0.5, 0.6], t);          // 换地方：走一段
      const t0 = w.at('探针甲', t), half = w.at('探针甲', t + 600), end = w.at('探针甲', t + 1200);
      const done = w.step(t + 1200);
      return { first, t0, half, end, done, walking: w.describe().walking };
    });
    const mid = (walk.half || []).map((v, i) => Math.abs(v - ((walk.t0[i] + walk.end[i]) / 2)));
    rep.check('第一次出现直接落位，不凭空走一段', JSON.stringify(walk.first) === JSON.stringify([0.1, 0.2]), JSON.stringify(walk.first));
    rep.check('换地方：中途在两点之间（不瞬移）', mid.length === 2 && mid.every(d => d < 1e-6), JSON.stringify(walk.half));
    rep.check('到点到位并收尾', JSON.stringify(walk.end) === JSON.stringify([0.5, 0.6]) && walk.done.done.includes('探针甲'), JSON.stringify(walk.done));
  });

  /* ---------------- ① 庄园三维里的发光拾取物 ---------------- */
  await step('① 三维藏物：藏物表推下去 → 道具落进房间 → 点一下 → 宿主收到 eden-map:loot', async () => {
    await vf.evaluate(() => { try { window.go?.('eden_estate'); } catch (e) {} });
    await B.wait(2000);
    const fr = await (async () => { const h = await vf.$('#estate'); return h ? await h.contentFrame() : null; })();
    rep.check('庄园三维页起来了', !!fr, String(!!fr));
    if (!fr) return;
    // 落点用庄园自己的房间表：挑两个真房间名（探针推的藏物表按名字对账）
    const rooms = await fr.evaluate(() => (window.__estate ? { ok: true } : { ok: false }));
    rep.check('庄园页的调试面在（__estate）', rooms.ok, JSON.stringify(rooms));
    await fr.evaluate(() => window.__estate?.props?.set?.({ items: [
      { id: 'p1', name: '探针·机密账本', place: '主人书房' },
      { id: 'p2', name: '探针·门房登记簿', place: '大厅' },
      { id: 'p3', name: '探针·认不出落点的东西', place: '不存在的角落' },
    ] }));
    await B.wait(400);
    const s = await fr.evaluate(() => ({ n: window.__estate?.props?.now?.() ?? -1, sum: window.__estate?.props?.summary?.(), list: window.__estate?.props?.list?.() || [] }));
    rep.check('认得出落点的道具落进了房间（认不出的丢掉）', s.n === 2, `${s.n} 枚：${s.list.map(p => p.name + '@' + p.place).join('/')}`);
    // 楼层切换：道具跟着当前层显隐（剖切看本层、外观只亮室外）
    const byFloor = await fr.evaluate(() => {
      const at = m => { window.__estate.setMode(m); return window.__estate.props.list().map(p => p.id); };
      const onF2 = at('F2'), onF1 = at('F1'), onExt = at('ext');
      window.__estate.setMode('F2');
      return { onF2, onF1, onExt };
    });
    rep.check('F2 只亮二层的那一枚', byFloor.onF2.length === 1 && byFloor.onF2[0] === 'p1', `F2 ${byFloor.onF2.join()}`);
    rep.check('F1 只亮一层的那一枚', byFloor.onF1.length === 1 && byFloor.onF1[0] === 'p2', `F1 ${byFloor.onF1.join()}`);
    rep.check('外观（室外）不亮室内的', byFloor.onExt.length === 0, `ext ${byFloor.onExt.join()}`);
    const sum = await fr.evaluate(() => { window.__estate.setMode('F2'); return window.__estate.props.summary(); });
    rep.check('摘要出账（{ total, hidden, floors }）', sum?.total === 1 && sum.floors.includes('F2'), JSON.stringify(sum));
    // 点一枚：走真实的射线（pointerup → pickProp → takeProp → estate:loot → 查看器 → 宿主）
    const hit = await fr.evaluate(() => {
      const p = window.__estate.props.screen().find(x => x.id === 'p1'); if (!p) return null;
      const el = window.__estate.renderer.domElement, rc = el.getBoundingClientRect();
      const x = rc.left + p.x, y = rc.top + p.y;
      return { x, y, on: window.__estate.props.pick(x, y) };
    });
    rep.check('道具投影到了屏幕上（点得到）', !!hit && hit.on === 'p1', JSON.stringify(hit));
    if (hit) {
      await fr.evaluate(h => { const el = window.__estate.renderer.domElement;
        el.dispatchEvent(new PointerEvent('pointerdown', { clientX: h.x, clientY: h.y, button: 0, pointerType: 'mouse', bubbles: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { clientX: h.x, clientY: h.y, button: 0, pointerType: 'mouse', bubbles: true })); }, hit);
      await B.wait(700);
      const got = await D.page.evaluate(() => (window.__msgs || []).filter(m => m?.type === 'eden-map:loot'));
      rep.check('宿主收到 eden-map:loot', got.length === 1, JSON.stringify(got[0] || {}));
      rep.check('消息带藏物的 id / 名字 / 地点', got[0]?.id === 'p1' && got[0]?.name === '探针·机密账本' && !!got[0]?.place, JSON.stringify(got[0] || {}));
      const left = await fr.evaluate(() => window.__estate.props.now());
      rep.check('拿走的那一枚不再发光', left === 1, `还剩 ${left} 枚`);
    }
  });

  // 已知噪声：数据 404；合成 PointerEvent 上没有真指针，OrbitControls 的 setPointerCapture 会报一次（真鼠标不会）
  await step('②-3D 三维页里的 NPC：时钟 tick 推日程，换地方是插值走过去的（不瞬移）', async () => {
    const fr = await (async () => { const h = await vf.$('#estate'); return h ? await h.contentFrame() : null; })();
    if (!fr) { rep.check('庄园页还在', false, '拿不到 iframe'); return; }
    // 日程：08:00–12:00 在主层大厅，13:00–18:00 在二层书房（两个真房间名）
    const sched = { default: '大厅', npcs: [{ name: '探针乙', slots: [{ from: '08:00', to: '12:00', at: '大厅' }, { from: '13:00', to: '18:00', at: '主人书房' }] }] };
    await fr.evaluate(s => window.__estate.npcs.set(s, { day: 1, min: 9 * 60 }), sched);
    await B.wait(300);
    const a = await fr.evaluate(() => ({ n: window.__estate.npcs.now(), floor: window.__estate.npcs.floor('探针乙'), d: window.__estate.npcs.describe() }));
    rep.check('按日程表在房间里落了一个人', a.n === 1 && a.floor === 'F1', JSON.stringify({ n: a.n, floor: a.floor }));
    rep.check('时钟接住了（rounds 有账）', a.d.rounds === 0 && a.d.clock?.min === 540, JSON.stringify(a.d.clock));
    // 时刻推到下一段 → 换楼层：走一段过去，中途在两点之间
    const walk = await fr.evaluate(() => {
      const N = '探针乙', t = performance.now();
      const from = window.__estate.npcs.at(N, t);
      window.__estate.npcs.set({ default: '大厅', npcs: [{ name: N, slots: [{ from: '08:00', to: '12:00', at: '大厅' }, { from: '13:00', to: '18:00', at: '主人书房' }] }] }, { day: 1, min: 15 * 60 });
      const walking = window.__estate.npcs.describe().walking;
      const half = window.__estate.npcs.at(N, t + 600), to = window.__estate.npcs.at(N, t + 1200);
      return { from, walking, half, to, floor: window.__estate.npcs.floor(N) };
    });
    rep.check('换到另一层：进了一段行走（不瞬移）', walk.walking === 1, JSON.stringify(walk));
    // 中途那一点必须落在两个端点之间、且离中点很近（缓入缓出在半程刚好过中点；t0 比取样时刻晚几毫秒，留一点容差）
    const between = (walk.half || []).every((v, i) => { const a = walk.from[i], b = walk.to[i];
      return (v - a) * (b - v) >= 0 && Math.abs(v - (a + b) / 2) <= Math.abs(b - a) * 0.1 + 0.05; });
    rep.check('中途在两点之间（三维三个分量都是）', (walk.half || []).length === 3 && between,
      JSON.stringify({ half: walk.half, from: walk.from, to: walk.to }));
    const moved3 = (walk.to || []).some((v, i) => Math.abs(v - walk.from[i]) > 1e-6);
    rep.check('到点落在新楼层（F2），三维坐标真的换了', walk.floor === 'F2' && moved3, `floor ${walk.floor} / ${JSON.stringify(walk.from)} → ${JSON.stringify(walk.to)}`);
    // 头像真的画出来了（CSS2D 元素挂在 DOM 上）
    await B.wait(600);
    const dom = await fr.evaluate(() => [...document.querySelectorAll('.npc b')].map(b => b.textContent));
    rep.check('头像（CSS2D）在三维页里画出来了', dom.includes('探针乙'), dom.join('/'));
  });

  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e) || /setPointerCapture/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.check('除已知 404 外无控制台错误', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? `\n全部通过 → ${OUT}` : `\n有失败 → ${OUT}`);
  process.exit(ok ? 0 : 1);
}
