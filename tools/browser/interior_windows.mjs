// INTERIOR-WINDOWS 3/4/5：窗内景的样张（昼 / 夜 × 1440 / 375）、帧时间（Chromium + WebKit）和断言。
// 用法：[GPU=1] node tools/browser/interior_windows.mjs <输出目录>
// A/B 在同一页里开关（setInteriorOn 只翻 uIntOn，着色器、纹理、机位全不动），两种状态交替各测几轮取中位数：
// 跨页对比会被加载顺序和机位漂移污染，这里机位差就是 0。gl.finish() 在 Chromium 上不像会等（量出 0.08 ms），
// 所以一批 BATCH 帧后用一次 1×1 readPixels 排空（它要等帧缓冲可用，是真的同步点）；每帧都同步的话量到的多是同步本身。
// performance.now() 在 Chromium 是 1 ms 精度，所以按批取平均（一臂 9 个样本取中位数）。
// 另外跑一页「图集请求被 abort」的降级页：着色器照样编译、uIntOn 停在 0，窗退回一层平光。
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { newPage, shot, closeAll, wait, ensureServer, openEstate } from './lib.mjs';

const OUT = path.resolve(process.argv[2] || 'docs/reviews/interior-windows');
const BATCH = 20, ROUNDS = 3, GRID = 60, THETA = 0.62, PHI = 1.30, ZOOM = 2.2;   // ZOOM 2.2 → 视口高约 55 米：主楼占半屏，一扇窗约 25 像素
const srv = await ensureServer();
const q = a => { const s = [...a].sort((x, y) => x - y); return { p50: +s[Math.floor(s.length / 2)].toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3) }; };
const mean = a => +(a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)).toFixed(2);

// 交替开关测帧时间 + 两种状态各压一张亮度网格（GRID 列，行按画面比例）
const measure = (f) => f.evaluate(async ([batch, rounds, G]) => {
  const { renderer, scene, camera } = window.__estate, gl = renderer.getContext();
  const mod = await import('/three/interior-look.mjs'), one = new Uint8Array(4);
  const arm = (on) => { mod.setInteriorOn(on); const t = [];
    for (let r = 0; r < rounds; r++) { const a = performance.now();
      for (let i = 0; i < batch; i++) renderer.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);        // 一次同步把整批排空：每帧都同步的话，量到的多是同步本身
      t.push((performance.now() - a) / batch); }
    return t; };
  arm(1); arm(0); arm(1); arm(0);                                       // 热身：纹理上传 / 程序切换都算头几轮
  const on = [], off = [];
  for (let r = 0; r < 3; r++) { off.push(...arm(0)); on.push(...arm(1)); }
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, R = Math.max(1, Math.round(G * H / W));
  const gridOf = (o) => { mod.setInteriorOn(o); renderer.render(scene, camera);
    const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sum = new Float64Array(G * R), cnt = new Int32Array(G * R);
    for (let y = 0; y < H; y++) { const ri = Math.min(R - 1, Math.floor((H - 1 - y) / H * R));   // 网格从画面顶部往下数
      for (let x = 0; x < W; x++) { const j = (y * W + x) * 4, ci = ri * G + Math.min(G - 1, Math.floor(x / W * G));
        sum[ci] += .2126 * px[j] + .7152 * px[j + 1] + .0722 * px[j + 2]; cnt[ci]++; } }
    return [...sum.map((v, i) => +(v / Math.max(1, cnt[i])).toFixed(2))]; };
  const c = camera.position;
  return { msOn: on, msOff: off, gridOn: gridOf(1), gridOff: gridOf(0), rows: R,
    cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], zoom: +camera.zoom.toFixed(2) };
}, [BATCH, ROUNDS, GRID]);

const open = async (preset, { block = false, night = true } = {}) => {
  const P = await newPage(preset);
  if (block) await P.page.route('**/interior_*.jpg', r => r.abort());
  if (preset === 'phone') { const cdp = await P.ctx.newCDPSession(P.page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  const t = await openEstate(P);
  await P.page.evaluate(() => document.querySelector('.cc-hint')?.remove());          // 提示卡不挡画面（hidden 会被类样式盖掉）
  await P.page.evaluate(m => window.__estate.dayNight.setClock({ min: m }), night ? 30 : 750);
  await wait(3200);                                                                   // 1.6 s 淡入 + 开场飞行落定
  await P.page.evaluate(([z, th, ph]) => { const { camera } = window.__estate; camera.zoom = z;
    camera.updateProjectionMatrix(); window.__estate.view(th, ph); }, [ZOOM, THETA, PHI]);
  await wait(1200);
  return { P, t };
};

const read = (P) => P.page.evaluate(() => ({
  look: window.__estate.nightLook(),
  shader: (window.__estate.renderer.info.programs || []).some(p => String(p.cacheKey ?? '').includes('-int')),
  // 补丁挂上没有 = uIntOn；图集到齐 = 纹理有尺寸（interiorCount() 只数材质，图没到也挂着，别拿它当到货）
  iu: window.__estate.scene.children.flatMap(function walk(o) { const u = o.material?.userData?.iu;
    const self = u ? [[u.uIntOn.value, u.uIntTex.value?.image?.width ?? 0, o.material.userData.u?.uGlow?.value ?? -1]] : [];
    return [...self, ...o.children.flatMap(walk)]; }),
}));

const setOn = (P, v) => P.page.evaluate((v) => import('/three/interior-look.mjs').then(x => x.setInteriorOn(v)), v);

const run = async (preset, { night = true } = {}) => {
  const { P, t } = await open(preset, { night });
  const m = await measure(P.page.mainFrame());
  await setOn(P, 1); await wait(300);
  const s = await read(P);                                              // 读数要在打开状态：iu.on 就是这一层的开关
  await shot(P.page, path.join(OUT, 'shots'), `${preset}_${night ? 'night' : 'day'}_interior`);
  await setOn(P, 0); await wait(300);
  await shot(P.page, path.join(OUT, 'shots'), `${preset}_${night ? 'night' : 'day'}_baseline`);
  await P.close();
  return { ...s, firstFrameMs: t.firstFrameMs, ...m };
};

const out = {};
const fails = [];
for (const preset of ['desktop', 'phone', 'desktopWk']) {
  const r = await run(preset);
  const win = [], rest = [];
  r.gridOn.forEach((v, i) => (v - r.gridOff[i] > 1 ? win : rest).push(v));   // 只有窗内景会改这些格：变亮的格 = 窗，其余 = 墙 / 地 / 天
  const fOn = q(r.msOn), fOff = q(r.msOff);
  const dp = +((fOn.p50 / fOff.p50 - 1) * 100).toFixed(1);
  out[preset] = { frames: { off: fOff, on: fOn, delta_pct: dp, budget_pct: +(fOn.p50 / 16.67 * 100).toFixed(1) },
    armed: r.look.interior, glowOn: r.look.glowOn, shader: r.shader, zoom: r.zoom,
    iu: { n: r.iu.length, on: r.iu.filter(x => x[0] > .5).length, w: r.iu.map(x => x[1])[0] ?? 0, glow: Math.max(0, ...r.iu.map(x => x[2])) },
    firstFrame: r.firstFrameMs, lum: { winCells: win.length, winMean: mean(win), restMean: mean(rest) } };
  if (!r.shader) fails.push(`${preset}: 没有编译出带窗内景的着色器`);
  if (!(r.iu.length > 0)) fails.push(`${preset}: 没有一块材质挂上窗内景补丁`);
  if (!(r.iu.every(x => x[0] > .5) && r.iu.every(x => x[1] > 8))) fails.push(`${preset}: 窗内景没打开（挂上 ${r.iu.length} 块、图集宽 ${r.iu[0]?.[1]}、uGlow ${r.iu[0]?.[2]}）`);
  if (!(win.length > 0 && out[preset].lum.winMean > out[preset].lum.restMean)) fails.push(`${preset}: 夜里窗格不比其余画面亮 ${JSON.stringify(out[preset].lum)}`);
  if (preset === 'phone' && fOn.p50 > 16.67 * 0.5) fails.push(`phone: 一帧 ${fOn.p50} ms，超过 60 fps 预算的一半，低档要降级`);
  console.log(`${preset} 帧时间 off ${fOff.p50} → on ${fOn.p50} ms (+${dp}%, 占 60fps 预算 ${out[preset].frames.budget_pct}%) 窗格 ${win.length} 窗/其余亮度 ${out[preset].lum.winMean}/${out[preset].lum.restMean} iu ${JSON.stringify(out[preset].iu)}`);
}
for (const preset of ['desktop', 'phone']) {                                   // 白天的样张（窗读作反光）：1440 与 375 各一对
  const { P, t } = await open(preset, { night: false });
  await setOn(P, 1); await wait(300);
  const day = await read(P);
  await shot(P.page, path.join(OUT, 'shots'), `${preset}_day_interior`);
  await setOn(P, 0); await wait(300);
  await shot(P.page, path.join(OUT, 'shots'), `${preset}_day_baseline`);
  await P.close();
  out[`${preset}_day`] = { iu: day.iu[0] && { on: day.iu[0][0], w: day.iu[0][1], glow: day.iu[0][2] }, shader: day.shader, firstFrame: t.firstFrameMs };
  if (!(day.iu.length > 0 && day.iu.every(x => x[0] > .5) && day.shader)) fails.push(`${preset} 白天: 窗内景没挂上（${JSON.stringify(day.iu)} shader ${day.shader}）`);
}
const { P: offP } = await open('desktop', { block: true });                // 降级：图集请求 abort，窗退回平光
const off = await read(offP);
await shot(offP.page, path.join(OUT, 'shots'), 'desktop_night_noatlas');
await offP.close();
out.no_atlas = { shader: off.shader, iu: off.iu[0] && { on: off.iu[0][0], w: off.iu[0][1] } };
if (!(off.iu.length > 0 && off.iu.every(x => x[0] < .5) && off.shader)) fails.push(`降级页: 图集没到位时应当是补丁挂着、uIntOn=0、着色器照样编译（实际 ${JSON.stringify(off.iu)} shader ${off.shader}）`);
await closeAll(); srv.stop();
out.pass = fails.length === 0; out.fails = fails;
await writeFile(path.join(OUT, 'frames.json'), JSON.stringify(out, null, 1) + '\n');   // 样张旁边的数据：帧时间 / 亮度格 / 探针读数
console.log(JSON.stringify(out, null, 1));
process.exit(fails.length ? 1 : 0);
