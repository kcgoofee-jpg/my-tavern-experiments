// TURN-IDS（docs/turn-ids.md）：每轮生成的「本轮可用地点 / 人物」闭合词表 + 标签落点校验。默认关（edenMapTurnIds）；关 = 零行为变化。
// 思路取自 per-turn allowed-id 清单与分层校验（先 schema——标签解析器本来就只收合规写法——再「认不认得这个地点」）；保留我们的行标签，不上 JSON 块。
// 纯模块：不碰 DOM / 酒馆全局 / 存储；宿主接线在 tavern/eden-map.js（校验）与 tavern/llm-flow.mjs（注入）。node 单测 tests/turn_ids.test.mjs。
// 校验只在开关开着时生效（与 2026-09-27「不做内容过滤」契约的边界：开 = 用户点名要拦，关 = 原样列出）；被拦下的写法进环形诊断表（最多 16 条，只增本机内存，换聊天清空）。
import { tokens } from './interaction-modes.mjs';

export const TURN_IDS_ID = 'eden-map-turn-ids';
export const BUDGET = 400;      // 注入行预算（约 400 token 口径，同 stateLine；超了从名单尾部砍）
export const RING_MAX = 16;
const cap60 = s => { const a = [...String(s || '')]; return a.length > 60 ? a.slice(0, 60).join('') + '…' : a.join(''); };

/** { here, places:[], names:[], budget } → 注入的一行（当前地点排最前，其余去重、按写入顺序；没内容返回 ''）。
 *  只教写法，不改任何标签语义；名单按预算从后往前砍（地点先保，砍完人物再砍地点尾部，当前地点永不砍）。 */
export function idsText({ here = '', places = [], names = [], budget = BUDGET } = {}) {
  const uniq = a => [...new Set(a.map(x => String(x || '').trim()).filter(Boolean))];
  const h = String(here || '').trim(), pl = uniq([h, ...places].filter(Boolean)), nm = uniq(names);
  if (!pl.length && !nm.length) return '';
  const build = (np, nn) => {
    const parts = [];
    if (pl.length) parts.push('地点：' + ([h, ...pl.filter(x => x !== h).slice(0, Math.max(0, np - (h ? 1 : 0)))].filter(Boolean).join('、')));
    if (nn && nm.length) parts.push('人物：' + nm.slice(0, nn).join('、'));
    return parts.length ? '[本轮标签词表] ' + parts.join('；') + '。标签里的地点与人物名只能照抄上面的写法；列表以外的宁可不写，不要自造。' : '';
  };
  let np = pl.length, nn = nm.length, line = build(np, nn);
  while (tokens(line) > budget && nn > 0) line = build(np, --nn);
  while (tokens(line) > budget && np > 0) line = build(--np, nn);
  return tokens(line) > budget ? '' : line;
}

/** 注入对象与写入口径同 applyState / applySpatial：固定 id、先撤再注（空内容 = 只撤），不叠 */
export function idsPrompt(content, depth = 0) {
  return { id: TURN_IDS_ID, position: 'in_chat', depth: Math.max(0, Math.min(20, Math.round(+depth) || 0)), role: 'system', content, should_scan: false };
}
export function applyIds(fn, content, depth = 0) {
  const un = fn('uninjectPrompts'), inj = fn('injectPrompts'); if (!inj) return false;
  try { un?.([TURN_IDS_ID]); if (content) inj([idsPrompt(content, depth)]); return true; } catch (e) { return false; }
}

/** 一个脚本实例一份（多实例并存不串数据）。
 *  deps = { on(): 开关现在开着吗, resolve(placeText)->节点|假值（节点树能不能认这个写法）, floorNow(): 诊断条目记的楼, apply(content)->bool（写注入，宿主给） } */
export function createTurnIds(deps = {}) {
  const { on = () => false, resolve = () => true, floorNow = () => -1, apply = () => false } = deps;
  const ring = [];   // 新的在前；窗口每轮重放，同一条重复拒只更新时间，不新增
  const reject = (kind, code, text) => {
    const key = kind + '|' + code + '|' + String(text || '').replace(/\s+/g, ''), at = Date.now();
    const old = ring.find(x => x._k === key);
    if (old) { old.at = at; old.floor = floorNow(); return; }
    ring.unshift({ _k: key, kind, code, text: cap60(text), floor: floorNow(), at });
    while (ring.length > RING_MAX) ring.pop();
  };
  const enabled = () => { try { return !!on(); } catch (e) { return false; } };
  const known = t => { try { return !!resolve(String(t || '').trim()); } catch (e) { return true; } };   // 认不出树（geo 还没装好）时绝不拦：校验器坏不拦好
  return {
    enabled,
    /** 事态：开 = 只留钉到节点上的（node != null；层都对不上的「未上图」写法拦下） */
    filterEvents: list => !enabled() ? list : list.filter(e => { if (e.node != null) return true; reject('event', 'event-unplaced', e.text || e.place); return false; }),
    /** 人物标签：开 = 地点写法认不出节点的这条不更新位置（玩家 OOC 纠正不校验） */
    filterChars: list => !enabled() ? list : list.filter(c => { if (c.src !== 'tag' || c.ooc || !c.place || known(c.place)) return true; reject('char', 'char-unresolved', c.name + '@' + c.place); return false; }),
    /** 地点标签（interaction-modes.parseHereTag 的守卫）：认不出 → 这条不算数，当前地点走原有兜底链（等于没写） */
    checkHere: p => { if (enabled() && !known(p)) { reject('place', 'place-unknown', p); return false; } return true; },
    uninject: () => apply(''),
    clear: () => { ring.length = 0; },
    recent: () => ({ on: enabled(), items: ring.map(({ _k, ...x }) => x) }),
  };
}
