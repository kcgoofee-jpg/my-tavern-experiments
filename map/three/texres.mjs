// Part 3 §5：贴图资源（KTX2 / Basis 备选加载 + 显存预算的取数）。
//   - 能力探测：有没有哪种压缩格式可用（ASTC / ETC2 / BC / PVRTC / BPTC）；没有就继续用现在的 WebP 贴图
//   - KTX2Loader：只在真的能用且转码器在位时才挂到 GLTFLoader 上（转码器 404 / 探测不支持 → 原路径，绝不出现黑页）
//   - 预算取数：把 renderer.info.memory（几何 / 贴图数）与贴图尺寸估成字节，交给 core/graphics-budget.mjs 决策
// 本模块不 import three / KTX2Loader：都由调用方传进来（子页的 importmap 各自解析；本模块可在 node 里测）。

/** 探测压缩贴图能力（WebGL2 下 ETC1 不可用是 three 的既有结论） */
export function detect({ renderer, isWebGL2 = true } = {}) {
  const has = k => { try { return !!renderer?.extensions?.has?.(k); } catch (e) { return false; } };
  const caps = {
    astc: has('WEBGL_compressed_texture_astc'),
    etc2: has('WEBGL_compressed_texture_etc'),
    dxt: has('WEBGL_compressed_texture_s3tc'),
    bptc: has('EXT_texture_compression_bptc'),
    pvrtc: has('WEBGL_compressed_texture_pvrtc') || has('WEBKIT_WEBGL_compressed_texture_pvrtc'),
    etc1: !isWebGL2 && has('WEBGL_compressed_texture_etc1'),
  };
  caps.any = Object.values(caps).some(Boolean);
  return caps;
}

/**
 * 建资源管理器：{ caps, attach(loader), budgetBytes(), resources(), dispose() }
 * opts: { renderer, THREE, KTX2Loader, transcoderPath, isWebGL2, enableKtx2 }
 */
export function createTexRes(opts = {}) {
  const { renderer, THREE, KTX2Loader, transcoderPath = '', isWebGL2 = true, enableKtx2 = true } = opts;
  const caps = detect({ renderer, isWebGL2 });
  let ktx2 = null, ktx2State = 'off';
  const textures = new Map();   // texture -> bytes

  /** 挂 KTX2：能用且拿到了转码器才挂；任何一步失败都回到原贴图路径 */
  async function attach(loader) {
    if (!enableKtx2 || !caps.any || !KTX2Loader || !transcoderPath || !loader) { ktx2State = 'off'; return false; }
    try {
      if (!ktx2) {
        ktx2 = new KTX2Loader().setTranscoderPath(transcoderPath).detectSupport(renderer);
        await ktx2.init?.();
      }
      loader.setKTX2Loader?.(ktx2);
      ktx2State = 'on';
      return true;
    } catch (e) { ktx2State = 'fallback'; return false; }
  }

  /** 记一张贴图（换模型时重记；bytes 由 core/graphics-budget.mjs 的估算给出） */
  function track(texture, bytes) {
    if (!texture) return 0;
    textures.set(texture, Math.max(0, bytes | 0));
    return bytes | 0;
  }
  /** 场景里的贴图与几何一起估成字节清单（交给 budget.plan 排序淘汰） */
  function resources(root, { estimateTexture, estimateGeometry, kindOf } = {}) {
    const out = [];
    if (!root) return out;
    root.traverse?.(o => {
      if (o.isInstancedMesh || o.isMesh) {
        const kind = typeof kindOf === 'function' ? kindOf(o) : (o.userData?.detail || 'mid');
        const texBytes = (() => { const t = o.material?.map; if (!t) return 0; const b = textures.get(t) ?? (estimateTexture ? estimateTexture({ width: t.image?.width, height: t.image?.height, compressed: !!t.isCompressedTexture, depth: t.isCompressedTexture ? 1 : 4 }) : 0); return b; })();
        const geoBytes = estimateGeometry ? estimateGeometry({ attributes: Object.values(o.geometry?.attributes || {}).map(a => ({ count: a.count, itemSize: a.itemSize })), index: o.geometry?.index ? { count: o.geometry.index.count } : null }) : 0;
        out.push({ id: o.name || o.uuid, kind, bytes: texBytes + geoBytes, state: kind, active: true, lastUsed: 0 });
      }
    });
    return out;
  }

  /** 释放一棵子树的 GPU 资源（几何 / 材质 / 贴图）；返回释放的贴图数 */
  function disposeTree(root) {
    let n = 0;
    if (!root) return n;
    root.traverse?.(o => {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) { try { m.map.dispose?.(); } catch (e) {} if (textures.delete(m.map)) n++; }
        try { m.dispose(); } catch (e) {}
      }
    });
    return n;
  }

  const st = () => ({ ktx2: ktx2State, caps, tracked: textures.size, textures: renderer?.info?.memory?.textures || 0, geometries: renderer?.info?.memory?.geometries || 0 });
  return {
    caps, attach, track, resources, disposeTree, stats: st,
    dispose() { try { ktx2?.dispose?.(); } catch (e) {} ktx2 = null; ktx2State = 'off'; textures.clear(); },
    get mode() { return ktx2State; },
  };
}
