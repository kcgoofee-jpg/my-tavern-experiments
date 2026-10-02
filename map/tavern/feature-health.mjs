// Feature health (docs/settings-ia.md §4.5, S7-1 T3): one pure function that says, for each AI-link card, whether it is on, whether it works in this chat and what it did last.
// Input = facts the host already has (recorded where the features run; no extra API calls); output = { <card id>: { on, state, reason?, floor?, text?, tokens?, stats?, fields? } }.
// state: 'working' | 'idle' (on, nothing to report yet: no reply since the switch or the load) | 'not-effective' (on and something is missing) | 'off'. Texts are capped at 600 characters.
// Pure: no DOM, no host globals, no storage, no network. node test tests/feature_health.test.mjs.
import { tokens } from './interaction-modes.mjs';

export const CARD_IDS = Object.freeze(['digest', 'state', 'macros', 'dice', 'ledger', 'spatial', 'wbJit', 'wbXtal', 'nav', 'inject']);
export const MAX_TEXT = 600;
const cap = (s, n = MAX_TEXT) => { const a = [...String(s ?? '')]; return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
const num = v => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);

/** createFacts() -> a fresh facts object (one per script instance); the flows write their own part of it where the feature runs. */
export function createFacts() {
  return {
    digest: { text: '', floor: null }, state: { text: '', reason: '', floor: null, fields: null }, spatial: { text: '', floor: null, placed: null },
    macros: { here: '', route: '' }, dice: { last: '', floor: null }, ledger: { rows: null, floor: null }, jit: { enabled: 0, disabled: 0, floor: null, book: null },
    xtal: { written: 0, last: '', floor: null, book: null, seenTags: null }, nav: { consent: null, cfgOk: null, lastAt: 0, runs: 0, lastN: 0, lastDropped: 0, lastStatus: null, lastTokens: 0, nextAt: 0, generating: false },
    inject: { mode: 'off', lastOk: null, floor: null },
  };
}
const off = { on: false, state: 'off', reason: 'off' };
const bad = (reason, extra = {}) => ({ on: true, state: 'not-effective', reason, ...extra });
const idle = (reason, extra = {}) => ({ on: true, state: 'idle', ...(reason ? { reason } : {}), ...extra });
const ok = (extra = {}) => ({ on: true, state: 'working', ...extra });
const withText = (text, floor) => { const t = cap(text); return { ...(num(floor) !== null ? { floor: num(floor) } : {}), ...(t ? { text: t, tokens: tokens(t) } : {}) }; };

/** healthOf(facts) -> { <id>: row }; facts = { prefs, api: { inject, macros, worldbook }, ...createFacts() parts }. */
export function healthOf(facts = {}) {
  const P = facts.prefs || {}, A = facts.api || {}, f = { ...createFacts(), ...facts }, out = {};
  // C1 digest: no master switch (U-06): read-only transparency
  const d = f.digest;
  out.digest = A.inject === false ? bad('no-host-api', { text: 'injectPrompts' }) : d.floor === null ? idle() : d.text ? ok(withText(d.text, d.floor)) : idle('empty', { floor: num(d.floor) });
  // C2 status line
  const s = f.state;
  out.state = P.inj === false ? off : A.inject === false ? bad('no-host-api', { text: 'injectPrompts' }) : s.text ? ok({ ...withText(s.text, s.floor), ...(s.fields ? { fields: s.fields } : {}) })
    : s.reason === 'skipped' ? bad('skipped', { ...(s.fields ? { fields: s.fields } : {}) }) : idle(s.floor === null ? '' : 'empty', s.fields ? { fields: s.fields } : {});
  // C3 macros
  out.macros = !P.macros ? off : A.macros === false ? bad('no-host-api', { text: 'registerMacroLike' }) : ok({ text: cap(`{{eden_here}} = ${f.macros.here}\n{{eden_route}} = ${f.macros.route}`) });
  // C4 dice checks
  out.dice = !P.dice ? off : f.dice.floor === null ? idle('no-checks') : ok(withText(f.dice.last, f.dice.floor));
  // C5 settlement records
  out.ledger = !P.ledgerWrite ? off : f.ledger.rows === null ? idle() : ok({ ...(num(f.ledger.floor) !== null ? { floor: num(f.ledger.floor) } : {}), stats: { rows: f.ledger.rows } });
  // C6 spatial contract
  const sp = f.spatial;
  out.spatial = !P.spatial ? off : sp.placed === false ? bad('no-place', { floor: num(sp.floor) ?? undefined }) : sp.text ? ok(withText(sp.text, sp.floor)) : idle(sp.floor === null ? '' : 'empty');
  // C7 worldbook JIT
  const j = f.jit;
  out.wbJit = !P.wbJit ? off : A.worldbook === false ? bad('no-host-api', { text: 'updateWorldbookWith' }) : j.book === false ? bad('no-book') : j.floor === null ? idle() : ok({ floor: num(j.floor), stats: { enabled: j.enabled | 0, disabled: j.disabled | 0 } });
  // C8 fact crystallisation
  const x = f.xtal;
  out.wbXtal = !P.wbXtal ? off : A.worldbook === false ? bad('no-host-api', { text: 'updateWorldbookWith' }) : x.book === false ? bad('no-book') : x.seenTags === false && !x.written ? idle('no-tags')
    : x.floor === null && !x.written ? idle() : ok({ ...(num(x.floor) !== null ? { floor: num(x.floor) } : {}), ...(x.last ? { text: cap(x.last) } : {}), stats: { written: x.written | 0 } });
  // C9 AI advisor (the user's own endpoint)
  const n = f.nav, st = { lastAt: n.lastAt || 0, runs: n.runs | 0, kept: n.lastN | 0, dropped: n.lastDropped | 0, nextAt: n.nextAt || 0, tokens: n.lastTokens | 0 };
  out.nav = !P.nav ? off : n.consent === false ? bad('no-consent') : n.cfgOk === false ? bad('no-config') : (n.lastStatus ?? null) !== null && !(n.lastStatus >= 200 && n.lastStatus < 300) ? bad('endpoint', { stats: { ...st, status: n.lastStatus } })
    : n.generating ? idle('waiting', { stats: st }) : n.runs > 0 ? ok({ stats: st }) : idle('', { stats: st });
  // C10 map actions into chat
  const i = f.inject;
  out.inject = i.mode === 'off' ? off : i.lastOk === false ? bad('no-input', { ...(num(i.floor) !== null ? { floor: num(i.floor) } : {}) }) : i.lastOk === null ? idle() : ok({ ...(num(i.floor) !== null ? { floor: num(i.floor) } : {}) });
  return out;
}
/** healthSum(health) -> { n: how many cards are on, m: how many are on and not effective } (the home summary; idle is not counted as not effective, U-32).
 *  A card switched on but waiting for the user's consent is not counted at all: nothing runs until the consent (U-FIX-5 S-03). */
export function healthSum(h = {}) { let n = 0, m = 0; for (const k of CARD_IDS) { const r = h[k]; if (r?.on && r.reason !== 'no-consent') { n++; if (r.state === 'not-effective') m++; } } return { n, m }; }
