// 夜里的烘焙外观（ESTATE-MODES-1 A4 / A5 / D38）：整岛外观烘焙了一个黄金时刻的日光，昼夜调色（daynight.mjs 的 applyGrade）
// 只会整体压暗提色，烘焙进贴图 / 顶点色的长影子和受光面在深夜里原样留着。夜里把「太阳落掉」：每块烘焙面
// 向它自己的平均色提（长影子与受光面对比抹平），夜调再乘上去就是一片平的月光 / 环境光。黄昏轻轻压一半，
// 清晨 / 正午不动（那本来就是烘焙的那盏光）。
// 窗光：夜里该亮的是窗，不是整片外壳——只有清单点名的窗 / 玻璃材质（x-night-glow，包数据）夜里加一层暖光，
// 按世界坐标分格哈希：每层亮度略有差别、约两成的窗暗着，所以读起来是一栋夜里零散亮着窗的楼，不是一块发光贴片。
// 只有材质补丁，不加灯（外面不飘灯）；THREE 由调用方传入。
import { smoothstep } from './daynight.mjs';

/** 环境参数 → 抹平强度：emissive 是 daynight 的「夜的程度」（夜 1 / 黄昏 .55 / 清晨 .35 / 正午 0），
 *  smoothstep 的一参版是「归一化输入」，所以这里先把 0.42…0.8 这段窗口折成 0…1 再插值 */
export function nightOf(env) {
  return smoothstep(((Number(env?.emissive) || 0) - 0.42) / 0.38);
}

/** 环境参数 → 窗光强度：夜 1、黄昏 .3、清晨 / 正午 0（夜里亮窗，黄昏已经有零星窗光） */
export function glowOf(env) {
  return Math.min(1, Math.max(0, ((Number(env?.emissive) || 0) - 0.4) / 0.5));
}

/** 材质名里带这些词的就是窗 / 玻璃（清单没点名时的兜底）：win / window / glass / glaz */
export const GLOW_NAME = /(?:^|[_.])(win|window|windows|glass|glaz|glazing)(?:$|[_.])/i;

/** 这块材质夜里该不该自己发光：清单的 x-night-glow（材质名表，包数据）与材质名兜底取并集 */
export function isGlowMaterial(name, list) {
  const n = String(name || '');
  if (!n) return false;
  return GLOW_NAME.test(n) || (Array.isArray(list) && list.some((x) => String(x) === n));
}

/** 一块网格的中间调（夜里抹平的目标色）：烘焙贴图降采样 16×16，取「亮的那一半」按 alpha 加权的均值；
 *  顶点色取均值；取不到 = null，夜里这块保持原样。sRGB 贴图进 sRGB 通道，顶点色按线性。
 *  为什么不用整体均值：uv 图集有大半是没用到的黑（实测主楼图集中位亮度 1/255），直接平均等于把夜里调成黑块。 */
export function flatColorOf(THREE, mesh) {
  const map = mesh?.material?.map, col = mesh?.geometry?.attributes?.color, S = 16;
  try {
    if (map?.image?.width) {
      const c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'); g.clearRect(0, 0, S, S); g.drawImage(map.image, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S).data, px = [];
      for (let i = 0; i < d.length; i += 4) px.push([.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2], d[i], d[i + 1], d[i + 2], d[i + 3] / 255]);
      px.sort((a, b) => a[0] - b[0]);
      const lit = px.slice(px.length >> 1);   // 亮的那一半 = 这块面的中间调
      let r = 0, gr = 0, b = 0, a = 0;
      for (const p of lit) { r += p[1] * p[4]; gr += p[2] * p[4]; b += p[3] * p[4]; a += p[4]; }
      return a > 0.5 ? { rgb: [r / a / 255, gr / a / 255, b / a / 255], srgb: true } : null;
    }
    if (col?.count) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < col.count; i++) { r += col.getX(i); g += col.getY(i); b += col.getZ(i); }
      return { rgb: [r / col.count, g / col.count, b / col.count], srgb: false };
    }
  } catch (e) { console.warn('[map] three/night-look: 取烘焙贴图的平均色失败（这块夜里不抹平）', e); }   // 未解码 / 跨源贴图会抛；取不到就当这块没有基准色
  return null;
}

/** 给烘焙材质打一夜面补丁（uNight 抹平 + uGlow 窗光，背面色 back 可选 = 剖开的墙内侧的截面色，接替原 darkBack）。
 *  注入点在 color_fragment 之后：那里 diffuseColor 已经是「材质调色色 × 贴图 × 顶点色」，所以抹平的目标色
 *  = 这块烘焙面的中间调 × 同一个调色色（夜调色），夜里整块面就是「中间调 × 夜调」，烘焙的明暗对比随之抹平。
 *  截面色只在上层被剖开时涂（uCut，调用方在切到楼层视图时打开）：外观视图里墙没有被剖，背面就是正常烘焙面，
 *  涂成一块平色等于在楼体上架一块色板。
 *  窗光加在 dithering 之后（输出空间）：夜里要的就是「窗比墙亮」这一层加光，不是重新照亮烘焙面。返回 uniform 组（探针 / 测试用）。 */
export function patchSurface(THREE, mat, { flat = null, back = null, glow = false } = {}) {
  const u = { uNight: { value: 0 }, uFlat: { value: new THREE.Color(0.5, 0.5, 0.5) }, uFlatOn: { value: flat ? 1 : 0 },
    uGlow: { value: 0 }, uGlowOn: { value: glow ? 1 : 0 }, uGlowCol: { value: new THREE.Color() }, uCut: { value: back ? 1 : 0 } };
  // 窗光加在输出空间（色调映射与色彩空间转换之后），所以这里存的就是显示值本身，不再转换
  u.uGlowCol.value.setRGB(1, .81, .54, THREE.LinearSRGBColorSpace);
  if (flat) u.uFlat.value.setRGB(flat.rgb[0], flat.rgb[1], flat.rgb[2], flat.srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace);
  const tail = `${back ? `\n  if (uCut > .5 && !gl_FrontFacing) gl_FragColor.rgb = vec3(${back.map((v) => v.toFixed(3)).join(',')});` : ''}${glow ? `
  { float l = dot(gl_FragColor.rgb, vec3(.3, .59, .11));
    float fl = floor(vWPos.y / 3.1);                                   // 一层一格
    float h = fract(sin(dot(floor(vWPos.xz / 2.4) + fl * 13.0, vec2(12.9898, 78.233))) * 43758.5453);
    float fl2 = .55 + .45 * fract(sin(fl * 3.7) * 4375.5453);            // 每层亮度不同
    gl_FragColor.rgb += uGlowCol * (uGlow * uGlowOn * step(.22, h) * fl2 * mix(.7, 1.25, l)); }` : ''}`;
  const vDecl = glow ? 'varying vec3 vWPos;\n' : '', vBody = glow ? '\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;' : '';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${vDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${vBody}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${vDecl}uniform float uNight, uFlatOn, uGlow, uGlowOn, uCut; uniform vec3 uFlat, uGlowCol;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float l = dot(diffuseColor.rgb, vec3(.3, .59, .11));
    diffuseColor.rgb = mix(diffuseColor.rgb, uFlat * diffuse * (0.9 + 0.2 * l), uNight * uFlatOn * 0.85); }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${tail}`);
  };
  mat.customProgramCacheKey = () => 'nightSurface' + (flat ? '-flat' : '') + (back ? '-back' + back.map((v) => v.toFixed(3)).join(',') : '') + (glow ? '-glow' : '');
  mat.userData.u = u;   // 与地标查看器一个口径：探针 / 调试从材质上直接读这组 uniform
  return u;
}

/** 只涂背面色的轻量版（室内体量剖切的内壁用，不抹平也不发光） */
export function patchBackFace(THREE, mat, rgb) { return patchSurface(THREE, mat, { back: rgb }); }

/** 把抹平强度写进一批补丁过的材质（targets = [{ u }]），返回写到的个数 */
export function applyNightFlat({ env, targets = [] } = {}) {
  if (!env) return 0;
  const k = nightOf(env); let n = 0;
  for (const t of targets) if (t?.u) { t.u.uNight.value = k; n++; }
  return n;
}

/** 把窗光强度写进一批补丁过的材质（targets = [{ u }]），返回写到的个数 */
export function applyGlow({ env, targets = [] } = {}) {
  if (!env) return 0;
  const k = glowOf(env); let n = 0;
  for (const t of targets) if (t?.u?.uGlow) { t.u.uGlow.value = k; n++; }
  return n;
}
