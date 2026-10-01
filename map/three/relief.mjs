// Part 9-3：2.5D 浮雕材质（法线 + 视差 + 粗糙度），把 2D 立面贴图在斜视 / 走动时做出微立体。
// 素材来自 map/art/relief/（tools/make_relief_maps.py 生成，清单 relief.json 描述每组的路径与参数），
// 光照来自 daynight.mjs 的环境参数——同一份昼夜状态同时驱动主场景的光与立面的高光，画面才自洽。
// 纯渲染层：THREE 由调用方传进来，本模块不 import three、不碰 DOM / 存储 / 宿主全局。
import { RELIEF_VS, RELIEF_FS, UNIFORM_SETS } from './shaders.mjs';

export const RELIEF_DEFAULTS = { parallax: .05, normalScale: .85, albedo: [.82, .79, .72], useHeight: true, ambient: .35, emissiveScale: .28 };
export { UNIFORM_SETS as RELIEF_UNIFORM_SETS };

/** 1×1 常量贴图兜底：缺图时也绝不出现黑面（采样到常量，而不是未绑定纹理） */
function solidTexture(THREE, rgb) {
  if (typeof THREE?.DataTexture !== 'function') return null;
  const px = new Uint8Array([Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), 255]);
  const t = new THREE.DataTexture(px, 1, 1);
  t.needsUpdate = true;
  return t;
}

/** 清单里的资产组 → { parallax, normalScale, albedo, files: { height, normal, rough } }（路径不写死） */
export function reliefFromManifest(manifest, id) {
  const assets = manifest?.assets || {};
  const key = id || Object.keys(assets)[0];
  const a = assets[key];
  if (!a) return null;
  return { id: key, parallax: a.parallax ?? RELIEF_DEFAULTS.parallax, normalScale: a.normalScale ?? RELIEF_DEFAULTS.normalScale,
    albedo: a.albedo || RELIEF_DEFAULTS.albedo, files: { height: a.height, normal: a.normal, rough: a.rough } };
}

/**
 * createReliefMaterial({ THREE, maps, parallax, normalScale, albedo, useHeight, env })
 * maps = { albedo, normal, rough, height }（THREE.Texture；缺 normal / rough 时用 1×1 常量兜底）
 * 返回 ShaderMaterial；env 给了就顺手写一次光照（等价于 create + update）。
 */
export function createReliefMaterial({ THREE, maps = {}, parallax, normalScale, albedo, useHeight, env } = {}) {
  if (!THREE || typeof THREE.ShaderMaterial !== 'function') return null;
  const alb = albedo || RELIEF_DEFAULTS.albedo;
  const hasHeight = !!maps.height && useHeight !== false;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAlbedo: { value: maps.albedo || solidTexture(THREE, alb) },
      uNormal: { value: maps.normal || solidTexture(THREE, [.5, .5, 1]) },
      uRough: { value: maps.rough || solidTexture(THREE, [.85, .85, .85]) },
      uHeight: { value: maps.height || solidTexture(THREE, [.5, .5, .5]) },
      uUseHeight: { value: hasHeight ? 1 : 0 },
      uParallax: { value: parallax ?? RELIEF_DEFAULTS.parallax },
      uNormalScale: { value: normalScale ?? RELIEF_DEFAULTS.normalScale },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightColor: { value: new THREE.Color(1, .98, .94) },
      uAmbientColor: { value: new THREE.Color(.8, .8, .8) },
      uAmbient: { value: RELIEF_DEFAULTS.ambient },
      uEmissive: { value: 0 },
    },
    vertexShader: RELIEF_VS, fragmentShader: RELIEF_FS,
  });
  if (env) updateRelief(material, env);
  return material;
}

/** 每帧（或每个世界时钟节拍）把昼夜环境写进材质；缺 uniform 就跳过 */
export function updateRelief(material, env, opts = {}) {
  const u = material?.uniforms;
  if (!u?.uLightDir || !env) return 0;
  let n = 0;
  const d = env.sun?.dir || [0, 1, 0], c = env.sun?.color || [1, 1, 1], sky = env.ambient?.sky || [.8, .8, .8];
  const li = Number.isFinite(env.sun?.intensity) ? env.sun.intensity : 1;
  if (u.uLightDir.value?.set) { u.uLightDir.value.set(d[0], d[1], d[2]); n++; }
  if (u.uLightColor.value?.setRGB) { u.uLightColor.value.setRGB(c[0] * li, c[1] * li, c[2] * li); n++; }
  if (u.uAmbientColor.value?.setRGB) { u.uAmbientColor.value.setRGB(sky[0], sky[1], sky[2]); n++; }
  if (u.uAmbient) { u.uAmbient.value = (opts.ambient ?? RELIEF_DEFAULTS.ambient) + (env.ambient?.intensity ?? 0) * .3; n++; }
  if (u.uEmissive) { u.uEmissive.value = (env.emissive ?? 0) * (opts.emissiveScale ?? RELIEF_DEFAULTS.emissiveScale); n++; }
  return n;
}

/** 摘要（探针 / 自检）：当前材质参数 + 光照方向 */
export function describe(material) {
  const u = material?.uniforms;
  if (!u) return null;
  const v = u.uLightDir?.value || { x: 0, y: 0, z: 0 };
  return { parallax: +(u.uParallax?.value ?? 0).toFixed(4), normalScale: +(u.uNormalScale?.value ?? 0).toFixed(3),
    useHeight: !!u.uUseHeight?.value, ambient: +(u.uAmbient?.value ?? 0).toFixed(3), emissive: +(u.uEmissive?.value ?? 0).toFixed(3),
    lightDir: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)], uniforms: Object.keys(u).length };
}
