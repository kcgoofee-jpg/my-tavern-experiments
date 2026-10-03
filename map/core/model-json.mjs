// Model-reply JSON tolerance (FIX-3). A model's structured reply is text first and JSON second: it arrives in a
// code fence, or cut off mid-object when the generation stops, or with a bracket left open. Every place that reads
// a model's reply goes through one ladder here instead of its own idea of it:
//   1. parse it as it stands   2. unwrap a fence / code wrapper
//   3. take the first object or array and close a truncated tail   4. give up quietly (null, never a throw)
// Pure: no DOM, no host globals, no storage, no network, no clock. node tests tests/model_json.test.mjs.
// The ladder is deliberately narrow: it never guesses a value, never invents a key, never repairs a number.
// A reply it cannot make sense of comes back as null; the caller drops that one item and counts it, as before.
const OPEN = { '{': '}', '[': ']' };
const FENCE = /```[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n?([\s\S]*?)```/;
const CODE = /<code>([\s\S]*?)<\/code>/i;
const KEY_TAIL = /"(?:[^"\\]|\\.)*"\s*:\s*$/;   // 截断在一个键上（`"键":`）
const attempt = t => { try { return JSON.parse(t); } catch (e) { return undefined; } };   // 一种形状解不出来就换下一种

/** The inside of the first code fence or code element; '' when the text has neither. Unwraps, never deletes:
 *  a model that wraps its answer in a fence still gave an answer. */
export function stripFence(text) {
  const s = String(text ?? '');
  const f = FENCE.exec(s);
  if (f) return f[1];
  const c = CODE.exec(s);
  return c ? c[1] : '';
}

/** The opposite of stripFence, for chat text: a tag inside a code block is the model quoting something, so the
 *  block goes away with its content. This is the one copy of that rule (it was inlined in four readers). */
export function unfenced(text) {
  return String(text ?? '').replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, '');
}

/** Close a truncated tail: the string that was cut off, then the bracket that was cut off, then a dangling `,`
 *  or `"key":`. Balanced input comes back unchanged. o = { limit } caps how much text is scanned. */
export function closeBraces(text, o = {}) {
  const s = String(text ?? ''), limit = Math.max(16, Math.round(+o.limit) || 20000);
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < Math.min(s.length, limit); i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === '}' || c === ']') stack.pop();
  }
  if (!stack.length && !inStr) return s;
  let body = s.replace(/\s+$/, '');
  if (inStr) body += '"';                                   // 断在字符串中间
  for (let i = 0; i < 4; i++) {                              // 断在逗号 / 键 / 冒号上：各收一次就够
    const before = body;
    body = body.replace(/\s+$/, '');
    if (body.endsWith(',')) body = body.slice(0, -1);
    else if (KEY_TAIL.test(body)) body = body.replace(KEY_TAIL, '');   // 断在 `"键":` 上：键与冒号一起收
    else if (body.endsWith(':')) body = body.slice(0, -1);
    if (body === before) break;
  }
  return body + stack.reverse().join('');
}

/** From the first `open` bracket to its balanced close, or to the end of the text when it was never closed;
 *  null when there is no such bracket. */
export function sliceBalanced(text, open = '{', o = {}) {
  const s = String(text ?? ''), start = s.indexOf(open);
  if (start < 0) return null;
  const limit = Math.max(16, Math.round(+o.limit) || 20000), stop = Math.min(s.length, start + limit), want = OPEN[open];
  const stack = [];
  let inStr = false, esc = false;
  for (let i = start; i < stop; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === '}' || c === ']') { if (c === want && stack.length <= 1) return s.slice(start, i + 1); stack.pop(); }   // <= 1: 自己开的那一个
  }
  return s.slice(start, stop);   // 没闭合：把截断的那一段交出去，让 closeBraces 收尾
}

/**
 * parseLoose(text, o) -> the parsed value, or null.
 *   o.array = true → look for an array first (an object first otherwise);  o.limit caps the scan.
 * Never throws. A caller that gets null drops that one item and keeps going, exactly as before.
 */
export function parseLoose(text, o = {}) {
  const raw = String(text ?? '');
  if (!raw.trim()) return null;
  const lim = { limit: o.limit }, order = o.array ? ['[', '{'] : ['{', '['], tries = [];
  tries.push(raw.trim());
  const un = stripFence(raw);
  if (un.trim()) tries.push(un.trim());
  for (const open of order) {
    const body = sliceBalanced(raw, open, lim);
    if (!body) continue;
    tries.push(body.trim());
    const closed = closeBraces(body, lim).trim();
    if (closed !== body.trim()) tries.push(closed);
  }
  for (const t of tries) { const v = attempt(t); if (v !== null && v !== undefined) return v; }
  return null;   // 修不出来就安静放弃：没有可解析的片段
}
