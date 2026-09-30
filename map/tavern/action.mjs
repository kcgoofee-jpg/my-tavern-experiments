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

/** 默认模板：{name} = 地点 / 事件 / 人物名 */
export const DEFAULTS = {
  zh: { go: '前往{name}。', look: '查看{name}。', take: '在{name}搜刮。' },
  en: { go: 'Go to {name}. ', look: 'Look at {name}. ', take: 'Search {name}. ' },
};
export const KINDS = ['go', 'look', 'take'];

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

/** 模板 + 名字 → 一句话；模板里没有 {name} 就把名字接在后面。名字空 / 模式 off 返回 '' */
export function fill(tpl, name) {
  const n = cleanName(name); if (!n) return '';
  const t = String(tpl || '');
  const out = /\{name\}/.test(t) ? t.split('{name}').join(n) : (t + n);
  return clip(out.replace(/[\r\n]+/g, ' '), MAX).trim();
}

/**
 * 造一条动作消息：{ type: 'eden-map:action', kind, text, name?, map? }。
 * off / 名字为空 / 文案为空 → null（不发空消息）。kind 不在 KINDS 里按 go 处理。
 */
export function buildAction({ mode, kind = 'go', name, map, tpls, lang = 'zh' } = {}) {
  if (modeOf(() => mode) === 'off') return null;
  const k = KINDS.includes(kind) ? kind : 'go';
  const d = DEFAULTS[lang] || DEFAULTS.zh;
  const tpl = (tpls && typeof tpls[k] === 'string' && tpls[k].trim() ? tpls[k] : null) || d[k];
  const text = fill(tpl, name);
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
