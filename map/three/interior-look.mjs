// 窗内景（INTERIOR-WINDOWS 2）：给窗 / 玻璃材质（清单 x-night-glow 点的那批）在玻璃后面摆一间「假房间」。
// 做法是 interior mapping：把视向射线打进窗后一个虚拟箱体，看它从箱体的哪张面出去，出去点在面上的比例就是
// uv，去拼版图集里取那一格。图集由 blender/estate/interior_maps.py 出：相机放在房间里，六个面各渲一张，
// 像平面就贴在那张箱面上（像平面与箱面平行 ⇒ 面上的投影是仿射的，视点在哪都一样，偏心用移轴补），
// 所以「比例 = 贴图里的比例」两边严格对得上，不需要立方 / 球面投影。
// 箱体局部轴：x=宽 y=高 z=深，高 = 世界上方向，深 = 窗面法线的反方向（水平化），宽 = 高 × 深；(宽,高,深) 右手系。
// 面表 FACES 与 blender/estate/interior_maps.py 的 FACES 逐行同序同值（tests/interior_faces.test.mjs 对拍），
// 画面水平轴 = n × up（= Blender 相机的 +X），竖直轴 = up；图集行 = 面、列 = 房间类别。
// 每扇窗的房间、亮暗、黑不黑：沿用 night-look.mjs 窗光那一套世界坐标分格哈希（同一扇窗不会外面亮里面黑）。
// 没有任何时间项：画面只随视角动，不随时间动，所以「减少动态效果」下不需要额外降级。
// 依赖：必须先过 night-look.mjs 的 patchSurface(glow) —— vWPos 与 uGlow（夜的程度）都从那里来。THREE 由调用方传入。

export const CELLS = 6;                                    // 图集 = CELLS 列（类别）× CELLS 行（面）
// n = 箱面外法线，u = 画面上方向，都在箱体局部系里；与 Blender 侧同一张表
export const FACES = [
  { k: 'far', n: [0, 0, 1], u: [0, 1, 0] },                // 正对窗的远墙
  { k: 'near', n: [0, 0, -1], u: [0, 1, 0] },              // 窗所在的这面墙（掠射角才看见）
  { k: 'right', n: [1, 0, 0], u: [0, 1, 0] },
  { k: 'left', n: [-1, 0, 0], u: [0, 1, 0] },
  { k: 'top', n: [0, 1, 0], u: [0, 0, 1] },                // 顶棚：画面上方 = 往里（深）
  { k: 'bottom', n: [0, -1, 0], u: [0, 0, 1] },            // 地面
];
// 外观常数（白天 / 夜里各一组：增益、混入量）。白天只要一点点，窗读作反光；夜里读作亮着的房间。
export const LOOK = { gainDay: 1.0, gainNight: 1.5, amtDay: 0.16, amtNight: 0.9 };
const CELL = 2.4, BAND = 3.1;                              // 窗格与层高：与 night-look.mjs 的窗光哈希同一套

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const axisOf = (n) => n.findIndex((v) => v !== 0);
/** 一张箱面的画面基：e = 画面水平方向（= n × up），u = 画面上方向 */
export const faceBasis = (f) => ({ e: cross(f.n, f.u), u: f.u });
const lit = (v) => v.map((x) => `${x < 0 ? '-' : ''}${Math.abs(x).toFixed(1)}`).join(', ');

/** 射线（起点 o 在 ±0.5 的箱内，方向 L）从哪张面出去、出去点在画面里的比例。
 *  每个轴只有「前方那一面」算出口，另一面要留正无穷：把除数夹到 ±eps 会把后面那面的根也翻成正数，
 *  三个轴就全成了无穷远，选面变成随机（tests/interior_faces.test.mjs 就是拦这个的）。
 *  与 GLSL 里由 faceChain() 生成的那串 if 同一条路径（同一顺序、同一比较）。 */
export function exitOf(o, L) {
  const FAR = 1e9, EPS = 1e-6;
  const Ta = [0, 1, 2].map((i) => (Math.abs(L[i]) < EPS ? FAR : (Math.sign(L[i]) * 0.5 - o[i]) / L[i]));
  const T = Math.min(Ta[0], Ta[1], Ta[2]);
  const P = [0, 1, 2].map((i) => o[i] + L[i] * T);
  for (let i = 0; i < FACES.length; i++) {
    const f = FACES[i], a = axisOf(f.n), [b, c] = [0, 1, 2].filter((j) => j !== a);
    if (Ta[a] <= Ta[b] && Ta[a] <= Ta[c] && (L[a] > 0) === (f.n[a] > 0)) {
      const { e, u } = faceBasis(f);
      return { face: i, key: f.k, ab: [dot3(P, e) + 0.5, dot3(P, u) + 0.5] };
    }
  }
  return { face: 0, key: 'far', ab: [0.5, 0.5] };
}

/** 一格贴图里 (a,b) 处的纹素地址：列 = 类别、行 = 面，行从图集顶部往下数，所以 v 要翻一次（three 的 flipY） */
export function cellUv({ room, face, ab, cells = CELLS }) {
  const x = Math.min(Math.max(ab[0], 0.004), 0.996), y = Math.min(Math.max(ab[1], 0.004), 0.996);
  return [(room + x) / cells, 1 - (face + 1 - y) / cells];
}

/** 面选择 + 取画面比例的 GLSL（由 FACES 生成，不手写：改了表就自动跟着改）。AB ∈ [0,1] 是这一格内的比例 */
function faceChain() {
  const cmp = ['x', 'y', 'z'];
  return FACES.map((f, i) => {
    const a = axisOf(f.n), [b, c] = [0, 1, 2].filter((j) => j !== a), { e, u } = faceBasis(f);
    const cond = `Ta.${cmp[a]} <= Ta.${cmp[b]} && Ta.${cmp[a]} <= Ta.${cmp[c]} && L.${cmp[a]} ${f.n[a] > 0 ? '>' : '<'} 0.`;
    return `${i ? 'else ' : ''}if (${cond}) { F = ${i.toFixed(1)}; AB = vec2(dot(P, vec3(${lit(e)})), dot(P, vec3(${lit(u)}))) + .5; }`;
  }).join(' ') + ' else { F = 0.; AB = vec2(.5); }';
}

/** 注入 dithering 之后的那段：算箱体 → 取图集 → 混进 gl_FragColor（在 night-look 的窗光加光之前，所以亮房间多拿一点窗光） */
export function interiorGlsl({ cells = CELLS, day = false } = {}) {
  return `
  if (uIntOn > .5) {                                        // 窗内景：视向射线打进窗后的虚拟箱体
    vec3 N = normalize(cross(dFdx(vWPos), dFdy(vWPos)));    // 这块玻璃的法线（不靠 uv / 法线属性，几何自己给）
    vec3 V = normalize(vWPos - uIntEye);                    // 视向（正交相机时眼睛很远 ≈ 平行光）
    N = faceforward(N, V, N);                               // 翻到朝相机这一面
    vec2 nXZ = vec2(-N.x, -N.z);                            // 进墙方向（水平化）
    vec3 D = dot(nXZ, nXZ) > 1e-4 ? normalize(vec3(nXZ.x, 0.0, nXZ.y)) : vec3(1.0, 0.0, 0.0);
    vec3 W = vec3(D.z, 0.0, -D.x);                          // 宽 = 世界上 × 深
    float fl = floor(vWPos.y / ${BAND.toFixed(1)});         // 一层一格（与窗光哈希同口径）
    vec2 cell = floor(vWPos.xz / ${CELL.toFixed(1)}) + fl * 13.0;
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float fl2 = .55 + .45 * fract(sin(fl * 3.7) * 4375.5453);
    float room = floor(fract(sin(dot(cell, vec2(39.3468, 11.135))) * 24634.6345) * ${cells.toFixed(1)});
    float ent = .12 + .3 * fract(h * 7.13);                 // 每扇窗的箱门深浅不同 → 视差各不相同
    float fx = abs(W.x) > abs(W.z) ? fract(vWPos.x / ${CELL.toFixed(1)}) : fract(vWPos.z / ${CELL.toFixed(1)});
    vec3 o = vec3(fx - .5, fract(vWPos.y / ${BAND.toFixed(1)}) - .5, ent - .5);
    vec3 L = vec3(dot(W, V), V.y, dot(D, V));               // 视向 → 箱体局部系
    // 只有前方那一面算出口，后方那面留正无穷（与 exitOf 同式）。夹到 ±eps 会把背后的根翻成正的、三个轴全成无穷远。
    // 用 step 而不是 greaterThan 选：mix(vec,vec,bvec) 只在 GLSL ES 3.0 有，WebGL1 上下文会编译失败。
    vec3 Ta = mix(vec3(1e9), (sign(L) * .5 - o) / max(abs(L), vec3(1e-6)), step(vec3(1e-6), abs(L)));
    float T = min(Ta.x, min(Ta.y, Ta.z));
    vec3 P = o + L * T;
    vec2 AB; float F;
    ${faceChain()}
    vec2 uv = vec2((room + clamp(AB.x, .004, .996)) / ${cells.toFixed(1)}, 1.0 - (F + 1.0 - clamp(AB.y, .004, .996)) / ${cells.toFixed(1)});
    float kN = clamp(uGlow, 0.0, 1.0) * uGlowOn;            // 夜的程度：白天几乎只看反光
    vec3 iw = texture2D(uIntTex, uv).rgb;                   // 图集按显示色存（NoColorSpace），这里就是最终色
    ${day ? 'iw = mix(texture2D(uIntTexDay, uv).rgb, iw, kN);' : ''}
    iw *= mix(${LOOK.gainDay.toFixed(2)}, ${LOOK.gainNight.toFixed(2)}, kN) * mix(1.0, fl2 * (.25 + .75 * step(.22, h)), kN);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, iw, uIntOn * mix(${LOOK.amtDay.toFixed(2)}, ${LOOK.amtNight.toFixed(2)}, kN));
  }`;
}

let BLANK = null;
const blankTex = (THREE) => BLANK || (BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));
const TARGETS = [];                                        // 打过窗内景补丁的材质 uniform，本页一共这一批（一页一个三维视图）

/** 给一块已经过 patchSurface(glow) 的窗材质加窗内景，并登记进 TARGETS。
 *  贴图可以晚点到（loadInteriors → armInteriors），所以这里不要求有图。
 *  返回这组 uniform（探针用），材质没打过窗光补丁就返回 null（不自己造第二套夜面补丁）。 */
export function patchInterior(THREE, mat, { cells = CELLS, day = false } = {}) {
  if (!mat?.userData?.u?.uGlow) return null;
  const u = { uIntTex: { value: blankTex(THREE) }, uIntEye: { value: new THREE.Vector3(0, 1e4, 0) },
    uIntOn: { value: 0 } };
  if (day) u.uIntTexDay = { value: blankTex(THREE) };
  const inner = mat.onBeforeCompile, innerKey = mat.customProgramCacheKey;
  const decl = `uniform sampler2D uIntTex;${day ? ' uniform sampler2D uIntTexDay;' : ''} uniform vec3 uIntEye; uniform float uIntOn;`;
  const body = interiorGlsl({ cells, day });
  mat.onBeforeCompile = (sh, renderer) => {
    if (inner) inner(sh, renderer);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${body}`);   // 排在窗光加光之前
  };
  mat.customProgramCacheKey = () => `${innerKey ? innerKey() : 'nightSurface'}-int${day ? '-day' : ''}`;
  mat.userData.iu = u;
  TARGETS.push(u);
  return u;
}

/** 读清单的 x-interior（包数据：图集地址），地址按清单所在目录解析。没有这一段 / 读不到就返回 null，窗退回平光。 */
export async function loadInteriors(THREE, block, base, { low = false, aniso = 4 } = {}) {
  if (!block || !base) return null;
  const url = (k) => { const p = low ? (block[`${k}_low`] ?? block[k]) : block[k]; return p ? new URL(p, base).href : null; };
  const get = (k) => {
    const u = url(k); if (!u) return null;
    return new Promise((res) => {
      const t = new THREE.TextureLoader().load(u, () => res(t));   // 失败不 reject：拿不到就是没有（TextureLoader 不给 manager：three 的默认值只认 undefined，传 null 会在 itemStart 抛）
      t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true;         // 显示色直存直取（注入点在色调映射之后）
      t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter;
    }).catch(() => null);
  };
  try { return { night: await get('night'), day: await get('day') }; } catch (e) { console.warn('[map] three/interior-look: 窗内景图集没到位，窗退回平光', e); return null; }
}

/** 贴图到位：写进所有登记的窗材质并打开；夜里那套必须有，白天那套缺了就复用夜图（少一格反光而已）。返回开了几块 */
export function armInteriors(tex) {
  const { night = null, day = null } = tex || {};
  if (!night) return 0;
  let n = 0;
  for (const u of TARGETS) {
    u.uIntTex.value = night;
    if (u.uIntTexDay) u.uIntTexDay.value = day || night;
    u.uIntOn.value = 1; n++;
  }
  return n;
}

/** 每帧：把相机（眼睛）位置写给用得到的材质。正交相机离得很远，视向近似平行，视差照样成立 */
export function aimInterior(camera = null) {
  if (!camera) return 0;
  for (const u of TARGETS) if (u.uIntOn.value > .5) u.uIntEye.value.copy(camera.position);
  return TARGETS.length;
}

/** 关掉 / 打开窗内景（低档、探针）；返回受影响的材料数，探针拿它确认补丁真的挂上了 */
export function setInteriorOn(on = 1) {
  for (const u of TARGETS) u.uIntOn.value = on ? 1 : 0;
  return TARGETS.length;
}

/** 已挂窗内景的窗材质数（探针用） */
export const interiorCount = () => TARGETS.length;
