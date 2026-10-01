// 卡内脚本启动自检（纯函数：eden-map.js 在宿主页收集事实，这里判定；node 单测 tests/selfcheck.test.mjs）。
// 只在本机：不联网（线路可达用已有的测速 / 取页面结果）、不上传、不写进地址。
// 每一项 → { id, status: 'ok' | 'warn' | 'skip' | 'info', zh, en }；skip = 查不了（接口不存在等），不打扰用户；info = 有新版本（只在自检里显示）。
// 唯一的额外请求：正式版每天最多一次查 jsDelivr 数据接口的最新标签（UPDATE_API，不带 referrer、不带凭据）。

// 附加世界书（tools/build_worldbook_addon.py）的必需条目：按名字前缀认，版本号可以不同（v0.9.3 加了「地图人物位置」）
export const WB_ENTRIES = ['地图联动规范', '地图事件类型', '地图当前地点', '地图人物位置'];
// 按当前地点注入方位的 EJS 条目（可选；要「提示词模板」扩展才会展开）
export const LORE_PREFIX = '地图方位';

const item = (id, status, zh, en, extra) => ({ id, status, zh, en, ...extra });

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
/** 条目名规范化：去空白、全角半角统一、去掉常见的包裹符号（有人导入时会改成「【地图】地图联动规范」之类） */
export const wbNorm = s => String(s ?? '').normalize('NFKC').replace(/[\s【】\[\]（）()《》「」·•:：_-]/g, '');
/** 世界书条目 [{name, enabled}] → 缺了哪几个附加条目（名字包含即算、要启用） */
export function wbMissing(entries) {
  return WB_ENTRIES.filter(w => !entries.some(e => e && e.enabled !== false && wbNorm(e.name).includes(wbNorm(w))));
}
/** 酒馆助手不同版本的条目形状 → {name, enabled}：新接口 {name, enabled}；旧接口 {comment, enabled}；原始 ST {comment, disable} */
export const wbEntry = e => (e && typeof e === 'object' ? { name: e.name ?? e.comment ?? '', enabled: e.enabled ?? (e.disable === undefined ? true : !e.disable) } : null);
const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

/**
 * 收集世界书事实（v0.9.6，修 v0.9.5 的误报：用户导入并设为全局启用，自检仍说「缺少」）。
 * f = 取接口的函数 name => fn | null（宿主传 window / TavernHelper 上的同名函数；同步或返回 Promise 都行）。
 * 以前的问题：① 列书名的几个接口是 if / else if，只取了第一个；有的版本 getGlobalWorldbookNames 返回空（设置还没加载完）就不再看 getLorebookSettings；
 * ② 每本书取条目失败被吞掉，条目为空 → 四条全「缺少」；③ 名字只认前缀。
 * 现在：所有列名接口取并集；取条目 getWorldbook 失败再试 getLorebookEntries；一本都取不到 → null（查不了，跳过，不报警）；
 * 启用的书里没找到、但所有世界书里有附加条目 → { missing, imported: true }（提示「已导入但没启用」）。
 */
export async function collectWorldbook(f) {
  const call = async (n, ...a) => { const fn = f(n); if (typeof fn !== 'function') return undefined; try { return await fn(...a); } catch (e) { return undefined; } };
  const names = new Set(), add = n => { if (typeof n === 'string' && n) names.add(n); else if (n && typeof n === 'object' && typeof n.name === 'string') names.add(n.name); };
  let listed = false;
  for (const [n, pick, ...args] of [['getGlobalWorldbookNames', v => v], ['getLorebookSettings', v => v?.selected_global_lorebooks],
    ['getCharWorldbookNames', v => [v?.primary, ...arr(v?.additional)], 'current'], ['getCharLorebooks', v => [v?.primary, ...arr(v?.additional)]],
    ['getChatWorldbookName', v => [v], 'current'], ['getChatLorebook', v => [v]]]) {
    if (typeof f(n) !== 'function') continue; listed = true;
    arr(pick(await call(n, ...args))).forEach(add);
  }
  const hasGet = typeof f('getWorldbook') === 'function' || typeof f('getLorebookEntries') === 'function';
  if (!listed || !hasGet) return null;
  const entriesOf = async n => {
    let v = await call('getWorldbook', n); if (Array.isArray(v) || (v && typeof v === 'object')) return arr(v).map(wbEntry).filter(Boolean);
    v = await call('getLorebookEntries', n); if (Array.isArray(v)) return v.map(wbEntry).filter(Boolean);
    return null;
  };
  const entries = []; let got = 0;
  for (const n of names) { const e = await entriesOf(n); if (e) { got++; entries.push(...e); } }
  if (names.size && !got) return null;   // 一本都取不到：查不了，不报「缺少」
  const missing = wbMissing(entries), lore = entries.some(e => e.enabled !== false && wbNorm(e.name).startsWith(wbNorm(LORE_PREFIX)));
  let imported = false;
  if (missing.length) {   // 只在「缺」时再看所有世界书：区分「没导入」和「导入了但没启用 / 没绑定」
    const all = arr(await call('getWorldbookNames') ?? await call('getLorebooks'));
    for (const n of all) { if (typeof n !== 'string' || names.has(n)) continue; const e = await entriesOf(n); if (e && wbMissing(e).length < WB_ENTRIES.length) { imported = true; break; } }
  }
  return { missing, lore, imported };
}

/**
 * f = {
 *   api: { getChatMessages, eventOn, injectPrompts, tavern_events }（true / false）,
 *   mvu: null（没有 MVU）| { stat: 能不能读到 stat_data, here: 当前地点路径是否存在, candidates: [像地点的路径] },
 *   dup: { others: 本页加载过的其他地图脚本地址[], oldStyle: 有不带清理钩子的旧版脚本（v0.6.1）, replaced: 我们的按钮被别的脚本换掉 },
 *   line: { swappable, ok: true / false / null（还不知道）, name },
 *   worldbook: null（查不了）| { missing: [条目名], lore: 启用了「地图方位」EJS 条目 },
 *   vars: 酒馆助手聊天变量接口可用（自定义名称存聊天变量；否则存本机）, ejs: 「提示词模板」扩展（EjsTemplate）在,
 *   mvu.fields: { present: 有在场人物表, clock: 有世界时钟变量, outfit: 有着装变量 }（v0.9.3，缺了只是对应功能不显示）,
 *   db: null（没有表格数据库插件）| { tables, location: MVU 没地点时读了它的地点, chars: 它的表里有位置的人物数 }（tavern/tabledb-bridge.mjs）,
 *   version: { script: 脚本版本或 null（跟分支 / 本地）, viewer: 地图 build.json 的 version 或 null（还没打开过） },
 *   update: null | { current, latest }（有新正式版时多一项 status 'info'，不弹提示）
 * }
 */
export function evaluate(f) {
  const out = [];
  const a = f.api || {}, miss = ['getChatMessages', 'eventOn', 'injectPrompts', 'tavern_events'].filter(k => !a[k]);
  out.push(miss.length ? item('api', 'warn', `酒馆助手接口缺少 ${miss.join('、')}：事态与注入不可用（请更新酒馆助手）`, `TavernHelper API missing ${miss.join(', ')}: events and injection disabled (update TavernHelper)`)
    : item('api', 'ok', '酒馆助手接口齐全', 'TavernHelper API present'));

  const m = f.mvu, HP = (m && m.path) || '', HPz = HP ? `「${HP}」` : '当前地点变量', HPe = HP ? `"${HP}"` : 'the location variable';   // 路径由设定包 / 变量映射给出；都缺时只说「当前地点变量」
  const db = f.db || null;   // 表格数据库插件（tavern/tabledb-bridge.mjs）：null = 没检测到
  if (!m && db?.location) out.push(item('mvu', 'skip', 'MVU 变量框架未加载：当前地点改读数据库插件的表', 'MVU not loaded: current location comes from the table database plugin'));
  else if (!m) out.push(item('mvu', 'warn', 'MVU 变量框架未加载：地图无法跟随当前地点', 'MVU not loaded: the map cannot follow the current location'));
  else if (!m.stat) out.push(item('mvu', 'skip', '这个聊天还没有 MVU 变量（新聊天？）', 'No MVU variables in this chat yet (new chat?)'));
  else if (!m.here) {
    const c = (m.candidates || []).join('、');
    out.push(item('mvu', 'warn', `MVU 里没有${HPz}${c ? `（是不是改名成了 ${c}？）` : ''}：地图无法跟随当前地点`,
      `MVU has no ${HPe}${c ? ` (renamed to ${(m.candidates || []).join(', ')}?)` : ''}: the map cannot follow the current location`));
  } else out.push(item('mvu', 'ok', `MVU${HPz}可读`, `MVU ${HPe} readable`));
  if (m && m.stat && m.fields) {   // v0.9.3：人物栏 / 世界时间 / 着装读的字段；缺了不算错，只说明哪些功能不显示
    const F = [['present', '在场人物', 'present characters', '人物栏只用聊天标签', 'panel uses chat tags only'], ['clock', '世界时间', 'world clock', '不显示世界时间与夜色', 'no clock or night tint'], ['outfit', '着装', 'outfit', '不显示着装', 'no outfit line']];
    const miss = F.filter(f => !m.fields[f[0]]);
    out.push(miss.length ? item('mvu_fields', 'skip', `MVU 没有 ${miss.map(f => f[1]).join('、')}：${miss.map(f => f[3]).join('；')}`, `MVU lacks ${miss.map(f => f[2]).join(', ')}: ${miss.map(f => f[4]).join('; ')}`)
      : item('mvu_fields', 'ok', 'MVU 在场人物 / 世界时间 / 着装可读', 'MVU present characters / clock / outfit readable'));
  }
  // v0.9.5 变量映射：现在用哪种读法（设置「变量映射」可改）
  if (f.varmode === 'mvu') out.push(item('varmap', 'ok', HP ? `读法：MVU（地点 ${HP}）` : '读法：MVU', HP ? `Mode: MVU (location ${HP})` : 'Mode: MVU'));
  else if (f.varmode === 'mvu-partial') out.push(item('varmap', 'warn', '有 MVU，但没找到地点字段：到设置「变量映射」里选一个', 'MVU found, but no location field: pick one under Settings → Variable mapping'));
  else if (f.varmode === 'tags' && f.db?.location) out.push(item('varmap', 'skip', '读法：当前地点读数据库插件的表；事态、人物读聊天标签（没有 MVU）', 'Mode: location from the table database plugin; events and people from chat tags (no MVU)'));
  else if (f.varmode === 'tags') out.push(item('varmap', 'skip', '读法：聊天标签（没有 MVU；事态、人物、当前地点都从聊天里的标签读）', 'Mode: chat tags (no MVU; events, people and location come from chat tags)'));
  if ('vars' in f) out.push(f.vars ? item('vars', 'ok', '自定义名称存在聊天变量（跟着聊天走）', 'Custom names stored in chat variables')
    : item('vars', 'warn', '酒馆助手没有聊天变量接口：自定义名称只存本机浏览器（请更新酒馆助手）', 'No TavernHelper chat-variable API: custom names stay in this browser only (update TavernHelper)'));

  if (db) out.push(item('shujuku', 'ok', `数据库插件：已检测 / 兼容模式（只读，${db.tables} 张表${db.location ? '；当前地点读自它的表' : ''}${db.chars ? `；人物位置 ${db.chars} 人` : ''}）`,
    `Table database plugin: detected / compatible mode (read-only, ${db.tables} tables${db.location ? '; current location read from its table' : ''}${db.chars ? `; ${db.chars} character locations` : ''})`));
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
  else if (w.missing.length && w.imported) out.push(item('worldbook', 'info', `世界书附加条目已导入但没有启用：${w.missing.join('、')}（已在后台静默绑定，稍后自动生效；要立刻写入可到「数据与映射」）`,
    `Lorebook add-on imported but not active: ${w.missing.join(', ')} (binding silently in the background; use Data & mapping to write it now)`));
  else if (w.missing.length) out.push(item('worldbook', 'warn', `世界书附加条目缺少：${w.missing.join('、')}（导入${f.wbBook ? `「${f.wbBook}」` : '附加条目的世界书'}，并在世界书里设为全局、或绑定到当前角色 / 聊天；刚导入的话刷新一次页面）`,
    `Lorebook add-on entries missing: ${w.missing.join(', ')} (import ${f.wbBook ? `"${f.wbBook}"` : 'the add-on lorebook'} and activate it globally or bind it to this character / chat; refresh once after importing)`, { book: f.wbBook || '' }));
  else out.push(item('worldbook', 'ok', '世界书附加条目已启用', 'Lorebook add-on entries enabled'));
  if (w && f.wbWhere !== undefined) {   // N15：附加书挂在哪儿（char / global / chat / none）；只显示，不改绑定
    const W = { char: ['角色附加世界书', 'character additional books'], global: ['全局', 'global'], chat: ['当前聊天', 'this chat'], none: ['哪里都没挂', 'nowhere'] }, k = W[f.wbWhere] ? f.wbWhere : 'none';
    out.push(item('worldbook-bound', k === 'none' ? 'info' : 'ok', `世界书附加条目绑定位置：${W[k][0]}`, `Lorebook add-on bound to: ${W[k][1]}`, { where: k }));
  }
  if (w && w.lore && f.ejs === false) out.push(item('ejs', 'warn', '启用了「地图方位」条目，但没检测到「提示词模板」扩展：条目会原样发给模型（装上扩展，或关掉这几条）',
    'Map location lore entries enabled but the Prompt Template extension is missing: raw EJS would reach the model (install it or disable those entries)'));

  const v = f.version || {};
  if (!v.script || !v.viewer) out.push(item('version', 'skip', !v.script ? '脚本跟随分支或本地，不比对版本' : '地图还没打开过，版本待比对', !v.script ? 'Script follows a branch or local copy, version not compared' : 'Map not opened yet, version not compared'));
  else if (v.script !== v.viewer) out.push(item('version', 'warn', `脚本 v${v.script} 与地图 v${v.viewer} 版本不一致：可能是缓存，刷新页面或换线路`, `Script v${v.script} and map v${v.viewer} differ: probably a cache, reload or switch route`));
  else out.push(item('version', 'ok', `版本一致 v${v.script}`, `Versions match v${v.script}`));
  const u = f.update;
  if (u && u.latest && cmpVer(u.latest, u.current) > 0) { const zh = u.channel === 'latest' ? '：刷新酒馆页面即可' : u.channel === 'locked' ? '：你锁定了当前版本，到「关于」解锁后刷新' : '', en = u.channel === 'latest' ? ': reload the Tavern page' : u.channel === 'locked' ? ': unlock the version in About, then reload' : '';
    out.push(item('update', 'info', `有新版本 ${fmtVer(u.latest)}（当前 ${fmtVer(u.current)}）${zh}`, `New version ${fmtVer(u.latest)} (current ${fmtVer(u.current)})${en}`)); }
  // 酒馆助手采纳（docs/tavernhelper-audit.md B3 / B4 / B7）：卡身份、宿主版本只报告（兼容判断仍靠功能探测）；正则只读
  if (f.card) out.push(item('card', 'info', `角色卡：${f.card.name}${f.card.version ? ` ${f.card.version}` : ''}`, `Character card: ${f.card.name}${f.card.version ? ` ${f.card.version}` : ''}`));
  if (f.host && (f.host.th || f.host.st)) out.push(item('host', 'info', `酒馆助手 ${f.host.th || '?'} · 酒馆 ${f.host.st || '?'}`, `TavernHelper ${f.host.th || '?'} · SillyTavern ${f.host.st || '?'}`));
  if (f.regex) out.push(f.regex.hidesVars ? item('regex', 'ok', `角色卡正则 ${f.regex.n} 条：变量更新块在显示时隐藏`, `${f.regex.n} character regex(es): variable-update blocks hidden in display`)
    : item('regex', 'skip', `角色卡正则 ${f.regex.n} 条：没有隐藏变量更新块的显示正则（只影响正文显示，地图照常读取）`, `${f.regex.n} character regex(es): none hides variable-update blocks in display (display only; the map still reads them)`));
  // 交互方式 (d) 标签对账：MVU 与正文地点标签不一致的楼层（以 MVU 为准，这里只列出来）
  if (Array.isArray(f.conflicts) && f.conflicts.length) out.push(item('conflict', 'info', `地点不一致 ${f.conflicts.length} 楼（按 MVU）：${f.conflicts.slice(-3).map(c => `#${c.floor} MVU「${c.mvu}」≠ 标签「${c.tag}」`).join('；')}`,
    `${f.conflicts.length} floor(s) where the location tag disagrees with MVU (MVU wins): ${f.conflicts.slice(-3).map(c => `#${c.floor} MVU "${c.mvu}" vs tag "${c.tag}"`).join('; ')}`));
  // 交互方式 (e) 检查点：上次确认的楼层 / swipe 和现在对不上（中途被杀、切了 swipe）→ 已从聊天记录重新推导
  if (f.checkpoint && f.checkpoint.reason && !['match', 'none'].includes(f.checkpoint.reason)) out.push(item('checkpoint', 'info', `上次确认到第 ${f.checkpoint.floor} 楼（${{ ahead: '之后的楼层还没有变量快照', swiped: '那一楼换了 swipe', missing: '那一楼已不存在' }[f.checkpoint.reason] || f.checkpoint.reason}），已从聊天记录重新推导`,
    `Last confirmed floor ${f.checkpoint.floor} (${{ ahead: 'later floors have no variable snapshot yet', swiped: 'that floor was swiped', missing: 'that floor no longer exists' }[f.checkpoint.reason] || f.checkpoint.reason}); re-derived from chat`));
  return out;
}

// ---------------- 正式版更新检查（只对钉了标签 map-vX.Y.Z 的正式版脚本；跟分支的预览脚本不查） ----------------
export const UPDATE_API = repo => `https://data.jsdelivr.com/v1/packages/gh/${repo}`;
export const MS_PER_DAY = 24 * 3600 * 1000;
/** 版本号：X.Y.Z，或带第 4 段小修补丁 X.Y.Z.P（0.9.6 < 0.9.6.1 < 0.9.7）；系列（构建编码的 S<n>）≥ 2 时写成 'S2:0.1.0'（不带前缀 = S1）。
 *  排序按（系列, 版本）：S2:0.1.0 > 0.9.9。标签：S1 = map-vX.Y.Z[.P]（沿用），S≥2 = map-s<n>-vX.Y.Z[.P]（不和 map-v0.x 撞）。见 docs/versioning.md */
export const VER_RE = /^(?:S\d+:)?\d+\.\d+\.\d+(?:\.\d+)?$/;
const TAG_RE = /^map-(?:s(\d+)-)?v(\d+\.\d+\.\d+(?:\.\d+)?)$/;
/** 'S2:0.1.0' → { series: 2, ver: '0.1.0', parts: [0,1,0] }；'0.9.6' → series 1 */
export function parseVer(v) {
  const m = /^(?:S(\d+):)?(.*)$/.exec(String(v ?? '').trim()), ver = m[2];
  return { series: m[1] ? +m[1] : 1, ver, parts: ver.split('.').map(Number) };
}
/** 规范写法：S1 不带前缀 */
export const fullVer = (series, ver) => (+series > 1 ? `S${+series}:${ver}` : String(ver));
/** build.json（{ version, code: 'S2-0100-R-0001' }）→ 规范版本 */
export const buildVer = b => (b?.version ? fullVer((/^S(\d+)-/.exec(b.code || '') || [])[1] || 1, b.version) : null);
/** 版本 → 标签 / 反过来 */
export const tagOf = v => { const p = parseVer(v); return p.series > 1 ? `map-s${p.series}-v${p.ver}` : `map-v${p.ver}`; };
export const verOfTag = t => { const m = TAG_RE.exec(String(t || '')); return m ? fullVer(m[1] || 1, m[2]) : null; };
/** 给人看：'v0.9.6' / 'S2 v0.1.0' */
export const fmtVer = v => { const p = parseVer(v); return (p.series > 1 ? `S${p.series} ` : '') + 'v' + p.ver; };
/** 版本号比较：先比系列，再逐段比；缺的段按 0（0.9.6 == 0.9.6.0 < 0.9.6.1 < 0.9.7 < S2:0.1.0） */
export function cmpVer(a, b) {
  const A = parseVer(a), B = parseVer(b);
  if (A.series !== B.series) return A.series > B.series ? 1 : -1;
  const x = A.parts, y = B.parts;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
/** jsDelivr 数据接口的返回（新版 {versions:[{version}]} 或旧版 {versions:['…']}）→ 最新的正式版（规范写法，两种标签都认），没有返回 null */
export function latestTag(json) {
  let best = null;
  for (const v of json?.versions || []) {
    const x = verOfTag(typeof v === 'string' ? v : v?.version);
    if (x && (!best || cmpVer(x, best) > 0)) best = x;
  }
  return best;
}
/** 距上次检查（不论成败）满一天才再查 */
export const dueCheck = (lastAt, now) => !(lastAt > 0) || now - lastAt >= MS_PER_DAY || now < lastAt;
/** 脚本地址换成另一个正式版（只认 gh 标签地址，两种标签；npm / 分支地址返回 null） */
export function swapVer(url, to) {
  const m = String(url).match(/@(map-(?:s\d+-)?v\d+\.\d+\.\d+(?:\.\d+)?)\//);
  return m && VER_RE.test(String(to)) ? String(url).replace(m[0], `@${tagOf(to)}/`) : null;
}
/** 需要弹一次提示的警告签名（同一组警告只提示一次，不按聊天重复） */
export const warnSig = items => items.filter(i => i.status === 'warn').map(i => i.id).sort().join(',');

/** v0.9.6「检查更新」的结论：current = 正在用的版本（build.json），latest = 最新 map-v 标签；跟随分支的版本可能比最新标签还新（未发版）→ 也算最新 */
export function updateVerdict(current, latest, channel) {
  if (!latest) return { status: 'fail' };
  if (!current) return { status: 'new', latest, channel };
  return cmpVer(latest, current) > 0 ? { status: 'new', latest, current, channel } : { status: 'latest', latest, current, channel };
}

// ---------------- 自动检查更新（设置「自动检查更新」默认开） ----------------
// 实时：脚本加载时、每次打开地图时查一次，面板开着时每 AUTO_EVERY（10 分钟）再查；两次之间至少隔 AUTO_MIN（1 分钟）。本地 / 单独打开不查。
export const AUTO_EVERY = 10 * 60 * 1000, AUTO_MIN = 60 * 1000;
/** 这次要不要查：'skip'（关了 / 本地 / 离上次不到 1 分钟）或 'fetch' */
export function autoCheckPlan({ enabled = true, channel = 'local', lastAt = 0, now = Date.now() } = {}) {
  if (!enabled || channel === 'local') return 'skip';
  return lastAt > 0 && now >= lastAt && now - lastAt < AUTO_MIN ? 'skip' : 'fetch';
}
/** 要不要弹「地图有新版」：有新版、不是用户说过「此版本不再提示」的那个版本 */
export const shouldPrompt = (verdict, skipVer) => verdict?.status === 'new' && !!verdict.latest && verdict.latest !== skipVer;
/** 提示文案：怎么更新取决于脚本是跟随分支（刷新即可）还是钉了版本（重新导入） */
export function updatePromptText(latest, channel, en = false, names = {}) {   // names.script：导入的脚本名（host-strings app.script），没给就是中性默认
  const follow = channel === 'follow', script = names.script || (en ? '[Map] Spatial Map' : '【地图】空间地图');
  return {
    title: en ? `New map version ${fmtVer(latest)}` : `地图有新版 ${fmtVer(latest)}`,
    how: channel === 'latest' ? (en ? 'Reload the Tavern page to use it (the script always loads the latest release).' : '刷新酒馆页面就会用上（脚本每次加载最新正式版）')
      : channel === 'locked' ? (en ? 'You locked the current version: turn off "Lock current version" in map settings › About, then reload.' : '你锁定了当前版本：到地图设置「关于」关掉「锁定当前版本」再刷新')
      : follow ? (en ? 'Your script follows the branch: reload the Tavern page to use it.' : '你的脚本跟随分支：刷新酒馆页面就会用上')
      : (en ? `Your script is pinned: re-import the new script "${script} ${fmtVer(latest)}" (same name, overwrite).` : `你的脚本钉了版本：重新导入新版脚本「${script} ${fmtVer(latest)}」（同名覆盖）`),
    // 主按钮：能刷新就用上的通道 =「刷新载入」；钉了版本 =「本次切换到新版本」；锁定 = 无主按钮（要先去设置解锁）
    act: channel === 'locked' ? null : channel === 'latest' || follow ? (en ? 'Reload' : '刷新载入') : (en ? 'Switch for this session' : '本次切换到新版本'),
    actKind: channel === 'locked' ? null : channel === 'latest' || follow ? 'reload' : 'switch',
    notes: en ? 'Release notes' : '更新说明', later: en ? 'Later' : '稍后', skip: en ? "Don't remind me for this version" : '此版本不再提示',
  };
}
// ---------------- 强制更新（最新正式版的 build.json 里写 min_version / force_reason）----------------
/** 正在用的版本低于 min_version → 需要强制提示（本次会话可以关，下次加载再弹；地图照常可用） */
export const mustUpdate = (current, min) => !!current && !!min && VER_RE.test(String(min)) && cmpVer(current, min) < 0;
export function forceText(current, min, latest, channel, reason = '', en = false, names = {}) {
  const p = updatePromptText(latest || min, channel, en, names);
  return { title: en ? `Map ${fmtVer(current)} is no longer supported: please update` : `此版本（${fmtVer(current)}）已停止支持，请更新`,
    lines: [reason ? String(reason).slice(0, 200) : (en ? `Minimum supported version: ${fmtVer(min)}.` : `最低支持版本 ${fmtVer(min)}`), p.how], notes: p.notes,
    close: en ? 'Close for this session' : '本次关闭' };
}
