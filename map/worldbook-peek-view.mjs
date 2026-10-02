// 世界书档案（PLACE-1b，docs/place-record.md §4.4）：地点卡里那一块就是同步出去的那条条目。
// 按记录的 id 查（eden-map:th {op:'wb-peek', id, name}），宿主在附加书里按发布物的 index 取条目、再取本聊天的自定义书里这一条，
// 回 eden-map:wb-peek { id, name, entries: [{ book, name, content, ver, state }], syncAt }。这里画：
// 条目名 + 条目正文（去掉包裹标签行）+ 一行同步状态（已同步 / 酒馆里改过 / 还没同步）+ 本机上次同步的时刻。
// 本聊天有改动时合并显示：上面是「本聊天的改动」，下面收起的是「包里的原文」。只读：不写条目、不发请求之外的动作。
// 按钮文字不带表情符号（COPY-1）；没有表情、没有装饰符号。
import { esc } from './app/dom-helpers.mjs';
import { post } from './app/protocol-stamp.mjs';
import { busOn } from './app/bus.mjs';
import { register } from './app/plugins.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
import { unwrap, hasText } from './core/place-record.mjs';
import { h } from './app/place-sources.mjs';

const pad = n => String(n).padStart(2, '0');
/** 'YYYY-MM-DD HH:MM'（本机时间）；时间戳没有就没有这一段 */
const stamp = ms => { const d = new Date(+ms || 0); return Number.isFinite(+ms) && ms ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
const STATE = {
  synced: () => uiTextOr('wb.s_synced', '已同步'), pending: () => uiTextOr('wb.s_pending', '还没同步'),
  edited: () => uiTextOr('wb.s_edited', '酒馆里改过'), custom: () => uiTextOr('wb.s_custom', '本聊天的改动'),
};
const CSS = `
.cu-wb{margin-top:var(--sp-4)}
.cu-wb .wb-go{display:inline-flex;align-items:center;gap:var(--sp-3);min-height:var(--hit,44px);padding:0 var(--sp-5);font:inherit;font-size:var(--fs-control);color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-m);cursor:pointer}
.cu-wb .wb-go:hover{border-color:var(--line-strong)}
.cu-wb .wb-out{margin-top:var(--sp-4);font-size:var(--fs-small)}
.cu-wb .wb-state{display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-4);color:var(--ink-2)}
.cu-wb .wb-state .wb-ver{color:var(--muted)}
.cu-wb .wb-item{margin-top:var(--sp-4);padding:var(--sp-4);border:1px solid var(--line);border-radius:var(--r-m)}
.cu-wb .wb-item b{display:block;font-weight:600}
.cu-wb .wb-item pre{margin:var(--sp-3) 0 0;white-space:pre-wrap;word-break:break-word;font:inherit;line-height:1.6;color:var(--ink-2)}
.cu-wb .wb-item details{margin-top:var(--sp-3)}
.cu-wb .wb-item summary{cursor:pointer;color:var(--muted);font-size:var(--fs-micro)}
.cu-wb .wb-none{color:var(--ink-2);line-height:1.6}`;

let style = null, openFor = null;
const ensureStyle = () => { if (style) return; style = document.createElement('style'); style.id = 'wbPeekCss'; style.textContent = CSS; document.head.append(style); };

function entryItem(e) {
  const box = h('div', 'wb-item');
  box.append(h('b', null, e.name || e.book || ''));
  const st = h('div', 'wb-state');
  st.append(h('span', null, (STATE[e.state] || STATE.synced)()));
  if (e.ver) st.append(h('span', 'wb-ver', e.ver));
  if (e.state === 'pending') st.append(h('span', 'wb-ver', uiTextOr('wb.s_hint', '下次打开地图时写入')));
  box.append(st);
  if (e.content) box.append(h('pre', null, unwrap(e.content)));
  if (e.state === 'edited' && e.upstream) {   // 酒馆里改过：上游的新文字收在这里，一句都不丢
    const d = h('details'), s = h('summary', null, uiTextOr('wb.upstream', '包里更新后的原文'));
    d.append(s, h('pre', null, unwrap(e.upstream))); box.append(d);
  }
  return box;
}

/** The archive block of a place card: a button, and (once asked for) the synced entry itself. */
export function placeArchive(rec) {
  ensureStyle();
  const box = h('div', 'cu-wb'), out = h('div', 'wb-out'); out.hidden = true;
  const btn = h('button', 'wb-go'); btn.type = 'button';
  btn.innerHTML = `<span>${esc(uiTextOr('wb.capsule', '世界书档案'))}</span>`;   // I-09: the label goes through esc before it reaches innerHTML
  if (rec && !hasText(rec) && !rec.custom) {   // 只有名字的房间：书里没有它的条目，先说清楚
    out.hidden = false; out.append(h('p', 'wb-none', uiTextOr('wb.no_entry', '这个地方还没有说明，所以世界书里没有单独的条目。')));
  }
  btn.addEventListener('click', () => {
    out.hidden = false; out.textContent = uiTextOr('wb.peeking', '查看中…');
    openFor = rec?.id || '';
    post({ type: 'eden-map:th', op: 'wb-peek', id: rec?.id || '', name: rec?.baseName || rec?.name || '' });
  });
  box.append(btn, out);
  box._out = out; box._id = rec?.id || '';
  return box;
}

function render(d) {
  const box = document.querySelector(`#card .cu-wb[data-wb="${esc(d.id || '')}"]`) || lastBox;
  if (!box || !box.isConnected) return;
  if (openFor && d.id && openFor !== d.id) return;   // 用户已经换了地方
  const out = box._out; if (!out || out.hidden) return;
  const list = Array.isArray(d.entries) ? d.entries : [];
  out.replaceChildren();
  if (!list.length) { out.append(h('p', 'wb-none', uiTextOr('wb.none', '附加书里没有这个地点的条目。'))); return; }
  const pack = list.filter(e => e.state !== 'custom'), mine = list.filter(e => e.state === 'custom');
  if (mine.length) { out.append(h('p', 'wb-none', uiTextOr('wb.mine', '本聊天里改过的文字以这里为准：'))); for (const e of mine) out.append(entryItem(e)); }
  for (const e of pack) out.append(entryItem(e));
  if (d.syncAt) out.append(h('p', 'wb-none', uiTextOr('wb.synced_at', '本机上次自动同步：{t}', { t: stamp(d.syncAt) })));
}
let lastBox = null;
/** 卡片每次重画都登记一次，宿主回话时找得到当前那一块 */
export const bindArchive = box => { lastBox = box; box.dataset.wb = box._id || ''; return box; };

busOn({ key: 'wbpeek.hostMsg', type: 'message', fn: e => {
  try { if (window.__isFromHost?.(e) && e.data?.type === 'eden-map:wb-peek') render(e.data); } catch (x) {}
} });

// 插件名保留（别处按它取）：decorate 现在只登记卡片里那一块，界面由 place-card 画
const WorldbookPeekView = { decorate: (el, title) => { const b = document.querySelector('#card .cu-wb'); if (b) bindArchive(b); }, show: render };
register('WorldbookPeekView', WorldbookPeekView);
