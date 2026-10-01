// Part 3 §2：瓦片后台解码的查看器侧客户端（懒加载，接 app/dzi-worker-src.mjs 里的源码串）。
// 为什么不直接 new Worker(url)：查看器在酒馆里是 srcdoc iframe，<base> 指向 CDN（跨域），跨域脚本 URL 建 worker 抛
// SecurityError；blob: 地址继承创建者的源，srcdoc / file:// / blob 子页都能起。所以源码随模块走，起 worker 时用 blob。
// 拿不到 Worker / createImageBitmap、或者解码失败 → 一律退回 OpenSeadragon 原来的 new Image() 路径
// （installWorkerTiles 里留着原实现兜底），不让它变成「瓦片永远加载不出来」。
import { viewer } from './state.mjs';
import { WORKER_SRC } from './dzi-worker-src.mjs';

export const DECODE_TIMEOUT_MS = 20000;
export const FAIL_LIMIT = 6;   // 连续失败这么多次就整个会话关掉后台解码（不让它变成「瓦片越来越慢」）

export let state = { mode: 'idle', source: '', spawned: 0, decoded: 0, failed: 0, canceled: 0, closed: 0, disabled: false, trimmed: 0 };

let workerP = null, worker = null, seq = 0, ready = false, fails = 0;

/** 连续失败计数：成功一次就清零，到上限整会话停用（调用方此后一律走原路径） */
function noteFail() {
  if (++fails >= FAIL_LIMIT) { state.disabled = true; state.mode = 'disabled'; kill(); }
  return state.disabled;
}
function noteOk() { fails = 0; }

/** 浏览器能力：Worker + createImageBitmap（OffscreenCanvas 只在 worker 的兜底分支里用，不强求） */
function supported() {
  try { return typeof Worker === 'function' && typeof createImageBitmap === 'function'; } catch (e) { return false; }
}
const jobs = new Map();      // id -> { job, bitmap, done }
const seen = new WeakSet();  // 已包过的瓦片源（不重复包）

const reset = () => { state = { mode: 'idle', source: '', spawned: 0, decoded: 0, failed: 0, canceled: 0, closed: 0, disabled: false, trimmed: 0 }; fails = 0; };

/** 建 worker（幂等）：源码串 → blob → 经典 worker。任何一步失败都退回原路径 */
export function ensureWorker() {
  if (worker) return Promise.resolve(worker);
  if (workerP) return workerP;
  if (!supported()) { state.mode = 'unsupported'; return Promise.resolve(null); }
  workerP = (async () => {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(url);   // 经典 worker：自包含，不用 importmap
      URL.revokeObjectURL(url);
      state.spawned++;
      worker.onmessage = e => onMsg(e.data || {});
      worker.onerror = () => kill();
      ready = true; state.mode = 'ready';
      return worker;
    } catch (e) { state.mode = 'fallback'; state.source = String(e && e.message || e); return null; }
  })();
  return workerP;
}

function onMsg(m) {
  const rec = jobs.get(m.id);
  if (!rec) { if (m.bitmap && m.bitmap.close) { try { m.bitmap.close(); } catch (e) {} } return; }
  rec.done = true;
  clearTimeout(rec.timer);
  if (m.op === 'bitmap') {
    rec.bitmap = m.bitmap; state.decoded++; noteOk();
    // ImageBitmap 不 transfer 给 OSD 之外的第二份持有者：位图的关闭统一由 closeTile 做（双份释放会抛）
    rec.job.finish(m.bitmap, null, undefined);
  } else if (m.op === 'matrices') {
    state.decoded++; noteOk(); jobs.delete(m.id); rec.resolve?.({ count: m.count, stride: m.stride, buffer: m.buffer });
  } else {   // error：交给 OSD 原路径的错误处理（tile-load-failed 照常走 app/sharpness-tiers.mjs）
    jobs.delete(m.id); state.failed++; noteFail();
    rec.job.finish(null, null, m.message || 'worker decode failed');
  }
}

/** 请求一张瓦片；返回是否交给 worker（false = 调用方用原路径） */
export async function decodeTile(job) {
  if (state.disabled) return false;
  const w = await ensureWorker();
  if (!w || !job) return false;
  const id = ++seq;
  const rec = { job, timer: 0 };
  rec.timer = setTimeout(() => {
    if (!jobs.has(id)) return;
    jobs.delete(id); state.failed++; noteFail();
    try { w.postMessage({ op: 'cancel', id }); } catch (e) {}
    job.finish(null, null, 'worker timeout');
  }, DECODE_TIMEOUT_MS);
  jobs.set(id, rec);
  try { w.postMessage({ op: 'tile', id, url: job.src }); }
  catch (e) { clearTimeout(rec.timer); jobs.delete(id); state.failed++; noteFail(); return false; }
  return true;
}

export function cancelTile(job) {
  for (const [id, rec] of jobs) if (rec.job === job) {
    jobs.delete(id); clearTimeout(rec.timer); state.canceled++;
    // 位图不在这里 close：已经 finish 的瓦片由 closeTile（缓存淘汰）统一关，在途的还没有位图
    if (rec.bitmap) closeTile({ _data: rec.bitmap });
    try { worker?.postMessage({ op: 'cancel', id }); } catch (e) {}
    return true;
  }
  return false;
}

/** 瓦片被 OSD 的缓存淘汰 / 取消：close 掉 ImageBitmap（不 close 要等 GC，手机上是快与进程被杀的区别） */
export function closeTile(tile) {
  const b = tile && tile._data;
  if (b && typeof b.close === 'function') { try { b.close(); state.closed++; return true; } catch (e) {} }
  return false;
}

/** 静态实例的 matrix buffer（GPU 端更新位置 / 缩放用）；不支持时返回 null，调用方走主线程 */
export async function instanceMatrices(items, { withNormals = false } = {}) {
  const w = await ensureWorker();
  if (!w || !Array.isArray(items) || !items.length) return null;
  const id = ++seq;
  return new Promise(res => {
    const rec = { resolve: res, timer: setTimeout(() => { jobs.delete(id); state.failed++; res(null); }, DECODE_TIMEOUT_MS) };
    jobs.set(id, rec);
    try { w.postMessage({ op: 'matrices', id, items, withNormals }); } catch (e) { clearTimeout(rec.timer); jobs.delete(id); res(null); }
  });
}

function kill() {
  ready = false;
  for (const [, rec] of jobs) {
    clearTimeout(rec.timer);
    if (rec.bitmap && rec.bitmap.close) { try { rec.bitmap.close(); state.closed++; } catch (e) {} }
    try { rec.job?.finish?.(null, null, 'worker lost'); } catch (e) {}
  }
  jobs.clear();
  try { worker?.terminate(); } catch (e) {}
  worker = null; workerP = null;
}

export function disposeWorker() { kill(); reset(); jobs.clear(); }

/**
 * 把 worker 解码接到 OpenSeadragon：覆写瓦片源的 downloadTileStart / downloadTileAbort / destroyTileCache。
 * 只包一层——OSD 的 addJob / finish 回调与 tile-loaded / tile-load-failed / _tilesLoading 全部照旧，
 * 所以 app/sharpness-tiers.mjs 的进度与「卡住了？重试」不受影响。任何一个钩子缺失 / worker 不可用 → 原路径（new Image）。
 */
export function installWorkerTiles(v = viewer) {
  const patch = src => {
    if (!src || seen.has(src)) return false;
    if (typeof src.downloadTileStart !== 'function' || typeof src.downloadTileAbort !== 'function') return false;
    seen.add(src);
    const orig = { start: src.downloadTileStart, abort: src.downloadTileAbort, destroy: src.destroyTileCache };
    src.downloadTileStart = async function (job) {
      try { if (await decodeTile(job)) return; } catch (e) {}
      orig.start.call(this, job);   // worker 不可用 / 解码失败 → 原 new Image() 路径
    };
    src.downloadTileAbort = function (job) { if (!cancelTile(job)) orig.abort.call(this, job); };
    src.destroyTileCache = function (tile) { closeTile(tile); if (typeof orig.destroy === 'function') orig.destroy.call(this, tile); else if (tile) tile._data = null; };
    return true;
  };
  const scan = () => {
    if (!v?.world?.getItemCount?.()) return 0;
    let n = 0;
    for (let i = 0; i < v.world.getItemCount(); i++) { const it = v.world.getItemAt(i); if (patch(it?.source)) n++; }
    return n;
  };
  let patched = scan();
  if (patched) state.mode = state.mode === 'idle' ? 'installed' : state.mode;
  try { v?.addHandler?.('add-item', e => { if (patch(e?.item?.source)) patched++; }); } catch (e) {}
  return patched;
}

/**
 * 收紧 / 放宽 OSD 解码瓦片缓存（Part 3 §5：三维页报「吃紧」时调用）。
 * OSD 的缓存按张数算（maxImageCacheCount 在建 TileCache 时就固定了），所以这里直接从最大的那层开始
 * unload 到目标张数为止——被摘的瓦片若是我们自己解码的 ImageBitmap，destroyTileCache 会 close 掉。
 */
export function trimTileCache(maxTiles, v = viewer) {
  const n = Math.max(4, maxTiles | 0);
  const cache = v?.tileCache || v?._tileCache;
  const list = cache?._tilesLoaded;
  if (!Array.isArray(list)) return 0;
  let cut = 0;
  for (let i = list.length - 1; i >= 0 && list.length > n; i--) {
    const rec = list[i];
    if (!rec || rec.tile?.beingDrawn) continue;
    try { cache._unloadTile(rec); cut++; } catch (e) { break; }
  }
  state.trimmed += cut;
  return cut;
}

/** 调试 / 自检窗口面（tools/browser/* 与 tests 用） */
export function describeWorker() {
  return { ...state, pending: jobs.size, ready: ready && !!worker, fails, sourceBytes: WORKER_SRC.length };
}

window.TCTileWorker = {
  ensureWorker, decodeTile, cancelTile, closeTile, instanceMatrices, installWorkerTiles, trimTileCache, disposeWorker, describe: describeWorker,
};
