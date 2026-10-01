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

// ---------------- 脚本源分支注册表（设置「更新与版本」→ 版本分支切换；docs/branching.md 的 main + preview 双轨） ----------------
// 宿主用 branchOf() 识别当前分支、branchUrl() 算切换目标地址；列表随 about 消息发给查看器渲染下拉。
// 旧名 cloud/tc-mid-low 是 preview 的历史兼容镜像，识别时折算成 preview、不再单列（镜像退役见 docs/branching.md）。
export const BRANCHES = [
  { id: 'main', label: 'main · 正式稳定版', label_en: 'main · stable release' },
  { id: 'preview', label: 'preview · 开发预览版', label_en: 'preview · dev preview' },
];

/** ref（分支名 / 发版标签 / 提交号）→ 分支 id。发版标签属于发版线（main）；提交号、本地路径认不出 → null（调用方自己降级） */
export function branchOf(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref === 'cloud/tc-mid-low') return 'preview';
  if (BRANCHES.some(b => b.id === ref)) return ref;
  return /^map-(?:s\d+-)?v[\d.]+$/.test(ref) ? 'main' : null;
}

/** gh 线路的脚本地址（…/gh/<仓库>@<ref>/…）换成目标分支地址；换不了（本地 / npm / 分支名不在注册表）返回 null */
export function branchUrl(url, branch) {
  if (typeof url !== 'string' || !BRANCHES.some(b => b.id === branch)) return null;
  const m = url.match(/^(https:\/\/[^/]+\/gh\/[^@]+)@[^/]+(\/.+)$/);
  return m ? `${m[1]}@${branch}${m[2]}` : null;
}
