// 数据源注册表（arch-v2 §5.1 / §6 第 8 步）：宿主从哪些地方读聊天里的状态。每项 { id, label, label_en, feeds, active(ctx) }。
// 设置「数据与映射」、EdenMap.sources() 从这里统一枚举；以后加新来源（别的变量框架）只在这里登记 + 写读取模块。
// 纯函数：ctx 由 eden-map.js 在调用时组装（不含任何数据内容本身）：
//   { hasMvu, mode: 'mvu'|'mvu-partial'|'tags', db: shujuku.facts() | null, here, hereFromDb, chars: [{src}], varMap, vars: 聊天变量接口是否可用 }
export const SOURCES = [
  { id: 'mvu', label: 'MVU 变量', label_en: 'MVU variables', feeds: ['location', 'time', 'outfit', 'characters'], active: c => !!c.hasMvu && c.mode !== 'tags' },
  { id: 'db', label: '数据库插件表', label_en: 'Table database plugin', feeds: ['location', 'characters'], active: c => !!c.db },
  { id: 'tags', label: '聊天标签', label_en: 'Chat tags', feeds: ['events', 'characters', 'location'], active: () => true },
  { id: 'vars', label: '聊天变量 eden_map', label_en: 'Chat variable eden_map', feeds: ['custom', 'fog'], active: c => !!c.vars },
];
export const byId = id => SOURCES.find(s => s.id === id) || null;
/** EdenMap.sources() 的返回（形状与 v0.9.6 兼容，另加 list） */
export function summarize(c = {}) {
  const byc = {}; for (const ch of c.chars || []) { const k = ch?.src || 'infer'; byc[k] = (byc[k] || 0) + 1; }
  return {
    location: c.here ? (c.hereFromDb ? 'db' : 'mvu') : 'none',
    mvu: { present: !!c.hasMvu, mode: c.mode || (c.hasMvu ? 'mvu' : 'tags') },
    db: c.db || null, tags: true, characters: byc, varmap: { ...(c.varMap || {}) },
    list: SOURCES.map(s => ({ id: s.id, active: !!s.active(c), feeds: s.feeds })),
  };
}
