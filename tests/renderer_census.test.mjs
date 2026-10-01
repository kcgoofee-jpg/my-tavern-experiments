// Part 3 §3：三维渲染上下文的清点（renderer census）——「全仓只有这几处建 WebGL 上下文」的机检护栏。
// 为什么是清点而不是运行时断言：三维页跑在 blob iframe 里（app/subpage3d-host.mjs），node 单测看不到运行时；
// 但只要有人再加一处 new THREE.WebGLRenderer，这里立刻变红，逼他要么复用共享运行时、要么把新地址登记进来并说明理由。
// 同时钉住两件相关事实：OSD 是 Canvas2D（不是 WebGL），庄园 / 三维子页的拆帧（dispose + forceContextLoss）也在这里守着。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/** 登记在册的建上下文地址（改这里必须同时改上面的说明与新地址的理由）：
 *  衣帽间样板间还自己 new（独立页，带 Reflector / 阴影，参数与工厂不同；已显式 stencil:true 拿 24 位深度）；
 *  通用三维页（props/viewer3d.html）与庄园页（estate/main.js，N12 起）都用下面的共享工厂。 */
export const RENDERER_SITES = ['map/estate/closet/main.js'];
export const FACTORY = 'map/three/render-context.mjs';
/** 已经改用共享工厂的页：不许再自己 new（迁移完成时把它并入 FACTORY 的消费者即可） */
export const FACTORY_USERS = ['map/props/viewer3d.html', 'map/estate/main.js'];

/** 全仓扫一遍 new THREE.WebGLRenderer（跳过 node_modules 与 vendor 的 three 自己） */
function scan() {
  const out = [];
  const walk = dir => {
    for (const e of readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true })) {
      const p = dir + e.name;
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === 'vendor') continue; walk(p + '/'); continue; }
      if (!/\.(mjs|js|html)$/.test(e.name)) continue;
      const s = rd(p);
      if (/new\s+THREE\.WebGLRenderer\s*\(/.test(s)) out.push(p);
    }
  };
  walk('map/');
  return out.sort();
}

test('建 WebGL 上下文的地址就是登记这几处（三维页 + 共享工厂；多一处即红）', () => {
  const found = scan();
  assert.deepEqual(found.filter(f => f !== FACTORY), RENDERER_SITES.slice().sort());
  assert.ok(found.includes(FACTORY), '共享工厂存在（它是全仓唯一的上下文来源）');
  for (const f of [...RENDERER_SITES, FACTORY]) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
});

test('宿主侧租约（app/subpage3d-host.mjs）：发新三维租约前先摘旧的，位图转场用完就关', () => {
  const s = rd('map/app/subpage3d-host.mjs');
  assert.match(s, /function release3d\(\)/, '要有显式的租约释放入口');
  assert.match(s, /release3d\(\)/, '开新三维页前先摘掉上一份租约');
  assert.match(s, /v3d:backdrop/, '底图转场消息');
  assert.match(s, /close\?\.\(\)/, 'ImageBitmap 用完要 close（不 close 要等 GC）');
  assert.match(s, /stopTileTo3d\(/, '三维页接管后停止上传底图');
});

test('OSD 是 Canvas2D：查看器里底图不走 WebGL 抽屉（三维才用那唯一的 GL 上下文）', () => {
  const b = rd('map/app/boot.mjs');
  assert.match(b, /drawer:\s*'canvas'/, '底图抽屉必须是 canvas（webgl 抽屉不发 tile-drawn，加载 / 转场 / 预热会全断）');
  assert.doesNotMatch(b, /drawer:\s*'webgl'/);
});

test('庄园 / 三维子页的退出要真拆：dispose + forceContextLoss（上下文是稀缺资源，别留给 GC）', () => {
  const v3d = rd('map/props/viewer3d.html');
  assert.match(v3d, /renderer\.dispose\(\)/);
  assert.match(v3d, /forceContextLoss/);
  const est = rd('map/estate/main.js');
  assert.match(est, /render-context\.mjs/, '庄园页走共享工厂（N12）');
  // 庄园页只靠 iframe 被移除回收：由宿主侧拆帧负责（见 app/subpage3d-host.mjs 的 dropParked / leaveEstate）
  assert.ok(!/renderer\.dispose\(\)/.test(est));
});

test('共享工厂是全仓唯一的上下文来源：改用工厂的页不再自己 new', () => {
  for (const f of FACTORY_USERS) {
    const s = rd(f);
    assert.match(s, /render-context\.mjs/, `${f} 要用共享工厂`);
    assert.doesNotMatch(s, /new\s+THREE\.WebGLRenderer\s*\(/, `${f} 已经在用共享工厂，不该再自己建上下文`);
  }
  for (const f of RENDERER_SITES) if (/engine3d\/render-context\.mjs/.test(rd(f))) assert.doesNotMatch(rd(f), /new\s+THREE\.WebGLRenderer\s*\(/, f);
  assert.match(rd(FACTORY), /new\s+THREE\.WebGLRenderer\(/, '工厂自己负责 new');
  assert.match(rd(FACTORY), /forceContextLoss/, '工厂负责真拆');
});

test('N12：每个 WebGLRenderer 都 stencil:true（WebKit 上 stencil:false = 16 位深度，共面的面逐帧闪）', () => {
  assert.match(rd(FACTORY), /stencil:\s*true/, '工厂建的都带 stencil');
  assert.doesNotMatch(rd(FACTORY), /stencil:\s*false/);
  for (const f of RENDERER_SITES) { const s = rd(f); assert.match(s, /new\s+THREE\.WebGLRenderer\s*\([^)]*stencil:\s*true/, `${f} 自己 new 的也要 stencil:true`); }
  for (const f of [...RENDERER_SITES, ...FACTORY_USERS]) assert.doesNotMatch(rd(f), /stencil:\s*false/, f);
});
