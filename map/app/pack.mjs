// 当前设定包（core/pack.mjs）：查看器启动时解析一次，一律取 packs/<id>/manifest.json（eden 的清单在 viewer.html 里 preload，与模块并行）。
// 读 = import 活绑定 PACK；数据路径用 packData(键)（没有 = null，调用方跳过那份数据）。
import { DEFAULT_ID, load, currentId, rebaseRegistry } from '../core/pack.mjs';
export let PACK = null;   // initPack 之前为 null；isEden 退回地址 / 宿主给的包 id
export const packData = k => { const p = PACK?.data?.[k]; return p && p !== 'builtin' ? p : null; };
export const isEden = () => (PACK?.id ?? currentId(window)) === DEFAULT_ID;
export let packEvents = null;
export async function initPack(getJSON) {
  const id = currentId(window);
  PACK = await load(id, { fetchJSON: async u => { const v = (await getJSON(u)) ?? (await getJSON(u)); if (!v) throw new Error('取不到 ' + u); return v; }, injected: window.__tcPack });   // 失败不缓存，重试一次
  if (id === DEFAULT_ID) return PACK;   // eden：不写 data-pack / --pack-accent（与以前一样）
  document.documentElement.dataset.pack = PACK.id;
  if (PACK.theme?.accent) document.documentElement.style.setProperty('--pack-accent', PACK.theme.accent);
  // 包自带事件分类：换掉 tavern/events.mjs 的内置天城分类（查看器事态横条、图例同一个模块实例）
  // 不挡数据请求：boot 把 packEvents 和注册表等放进同一个 Promise.all（性能评审 P2：少一个串行往返）
  packEvents = packData('events') ? Promise.all([import('../tavern/events.mjs'), getJSON(packData('events'))]).then(([m, tax]) => { if (tax) m.configure(tax, PACK.id); }).catch(() => {}) : null;
  return PACK;
}
export const rebase = reg => rebaseRegistry(reg, PACK.base);
