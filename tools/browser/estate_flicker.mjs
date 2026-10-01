// N12：3D z-fighting 闪烁探针（庄园 B1 / F2 剖切 / 外观 + 通用三维页一个模型）。
// 用法：node tools/browser/estate_flicker.mjs [输出目录=~/eden-map-review/n12] [--engine chromium|webkit|both] [--model dairy] [--frames 30]
// 判据：① 相机不动，同一视角连续强制渲染 N 帧，逐帧像素完全相同；② DEPTH_BITS ≥ 24；
// ③ 灵敏度：near / far 各偏 3 mm（只改深度映射、画面几何不动）再渲染，与基准帧比较，差异像素占比（深度缓冲太浅或有共面面时胜负翻转，占比陡增）≤ 阈值。
// 强制渲染 = 同一个 JS 任务里 renderer.render 后立刻读回画布（不依赖 rAF，也不需要 preserveDrawingBuffer）。
// WebKit 才是出过问题的平台（TauriTavern / macOS）；playwright webkit 与 chromium 都跑。
import * as B from './lib.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve((process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null) || path.join(os.homedir(), 'eden-map-review/n12'));
const ENGINE = arg('--engine', 'both'), MODEL = arg('--model', 'dairy'), FRAMES = +arg('--frames', 30);
const DIFF_MAX = +arg('--diff-max', 0.0005);   // 差异像素占比上限（0.05%）
const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const PRESETS = { chromium: 'desktop', webkit: 'desktopWk' };
const engines = ENGINE === 'both' ? ['chromium', 'webkit'] : [ENGINE];

/** 页内：对每个机位（poses）固定相机连续渲染 frames 帧；返回每个机位的：帧哈希去重数、深度映射偏 3 mm 的差异占比、near / far；深度位数是上下文的属性。
 *  机位 = 绕 target 的球面角 { theta, phi }（estate：正交，DIST 1600；viewer3d：透视，当前距离）；null = 当前机位。 */
const PAGE_FN = `(async ({ frames, which, poses }) => {
  const H = which === 'estate' ? window.__estate : window.__viewer3dProbe;
  const canvas = H.canvas || H.renderer.domElement;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const cam = H.camera, render = H.renderNow ? () => H.renderNow() : () => H.renderer.render(H.scene, H.camera);
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const c2 = document.createElement('canvas'), g2 = c2.getContext('2d', { willReadFrequently: true });
  const grab = () => { c2.width = canvas.width; c2.height = canvas.height; g2.drawImage(canvas, 0, 0); return g2.getImageData(0, 0, c2.width, c2.height).data; };
  const hash = (a) => { let h = 2166136261; const u = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2); for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619) >>> 0; return h; };
  const shot = () => { render(); return grab(); };
  const tg = which === 'estate' ? H.controls.target : null, vt = which === 'viewer3d' ? H.target : null;
  const dist0 = which === 'viewer3d' ? H.camDist : 1600, out = [];
  for (const pose of poses) {
    if (pose) {
      const t = tg ? tg.toArray() : vt, d = dist0, { theta, phi } = pose;
      const p = [t[0] + d * Math.sin(phi) * Math.sin(theta), t[1] + d * Math.cos(phi), t[2] + d * Math.sin(phi) * Math.cos(theta)];
      if (which === 'estate') { cam.position.set(...p); cam.lookAt(...t); cam.updateMatrixWorld(true); H.fit(); }
      else H.view(p, t);
      await raf2(); await raf2();
    }
    const base = shot().slice(), hashes = [hash(base)];
    for (let i = 1; i < frames; i++) hashes.push(hash(shot()));
    // 灵敏度：只扰动深度映射（near / far 各 ±3 mm），画面几何不动；深度缓冲分不开的面（共面 / 近共面）胜负会翻转 → 差异像素
    const n0 = cam.near, f0 = cam.far; let worst = 0;
    for (const d of [0.003, -0.003]) {
      cam.near = n0 + d; cam.far = f0 + d; cam.updateProjectionMatrix();
      const a = shot(); let n = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - base[i]) > 8 || Math.abs(a[i + 1] - base[i + 1]) > 8 || Math.abs(a[i + 2] - base[i + 2]) > 8) n++;
      worst = Math.max(worst, n / (a.length / 4));
    }
    cam.near = n0; cam.far = f0; cam.updateProjectionMatrix();
    out.push({ pose, distinct: new Set(hashes).size, nudgeDiff: worst, near: cam.near, far: cam.far });
  }
  render();
  const attr = gl.getContextAttributes();
  return { poses: out, distinct: Math.max(...out.map((o) => o.distinct)), nudgeDiff: Math.max(...out.map((o) => o.nudgeDiff)), near: out[0].near, far: out[0].far,
    depthBits: gl.getParameter(gl.DEPTH_BITS), stencilBits: gl.getParameter(gl.STENCIL_BITS), stencilAttr: attr.stencil, size: [canvas.width, canvas.height] };
})`;
const POSES = [null, { theta: -0.42, phi: 0.98 }, { theta: 0.9, phi: 0.45 }, { theta: 2.4, phi: 1.1 }, { theta: -2.2, phi: 0.2 }];   // 当前 + 4 个角度

const results = {};
try {
  for (const eng of engines) {
    const preset = PRESETS[eng];
    results[eng] = {};
    const P = await B.newPage(preset);
    // ---- 庄园：外观 / B1 / F2 剖切 ----
    await B.openEstate(P, { stats: false });
    const f = P.page.mainFrame();
    for (const [name, mode] of [['exterior', 'ext'], ['B1', 'B1'], ['F2', 'F2']]) {
      await f.evaluate((m) => window.__estate.setMode(m), mode);
      if (mode !== 'ext') await f.waitForFunction(() => window.__estate.houseState() !== 1, null, { timeout: 40000 }).catch(() => {});
      await B.wait(2600);   // 飞行动画收尾
      const r = await f.evaluate(`(${PAGE_FN})({ frames: ${FRAMES}, which: 'estate', poses: ${JSON.stringify(POSES)} })`);
      results[eng]['estate_' + name] = r;
      await B.shot(P.page, OUT, `${eng}_estate_${name}`);
      const ident = r.distinct === 1;
      rep.check(`${eng} 庄园 ${name}：${FRAMES} 帧像素完全相同`, ident, `distinct=${r.distinct} depth=${r.depthBits} stencil=${r.stencilBits} near/far=${r.near.toFixed(1)}/${r.far.toFixed(1)} poses=${r.poses.length} nudgeDiff=${(r.nudgeDiff * 100).toFixed(4)}%`);
      rep.check(`${eng} 庄园 ${name}：DEPTH_BITS ≥ 24`, r.depthBits >= 24, `DEPTH_BITS=${r.depthBits}, STENCIL_BITS=${r.stencilBits}`);
      rep.check(`${eng} 庄园 ${name}：深度映射偏 3 mm 后差异像素 ≤ ${(DIFF_MAX * 100).toFixed(3)}%`, r.nudgeDiff <= DIFF_MAX, `${(r.nudgeDiff * 100).toFixed(4)}%`);
    }
    rep.check(`${eng} 庄园：无页面错误`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    await P.close();
    // ---- 通用三维页一个模型 ----
    const Q = await B.newPage(preset);
    await Q.page.goto(`${B.BASE}props/viewer3d.html?model=${MODEL}`);
    await Q.page.waitForFunction(() => window.__viewer3dProbe?.ready, null, { timeout: 120000 });
    await B.wait(2500);
    const r = await Q.page.evaluate(`(${PAGE_FN})({ frames: ${FRAMES}, which: 'viewer3d', poses: ${JSON.stringify(POSES.slice(0, 3))} })`);
    results[eng]['viewer3d_' + MODEL] = r;
    await B.shot(Q.page, OUT, `${eng}_viewer3d_${MODEL}`);
    rep.check(`${eng} viewer3d ${MODEL}：${FRAMES} 帧像素完全相同`, r.distinct === 1, `distinct=${r.distinct} depth=${r.depthBits} near/far=${r.near.toFixed(2)}/${r.far.toFixed(1)} nudgeDiff=${(r.nudgeDiff * 100).toFixed(4)}%`);
    rep.check(`${eng} viewer3d ${MODEL}：DEPTH_BITS ≥ 24`, r.depthBits >= 24, `DEPTH_BITS=${r.depthBits}, STENCIL_BITS=${r.stencilBits}`);
    rep.check(`${eng} viewer3d ${MODEL}：深度映射偏 3 mm 后差异像素 ≤ ${(DIFF_MAX * 100).toFixed(3)}%`, r.nudgeDiff <= DIFF_MAX, `${(r.nudgeDiff * 100).toFixed(4)}%`);
    rep.check(`${eng} viewer3d：无页面错误`, Q.errors.length === 0, Q.errors.slice(0, 3).join(' | '));
    await Q.close();
  }
} catch (e) { rep.check('探针未崩溃', false, String(e?.stack || e).split('\n').slice(0, 3).join(' / ')); }
rep.metric('results', results);
const ok = rep.save();
await B.closeAll(); srv.stop();
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([e, v]) => [e, Object.fromEntries(Object.entries(v).map(([k, r]) => [k, { distinct: r.distinct, depth: r.depthBits, stencil: r.stencilBits, near: +r.near.toFixed(2), far: +r.far.toFixed(1), nudgeDiffPct: +(r.nudgeDiff * 100).toFixed(4), perPose: r.poses.map((o) => +(o.nudgeDiff * 100).toFixed(4)) }]))])), null, 1));
process.exit(ok ? 0 : 1);
