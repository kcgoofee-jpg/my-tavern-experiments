// Part 3 §2：瓦片解码 / 实例矩阵两条线程侧的测试。
//   1) map/app/dzi-worker-src.mjs 里的源码串：在 node 里用假的 worker 作用域直接求值
//      （真跑 fetch / createImageBitmap / AbortController），验解码成功、取消、矩阵列主序与缩放；
//   2) map/app/dzi-worker.mjs：假 Worker + 假瓦片作业，验成功 / 失败 / 取消 / 连续失败停用、
//      ImageBitmap 关闭、OSD 三个钩子覆写后失败自动回原路径，以及 OSD 5.0.1 这几个内部 API 还在（版本一变就红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { WORKER_SRC } from '../map/app/dzi-worker-src.mjs';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const stripComments = s => s.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');

function fakeWorkerScope({ fetchImpl, createImageBitmapImpl = async b => ({ width: 8, height: 8, blob: b }) } = {}) {
  const posted = [];
  const scope = {
    postMessage: (m, t) => posted.push({ m, transfer: t }),
    onmessage: null,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, blob: async () => ({ size: 4 }) })),
    createImageBitmap: createImageBitmapImpl,
    AbortController,
    OffscreenCanvas: undefined,
  };
  scope.self = scope;
  vm.createContext(scope);
  vm.runInContext(WORKER_SRC, scope);   // 源码串就是线程里跑的那一份，不再另外 fetch
  return { scope, posted };
}

const msg = (scope, m) => { scope.onmessage({ data: m }); return new Promise(r => setTimeout(r, 0)); };

test('worker 解码：fetch → createImageBitmap → 回传可转移的 ImageBitmap', async () => {
  let seenUrl = null, seenCred = null;
  const { scope, posted } = fakeWorkerScope({
    fetchImpl: async (url, opt) => { seenUrl = url; seenCred = opt.credentials; return { ok: true, status: 200, blob: async () => ({ size: 10 }) }; },
  });
  await msg(scope, { op: 'tile', id: 7, url: 'https://cdn/x/1/0_0.jpg' });
  assert.equal(seenUrl, 'https://cdn/x/1/0_0.jpg');
  assert.equal(seenCred, 'omit', '与预热用的 img.crossOrigin 同一份缓存语义（不带凭据）');
  const out = posted.at(-1);
  assert.equal(out.m.op, 'bitmap'); assert.equal(out.m.id, 7);
  assert.equal(out.transfer.length, 1);
  assert.equal(out.transfer[0], out.m.bitmap, 'ImageBitmap 走 transfer，不拷贝像素');
  assert.equal(out.m.width, 8);
});

test('worker 解码：HTTP 失败 / 空响应 / 解码失败都回 error，不抛到线程外', async () => {
  for (const [name, impl] of [
    ['HTTP 404', async () => ({ ok: false, status: 404 })],
    ['空响应', async () => ({ ok: true, status: 200, blob: async () => ({ size: 0 }) })],
    ['解码抛错', async () => { throw new Error('decode boom'); }],
  ]) {
    const { scope, posted } = fakeWorkerScope({ fetchImpl: impl });
    await msg(scope, { op: 'tile', id: 1, url: 'u' });
    assert.equal(posted.at(-1).m.op, 'error', name);
    assert.match(posted.at(-1).m.message, /404|empty|boom/, name);
  }
});

test('worker 取消：cancel 之后迟到的解码结果不再回传（镜头飞走的瓦片）', async () => {
  let release = null;
  const gate = new Promise(r => { release = r; });
  const { scope, posted } = fakeWorkerScope({ fetchImpl: async () => { await gate; return { ok: true, blob: async () => ({ size: 4 }) }; } });
  msg(scope, { op: 'tile', id: 3, url: 'u' });
  await msg(scope, { op: 'cancel', id: 3 });
  release();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(posted.length, 0, '取消后既不回 bitmap 也不回 error');
});

test('worker 矩阵：列主序 4x4，缩放只动左上 3x3、平移在第 4 列（与 three Matrix4.compose 同形）', async () => {
  const { scope, posted } = fakeWorkerScope();
  await msg(scope, { op: 'matrices', id: 5, items: [{ tx: 1, ty: 2, tz: 3, s: 2 }, { tx: 0, ty: 0, tz: 0, ry: Math.PI / 2, s: 1 }] });
  const m = posted.at(-1).m;
  assert.equal(m.op, 'matrices'); assert.equal(m.count, 2); assert.equal(m.stride, 16);
  assert.equal(m.buffer.byteLength, 2 * 16 * 4);
  const a = new Float32Array(m.buffer);
  assert.deepEqual([...a.slice(0, 4)], [2, 0, 0, 0], '缩放在对角');
  assert.deepEqual([...a.slice(12, 16)], [1, 2, 3, 1], '平移在最后一列');
  const b = [...a.slice(16, 32)];   // 绕 Y 转 90°：第一列 = (sin, 0, cos) 方向，与 three Matrix4.makeRotationY 同符号
  assert.ok(Math.abs(b[0] - 0) < 1e-6 && Math.abs(b[2] + 1) < 1e-6, `绕 Y 90° 的第一列 ≈ (0,0,-1)，实际 ${b.slice(0, 3)}`);
  const { scope: s2, posted: p2 } = fakeWorkerScope();
  await msg(s2, { op: 'matrices', id: 6, items: [{ tx: 0, ty: 0, tz: 0, s: 2 }], withNormals: true });
  assert.equal(p2.at(-1).m.stride, 32);
  const n = new Float32Array(p2.at(-1).m.buffer).slice(16, 32);
  assert.equal(n[0], 1, '均匀缩放 s 下 normalMatrix = 旋转部分（矩阵已含 s，再乘 1/s）');
  assert.equal(n[15], 1);
});

// ---------------- 客户端（app/dzi-worker.mjs）----------------
function fakeWorkerClass() {
  const sent = [];
  const inst = { onmessage: null, onerror: null, postMessage: m => sent.push(m), terminate() { inst.dead = true; } };
  return { sent, inst, Ctor: class { constructor() { return inst; } } };
}
async function loadClient(g = {}) {
  const prev = {};
  const set = (k, v) => { prev[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
  const unset = k => { prev[k] = Object.getOwnPropertyDescriptor(globalThis, k); try { delete globalThis[k]; } catch (e) {} };
  set('window', g.window || {});
  set('document', { baseURI: 'https://cdn.test/map/' });
  if (g.Worker === undefined) unset('Worker'); else set('Worker', g.Worker);
  if (g.createImageBitmap === undefined) unset('createImageBitmap'); else set('createImageBitmap', g.createImageBitmap);
  set('fetch', g.fetch || (async () => ({ ok: true, status: 200, text: async () => 'WORKER' })));
  set('URL', URL); set('Blob', Blob);
  // 每次用新的查询串：模块级状态（jobs / worker / 计数）每个用例都是干净的
  const mod = await import('../map/app/dzi-worker.mjs?t=' + Math.random());
  return { mod, restore: () => { for (const [k, d] of Object.entries(prev)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]; } };
}
const jobStub = () => { const j = { src: 'https://cdn/t.jpg', calls: [], finish(...a) { j.calls.push(a); } }; return j; };

test('客户端：拿不到 Worker / OffscreenCanvas 时不建线程，decodeTile 返回 false（调用方走原路径）', async () => {
  const { mod, restore } = await loadClient({ Worker: undefined });
  try {
    assert.equal(await mod.ensureWorker(), null);
    assert.equal(mod.describeWorker().mode, 'unsupported');
    assert.equal(await mod.decodeTile(jobStub()), false);
  } finally { mod.disposeWorker(); restore(); }
});

test('客户端：解码成功 → job.finish(bitmap)；解码失败 → finish(null,null,msg)', async () => {
  const fw = fakeWorkerClass();
  const { mod, restore } = await loadClient({ Worker: fw.Ctor, createImageBitmap: async () => ({}) });
  try {
    const j = jobStub();
    assert.equal(await mod.decodeTile(j), true);
    const bitmap = { close() {} };
    fw.inst.onmessage({ data: { op: 'bitmap', id: 1, bitmap } });
    assert.equal(j.calls.at(-1)[0], bitmap, '位图原样交给 OSD 的 finish');
    assert.equal(j.calls.at(-1)[1], null);
    assert.equal(mod.describeWorker().decoded, 1);

    const j2 = jobStub();
    await mod.decodeTile(j2);
    fw.inst.onmessage({ data: { op: 'error', id: 2, message: 'boom' } });
    assert.equal(j2.calls.at(-1)[2], 'boom');
    assert.equal(mod.describeWorker().failed, 1);
  } finally { mod.disposeWorker(); restore(); }
});

test('客户端：源码串随模块走，不额外发请求就能起线程（srcdoc 下 fetch 源码是跨域）', async () => {
  let fetches = 0;
  const fw = fakeWorkerClass();
  const { mod, restore } = await loadClient({ Worker: fw.Ctor, createImageBitmap: async () => ({}), fetch: async () => { fetches++; return { ok: false, status: 500 }; } });
  try {
    const w = await mod.ensureWorker();
    assert.equal(w, fw.inst, 'worker 建起来了');
    assert.equal(mod.describeWorker().mode, 'ready');
    assert.equal(fetches, 0, '不靠 fetch 拿源码');
    assert.ok(mod.describeWorker().sourceBytes > 500, '源码串非空');
    const j = jobStub();
    assert.equal(await mod.decodeTile(j), true);
    assert.deepEqual(fw.sent.at(-1), { op: 'tile', id: 1, url: j.src });
  } finally { mod.disposeWorker(); restore(); }
});

test('客户端：连续失败到上限 → 整个会话停用后台解码（不让它越用越慢）', async () => {
  const fw = fakeWorkerClass();
  const { mod, restore } = await loadClient({ Worker: fw.Ctor, createImageBitmap: async () => ({}) });
  try {
    for (let i = 0; i < mod.FAIL_LIMIT; i++) {
      const j = jobStub();
      await mod.decodeTile(j);
      fw.inst.onmessage({ data: { op: 'error', id: i + 1, message: 'nope' } });
    }
    const d = mod.describeWorker();
    assert.equal(d.disabled, true);
    assert.equal(d.mode, 'disabled');
    assert.equal(await mod.decodeTile(jobStub()), false, '停用后一律走原路径');
  } finally { mod.disposeWorker(); restore(); }
});

test('客户端：一次成功把连续失败计数清零（偶发失败不停用）', async () => {
  const fw = fakeWorkerClass();
  const { mod, restore } = await loadClient({ Worker: fw.Ctor, createImageBitmap: async () => ({}) });
  try {
    for (let i = 0; i < mod.FAIL_LIMIT - 1; i++) {
      const j = jobStub(); await mod.decodeTile(j);
      fw.inst.onmessage({ data: { op: 'error', id: i + 1, message: 'nope' } });
    }
    const ok = jobStub(); await mod.decodeTile(ok);
    fw.inst.onmessage({ data: { op: 'bitmap', id: fw.sent.at(-1).id, bitmap: { close() {} } } });
    assert.equal(mod.describeWorker().disabled, false);
    assert.equal(mod.describeWorker().fails, 0);
  } finally { mod.disposeWorker(); restore(); }
});

test('客户端：淘汰时 close 掉 ImageBitmap；取消只撤在途请求（不 close 位图，避免和淘汰重复释放）', async () => {
  const fw = fakeWorkerClass();
  const { mod, restore } = await loadClient({ Worker: fw.Ctor, createImageBitmap: async () => ({}) });
  try {
    const j = jobStub();
    await mod.decodeTile(j);
    let closed = 0;
    const bitmap = { close() { closed++; } };
    fw.inst.onmessage({ data: { op: 'bitmap', id: 1, bitmap } });
    assert.equal(mod.closeTile({ _data: null }), false, '没有位图不硬 close');
    assert.equal(mod.closeTile({ _data: bitmap }), true);
    assert.equal(closed, 1);

    const j2 = jobStub();
    await mod.decodeTile(j2);
    assert.equal(mod.cancelTile(j2), true, '在途的作业：撤掉 worker 请求');
    assert.deepEqual(fw.sent.at(-1), { op: 'cancel', id: 2 });
    assert.equal(closed, 1, '在途的还没有位图，不 close');
    assert.equal(mod.cancelTile(jobStub()), false, '没在解码的作业 → 调用方退回原路径');
    assert.equal(mod.describeWorker().canceled, 1);
  } finally { mod.disposeWorker(); restore(); }
});

test('客户端：OSD 三个钩子覆写——worker 不可用时逐条退回原实现', async () => {
  const { mod, restore } = await loadClient({ Worker: undefined });
  try {
    const calls = [];
    const src = {
      downloadTileStart(j) { calls.push(['start', j]); },
      downloadTileAbort(j) { calls.push(['abort', j]); },
      destroyTileCache(t) { calls.push(['destroy', t]); t._data = null; },
    };
    const v = { world: { getItemCount: () => 1, getItemAt: () => ({ source: src }) }, addHandler: () => {} };
    assert.equal(mod.installWorkerTiles(v), 1);
    const j = jobStub();
    await src.downloadTileStart(j);
    assert.equal(calls.at(-1)?.[0], 'start', 'worker 不可用 → 原 new Image() 路径');
    assert.equal(calls.at(-1)?.[1], j);
    src.downloadTileAbort(j);
    assert.deepEqual(calls.at(-1), ['abort', j]);
    const t = { _data: { close() {} } };
    src.destroyTileCache(t);
    assert.deepEqual(calls.at(-1), ['destroy', t]);
    assert.equal(t._data, null, '原 destroyTileCache 照旧执行');
    assert.equal(mod.installWorkerTiles(v), 0, '同一个源不重复包');
  } finally { mod.disposeWorker(); restore(); }
});

test('OSD 5.0.1 内部契约还在（downloadTileStart / downloadTileAbort / finish / 瓦片缓存三件套）', () => {
  const s = rd('map/vendor/openseadragon/openseadragon.min.js');
  for (const k of ['downloadTileStart:', 'downloadTileAbort:', 'createTileCache:', 'destroyTileCache:', 'getTileCacheDataAsImage:', 'getTileCacheDataAsContext2D:', 'userData.image'])
    assert.ok(s.includes(k), `OSD 内部 API 缺失：${k}（升级 OSD 时要重看 Part 3 §2 的接法）`);
  assert.ok(s.includes('finish('), 'job.finish 回调消失的话瓦片永远加载不完');
});

test('worker 源码不碰 DOM / 裸名 import（经典 worker，自包含）', () => {
  assert.doesNotMatch(stripComments(WORKER_SRC), /[^.\w]document\./, 'worker 里没有 document');
  assert.doesNotMatch(stripComments(WORKER_SRC), /\bwindow\b/, 'worker 里没有 window');
  assert.doesNotMatch(WORKER_SRC, /\bimport\s+[\w{*]/, '不许用模块 import（importmap 不进 worker 域）');
  assert.doesNotMatch(WORKER_SRC, /importScripts\(/, '不需要 importScripts：源码自包含');
  assert.match(WORKER_SRC, /self\.onmessage/);
  assert.match(WORKER_SRC, /createImageBitmap\(/);
});
