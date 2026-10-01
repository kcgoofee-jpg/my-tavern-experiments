// 当前设定包（core/pack.mjs）：查看器启动时解析一次，一律取 packs/<id>/manifest.json（eden 的清单在 viewer.html 里 preload，与模块并行）。
// 读 = import 活绑定 PACK；数据路径用 packData(键)（没有 = null，调用方跳过那份数据）。
import { DEFAULT_ID, load, currentId, rebaseRegistry } from '../core/pack.mjs';
import { resolveBlocks, validate2, withDefaults } from '../core/pack-v2.mjs';
export let PACK = null;   // initPack 之前为 null；isEden 退回地址 / 宿主给的包 id
export const packData = k => { const p = PACK?.data?.[k]; return typeof p === 'string' && p && p !== 'builtin' ? p : null; };
/** 包的地名对照表（清单 data.names = { 语言码: 路径 }，S4-4）：没声明 = null（该语言下地名退回中文原文） */
export const packNames = lang => { const p = PACK?.data?.names?.[lang]; return typeof p === 'string' && p ? p : null; };
export const isEden = () => (PACK?.id ?? currentId(window)) === DEFAULT_ID;
export let packEvents = null;
export let packOverlay = null, packTax = null;   // 包旁边的 v2 叠加层（overlay.v2.json，K-R67）与包自带的事件分类：一起交给 compat 建节点树
export let packV2 = null, packProblems = [];   // schema-2 包（K-R96）：校验并补过默认值的包；块解析与校验时的问题（自检 / 控制台）
export const setOverlay = v => (packOverlay = v && typeof v === 'object' ? v : null);
export async function initPack(getJSON) {
  const id = currentId(window);
  let injected = window.__tcPack;   // 宿主注入（清单同步在手）
  if (!injected?.manifest) { try { injected = { manifest: await window.__manifestPromise }; } catch (e) {} }   // 单独打开：首帧脚本已在取清单（viewer.html，与模块并行）；失败不缓存，下面 load 自己再取
  PACK = await load(id, { fetchJSON: async u => { const v = (await getJSON(u)) ?? (await getJSON(u)); if (!v) throw new Error('取不到 ' + u); return v; }, injected });   // 失败不缓存，重试一次
  if (id === DEFAULT_ID) return PACK;   // eden：不写 data-pack / --pack-accent（与以前一样）
  if (PACK.schema === 2) await openV2(getJSON);
  document.documentElement.dataset.pack = PACK.id;
  if (PACK.theme?.accent) document.documentElement.style.setProperty('--pack-accent', PACK.theme.accent);
  // 包自带事件分类（v1 的 events.json）：和叠加层一起交给 compat 建节点树；事件模块的分类从树的 geo.taxonomy() 取（K-R68）
  // 不挡数据请求：boot 把 packEvents 和注册表等放进同一个 Promise.all（性能评审 P2：少一个串行往返）
  packEvents = packData('events') ? getJSON(packData('events')).then(tax => { if (tax) packTax = tax; }).catch(() => {}) : null;
  return PACK;
}
export const rebase = reg => rebaseRegistry(reg, PACK.base);
// schema-2 包（K-R96）：块文件相对包目录取；校验按「随引擎发布」算（packs/<id>/ 在仓库里；S9-2 加 packs/index.json 后改查名单）。被拒绝 = 抛错，走启动失败的重试卡
async function openV2(getJSON) {
  const { manifest, problems } = await resolveBlocks(PACK.v2, p => getJSON(PACK.base + p));
  const r = validate2(manifest, { trusted: window.__tcPack?.trust !== 'foreign' });   // S9-2：宿主交来的外来包（K-R63）按不受信再校验一遍；其余随引擎发布
  if (!r.pack) throw new Error('设定包被拒绝：' + r.problems.map(x => x.code).join(','));
  packV2 = withDefaults(r.pack); packProblems = [...problems, ...r.problems];
  const accent = packV2.ui?.theme?.accent; if (typeof accent === 'string') PACK.theme = { ...PACK.theme, accent };
}
