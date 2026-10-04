// Out-of-character (OOC) lines in player messages (D32): pure functions, no host globals.
//   stripOoc(text)         the text without OOC segments: （OOC…） (OOC…) 【OOC…】 [OOC…] and a line that starts with OOC: / OOC：
//   floorCorrections(f, t) the player's explicit corrections written in one floor: （OOC 地图：现在在 X） sets the current place,
//                          （OOC 地图：Y 在 X） puts character Y at X (half-width brackets and "OOC地图" without a space are accepted)
//   activePlace(c, env)    the place a correction still holds: until a later floor brings a new place signal
// A correction lives in the chat floor, so it is recomputed like any other floor (swipe / edit / delete re-run it); nothing here is stored.
// Bracketed inner thoughts are NOT removed wholesale (some players write actions in brackets); only segments that start with OOC go.
export const MAX_OOC = 400;       // an OOC segment longer than this is not treated as one (an unclosed bracket must not swallow the message)
export const TEMPLATE_IDS = Object.freeze(['place', 'chars', 'event', 'items']);
const OPEN = '（(【[', CLOSE = '）)】\\]';
const SEG = new RegExp(`[${OPEN.replace('[', '\\[')}]\\s*OOC(?![A-Za-z])[^${CLOSE}]{0,${MAX_OOC}}[${CLOSE}]`, 'gi');
const LINE = /^[ \t]*OOC(?![A-Za-z])[^\n:：]{0,12}[:：][^\n]*$/gim;
const clip = (s, n) => [...String(s ?? '')].slice(0, n).join('');
const tidy = s => clip(String(s ?? '').replace(/[\s。.!！?？~～]+$/, '').replace(/^[\s「『“"'‘]+|[」』”"'’]+$/g, '').replace(/\s+/g, ' ').trim(), 60);

/** Remove every OOC segment (bracketed or whole-line) from a message. */
export function stripOoc(text) {
  const s = String(text ?? '');
  if (!/OOC/i.test(s)) return s;
  return s.replace(SEG, '').replace(LINE, '');
}

/** The OOC segments of a message, as their inner text (brackets removed): ['OOC 地图：现在在 X', …] */
export function segments(text) {
  const s = String(text ?? ''), out = [];
  if (!/OOC/i.test(s)) return out;
  for (const m of s.matchAll(SEG)) out.push(m[0].slice(1, -1).trim());
  for (const m of s.matchAll(LINE)) out.push(m[0].trim());
  return out;
}

const MAP = /^OOC(?![A-Za-z])\s*(?:地图|map)(?![A-Za-z])\s*[:：]\s*([\s\S]+)$/i;
const SELF = /^(?:我|我们|咱们|玩家|主角|你|\{\{user\}\}|me|i|we)$/i;
// The tail may be empty: 「现在在 」 with no place is consumed here and must not fall through to the character pattern (which would read 「现 在 在」 as a person).
const NOW_ZH = /^(?:现在|当前|目前)\s*(?:在|位于|处于|来到了?|到了?)\s*([\s\S]*)$/;
const NOW_EN = /^(?:(?:we|i)(?:\s+are|['’]m|['’]re)?|now|currently)\s*(?:now\s+|currently\s+)?(?:at|in)\s*([\s\S]*)$/i;
const PUT = /^([^@＠\n]{1,40}?)\s*(?:@|＠|在|\bat\b)\s*([\s\S]+)$/i;

/** One floor's corrections: [{ floor, kind: 'place', place } | { floor, kind: 'char', name, place }], in text order. */
export function floorCorrections(floor, text) {
  const out = [];
  for (const seg of segments(text)) {
    const m = MAP.exec(seg); if (!m) continue;
    const body = m[1].trim();
    const np = NOW_ZH.exec(body) || NOW_EN.exec(body);
    if (np) { const place = tidy(np[1]); if (place) out.push({ floor, kind: 'place', place }); continue; }
    const pm = PUT.exec(body); if (!pm) continue;
    const name = tidy(pm[1]), place = tidy(pm[2]); if (!name || !place) continue;
    out.push(SELF.test(name) ? { floor, kind: 'place', place } : { floor, kind: 'char', name: clip(name, 40), place });
  }
  return out;
}

/** The latest place correction of a list (or null), and the character corrections by name (the latest per name). */
export function latest(list) {
  let place = null; const chars = new Map();
  for (const c of [...(Array.isArray(list) ? list : [])].sort((a, b) => a.floor - b.floor)) { if (c.kind === 'place') place = c; else if (c.kind === 'char') chars.set(c.name, c); }
  return { place, chars: [...chars.values()] };
}

/** Does a place correction still hold at floorNow? env = { placeAt(floor): string | null (the variable's place on that floor), moveAt(floor): bool (a recognised move in that floor's text) }.
 *  It ends at the first later floor whose variable place differs from the one in force at the correction, or whose text shows a move. */
export function activePlace(c, env, { floorNow, span = 40 } = {}) {
  if (!c || c.kind !== 'place' || !c.place) return null;
  const top = Number.isFinite(floorNow) ? floorNow : c.floor;
  if (top < c.floor) return null;
  let base = null; for (let f = c.floor; f >= 0 && f >= c.floor - 3 && base == null; f--) { const v = env.placeAt?.(f); if (typeof v === 'string' && v.trim()) base = v.trim(); }
  for (let f = c.floor + 1; f <= top && f <= c.floor + span; f++) {
    if (env.moveAt?.(f)) return null;
    const v = env.placeAt?.(f);
    if (base != null && typeof v === 'string' && v.trim() && v.trim() !== base) return null;
  }
  return c.place;
}
