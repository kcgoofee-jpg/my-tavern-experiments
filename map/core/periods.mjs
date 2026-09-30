// Periods of the day (docs/kernel-schema.md K-R39). Pure.
//   bandOf(periods, { time, period }) -> the band { id, start, words?, dark? } the world clock is in, or null when neither text says
// The period text is matched against the bands' words (longest word, then earliest band); else HH:MM read from the time text selects the band with
// start <= time < the next start, wrapping past midnight; else no band. Without bands of its own a pack gets DEFAULT_PERIODS.
import { normalise } from './lexicon.mjs';

export const DEFAULT_PERIODS = Object.freeze([
  { id: 'dawn', start: '05:00' }, { id: 'day', start: '07:00' }, { id: 'dusk', start: '17:00' }, { id: 'night', start: '20:00', dark: true }]);

const minutes = t => { const m = String(t ?? '').match(/(\d{1,2})\s*[:：时]\s*(\d{0,2})/); return m ? +m[1] * 60 + (+m[2] || 0) : null; };
const at = s => { const m = /^(\d\d):(\d\d)$/.exec(String(s ?? '')); return m ? +m[1] * 60 + +m[2] : null; };

export function bandOf(periods, w) {
  const list = (Array.isArray(periods) && periods.length ? periods : DEFAULT_PERIODS).filter(b => b && at(b.start) !== null);
  if (!list.length || !w) return null;
  const text = normalise(w.period);
  if (text) {
    let best = null;
    list.forEach((b, i) => { for (const word of Array.isArray(b.words) ? b.words : []) { const x = normalise(word); if (x && text.includes(x) && (!best || x.length > best.n)) best = { b, n: x.length, i }; } });
    if (best) return best.b;
  }
  const m = minutes(w.time); if (m === null) return null;
  const sorted = [...list].sort((a, b) => at(a.start) - at(b.start)), before = sorted.filter(b => at(b.start) <= m);
  return before.length ? before[before.length - 1] : sorted[sorted.length - 1];
}
