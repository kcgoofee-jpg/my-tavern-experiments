// WB-2: the readme entry of an add-on book. A book that explains itself: what it is, which version, when and by which map build it was written,
// how many entries are on / off and why, and what to send with a bug report. One entry, always DISABLED (never injected, costs no tokens),
// rewritten on every sync that writes the book. Pure text: the sync module hands in the facts, tests pin the lines.
export const README_ID = 'map.readme';

const pad = n => String(n).padStart(2, '0');
/** 'YYYY-MM-DD HH:MM' in local time; '' when the time is missing */
export const stamp = ms => { const d = new Date(ms); return Number.isFinite(+d) && ms ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };

/** A human-readable version of a ship `ver` ("0.9.8+98435f09"): release, build date, the content id only as a trailing id.
 *  S = the shipped book ({ ver, version, built }); only the shipped version knows its date. */
export function verLabel(ver, S) {
  if (!ver) return '';
  const [rel, id] = String(ver).split('+'), cur = !!S && S.ver === ver;
  return `${(cur && S.version) || rel}${cur && S.built ? ' · ' + S.built : ''}${id ? ` (id ${id})` : ''}`;
}

const TXT = {
  zh: {
    name: (t, v, b) => `说明 · ${t} · ${v}${b ? ' · ' + b : ''}`,
    head: t => `这本书是「${t}」：地图脚本自动写入、自动更新，不是角色卡自带的。`,
    ver: (l, id) => `【版本】${l}${id ? `（内容编号 ${id}）` : ''}`,
    last: (t, m, a) => `【最近一次写入】${t || '时间不详'}，由地图${m ? ' ' + m : ''}写入（${a ? '自动同步' : '手动写入'}）。`,
    del: '【要不要删旧书】不用。地图每次打开、版本变化时按条目编号在原地更新这本书：旧版条目换成新内容，不再用的降为最低优先级，你自己改过的条目原样保留。想删也行，地图会重新建好。',
    self: '【这一条自己】始终关着，不会发给模型，不占 token；每次写入时重写。',
    count: (n, c, k, on, off) => `【现在书里】共 ${n} 条：常驻 ${c} 条，关键词触发 ${k} 条；写入时开着 ${on} 条，关着 ${off} 条（不含这一条）。`,
    jitOn: '【为什么有关着的】「世界书按需挂载」开着：地图只开你所在地点附近的关键词条目，其余故意关着，换地点时自动切换。每次切换都会改变发给模型的内容，对提示缓存不利；关掉它，所有条目会重新开着。',
    jitOff: '【为什么有关着的】「世界书按需挂载」关着：地图发的条目全部开着。如果还有条目关着，是你自己关的。',
    bug: '【报 bug 时请附上】这一条的名字（含版本和构建号）、「最近一次写入」这一行，和 设置 › 数据与映射 里世界书那一栏的状态。',
  },
  en: {
    name: (t, v, b) => `Readme · ${t} · ${v}${b ? ' · ' + b : ''}`,
    head: t => `This book is "${t}": written and updated by the map script on its own; it does not come with the character card.`,
    ver: (l, id) => `[Version] ${l}${id ? ` (content id ${id})` : ''}`,
    last: (t, m, a) => `[Last write] ${t || 'time unknown'}, by the map${m ? ' ' + m : ''} (${a ? 'automatic sync' : 'manual write'}).`,
    del: '[Delete the old book?] No. Every time the map opens or its version changes, it updates this book in place by entry id: old entries get the new text, retired ones drop to the lowest priority, entries you edited are kept as they are. You may delete it; the map builds it again.',
    self: '[This entry] Always disabled, never sent to the model, costs no tokens; rewritten on every write.',
    count: (n, c, k, on, off) => `[In the book now] ${n} entries: ${c} constant, ${k} keyword-triggered; ${on} on and ${off} off when last written (this entry not counted).`,
    jitOn: '[Why some are off] "Worldbook JIT" is on: the map keeps only the keyword entries near your current place enabled and switches the rest off on purpose, swapping them as you move. Each switch changes what the model receives, which hurts the prompt cache; turn it off and every entry is on again.',
    jitOff: '[Why some are off] "Worldbook JIT" is off: every entry the map ships is on. Any entry that is off, you turned off.',
    bug: '[With a bug report, send] this entry\'s name (it carries the version and build), the "Last write" line, and the worldbook row of Settings > Data & mapping.',
  },
};

/** f = { title, S (shipped book), map: { version, build, at }, now, auto, jit, lang, counts: { total, constant, keyword, on, off } } -> { name, content } */
export function readme(f) {
  const L = TXT[f.lang === 'en' ? 'en' : 'zh'], S = f.S || {}, id = String(S.ver || '').split('+')[1] || '', label = verLabel(S.ver, S) || '?', c = f.counts || {};
  const build = Number.isInteger(f.map?.build) ? `head #${f.map.build}` : '';
  const mapVer = [f.map?.version, build].filter(Boolean).join(' ');
  const content = [L.head(f.title), L.ver(label.replace(/ \(id [^)]*\)$/, ''), id), L.last(stamp(f.now), mapVer, f.auto !== false), L.del, L.self,
    L.count(c.total | 0, c.constant | 0, c.keyword | 0, c.on | 0, c.off | 0), f.jit ? L.jitOn : L.jitOff, L.bug].join('\n');
  return { name: L.name(f.title, S.version || String(S.ver || '').split('+')[0], build), content };
}
const CUSTOM = {
  zh: {
    name: (b) => `说明 · 本聊天的自定义地点书${b ? ' · ' + b : ''}`,
    body: (n, mapVer, t, on) => ['这本书是地图为这个聊天单独写的：你在地图里给地点起的名字、写的说明、用途和事实，各存成一条，只在这个聊天里生效，且以这里的文字为准。',
      `【最近一次写入】${t || '时间不详'}，由地图${mapVer ? ' ' + mapVer : ''}写入（${on ? '同步开着' : '同步已关，条目全部停用'}）。`,
      `【现在书里】一条索引（名字对照）和 ${n} 个地点条目；这一条说明自己始终关着，不发给模型，不占 token。`,
      '【要不要手动处理】不用：地图改了自定义内容就在原地重写这本书；不想用就在地图设置里关掉同步，或删掉这本书。',
      '【报 bug 时请附上】这一条的名字（含构建号）和「最近一次写入」这一行。'].join('\n'),
  },
  en: {
    name: (b) => `Readme · this chat's custom places${b ? ' · ' + b : ''}`,
    body: (n, mapVer, t, on) => ['This book is written by the map for this chat alone: the names, descriptions, uses and facts you gave places in the map, one entry each. It applies only to this chat and its text takes precedence.',
      `[Last write] ${t || 'time unknown'}, by the map${mapVer ? ' ' + mapVer : ''} (${on ? 'sync on' : 'sync off, every entry disabled'}).`,
      `[In the book now] one index entry (name pairs) and ${n} place entries; this readme is always disabled, never sent to the model, costs no tokens.`,
      '[Do you need to do anything?] No: the map rewrites this book in place when your customs change; to stop, turn the sync off in the map settings or delete the book.',
      '[With a bug report, send] this entry\'s name (it carries the build) and the "Last write" line.'].join('\n'),
  },
};
/** The readme of a chat's custom book. f = { map: { version, build }, now, lang, on, count (place entries) } -> { name, content } */
export function customReadme(f) {
  const L = CUSTOM[f.lang === 'en' ? 'en' : 'zh'], build = Number.isInteger(f.map?.build) ? `head #${f.map.build}` : '', mapVer = [f.map?.version, build].filter(Boolean).join(' ');
  return { name: L.name(build), content: L.body(f.count | 0, mapVer, stamp(f.now), f.on !== false) };
}
/** What decides whether the readme needs a rewrite: the shipped version, the JIT switch and the language. (The write time, the map build and the counts
 *  are only refreshed by a write that happens anyway: a readme must not cause a write on every map load.) */
export const readmeKey = f => `${f.S?.ver || ''}|${f.jit ? 1 : 0}|${f.lang === 'en' ? 'en' : 'zh'}`;
