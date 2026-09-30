// Part 3 §2：瓦片后台解码线程的源码（以字符串导出，主线程拿它建 blob: worker）。
// 为什么不是 map/app/dzi-worker.js 这种独立文件：查看器在酒馆里是 srcdoc iframe，<base> 指向 CDN（跨域），
//   new Worker('dzi-worker.js') / new Worker(new URL('./x.mjs', import.meta.url)) 解析出的都是跨域脚本地址，直接抛
//   SecurityError；blob: 地址继承创建者的源，srcdoc / blob / file:// 子页都能起。把源码当字符串随模块带上就不需要额外请求。
// 为什么不是模块 worker：importmap 不会进 worker 域（three 这类裸名解析不了），所以这里自包含、一个 import 都不能有。
// 本串会被 node --check（tools/smoke.sh 的 map/app/*.mjs 覆盖）与 tests/dzi_worker.test.mjs 直接求值，语法错会当场红。
//
// 协议（主线程 → worker）：
//   { op:'tile', id, url }                    → { op:'bitmap', id, bitmap, width, height } | { op:'error', id, message }
//   { op:'cancel', id }
//   { op:'matrices', id, items:[{ tx, ty, tz, rx?, ry?, rz?, s? }], withNormals? }
//     → { op:'matrices', id, count, stride, buffer }（Float32Array，每项 16 或 32 个 float）| { op:'error', id, message }
// 传回的 ImageBitmap 是 transferable；位图的关闭统一在主线程做（瓦片被 OSD 淘汰时 closeTile）。
export const WORKER_SRC = String.raw`
var pending = new Map();   // id -> AbortController

function post(m, transfer) { try { self.postMessage(m, transfer || []); } catch (e) { self.postMessage(m); } }
function fail(id, message) { post({ op: 'error', id: id, message: String(message || 'decode failed') }); }

async function tile(msg) {
  var ac = new AbortController();
  pending.set(msg.id, ac);
  try {
    // credentials: 'omit' 与预热用的 img.crossOrigin='anonymous' 同一份缓存语义（不带凭据，命中同一个 HTTP 缓存条目）
    var res = await fetch(msg.url, { credentials: 'omit', mode: 'cors', signal: ac.signal, cache: 'default' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var blob = await res.blob();
    if (!blob.size) throw new Error('empty response');
    if (pending.get(msg.id) !== ac) return;   // 已被 cancel
    // 解码在后台线程：主线程不再为 decode 卡一帧（拖动时的卡顿就是从这里来的）
    var bitmap = await createImageBitmap(blob);
    if (pending.get(msg.id) !== ac) { if (bitmap.close) bitmap.close(); return; }
    // OffscreenCanvas 兜底：个别平台 createImageBitmap 不认某些编码时，在后台线程画一遍再转出 ImageBitmap
    var bmp = bitmap;
    if (msg.viaCanvas) {
      var oc = new OffscreenCanvas(bitmap.width, bitmap.height);
      var g = oc.getContext('2d');
      g.drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
      bmp = oc.transferToImageBitmap();
    }
    post({ op: 'bitmap', id: msg.id, bitmap: bmp, width: bmp.width, height: bmp.height }, [bmp]);
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // cancel 是正常的，不报错
    fail(msg.id, e && e.message || e);
  } finally {
    if (pending.get(msg.id) === ac) pending.delete(msg.id);
  }
}

function cancel(msg) {
  var ac = pending.get(msg.id);
  if (ac) { pending.delete(msg.id); try { ac.abort(); } catch (e) {} }
}

// 实例矩阵批量生成（静态道具 / 徽章的 matrix buffer）：16 float = 列主序 Matrix4，
// withNormals 时每项 32 float（后半是 normalMatrix 的 16 个 float，省掉主线程的矩阵求逆）
function matrices(msg) {
  try {
    var items = Array.isArray(msg.items) ? msg.items : [];
    var stride = msg.withNormals ? 32 : 16;
    var out = new Float32Array(items.length * stride);
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var s = typeof it.s === 'number' ? it.s : 1;
      var m = compose(it.tx || 0, it.ty || 0, it.tz || 0, it.rx || 0, it.ry || 0, it.rz || 0, s);
      out.set(m, i * stride);
      if (msg.withNormals) out.set(normalFrom(m, s), i * stride + 16);
    }
    post({ op: 'matrices', id: msg.id, count: items.length, stride: stride, buffer: out.buffer }, [out.buffer]);
  } catch (e) { fail(msg.id, e && e.message || e); }
}

// 列主序 4x4：缩放 → 旋转（YXZ，与 three Euler 默认序一致）→ 平移
function compose(tx, ty, tz, rx, ry, rz, s) {
  var cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  var m00 = cy * cz + sy * sx * sz, m01 = -cy * sz + sy * sx * cz, m02 = sy * cx;
  var m10 = cx * sz, m11 = cx * cz, m12 = -sx;
  var m20 = -sy * cz + cy * sx * sz, m21 = sy * sz + cy * sx * cz, m22 = cy * cx;
  return new Float32Array([
    m00 * s, m10 * s, m20 * s, 0,
    m01 * s, m11 * s, m21 * s, 0,
    m02 * s, m12 * s, m22 * s, 0,
    tx, ty, tz, 1,
  ]);
}
// 均匀缩放下的 normalMatrix = 旋转部分（矩阵已含 s，这里按 1/s 还原）
function normalFrom(m, s) {
  var k = s ? 1 / s : 1;
  return new Float32Array([
    m[0] * k, m[1] * k, m[2] * k, 0,
    m[4] * k, m[5] * k, m[6] * k, 0,
    m[8] * k, m[9] * k, m[10] * k, 0,
    0, 0, 0, 1,
  ]);
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.op === 'tile') tile(m);
  else if (m.op === 'cancel') cancel(m);
  else if (m.op === 'matrices') matrices(m);
};
`;
