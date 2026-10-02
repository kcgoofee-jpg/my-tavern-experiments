// 分时段天空 + 云海（ESTATE-MODES-1 7c / A5c）：烘焙光照的三维页原来只有主题色背景或页面透明，岛浮在酒馆壁纸上。
// 这里给一套按时段换的天空渐变和岛下的云海平面，主场景页（map/estate/main.js）与地标查看器（map/props/viewer3d.html）共用。
// apply() 顺带做时段调色（A5b）：daynight 的 gradeOf 一套曲线，landmark 查看器不必自己接昼夜。配色锚在昼夜关键帧的雾色上
// （map/three/daynight.mjs 的 PHASES，与二维夜调同一来源：世界时钟）；THREE 由调用方传入。
import { envAt, gradeOf } from './daynight.mjs';
const PAL = {
  night: { sky: ['#0d1326', '#1c2440', '#3d4d70'], hi: '#454c5e', lo: '#252b3c' },
  dawn: { sky: ['#4a5b8c', '#9d8ba0', '#e0c2a8'], hi: '#f4e4d2', lo: '#b9a9a5' },
  noon: { sky: ['#6f9cc8', '#a8c4de', '#eef2f7'], hi: '#fdfbf6', lo: '#d3dbe4' },
  dusk: { sky: ['#2f2a4a', '#6d4f6b', '#c08a76'], hi: '#e8c2a4', lo: '#8a5f68' },
};
/** 时钟胶囊的时段（U-FIX-4：eden-map:clock 的 view / tod）→ 昼夜关键帧的代表时刻（PHASES.at × 1440） */
export const PERIOD_MIN = { night: 30, dawn: 390, day: 750, dusk: 1095 };
export function createBackdrop({ THREE, scene }) {
  let skyTex = null, sea = null, last = '';
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { cHi: { value: new THREE.Color() }, cLo: { value: new THREE.Color() }, cFar: { value: new THREE.Color() }, R: { value: 1900 } },
    vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec2 vP; uniform vec3 cHi, cLo, cFar; uniform float R;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0., a = .5; for (int k = 0; k < 5; k++) { s += a * n(p); p = p * 2.03 + 17.; a *= .5; } return s; }
      void main(){ float r = length(vP) / R; float c = fbm(vP / 260.); float d = fbm(vP / 60. + 5.);
        float v = smoothstep(.30, .85, c * .8 + d * .3);
        vec3 col = mix(cLo, cHi, v); col = mix(col, cFar, smoothstep(.35, 1., r) * .8);
        gl_FragColor = vec4(col, (1. - smoothstep(.7, 1., r)) * (.55 + .45 * v)); }`,
  });
  /** 换时段 / 换主题：重画 4×256 的渐变当场景背景，云海配色跟着换 */
  function paint({ phase = 'noon', light = false } = {}) {
    const key = phase + (light ? 'L' : ''), p = PAL[phase] || PAL.noon;
    if (key === last && skyTex) return;
    last = key;
    const c = skyTex ? skyTex.image : document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, p.sky[0]); gr.addColorStop(0.55, p.sky[1]); gr.addColorStop(1, p.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    if (!skyTex) { skyTex = new THREE.CanvasTexture(c); skyTex.colorSpace = THREE.SRGBColorSpace; } else skyTex.needsUpdate = true;
    scene.background = skyTex;
    cloudMat.uniforms.cHi.value.set(light ? '#fdfbf6' : p.hi);
    cloudMat.uniforms.cLo.value.set(light ? '#d3dbe4' : p.lo);
    cloudMat.uniforms.cFar.value.set(p.sky[2]);
  }
  /** 模型落地后按它的包围盒把云海放到岛下（LOD 换档 / 换模型时重放一次） */
  function fit(root) {
    const bb = new THREE.Box3().setFromObject(root);
    if (sea) { scene.remove(sea); sea.geometry.dispose(); }
    sea = new THREE.Mesh(new THREE.CircleGeometry(1900, 64).rotateX(-Math.PI / 2), cloudMat);
    sea.position.y = bb.min.y + (bb.max.y - bb.min.y) * 0.18; sea.renderOrder = -1; sea.name = 'cloud_sea'; scene.add(sea);
  }
  /** 时段调色 + 换天空（地标查看器用；材质要带 uTint 补丁 uniform）。tod = 时钟胶囊的时段（'' = 正午），返回时段 id */
  function apply({ meshes = [], tod = '', light = false }) {
    const env = envAt({ min: PERIOD_MIN[tod] ?? 750 }, { reducedMotion: true });
    const g = gradeOf(env);
    for (const m of meshes) if (m?.material?.userData?.u?.uTint) m.material.userData.u.uTint.value.setRGB(g.tint[0], g.tint[1], g.tint[2]);
    paint({ phase: env.phase, light });
    return env.phase;
  }
  return { paint, fit, apply, get phase() { return last.replace(/L$/, '') || 'noon'; } };
}
