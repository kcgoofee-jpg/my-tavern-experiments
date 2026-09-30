// 地图驱动的双向动作注入（Part 6-4）：点地图上的 POI → 一句话进酒馆聊天流。
// 三种模式（设置项 edenMapInject）：
//   off     —— 一个都不发（默认：地图不该在玩家没同意的情况下替他说话）
//   compose —— 填进输入框，接在已有草稿后面，**永不自动发送**（与 v0.9.6 的「去这里」同一条底线）
//   sys     —— 以系统指令静默注入（走酒馆助手 triggerSlash('/sys …')），不在输入框里停留
// 纯模块：不碰酒馆全局、不发消息、不读存储（get 由宿主注入）；node 单测 tests/action.test.mjs。
export const KEY = 'edenMapInject';
export const TPL_KEY = 'edenMapActionTpl';
export const MODES = ['off', 'compose', 'sys'];
export const MAX = 300;

/** 默认模板：{name} = 地点 / 事件 / 人物名；{item} = 拾到的东西（loot）、{dc} = 检定难度（stealth）、
 *  {what} = 失手缘由（fail，W2 检定失败环：掷骰开着时由宿主填「搜刮失手 / 潜行被目击」） */
export const DEFAULTS = {
  zh: { go: '前往{name}。', look: '查看{name}。', take: '在{name}搜刮。', loot: '在{name}发现{item}，收进随身仓。', stealth: '穿过{name}避开巡逻视线：潜行检定 DC {dc}。', fail: '在{name}失手了：{what}（DC {dc}，掷 {roll}）。' },
  en: { go: 'Go to {name}. ', look: 'Look at {name}. ', take: 'Search {name}. ', loot: 'In {name}: found {item} and pocketed it. ', stealth: 'Slip past the patrol watching {name}: stealth check DC {dc}. ', fail: 'It went wrong at {name}: {what} (DC {dc}, rolled {roll}). ' },
};
export const KINDS = ['go', 'look', 'take', 'loot', 'stealth', 'fail'];

const clip = (s, n) => [...String(s ?? '')].slice(0, n).join('');
export const cleanName = n => clip(String(n ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\{\{user\}\}\s*/g, '').trim(), 60);

/** 设置项 → 模式；乱值一律 off（宁可不注入，不可猜着注入） */
export function modeOf(get) {
  try { const v = String(get?.(KEY) ?? '').trim(); return MODES.includes(v) ? v : 'off'; } catch (e) { return 'off'; }
}

/** 本机模板（用户改过的优先；空串 = 用默认）；kinds 之外的 key 一律忽略 */
export function readTpl(get, lang = 'zh') {
  const d = DEFAULTS[lang] || DEFAULTS.zh; let u = {};
  try { const o = JSON.parse(get?.(TPL_KEY) || '{}'); if (o && typeof o === 'object' && !Array.isArray(o)) u = o; } catch (e) {}
  const out = {};
  for (const k of KINDS) out[k] = typeof u[k] === 'string' && u[k].trim() ? clip(u[k], 120) : d[k];
  return out;
}

/** 模板 + 名字 → 一句话；模板里没有 {name} 就把名字接在后面。名字空返回 ''。
 *  vars = 其余占位符（{item}、{dc}…）；传字符串的旧写法按 {item} 处理。
 *  模板里没有对应占位符的老文案也不丢东西：插到句末标点之前。 */
export function fill(tpl, name, vars) {
  const n = cleanName(name); if (!n) return '';
  const v = typeof vars === 'string' ? { item: vars } : (vars && typeof vars === 'object' ? vars : {});
  let out = /\{name\}/.test(String(tpl || '')) ? String(tpl).split('{name}').join(n) : (String(tpl || '') + n);
  for (const [k, val] of Object.entries(v)) {
    const s = String(val ?? '').trim(); if (!s) continue;
    const ph = '{' + k + '}';
    out = out.includes(ph) ? out.split(ph).join(s) : out.replace(/([。.!？?]?)$/, (m, p) => s + p);
  }
  return clip(out.replace(/[\r\n]+/g, ' '), MAX).trim();
}

/**
 * 造一条动作消息：{ type: 'eden-map:action', kind, text, name?, map? }。
 * off / 名字为空 / 文案为空 → null（不发空消息）。kind 不在 KINDS 里按 go 处理。
 */
export function buildAction({ mode, kind = 'go', name, map, tpls, lang = 'zh', item, vars } = {}) {
  if (modeOf(() => mode) === 'off') return null;
  const k = KINDS.includes(kind) ? kind : 'go';
  const d = DEFAULTS[lang] || DEFAULTS.zh;
  const tpl = (tpls && typeof tpls[k] === 'string' && tpls[k].trim() ? tpls[k] : null) || d[k];
  const extra = { ...(vars && typeof vars === 'object' ? vars : {}), ...(item !== undefined && item !== null ? { item } : {}) };
  const text = fill(tpl, name, extra);
  if (!text) return null;
  const out = { type: 'eden-map:action', kind: k, text, v: 2 };
  if (cleanName(name)) out.name = cleanName(name);
  if (typeof map === 'string' && map) out.map = map;
  return out;
}

/** sys 模式下真正要执行的斜杠命令（宿主拿去 triggerSlash）；compose / off 都是 '' */
export function slashOf(action, mode) {
  if (mode !== 'sys' || !action?.text) return '';
  return '/sys ' + String(action.text).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').slice(0, MAX);
}

/** 摘要（自检 / 设置页显示）：{ mode, kinds } */
export const describe = get => ({ mode: modeOf(get), kinds: KINDS.slice() });
