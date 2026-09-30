// A journey written as a place ("从A到B", "A至B的…", "前往B", "A → B"): the two ends and what comes after "的" (a vehicle, premises). Pure: no DOM,
// no host globals. The patterns are the kernel's (core/lexicon.mjs `journey`, docs/kernel-schema.md K-R19); the card script uses this for the trip
// pipeline and the title-bar capsule, where the node tree is not at hand.
//   parseTransit(text, lang?, additions?) -> { from, to, via } | null     the ends as written, `via` '' when the text names none
//   transitLabel(text, en?)               -> "A → B（途中）" | null        the capsule's text; null when the text is not a journey
import { lexicon, journey } from './lexicon.mjs';
import { occurrences } from './locate.mjs';

export function parseTransit(value, lang = 'zh', additions) {
  const v = String(value || '').replace(/\{\{user\}\}/g, '').trim(); if (!v) return null;
  const j = journey(v, lexicon(lang, additions), occurrences);
  return j ? { from: j.from, to: j.to, via: j.route } : null;
}

export function transitLabel(value, en = false) {
  const t = parseTransit(value); if (!t) return null;
  const short = s => String(s).split(/[·・]/).filter(Boolean).pop() || s;
  return `${t.from ? short(t.from) + ' → ' : '→ '}${short(t.to)}${en ? ' (en route)' : '（途中）'}`;
}
