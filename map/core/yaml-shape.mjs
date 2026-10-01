// The shape of a card's variable initialisation text (docs/kernel-schema.md K-R94): JSON, or a small YAML subset (indented mappings `key: value`, sequences `- item`,
// scalars as strings / numbers / booleans, `#` comments). Only the SHAPE is wanted (which keys exist, what kind of value each holds). Anything else (anchors, tags, flow
// collections, block scalars, tabs, merge keys) gives `null`. Never evaluates anything. Pure.
const MAX_BYTES = 200000, MAX_DEPTH = 12, MAX_LINES = 4000;

const unq = s => { const m = s.match(/^(["'])([\s\S]*)\1$/); return m ? m[2] : null; };
const stripComment = line => {   // a `#` that starts the line or follows a space, outside quotes
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") { if (i === 0 || /[\s:,[{-]/.test(line[i - 1])) q = c; } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
};
const scalar = raw => {
  const s = raw.trim(), u = unq(s);
  if (u !== null) return u;
  if (/^["']/.test(s)) throw new Error('quote');
  if (/^[&*!|>@`%{[]/.test(s)) { if (s === '[]') return []; if (s === '{}') return {}; throw new Error('syntax'); }
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (s === '~' || s === 'null' || s === '') return null;
  return s;
};
const splitKey = body => {   // `key: value` | `key:` -> [key, rest] or null (a quoted key may hold colons)
  const m = body.match(/^("[^"]*"|'[^']*'|[^:"'][^:]*?|[^:"']):(?:\s+(.*)|\s*)$/);
  if (!m) return null;
  const k = m[1].trim(), key = unq(k) ?? k;
  if (!key || key === '<<' || /^[&*!]/.test(key)) throw new Error('key');
  return [key, (m[2] ?? '').trim()];
};

function parseYaml(text) {
  const lines = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (raw.includes('\t') && /^\s*\t/.test(raw)) throw new Error('tab');
    const t = stripComment(raw);
    if (!t.trim() || /^\s*(---|\.\.\.)\s*$/.test(t)) continue;
    lines.push({ ind: t.length - t.trimStart().length, body: t.trim() });
    if (lines.length > MAX_LINES) throw new Error('size');
  }
  let i = 0;
  const block = (ind, depth) => {
    if (depth > MAX_DEPTH) throw new Error('depth');
    if (i >= lines.length || lines[i].ind < ind) return null;
    return lines[i].body.startsWith('- ') || lines[i].body === '-' ? seq(lines[i].ind, depth) : map(lines[i].ind, depth);
  };
  const value = (rest, ind, depth) => {   // after `key:` or `-`: an inline scalar, or a nested block on the following lines
    if (rest !== '') return scalar(rest);
    if (i < lines.length && (lines[i].ind > ind || (lines[i].ind === ind && lines[i].body.startsWith('- ')))) return block(lines[i].ind, depth + 1);
    return null;
  };
  const map = (ind, depth) => {
    const out = {};
    while (i < lines.length && lines[i].ind === ind && !lines[i].body.startsWith('- ')) {
      const kv = splitKey(lines[i].body); if (!kv) throw new Error('line');
      i++; out[kv[0]] = value(kv[1], ind, depth);
    }
    if (i < lines.length && lines[i].ind > ind) throw new Error('indent');
    return out;
  };
  const seq = (ind, depth) => {
    const out = [];
    while (i < lines.length && lines[i].ind === ind && (lines[i].body.startsWith('- ') || lines[i].body === '-')) {
      const rest = lines[i].body.slice(1).trim(), kv = rest && !/^["']/.test(rest) ? splitKey(rest) : null;
      if (kv) { lines[i] = { ind: ind + 2, body: rest }; out.push(map(ind + 2, depth + 1)); } else { i++; out.push(value(rest, ind, depth)); }
    }
    return out;
  };
  const v = block(lines[0].ind, 0);
  if (i < lines.length) throw new Error('rest');
  return v;
}

/** JSON text, else the YAML subset, as a JS value; `null` for anything else (and for an empty text). */
export function parseShape(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > MAX_BYTES) return null;
  if (t[0] === '{' || t[0] === '[') { try { return JSON.parse(t); } catch (e) { return null; } }
  try { return parseYaml(t); } catch (e) { return null; }
}
