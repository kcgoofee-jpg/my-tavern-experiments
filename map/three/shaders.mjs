// Part 9-2 / 9-3：GLSL 片段库（粒子 + 极光 + 浮雕法线）。着色器代码一律放这里，渲染模块只拼装，
// 好处：① 单测可以直接扫 uniform 名单，改名 / 漏传会被测试抓住；② 渲染模块保持短，行数不炸。
// 约定：uniform 一律 u 前缀，varying 一律 v 前缀；所有着色器都不做分支纹理采样（老 GPU 上代价高）。

/** 降水点精灵：位置在顶点着色器里按 uTime 回绕（CPU 每帧只传一个 uniform，不重传 buffer） */
export const PRECIP_VS = `
precision mediump float;
attribute float aSeed;
uniform float uTime;
uniform float uSpeed;
uniform float uSize;
uniform float uPixelRatio;
uniform float uAtten;      // 1 = 透视（点大小随距离衰减）；0 = 正交（庄园这种相机，点大小固定，否则会被距离缩成尘埃）
uniform vec3 uBox;
uniform vec2 uWind;
varying float vSeed;
void main() {
  vec3 p = position;
  float t = uTime * uSpeed * (0.6 + aSeed * 0.8);
  p.y = mod(p.y - t + uBox.y, uBox.y * 2.0) - uBox.y;
  p.x = mod(p.x + t * uWind.x + uBox.x, uBox.x * 2.0) - uBox.x;
  p.z = mod(p.z + t * uWind.y + uBox.z, uBox.z * 2.0) - uBox.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float atten = mix(1.0, 240.0 / max(0.001, -mv.z), uAtten);
  gl_PointSize = uSize * uPixelRatio * atten;
  gl_Position = projectionMatrix * mv;
  vSeed = aSeed;
}
`;

/** 降水片元：圆点（雪 / 沙）到竖条（雨）用 uStreak 一个参数切换，一次 draw call 全画完 */
export const PRECIP_FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uStreak;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  c.x *= 1.0 + uStreak * 4.0;
  c.y *= 1.0 - uStreak * 0.45;
  float d = length(c);
  float a = smoothstep(0.5, 0.08, d) * uOpacity * (0.65 + vSeed * 0.35);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/** 极光平面：顶点只传 uv（平面正对 -Z，挂在天城高空那一层） */
export const AURORA_VS = `
precision mediump float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** 极光片元：3 层 value noise 叠出的流光带；uTime 不动就是一张静图（reduced-motion 用） */
export const AURORA_FS = `
precision mediump float;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBands;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec2 q = vec2(vUv.x * uBands + uTime * 0.05, vUv.y * 1.6 - uTime * 0.11);
  float n = fbm(q);
  float band = smoothstep(0.34, 0.86, n + 0.18 * sin(vUv.x * 6.2831 * uBands * 0.25));
  float fall = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  float a = band * fall * uIntensity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uColorA, uColorB, clamp(n, 0.0, 1.0)), a);
}
`;

/** 浮雕平面：法线 + 视差（任务三）。世界法线 / 切线用屏幕导数现场算，平面 UV 不对齐也能用 */
export const RELIEF_VS = `
precision mediump float;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const RELIEF_FS = `
precision mediump float;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform sampler2D uHeight;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform float uAmbient;
uniform float uEmissive;
uniform float uParallax;
uniform float uNormalScale;
uniform float uUseHeight;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N0 = normalize(vNormalW);
  // 切线基（three 的 perturbNormal2Arb 同款写法）：屏幕导数反推 TBN，UV 不对齐也站得住
  vec3 q0 = dFdx(vWorld), q1 = dFdy(vWorld);
  vec2 st0 = dFdx(vUv), st1 = dFdy(vUv);
  vec3 S = normalize(q0 * st1.t - q1 * st0.t);
  vec3 T = normalize(-q0 * st1.s + q1 * st0.s);
  vec2 uv = vUv;
  if (uParallax > 0.0001) {
    float h = mix(0.5, texture2D(uHeight, vUv).r, uUseHeight);
    vec3 vt = vec3(dot(S, V), dot(T, V), dot(N0, V));
    uv -= (vt.xy / max(0.15, vt.z)) * uParallax * (h - 0.5);
  }
  vec3 nT = texture2D(uNormal, uv).xyz * 2.0 - 1.0;
  nT.xy *= uNormalScale;
  vec3 N = normalize(mat3(S, T, N0) * nT);
  float rough = clamp(texture2D(uRough, uv).g, 0.04, 1.0);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), mix(6.0, 96.0, 1.0 - rough)) * (1.0 - rough) * 0.6;
  vec3 base = texture2D(uAlbedo, uv).rgb;
  vec3 col = base * (uAmbientColor * uAmbient + uLightColor * ndl) + uLightColor * spec + base * uEmissive;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** 每个着色器依赖的 uniform 名单（单测 / 自检对照：漏传或改名会被抓住） */
export const UNIFORM_SETS = {
  precip: ['uTime', 'uSpeed', 'uSize', 'uPixelRatio', 'uAtten', 'uBox', 'uWind', 'uColor', 'uOpacity', 'uStreak'],
  aurora: ['uTime', 'uIntensity', 'uColorA', 'uColorB', 'uBands'],
  relief: ['uAlbedo', 'uNormal', 'uRough', 'uHeight', 'uLightDir', 'uLightColor', 'uAmbientColor', 'uAmbient', 'uEmissive', 'uParallax', 'uNormalScale', 'uUseHeight'],
};

/** 扫一段 GLSL 里出现过的 u* uniform（测试对拍 UNIFORM_SETS 用） */
export const uniformsIn = src => [...new Set([...String(src || '').matchAll(/\bu[A-Z]\w*/g)].map(m => m[0]))].sort();
