// 当前设定包（core/pack.mjs）：查看器启动时解析一次。eden 用内置配置，不多一个请求；其它包先取 packs/<id>/manifest.json。
// 读 = import 活绑定 PACK；数据路径用 packData(键)（没有 = null，调用方跳过那份数据）。
import { EDEN_RESOLVED, load, currentId, rebaseRegistry } from '../core/pack.mjs';
export let PACK = EDEN_RESOLVED;
export const packData = k => { const p = PACK.data?.[k]; return p && p !== 'builtin' ? p : null; };
export const isEden = () => PACK.id === 'eden';
export let packEvents = null;
export async function initPack(getJSON) {
  const id = currentId(window);
  if (id === 'eden') return PACK;
  PACK = await load(id, { fetchJSON: async u => { const v = await getJSON(u); if (!v) throw new Error('取不到 ' + u); return v; }, injected: window.__tcPack });
  document.documentElement.dataset.pack = PACK.id;
  if (PACK.theme?.accent) document.documentElement.style.setProperty('--pack-accent', PACK.theme.accent);
  // 包自带事件分类：换掉 tavern/events.mjs 的内置天城分类（查看器事态横条、图例同一个模块实例）
  // 不挡数据请求：boot 把 packEvents 和注册表等放进同一个 Promise.all（性能评审 P2：少一个串行往返）
  packEvents = packData('events') ? Promise.all([import('../tavern/events.mjs'), getJSON(packData('events'))]).then(([m, tax]) => { if (tax) m.configure(tax, PACK.id); }).catch(() => {}) : null;
  return PACK;
}
export const rebase = reg => rebaseRegistry(reg, PACK.base);
