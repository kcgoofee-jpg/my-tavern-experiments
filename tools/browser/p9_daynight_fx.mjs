// Part 9 浏览器探针：node tools/browser/p9_daynight_fx.mjs [输出目录]
//   ① 昼夜：把世界时钟从 00:00 推到 24:00，四个时段（夜 / 清晨 / 正午 / 黄昏）的光强、自发光、探照灯
//      与画面亮度都得按预期到位，且时钟跳档是渐变过渡（不闪）；
//   ② fx 槽位粒子：雨 / 雪 / 极光切进去时 draw call 只涨 1，来回切十轮几何体 / 贴图 / 着色器程序不涨（不泄漏）。
// 只验「时钟到了 → 参数变了 → 画面真的变了 → 粒子开销可控」，不验好不好看。
// 亮度直接读 WebGL 后台缓冲（readPixels）算平均亮度，不靠眼睛比截图。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as B from './lib.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p9';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };
const num = o => (o == null ? '-' : o);

try {
  const D = await B.newPage('desktop');
  const r0 = await B.openEstate(D, { stats: true });   // stats=1：循环每帧都画，draw call / 亮度才量得准
  rep.check('庄园三维页起来了', r0.firstFrameMs > 0, `首帧 ${r0.firstFrameMs} ms / ${r0.requests} 个请求`);

  /* ---------------- 探针工具：装到页面里（昼夜模块与页面同一个实例，THREE 走页面 importmap） ---------------- */
  await D.page.evaluate(async () => {
    const dn = await import('/three/daynight.mjs');
    const THREE = await import('three');
    const st = { px: {}, dim: null };
    const lum = (px, i) => px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722;
    window.__p9 = {
      dn, THREE, st,
      // 时钟 → 一份完整环境参数（同一套关键帧，页面也用它）
      env: min => { const e = dn.envAt({ day: 1, min }); return { phase: e.phase, period: e.period, time: e.time,
        sun: +e.sun.intensity.toFixed(3), elev: +e.sun.elevation.toFixed(1),
        emissive: +e.emissive.toFixed(3), searchlight: +e.searchlight.toFixed(3), fog: +e.fog.density.toFixed(5), night: !!e.night }; },
      // 场景里真灯的状态（昼夜落地到了哪几盏）
      lights: () => { const out = []; window.__estate.scene.traverse(o => { if (o.isLight) out.push({ t: o.type, i: +o.intensity.toFixed(3),
        c: '#' + o.color.getHexString(), p: [o.position.x, o.position.y, o.position.z].map(v => Math.round(v)) }); }); return out; },
      // 画一帧并读回来：平均亮度 + draw call + 显存对象数（几何体 / 贴图 / 程序）
      grab: slot => { const { renderer, scene, camera } = window.__estate;
        renderer.render(scene, camera);
        const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = 0; for (let i = 0, n = w * h; i < n; i++) s += lum(px, i);
        // 只算中间那块（庄园本体）：天空渐变不跟着昼夜走，全屏平均会把对比冲淡
        let c = 0, m = 0;
        for (let y = Math.floor(h * .30); y < Math.floor(h * .85); y++) for (let x = Math.floor(w * .20); x < Math.floor(w * .80); x++) { c += lum(px, y * w + x); m++; }
        st.px[slot] = px; st.dim = [w, h];
        return { slot, lum: +(s / (w * h)).toFixed(2), lumCrop: +(c / m).toFixed(2), calls: renderer.info.render.calls,
          tris: renderer.info.render.triangles, geo: renderer.info.memory.geometries,
          tex: renderer.info.memory.textures, prog: renderer.info.programs?.length ?? -1 }; },
      // 两帧之间亮度差 > 12 的像素数（画面真的动了多少）
      diff: (a, b) => { const A = st.px[a], C = st.px[b]; if (!A || !C) return -1;
        let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(lum(A, i) - lum(C, i)) > 12) n++; return n; },
      // 场景里还挂着几个粒子对象（关掉后应该是 0：极光挂在相机上，也要跟着摘）。
      // fx-particles 是引擎自己的容器 Group（建一次、一直挂在那儿），不算残留。
      objs: () => { const out = []; window.__estate.scene.traverse(o => { if (/^fx-/.test(o.name) && o.name !== 'fx-particles') out.push({ name: o.name,
        parent: o.parent?.name || o.parent?.type || '(none)', visible: o.visible, parentVisible: o.parent?.visible }); }); return out; },
    };
  });
  const envOf = min => D.page.evaluate(m => window.__p9.env(m), min);
  const grab = slot => D.page.evaluate(s => window.__p9.grab(s), slot);
  const diff = (a, b) => D.page.evaluate(([x, y]) => window.__p9.diff(x, y), [a, b]);
  const setClock = async min => { await D.page.evaluate(m => window.__estate.dayNight.setClock({ day: 1, min: m }), min); await B.wait(120);
    await D.page.waitForFunction(() => window.__estate.dayNight.describe().settled, null, { timeout: 8000, polling: 50 }).catch(() => {}); await B.wait(150); };

  /* ---------------- ① 昼夜：00:00 → 24:00 ---------------- */
  await step('① 昼夜：时钟走一圈，四时段的光 / 自发光 / 探照灯 / 亮度都到位', async () => {
    const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 23];
    const rows = [];
    for (const h of HOURS) {
      const min = h * 60;
      await setClock(min);
      const e = await envOf(min);
      const dn = await D.page.evaluate(() => window.__estate.dayNight.describe());
      const g = await grab('t' + min);
      rows.push({ h, ...e, settled: dn.settled, reduced: dn.reducedMotion, lum: g.lum, lumCrop: g.lumCrop, calls: g.calls });
    }
    rep.metric('clockSweep', rows);
    const phases = [...new Set(rows.map(r => r.phase))];
    rep.check('四个时段都走到了', ['night', 'dawn', 'noon', 'dusk'].every(p => phases.includes(p)), phases.join('/'));
    // 关键帧正中（00:30 / 06:30 / 12:30 / 18:15）取一份环境参数：整点取样会落在两段插值中间，拿不到满值
    const KEY = { night: 30, dawn: 390, noon: 750, dusk: 1095 };
    const env = {};
    for (const [k, m] of Object.entries(KEY)) env[k] = await envOf(m);
    rep.metric('keyEnv', env);
    rep.check('深夜：自发光与探照灯全开', env.night.emissive > .99 && env.night.searchlight > .99, JSON.stringify({ emissive: env.night.emissive, searchlight: env.night.searchlight }));
    rep.check('正午：自发光与探照灯全灭', env.noon.emissive < .01 && env.noon.searchlight < .01, JSON.stringify({ emissive: env.noon.emissive, searchlight: env.noon.searchlight }));
    rep.check('黄昏 / 清晨在中间（灯半开）', env.dusk.emissive > .5 && env.dusk.emissive < .6 && env.dusk.searchlight > .5 && env.dawn.searchlight < .3,
      JSON.stringify({ dusk: [env.dusk.emissive, env.dusk.searchlight], dawn: [env.dawn.emissive, env.dawn.searchlight] }));
    const at = h => rows.find(r => r.h === h);
    rep.check('太阳强度：正午 > 清晨 > 深夜', at(12).sun > at(6).sun && at(6).sun > at(2).sun, `${at(12).sun} / ${at(6).sun} / ${at(2).sun}`);
    rep.check('画面亮度跟着时段走（正午最亮、深夜最暗）', at(12).lumCrop > at(18).lumCrop && at(18).lumCrop > at(2).lumCrop && at(12).lumCrop - at(2).lumCrop >= 18,
      rows.map(r => `${String(r.h).padStart(2, '0')}:00 ${r.lumCrop}`).join(' '));

    // 场景里的真灯：夜里那盏灯得真的换了强度 / 颜色 / 方向
    await setClock(12 * 60);
    const noonL = await D.page.evaluate(() => window.__p9.lights());
    await setClock(2 * 60);
    const nightL = await D.page.evaluate(() => window.__p9.lights());
    rep.metric('lights', { noon: noonL, night: nightL });
    const changed = nightL.filter((l, i) => noonL[i] && (Math.abs(l.i - noonL[i].i) > .05 || l.c !== noonL[i].c));
    rep.check('场景灯真的被昼夜驱动了（强度 / 颜色变了）', changed.length > 0,
      `${changed.map(l => l.t + ' ' + l.i).join('/')}（ noon ${noonL.map(l => l.i).join()} → night ${nightL.map(l => l.i).join()} ）`);
    const mi = nightL.findIndex((l, i) => noonL[i] && (l.p[0] !== noonL[i].p[0] || l.p[1] !== noonL[i].p[1] || l.p[2] !== noonL[i].p[2]));
    rep.check('太阳方向也换了（位置跟着高度角 / 方位角）', mi >= 0,
      mi < 0 ? '没变' : `${nightL[mi].t} ${JSON.stringify(noonL[mi].p)} → ${JSON.stringify(nightL[mi].p)}`);

    // 跳档不闪：正午 → 深夜推过去，过渡中途必须落在两端之间
    await setClock(12 * 60);
    const flash = await D.page.evaluate(async () => {
      const dn = window.__estate.dayNight, from = dn.describe().intensity;
      dn.setClock({ day: 1, min: 2 * 60 });
      const mid = [];
      for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 90)); mid.push(+dn.describe().intensity.toFixed(3)); }
      await new Promise(r => setTimeout(r, 1600));
      return { from, mid, to: dn.describe().intensity };
    });
    const between = flash.mid.filter(v => v < flash.from - .02 && v > flash.to + .02);
    rep.check('时钟跳档是渐变过渡（中途落在两端之间，不闪）', between.length >= 3,
      `${flash.from} → ${flash.mid.join(' → ')} → ${flash.to}`);

    // 四时段截图留档（人工联调用）
    for (const [name, min] of [['night', 2 * 60], ['dawn', 6 * 60 + 30], ['noon', 12 * 60 + 30], ['dusk', 18 * 60 + 15]]) {
      await setClock(min);
      await B.shot(D.page, OUT, 'phase-' + name);
    }
  });

  /* ---------------- ② fx 槽位：雨 / 雪 / 极光 ---------------- */
  await step('② fx 槽位粒子：一个效果 = +1 draw call，十轮切换不泄漏', async () => {
    const layers = await D.page.evaluate(() => ({ reg: window.__estate.fx.layers(), mounted: window.__estate.fx.mounted() }));
    const fxSlot = (layers.reg?.slots || []).find(s => s.id === 'fx') || {};
    rep.check('粒子按 LayerRegistry 契约挂在 fx 槽位', (fxSlot.layers || []).includes('particles3d') && layers.mounted,
      `fx 槽 [${(fxSlot.layers || []).join()}]；已挂进场景 ${layers.mounted}`);

    const setFX = async (type, i = 1) => {
      await D.page.evaluate(([t, v]) => window.__estate.fx.set(t, v), [type, i]);
      await D.page.waitForFunction(() => { const d = window.__estate.fx.describe();
        return d && (d.type === 'none' ? !d.active && d.intensity < .01 : d.intensity > .9); }, null, { timeout: 8000, polling: 50 }).catch(() => {});
      await B.wait(150);
    };

    await setFX('none', 0);
    await B.wait(300);
    const base = await grab('fx-none');
    const off = await D.page.evaluate(() => window.__p9.objs());
    rep.check('关掉时场景里没有粒子对象', off.length === 0, JSON.stringify(off));

    const deltas = {};
    for (const type of ['rain', 'snow', 'aurora']) {
      await setFX(type, 1);
      const g = await grab('fx-' + type);
      const d = await D.page.evaluate(() => window.__estate.fx.describe());
      deltas[type] = { calls: g.calls - base.calls, diff: await diff('fx-none', 'fx-' + type), describe: d, lum: g.lum };
      await B.shot(D.page, OUT, 'fx-' + type);
    }
    rep.metric('fx', { base, deltas });
    for (const [type, d] of Object.entries(deltas)) {
      rep.check(`${type}：draw call 只涨 1（≤ 1）`, d.calls === 1, `+${d.calls}（${base.calls} → ${base.calls + d.calls}）`);
      rep.check(`${type}：画面真的变了（亮度差 > 12 的像素 ≥ 2000）`, d.diff >= 2000, `${d.diff} px；亮度 ${base.lum} → ${d.lum}`);
    }

    // 十轮 rain → snow → aurora → none：几何体 / 贴图 / 着色器程序不许涨，粒子对象不许留在场景里
    await setFX('none', 0);   // 基线必须在「全关」状态下量，否则把上一轮的极光算进基线
    await B.wait(300);
    const before = await grab('fx-cycle-before');
    for (let i = 0; i < 10; i++) {
      for (const t of ['rain', 'snow', 'aurora']) { await D.page.evaluate(x => window.__estate.fx.set(x, 1), t); await B.wait(60); }
      await D.page.evaluate(() => window.__estate.fx.set('none', 0)); await B.wait(60);
    }
    await setFX('none', 0);
    await B.wait(400);
    const after = await grab('fx-cycle-after');
    const orphan = await D.page.evaluate(() => window.__p9.objs());
    rep.metric('leak', { before, after, orphan, describe: await D.page.evaluate(() => window.__estate.fx.describe()) });
    rep.check('十轮后几何体数不涨', after.geo - before.geo <= 1, `${before.geo} → ${after.geo}`);
    rep.check('十轮后贴图数不涨', after.tex - before.tex <= 1, `${before.tex} → ${after.tex}`);
    rep.check('十轮后着色器程序数不涨', after.prog - before.prog <= 2, `${before.prog} → ${after.prog}`);
    rep.check('十轮后 draw call 回到基线', after.calls === before.calls, `${before.calls} → ${after.calls}`);
    rep.check('十轮后场景里没留下粒子对象（含挂在相机上的极光）', orphan.length === 0, JSON.stringify(orphan));
  });

  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e) || /setPointerCapture/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.check('除已知 404 外无控制台错误', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  // 需人工过目的图：拷到 ~/eden-map-review/ 留档（只存档、不阻塞）
  try { const rev = path.join(os.homedir(), 'eden-map-review', path.basename(OUT));
    fs.cpSync(path.join(B.REPO_ROOT, OUT), rev, { recursive: true, filter: s => !s.endsWith('results.json') });
    console.log('截图留档 → ' + rev); } catch (e) { console.log('留档失败：' + e.message.split('\n')[0]); }
  console.log(ok ? `\n全部通过 → ${OUT}` : `\n有失败 → ${OUT}`);
  process.exit(ok ? 0 : 1);
}
