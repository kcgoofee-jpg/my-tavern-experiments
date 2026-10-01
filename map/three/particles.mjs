// LayerRegistry 的 fx 槽位（第 9 槽）：天气 / 以太粒子渲染器（Part 9-2）。
// 两条硬约束：① 一种效果一次 draw call（降水 = 一个 Points，极光 = 一个平面），关掉时开销瞬时归零
// （不 update、不上传 uniform、对象摘出场景）；② 纯数据注册——描述符由本模块产出，交给调用方 register 进
// core/layer-registry.mjs 的 LayerRegistry，本模块不碰 DOM / 存储 / 酒馆全局（机检见 tests/fx_particles.test.mjs）。
// 确定性：粒子出生点用 core/rng.mjs（同一 seed 同一场雨，回放与截图对比站得住）。
import { rng } from '../core/rng.mjs';
import { SLOTS } from '../core/layer-registry.mjs';
import { PRECIP_VS, PRECIP_FS, AURORA_VS, AURORA_FS } from './shaders.mjs';

/** 第 9 槽位（core/layer-registry.mjs SLOTS 的下标 8）：粒子只在自己这个槽里，不抢别的层 */
export const FX_SLOT = 'fx';
export const FX_TYPES = ['none', 'rain', 'snow', 'sand', 'aurora'];

/** 预设：都是「极简、低开销」那一档——没有物理、没有碰撞、没有逐粒子 CPU 更新 */
export const FX_PRESETS = {
  rain: { kind: 'precip', label: '雨', label_en: 'Rain', count: 1400, size: 2.6, speed: 9, wind: [.22, .05], streak: .9,
    color: [.76, .85, .98], opacity: .55, fade: .5, reduced: 'off' },
  snow: { kind: 'precip', label: '雪', label_en: 'Snow', count: 900, size: 3.2, speed: 1.6, wind: [.10, .03], streak: 0,
    color: [1, 1, 1], opacity: .8, fade: 1.2, reduced: 'off' },
  sand: { kind: 'precip', label: '沙尘', label_en: 'Sand', count: 700, size: 4.5, speed: 5.5, wind: [.75, .12], streak: .35,
    color: [.84, .72, .48], opacity: .35, fade: 1.6, reduced: 'off' },
  aurora: { kind: 'aurora', label: '以太极光', label_en: 'Aether aurora', count: 0, bands: 3.5,
    colorA: [.18, .95, .72], colorB: [.55, .35, .95], opacity: .85, fade: 2.4, reduced: 'freeze',
    plane: { size: [220, 90], position: [0, 70, -120] } },
};

const clamp01 = x => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
export const presetOf = t => FX_PRESETS[FX_TYPES.includes(t) ? t : ''] || null;

/**
 * 粒子预算：面积 × 画质档（0 = 一个都不画）。与 core/weather.mjs 的 particleBudget 同口径（封顶防低端机爆掉）。
 * area = w×h / (1280×720)；quality 0~1。
 */
export function fxBudget(type, { quality = 1, area = 1, cap = 3000 } = {}) {
  const p = presetOf(type);
  if (!p || !p.count) return 0;
  const q = clamp01(quality);
  if (!q) return 0;
  return Math.max(0, Math.min(cap, Math.round(p.count * Math.max(0, area) * q)));
}

/** 降水几何：位置 + 随机种子（速度抖动在顶点着色器里用种子算，CPU 不参与） */
function buildPrecipGeometry({ THREE, count, box, seed }) {
  const pos = new Float32Array(count * 3), sd = new Float32Array(count);
  const r = rng(seed || 1);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() * 2 - 1) * box[0];
    pos[i * 3 + 1] = (r() * 2 - 1) * box[1];
    pos[i * 3 + 2] = (r() * 2 - 1) * box[2];
    sd[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  return g;
}

/**
 * createFX({ THREE, scene, box, quality, pixelRatio, reducedMotion, seed })
 * 返回 { setFXType, setIntensity, update, setVisible, setReduced, dispose, describe, object, stats }
 * box = 粒子活动的半尺寸 [x, y, z]（米）；粒子在盒子里回绕，相机怎么动都填得满。
 */
export function createFX({ THREE, scene, box = [60, 40, 60], quality = 1, pixelRatio = 1, reducedMotion = false, seed = 1, area = 1, overrides = null, ortho = false } = {}) {
  if (!THREE || typeof THREE.ShaderMaterial !== 'function') return null;   // 没有 three 就安静退场（不出黑页）
  // 每场景微调（overrides[type] = { size / opacity / plane… }）：大场景（整岛的雨）与小场景（一间房的尘埃）共用同一套预设。
  const presetFor = t => {
    const p = presetOf(t); if (!p) return null;
    const o = overrides?.[t]; if (!o) return p;
    return o.plane ? { ...p, ...o, plane: { ...(p.plane || {}), ...o.plane } } : { ...p, ...o };
  };
  const st = { type: 'none', target: 0, intensity: 0, time: 0, blocked: false, visible: true, reducedMotion: !!reducedMotion, draws: 0, skipped: 0 };
  const group = new THREE.Group(); group.name = 'fx-particles'; group.visible = false;
  scene?.add?.(group);
  let obj = null, mat = null, geo = null, baked = '';

  function release() {
    // 宿主可能把某个效果挂到了别处（主场景把极光挂到相机上当天幕），所以按对象自己的 parent 摘，
    // 不能只调 group.remove —— 那会留下一个已经 dispose 的网格赖在场景里。
    if (obj) { try { (obj.parent || group).remove(obj); } catch (e) {} obj = null; }
    try { geo?.dispose?.(); } catch (e) {}
    try { mat?.dispose?.(); } catch (e) {}
    geo = null; mat = null; baked = '';
  }

  /** 按类型建对象（切类型时才重建，同类型改强度只动 uniform） */
  function build(type) {
    release();
    const p = presetFor(type);
    if (!p) { group.visible = false; return; }
    if (p.kind === 'precip') {
      const count = fxBudget(type, { quality, area });
      if (!count) { group.visible = false; return; }
      geo = buildPrecipGeometry({ THREE, count, box, seed });
      mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSpeed: { value: p.speed }, uSize: { value: p.size }, uPixelRatio: { value: pixelRatio },
          uAtten: { value: ortho ? 0 : 1 },   // 正交相机（主场景）下关掉距离衰减，否则粒子会被距离缩成尘埃
          uBox: { value: new THREE.Vector3(box[0], box[1], box[2]) },
          uWind: { value: new THREE.Vector2(p.wind[0], p.wind[1]) },
          uColor: { value: new THREE.Color(p.color[0], p.color[1], p.color[2]) },
          uOpacity: { value: 0 }, uStreak: { value: p.streak },
        },
        vertexShader: PRECIP_VS, fragmentShader: PRECIP_FS, transparent: true, depthWrite: false,
      });
      obj = new THREE.Points(geo, mat);
      obj.frustumCulled = false;   // 顶点着色器里回绕，CPU 包围盒算不准，别剔除
    } else {
      const pl = p.plane || { size: [200, 80], position: [0, 60, -100] };
      geo = new THREE.PlaneGeometry(pl.size[0], pl.size[1]);
      mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uIntensity: { value: 0 }, uBands: { value: p.bands },
          uColorA: { value: new THREE.Color(p.colorA[0], p.colorA[1], p.colorA[2]) },
          uColorB: { value: new THREE.Color(p.colorB[0], p.colorB[1], p.colorB[2]) },
        },
        vertexShader: AURORA_VS, fragmentShader: AURORA_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(pl.position[0], pl.position[1], pl.position[2]);
    }
    obj.name = `fx-${type}`;
    obj.visible = true;
    group.add(obj);
    baked = type;
  }

  /** setFXType(type, intensity)：剧情 / 宿主事件流驱动。type='none' 或 intensity=0 → 衰减到零后彻底摘掉 */
  function setFXType(type, intensity = 1) {
    let t = FX_TYPES.includes(type) ? type : 'none';
    const p = presetFor(t);
    st.blocked = false;
    if (p && st.reducedMotion && p.reduced === 'off') {   // 减弱动效：飘动类一律不开（只留可冻结的极光）
      t = 'none'; st.blocked = true;
    }
    st.target = t === 'none' ? 0 : clamp01(intensity);
    st.type = t;
    if (t !== 'none' && baked !== t) build(t);   // 同名不重建（改强度只动 uniform）；被衰减摘掉后同名重开也走这里
    return { type: st.type, target: st.target, blocked: st.blocked };
  }

  function setIntensity(v) { st.target = st.type === 'none' ? 0 : clamp01(v); return st.target; }
  function setReduced(v) {
    st.reducedMotion = !!v;
    if (v && presetFor(st.type)?.reduced === 'off') setFXType('none', 0);
    return st.reducedMotion;
  }
  function setVisible(v) {
    st.visible = !!v;
    group.visible = st.visible && st.intensity > .005;
    if (obj) obj.visible = st.visible;   // 对象可能被宿主挂到别处（相机天幕），只改 group 遮不住它
    return group.visible;
  }

  /**
   * 每帧调用：返回 { active, intensity, drawCalls, time, particles }。
   * 关掉（强度衰减到零）之后第一行就返回——不跑 shader、不传 uniform、对象已摘出场景，开销瞬时归零。
   */
  function update(dt) {
    if ((st.type === 'none' || st.target <= 0) && st.intensity <= .005) {
      st.intensity = 0;
      if (obj) { release(); }
      group.visible = false;
      st.skipped++;
      return { type: 'none', active: false, intensity: 0, drawCalls: 0, time: st.time, particles: 0, skipped: true };
    }
    const d = Math.max(0, Math.min(.1, Number(dt) || 0));   // 卡顿 / 切后台回来时不要一次跳一大段
    const p = presetFor(st.type) || presetFor('rain');
    const step = (p?.fade || 1) > 0 ? d / (p.fade || 1) : 1;
    const diff = st.target - st.intensity;
    st.intensity = clamp01(st.intensity + Math.max(-step, Math.min(step, diff)));
    if (st.intensity <= .005 && st.target <= 0) {
      st.type = 'none'; release(); group.visible = false;
      return { type: 'none', active: false, intensity: 0, drawCalls: 0, time: st.time, particles: 0, stopped: true };
    }
    if (!obj && st.type !== 'none') build(st.type);
    if (!(st.reducedMotion && p?.reduced === 'freeze')) st.time += d;   // 减弱动效：极光冻结成静图，不推进时间
    const u = mat?.uniforms || {};
    if (u.uTime) u.uTime.value = st.time;
    if (u.uOpacity) u.uOpacity.value = st.intensity * (p.opacity ?? 1);
    if (u.uIntensity) u.uIntensity.value = st.intensity * (p.opacity ?? 1);
    group.visible = st.visible;
    if (obj) obj.visible = st.visible;
    st.draws++;
    return {
      type: st.type, active: true, intensity: +st.intensity.toFixed(4), time: st.time,
      drawCalls: obj ? 1 : 0, particles: geo?.attributes?.position?.count || 0,
    };
  }

  function dispose() { release(); try { group.parent?.remove(group); } catch (e) {} return true; }

  return {
    object: group,
    setFXType, setIntensity, setReduced, setVisible, update, dispose,
    /** 摘要（上下文预算 / 自检 / 探针）：类型、强度、draw call、粒子数 */
    describe: () => ({ type: st.type, target: +st.target.toFixed(3), intensity: +st.intensity.toFixed(3),
      drawCalls: obj && st.intensity > .005 ? 1 : 0, particles: geo?.attributes?.position?.count || 0,
      active: st.intensity > .005, reducedMotion: st.reducedMotion, blocked: st.blocked }),
    stats: () => ({ ...st, draws: st.draws }),
  };
}

/**
 * fxDescriptor：交给 LayerRegistry 的纯数据描述符（slot = 'fx'，kind = 'canvas'）。
 * mount(ctx) 时把粒子对象挂进 ctx.scene（查看器 / 主场景子页谁挂载谁给场景），ctx.renderer 可选（自绘用）。
 */
export function fxDescriptor({ id = 'particles3d', order = 40, slot = FX_SLOT, kind = 'canvas', engine = null, initialVisible = true } = {}) {
  if (!SLOTS.includes(slot)) throw new Error(`fx: 槽位 ${slot} 不在 SLOTS（${SLOTS.join(' | ')}）`);
  return {
    id, slot, kind, order, initialVisible,
    mount: ctx => {
      if (!engine) return false;
      try { ctx?.scene?.add?.(engine.object); } catch (e) {}
      engine.setVisible(true);
      return true;
    },
    unmount: () => { try { engine?.dispose?.(); } catch (e) {} },
    setVisible: v => { try { engine?.setVisible?.(v); } catch (e) {} },
    describe: () => engine?.describe?.() || { type: 'none' },
  };
}

/** 一步到位：建引擎 + 注册进 fx 槽位。返回 { engine, layer }；没有 registry / three 时返回 { engine: null, layer: null } */
export function registerFX(registry, opts = {}) {
  const engine = createFX(opts);
  if (!engine || !registry?.register) return { engine: null, layer: null };
  const layer = fxDescriptor({ ...opts, engine });
  registry.register(layer);
  return { engine, layer };
}
