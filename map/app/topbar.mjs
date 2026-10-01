// 顶栏布局、后台预热（另一版底图、其它地图）、版本编码。
import { REG, cur, sleeping } from './state.mjs';
import { $, ico } from './dom-helpers.mjs';
import { getJSON } from './json-cache.mjs';
import { post } from './protocol-stamp.mjs';
import { tx } from './text-lookup.mjs';
import { autoKey, effTier, leanBg, tier } from './sharpness-tiers.mjs';
import { t } from './i18n.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { renderAbout, showLay } from './settings.mjs';
import { placeLayers } from './drawer-glue.mjs';
import { parentMap } from './nodes-runtime.mjs';
// ---------------- 顶栏（UI v2 §2.1）：清晰度、语言、主题、版本号都在设置「显示 / 更新与版本」里，顶栏不再放 ----------------
// 图层开关：桌面在「图层 ▾」弹层；手机（或桌面放不下：窄窗口、EN、放大 200%）进「⋯」设置首页的快捷区
const moreEls = () => [$('#layList')].filter(Boolean);
export function layoutHeader() {
  const box = $('#setPop .more'), hdr = $('header');
  const put = nar => { for (const el of moreEls()) {
    if (nar && el.parentElement !== box) { el._ph ??= document.createComment('slot'); el.before(el._ph); box.appendChild(el); }
    else if (!nar && el.parentElement === box && el._ph?.isConnected) el._ph.replaceWith(el);
  } };
  let nar = narrowNow(); document.body.classList.remove('hdrc'); put(nar);
  if (!nar) { const cs = getComputedStyle(hdr), kids = [...hdr.children].filter(e => e.offsetParent && !e.classList.contains('grow'));
    const need = kids.reduce((a, e) => a + (e.id === 'crumbs' ? [...e.children].reduce((w, c) => w + c.scrollWidth + 6, 0) : e.offsetWidth), 0) + (kids.length - 1) * parseFloat(cs.columnGap || 8) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    if (need > hdr.clientWidth) { nar = true; put(true); document.body.classList.add('hdrc'); } }
  if (nar) showLay(false);
  $('#setBtn').innerHTML = ico(narrowNow() ? 'more' : 'set'); $('#setBtn').setAttribute('aria-label', tx(narrowNow() ? 'more' : 'settings_title', '设置'));
  placeLayers();
}
// 面板收起（休眠）时的慢速预取：把另一版底图（如上层「显示下方城市」）按当前清晰度上限一张一张取进缓存，
// 每张间隔 250ms、同时只取 1 张，不和聊天抢带宽；面板打开就停，下次收起从没取过的继续
export let slowStop = true;
const slowDone = new Set();
export async function slowWarmAlt() {
  if (leanBg()) return;   // 省流（含拿不到网络信息的触屏）：后台不拉另一版底图
  slowStop = false;
  for (const m of Object.values(REG.maps)) {
    if (!m.alt?.base || m.status === 'planned') continue;
    try {
      const x = await getText(m.alt.base);
      const T = +x.match(/TileSize="(\d+)"/)[1], f = x.match(/Format="(\w+)"/)[1];
      const W = +x.match(/Width="(\d+)"/)[1], H = +x.match(/Height="(\d+)"/)[1], top = Math.ceil(Math.log2(Math.max(W, H)));
      const cap = effTier().cap, maxL = Math.min(top, Math.ceil(Math.log2(W * Math.min(1, cap / W))));
      const dir = m.alt.base.replace(/\.dzi$/, '_files/');
      for (let L = 8; L <= maxL; L++) {
        const s2 = 2 ** (top - L), w = Math.ceil(W / s2), h = Math.ceil(H / s2);
        for (let c = 0; c < Math.ceil(w / T); c++) for (let r = 0; r < Math.ceil(h / T); r++) {
          const url = `${dir}${L}/${c}_${r}.${f}`;
          if (slowDone.has(url)) continue;
          if (slowStop) return;
          await new Promise(res => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = img.onerror = res; img.src = url; });
          slowDone.add(url);
          await new Promise(res => setTimeout(res, 250));
        }
      }
    } catch (e) {}
  }
}
export const textCache = new Map();
// 版本编码：data/build.json 的 code（赛季-版本-通道-构建号，发版脚本写入）+ 运行时识别的客户端尾号。
// 尾号：I = iOS/iPadOS，A = 安卓，M = macOS，W = Windows，S = 其他。
function clientTail() {
  const u = navigator.userAgent, p = navigator.platform || '';
  if (/iPhone|iPad|iPod/.test(u) || (p === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'I';
  if (/Android/.test(u)) return 'A';
  if (/Mac/.test(p)) return 'M';
  if (/Win/.test(p)) return 'W';
  return 'S';
}
let buildCode = '';
export let buildInfo = null;
fetch('data/build.json').then(r => r.ok ? r.json() : null).then(b => { buildInfo = b; renderAbout();
  buildCode = ((b && b.code) || 'S0-0000-D-0000') + '-' + clientTail();
  post({ type: 'eden-map:build', version: b?.version || null, code: b?.code || null });   // 给卡内脚本的自检比对版本（E6）
  $('#build').textContent = buildCode;
}).catch(() => { buildCode = 'S0-0000-D-0000-' + clientTail(); $('#build').textContent = buildCode; $('#build').title = t('build_na'); });   // fix3：读不到 build.json 也显示诊断码（不留空白），原因在 title
$('#build').addEventListener('click', () => {
  const d = [buildCode, 'map=' + (cur || sleeping), 'tier=' + tier + (tier === 'auto' ? ':' + autoKey : ''), 'dpr=' + devicePixelRatio,
    'view=' + innerWidth + 'x' + innerHeight, 'base=' + document.baseURI, 'ua=' + navigator.userAgent].join('\n');
  const done = () => { const b = $('#build'); b.textContent = t('copied'); setTimeout(() => b.textContent = buildCode, 1500); };
  (navigator.clipboard ? navigator.clipboard.writeText(d) : Promise.reject()).then(done).catch(() => { prompt(t('copy_prompt'), d); });
});
export const getText = url => { if (!textCache.has(url)) textCache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).catch(e => { textCache.delete(url); throw e; })); return textCache.get(url); };   // 失败不留在缓存里（接手 review P1）
// 大版本 2（docs/perf/v2.md）：只预热「走一步就到」的图——同组各层、上级、直接下级（都从节点树读）。
// 同组各层取到 L10（切层最常用），其余只取 L8–9（先有个粗底，真打开时 OSD 再补细层），冷开总流量约少三成。
const warmed = new Map();
export async function warmOthers() {
  const thin = leanBg();   // 省流（含拿不到网络信息的触屏）：只取 JSON 与庄园页 HTML，不取 dzi、不取瓦片
  const c0 = cur, c = REG.maps[cur], gl = new Set(c?.group ? REG.groups[c.group]?.layers || [] : []);
  const up = parentMap(cur), near = id => gl.has(id) || id === up || parentMap(id) === cur;
  for (const [id, m] of Object.entries(REG.maps)) {
    if (cur !== c0) return;   // 预热途中切了图：交给新图那一轮
    const want = gl.has(id) ? 10 : 9;   // warmed：id → 已取到的最细层（按层记，后来进了同组还会补 L10）
    if (id === cur || !near(id) || (warmed.get(id) || 0) >= want) continue;
    if (m.kind === 'estate' && m.src) { warmed.set(id, 99); getText(new URL(m.src, document.baseURI).href).catch(() => {}); continue; }   // 庄园页面文本（三维库本身不预取）
    if (m.status === 'planned' || !m.base) continue;
    if (m.data) getJSON(m.data);
    if (thin) continue;   // 省流时不记：网络好了以后还会补
    try {
      const x = await fetch(m.base).then(r => r.text());
      if (cur !== c0) return;
      const T = +x.match(/TileSize="(\d+)"/)[1], f = x.match(/Format="(\w+)"/)[1];
      const W = +x.match(/Width="(\d+)"/)[1], H = +x.match(/Height="(\d+)"/)[1], top = Math.ceil(Math.log2(Math.max(W, H)));
      const dir = m.base.replace(/\.dzi$/, '_files/');
      for (let L = (warmed.get(id) || 7) + 1; L <= Math.min(top, want); L++) {   // 最粗几层（只补还没取过的层）
        const s = 2 ** (top - L), w = Math.ceil(W / s), h = Math.ceil(H / s);
        for (let c = 0; c < Math.ceil(w / T); c++) for (let r = 0; r < Math.ceil(h / T); r++) {
          const img = new Image(); img.crossOrigin = 'anonymous'; img.src = `${dir}${L}/${c}_${r}.${f}`;   // 与 OSD 的跨域方式一致，才能命中缓存
        }
      }
      warmed.set(id, want);   // dzi 解析成功才记
    } catch (e) {}
  }
}
export function setSlowStop(v) { return (slowStop = v); }
