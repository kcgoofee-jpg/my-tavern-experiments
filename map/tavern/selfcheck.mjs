// 卡内脚本启动自检（纯函数：eden-map.js 在宿主页收集事实，这里判定；node 单测 tests/selfcheck.test.mjs）。
// 只在本机：不联网（线路可达用已有的测速 / 取页面结果）、不上传、不写进地址。
// 每一项 → { id, status: 'ok' | 'warn' | 'skip' | 'info', zh, en }；skip = 查不了（接口不存在等），不打扰用户；info = 有新版本（只在自检里显示）。
// 唯一的额外请求：正式版每天最多一次查 jsDelivr 数据接口的最新标签（UPDATE_API，不带 referrer、不带凭据）。

export const HERE_PATH = '世界.当前地点';
// 附加世界书（tools/build_worldbook_addon.py）的必需条目：按名字前缀认，版本号可以不同（v0.9.3 加了「地图人物位置」）
export const WB_ENTRIES = ['地图联动规范', '地图事件类型', '地图当前地点', '地图人物位置'];
// 按当前地点注入方位的 EJS 条目（可选；要「提示词模板」扩展才会展开）
export const LORE_PREFIX = '地图方位';

const item = (id, status, zh, en) => ({ id, status, zh, en });

/** 在 MVU 的 stat_data 里找「像当前地点」的路径（作者改名时给提示）：键名含 地点 / 位置 / location，最多 3 条 */
export function findPaths(obj, re = /地点|位置|location/i, max = 3) {
  const out = [], seen = new Set();
  const walk = (o, pre, depth) => {
    if (!o || typeof o !== 'object' || depth > 4 || seen.has(o) || out.length >= max) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const p = pre ? pre + '.' + k : k;
      if (re.test(k) && (typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'string'))) { out.push(p); if (out.length >= max) return; }
      else walk(v, p, depth + 1);
    }
  };
  walk(obj, '', 0); return out;
}
/** 取路径（a.b.c）；MVU 的值可能是 [值, 说明] */
export function getPath(obj, path) {
  let v = obj; for (const k of path.split('.')) { if (v == null || typeof v !== 'object' || !(k in v)) return undefined; v = v[k]; }
  return Array.isArray(v) ? v[0] : v;
}
/** 世界书条目 [{name, enabled}] → 缺了哪几个附加条目（名字前缀匹配、要启用） */
export function wbMissing(entries) {
  return WB_ENTRIES.filter(w => !entries.some(e => e && e.enabled !== false && String(e.name || '').startsWith(w)));
}

/**
 * f = {
 *   api: { getChatMessages, eventOn, injectPrompts, tavern_events }（true / false）,
 *   mvu: null（没有 MVU）| { stat: 能不能读到 stat_data, here: 当前地点路径是否存在, candidates: [像地点的路径] },
 *   dup: { others: 本页加载过的其他地图脚本地址[], oldStyle: 有不带清理钩子的旧版脚本（v0.6.1）, replaced: 我们的按钮被别的脚本换掉 },
 *   line: { swappable, ok: true / false / null（还不知道）, name },
 *   worldbook: null（查不了）| { missing: [条目名], lore: 启用了「地图方位」EJS 条目 },
 *   vars: 酒馆助手聊天变量接口可用（自定义名称存聊天变量；否则存本机）, ejs: 「提示词模板」扩展（EjsTemplate）在,
 *   mvu.fields: { present: 有在场人物表, clock: 有世界.当前时刻, outfit: 有主角.着装 }（v0.9.3，缺了只是对应功能不显示）,
 *   version: { script: 脚本版本或 null（跟分支 / 本地）, viewer: 地图 build.json 的 version 或 null（还没打开过） },
 *   update: null | { current, latest }（有新正式版时多一项 status 'info'，不弹提示）
 * }
 */
export function evaluate(f) {
  const out = [];
  const a = f.api || {}, miss = ['getChatMessages', 'eventOn', 'injectPrompts', 'tavern_events'].filter(k => !a[k]);
  out.push(miss.length ? item('api', 'warn', `酒馆助手接口缺少 ${miss.join('、')}：事态与注入不可用（请更新酒馆助手）`, `TavernHelper API missing ${miss.join(', ')}: events and injection disabled (update TavernHelper)`)
    : item('api', 'ok', '酒馆助手接口齐全', 'TavernHelper API present'));

  const m = f.mvu;
  if (!m) out.push(item('mvu', 'warn', 'MVU 变量框架未加载：地图无法跟随当前地点', 'MVU not loaded: the map cannot follow the current location'));
  else if (!m.stat) out.push(item('mvu', 'skip', '这个聊天还没有 MVU 变量（新聊天？）', 'No MVU variables in this chat yet (new chat?)'));
  else if (!m.here) {
    const c = (m.candidates || []).join('、');
    out.push(item('mvu', 'warn', `MVU 里没有「${HERE_PATH}」${c ? `（是不是改名成了 ${c}？）` : ''}：地图无法跟随当前地点`,
      `MVU has no "${HERE_PATH}"${c ? ` (renamed to ${(m.candidates || []).join(', ')}?)` : ''}: the map cannot follow the current location`));
  } else out.push(item('mvu', 'ok', `MVU「${HERE_PATH}」可读`, `MVU "${HERE_PATH}" readable`));
  if (m && m.stat && m.fields) {   // v0.9.3：人物栏 / 世界时间 / 着装读的字段；缺了不算错，只说明哪些功能不显示
    const F = [['present', '在场人物', 'present characters', '人物栏只用聊天标签', 'panel uses chat tags only'], ['clock', '世界.当前时刻', 'world clock', '不显示世界时间与夜色', 'no clock or night tint'], ['outfit', '主角.着装', 'outfit', '不显示着装', 'no outfit line']];
    const miss = F.filter(f => !m.fields[f[0]]);
    out.push(miss.length ? item('mvu_fields', 'skip', `MVU 没有 ${miss.map(f => f[1]).join('、')}：${miss.map(f => f[3]).join('；')}`, `MVU lacks ${miss.map(f => f[2]).join(', ')}: ${miss.map(f => f[4]).join('; ')}`)
      : item('mvu_fields', 'ok', 'MVU 在场人物 / 世界时间 / 着装可读', 'MVU present characters / clock / outfit readable'));
  }
  if ('vars' in f) out.push(f.vars ? item('vars', 'ok', '自定义名称存在聊天变量（跟着聊天走）', 'Custom names stored in chat variables')
    : item('vars', 'warn', '酒馆助手没有聊天变量接口：自定义名称只存本机浏览器（请更新酒馆助手）', 'No TavernHelper chat-variable API: custom names stay in this browser only (update TavernHelper)'));

  const d = f.dup || {};
  if (d.oldStyle || d.replaced || (d.others || []).length) out.push(item('dup', 'warn', '检测到另一个地图脚本（如旧卡「地图版 v0.6.1」自带的「【地图】世界地图」）：请只启用一个，否则两个悬浮按钮会互相替换',
    'Another map script detected (e.g. the old v0.6.1 card\'s built-in map script): enable only one, or the two buttons keep replacing each other'));
  else out.push(item('dup', 'ok', '只有一个地图脚本', 'Only one map script'));

  const l = f.line || {};
  if (!l.swappable) out.push(item('line', 'skip', '本地地址，不测线路', 'Local address, route not tested'));
  else if (l.ok === true) out.push(item('line', 'ok', `线路可达${l.name ? `（${l.name}）` : ''}`, `Route reachable${l.name ? ` (${l.name})` : ''}`));
  else if (l.ok === false) out.push(item('line', 'warn', '地图线路都连不上：点开地图可手动换线路', 'No map route reachable: open the map to pick one manually'));
  else out.push(item('line', 'skip', '线路还没测', 'Route not tested yet'));

  const w = f.worldbook;
  if (!w) out.push(item('worldbook', 'skip', '查不了世界书（酒馆助手没有世界书接口）', 'Cannot inspect lorebooks (no TavernHelper lorebook API)'));
  else if (w.missing.length) out.push(item('worldbook', 'warn', `世界书附加条目缺少：${w.missing.join('、')}（导入「伊甸地图·世界书附加条目」，并在世界书里设为全局、或绑定到当前角色 / 聊天；刚导入的话刷新一次页面）`,
    `Lorebook add-on entries missing: ${w.missing.join(', ')} (import the Eden map add-on lorebook and activate it globally or bind it to this character / chat; refresh once after importing)`));
  else out.push(item('worldbook', 'ok', '世界书附加条目已启用', 'Lorebook add-on entries enabled'));
  if (w && w.lore && f.ejs === false) out.push(item('ejs', 'warn', '启用了「地图方位」条目，但没检测到「提示词模板」扩展：条目会原样发给模型（装上扩展，或关掉这几条）',
    'Map location lore entries enabled but the Prompt Template extension is missing: raw EJS would reach the model (install it or disable those entries)'));

  const v = f.version || {};
  if (!v.script || !v.viewer) out.push(item('version', 'skip', !v.script ? '脚本跟随分支或本地，不比对版本' : '地图还没打开过，版本待比对', !v.script ? 'Script follows a branch or local copy, version not compared' : 'Map not opened yet, version not compared'));
  else if (v.script !== v.viewer) out.push(item('version', 'warn', `脚本 v${v.script} 与地图 v${v.viewer} 版本不一致：可能是缓存，刷新页面或换线路`, `Script v${v.script} and map v${v.viewer} differ: probably a cache, reload or switch route`));
  else out.push(item('version', 'ok', `版本一致 v${v.script}`, `Versions match v${v.script}`));
  const u = f.update;
  if (u && u.latest && cmpVer(u.latest, u.current) > 0) out.push(item('update', 'info', `有新版本 v${u.latest}（当前 v${u.current}）`, `New version v${u.latest} (current v${u.current})`));
  return out;
}

// ---------------- 正式版更新检查（只对钉了标签 map-vX.Y.Z 的正式版脚本；跟分支的预览脚本不查） ----------------
export const UPDATE_API = repo => `https://data.jsdelivr.com/v1/packages/gh/${repo}`;
export const DAY = 24 * 3600 * 1000;
/** 版本号比较：'0.10.0' > '0.9.1' */
export function cmpVer(a, b) {
  const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
/** jsDelivr 数据接口的返回（新版 {versions:[{version}]} 或旧版 {versions:['…']}）→ 最新的 map-v 版本号（不带 map-v），没有返回 null */
export function latestTag(json) {
  let best = null;
  for (const v of json?.versions || []) {
    const m = String(typeof v === 'string' ? v : v?.version || '').match(/^map-v(\d+\.\d+\.\d+)$/);
    if (m && (!best || cmpVer(m[1], best) > 0)) best = m[1];
  }
  return best;
}
/** 距上次检查（不论成败）满一天才再查 */
export const dueCheck = (lastAt, now) => !(lastAt > 0) || now - lastAt >= DAY || now < lastAt;
/** 脚本地址换成另一个标签版本（只认 gh 标签地址；npm / 分支地址返回 null） */
export function swapVer(url, to) {
  const m = String(url).match(/@map-v(\d+\.\d+\.\d+)\//);
  return m && /^\d+\.\d+\.\d+$/.test(String(to)) ? String(url).replace(m[0], `@map-v${to}/`) : null;
}
/** 需要弹一次提示的警告签名（同一组警告只提示一次，不按聊天重复） */
export const warnSig = items => items.filter(i => i.status === 'warn').map(i => i.id).sort().join(',');
