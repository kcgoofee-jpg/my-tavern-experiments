// 地图 → 聊天（v0.9.6）：地点卡 / 事件卡 / 人物卡上的「去这里」「追问这件事」把一句简短的中性模板填进酒馆输入框，**从不自动发送**。
// 模板可在地图设置里改（本机 localStorage edenMapCompose，{name} = 地点 / 事件 / 人物名）。纯函数；node 单测 tests/compose097.test.mjs。
// 填入方式（eden-map.js 调 insert）：宿主页有 #send_textarea 时直接写（接在已有草稿后面，派发 input 事件，不清掉用户已经打的字）；
// 没有时退回酒馆助手的 triggerSlash('/setinput …')（会替换草稿；`|` 转义）。两样都没有返回 ''。
export const KEY = 'edenMapCompose';
export const DEFAULTS = { zh: { go: '前往{name}。', ask: '关于{name}，' }, en: { go: 'Go to {name}. ', ask: 'About {name}, ' } };
export const MAX = 300;
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const clip = (s, n) => [...String(s ?? '')].slice(0, n).join('');
/** 名字清理：去掉换行与首尾空白，最多 60 字 */
export const cleanName = n => clip(String(n ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\{\{user\}\}\s*/g, '').trim(), 60);
/** 本机模板（用户改过的覆盖默认；空串 = 用默认） */
export function read(st, lang = 'zh') {
  const d = DEFAULTS[lang] || DEFAULTS.zh; let u = {};
  try { const o = JSON.parse(st?.getItem(KEY) || '{}'); if (plain(o)) u = o; } catch (e) {}
  const pick = k => (typeof u[k] === 'string' && u[k].trim() ? clip(u[k], 120) : d[k]);
  return { go: pick('go'), ask: pick('ask'), custom: !!(u.go || u.ask) };
}
/** 保存；两项都空（或等于默认）就删掉键 */
export function write(st, o = {}) {
  const v = {}; for (const k of ['go', 'ask']) if (typeof o[k] === 'string' && o[k].trim()) v[k] = clip(o[k], 120);
  try { if (!Object.keys(v).length) st.removeItem(KEY); else st.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
}
/** 模板 + 名字 → 一句话；模板里没有 {name} 时把名字接在后面 */
export function fill(tpl, name) {
  const n = cleanName(name); if (!n) return '';
  const t = String(tpl || '');
  const out = /\{name\}/.test(t) ? t.split('{name}').join(n) : (t + n);
  return clip(out.replace(/[\r\n]+/g, ' '), MAX);
}
/** 填进酒馆输入框。win = 酒馆页 window；slash = triggerSlash（可无）。返回 'textarea' | 'slash' | '' */
export function insert(win, text, slash) {
  text = clip(String(text ?? '').replace(/[\r\n]+/g, ' '), MAX); if (!text.trim()) return '';
  let ta = null; try { ta = win?.document?.getElementById('send_textarea'); } catch (e) {}
  if (ta && 'value' in ta) {
    const cur = String(ta.value || '');
    ta.value = cur && !/\s$/.test(cur) ? cur + ' ' + text : cur + text;
    try { ta.dispatchEvent(new (win.Event || Event)('input', { bubbles: true })); } catch (e) {}
    try { ta.focus({ preventScroll: true }); const n = ta.value.length; ta.setSelectionRange?.(n, n); } catch (e) {}
    return 'textarea';
  }
  if (typeof slash === 'function') { try { slash('/setinput ' + text.replace(/\|/g, '\\|')); return 'slash'; } catch (e) {} }
  return '';
}
