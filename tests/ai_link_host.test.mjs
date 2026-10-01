// S7-1 T3 / T4 / T5 host side (map/tavern/host-tavernhelper.mjs createWbAuto): the new prefs round-trip, the AI advisor's endpoint config never leaves the host, `nav-test` (ok, 401, timeout; the form's values used once and
// never stored), `watch` gates the full health, and no blocking dialog is left where the advisor asked for consent and its endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createWbAuto } from '../map/tavern/host-tavernhelper.mjs';
import { createFacts } from '../map/tavern/feature-health.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
function host() {
  const ls = new Map(), LS = { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) }, posts = [], sched = [], facts = createFacts();
  const W = createWbAuto({ scriptBase: 'file://' + ROOT + 'map/', LS, lsGet: k => LS.getItem(k), lsSet: (k, v) => LS.setItem(k, v), life: createLife(), base: () => '', alive: () => true, uiLang: () => 'zh', thBtns: () => null, chatId: () => 'c1', cardKey: () => 'k',
    post: m => posts.push(m), hostToast() {}, stateInject() {}, macroSet() {}, prefSync() {}, facts, navFacts: () => ({ ...facts.nav, consent: ls.get('edenMapNavConsent') === '1', cfgOk: true }), macroVal: k => k, navSchedule: () => sched.push(1) });
  return { W, ls, posts, sched, facts };
}
const last = h => h.posts.at(-1);
test('prefs: stateOmit filtered to the four fields; spatial depth and budget clamped; the advisor cadence only while it is on', async () => {
  const h = host();
  await h.W.onTh({ op: 'prefs', prefs: { stateOmit: ['time', 'bogus', 'trips'], spatialDepth: 99, spatialBudget: 5 } });
  assert.equal(h.ls.get('edenMapStateOmit'), '["time","trips"]'); assert.equal(h.ls.get('edenMapSpatialDepth'), '20'); assert.equal(h.ls.get('edenMapSpatialBudget'), '60');
  assert.deepEqual([last(h).prefs.stateOmit, last(h).prefs.spatialDepth, last(h).prefs.spatialBudget], [['time', 'trips'], 20, 60]);
  await h.W.onTh({ op: 'prefs', prefs: { navCadence: 300000 } }); assert.equal(h.ls.get('edenMapNav') ?? '0', '0', 'off: the cadence does not switch it on');
  await h.W.onTh({ op: 'prefs', prefs: { nav: true, navCadence: 600000 } }); assert.equal(h.ls.get('edenMapNav'), '600000'); assert.equal(last(h).prefs.navCadence, 600000);
  await h.W.onTh({ op: 'prefs', prefs: { navCadence: 12345 } }); assert.equal(h.ls.get('edenMapNav'), '600000', 'only the three offered values');
});
test('consent: navConsent true -> 1; false -> 0 and the feature off; the schedule is told', async () => {
  const h = host();
  await h.W.onTh({ op: 'prefs', prefs: { navConsent: true, nav: true } }); assert.deepEqual([h.ls.get('edenMapNavConsent'), h.ls.get('edenMapNav')], ['1', '1']); assert.ok(last(h).prefs.navConsent && last(h).prefs.nav);
  await h.W.onTh({ op: 'prefs', prefs: { navConsent: false } }); assert.deepEqual([h.ls.get('edenMapNavConsent'), h.ls.get('edenMapNav')], ['0', '0']); assert.ok(h.sched.length >= 2);
});
test('the endpoint config: saved as before, the key never in any th-state payload (hasKey only); an empty form key keeps the saved one', async () => {
  const h = host(), KEY = 'sk-secret-123456';
  await h.W.onTh({ op: 'prefs', prefs: { navCfg: JSON.stringify({ provider: 'openai', key: KEY, base: 'https://api.example/v1', model: 'm' }) } });
  assert.deepEqual(JSON.parse(h.ls.get('edenMapNavCfg')), { provider: 'openai', key: KEY, base: 'https://api.example/v1', model: 'm' });
  assert.deepEqual(last(h).prefs.navCfg, { provider: 'openai', base: 'https://api.example/v1', model: 'm', hasKey: true });
  await h.W.onTh({ op: 'prefs', prefs: { navCfg: JSON.stringify({ provider: 'openai', key: '', base: 'https://b/v1', model: 'm2' }) } });
  assert.equal(JSON.parse(h.ls.get('edenMapNavCfg')).key, KEY); await h.W.onTh({ op: 'watch', ai: true }); await h.W.onTh({ op: 'state' });
  assert.ok(!JSON.stringify(h.posts).includes(KEY), 'no payload carries the key'); h.W.onTh({ op: 'watch', ai: false });
});
test('nav-test: ok, 401, config incomplete; the form values are used once and never stored; the key is not echoed', async t => {
  const h = host(), KEY = 'sk-form-key-987654', seen = [], hadF = globalThis.fetch;
  try {
    globalThis.fetch = async (u, o) => { seen.push([String(u), o.headers, JSON.parse(o.body)]); return { ok: seen.length === 1, status: seen.length === 1 ? 200 : 401 }; };
    const cfg = { provider: 'openai', base: 'https://api.example/v1', model: 'gpt-x', key: KEY };
    await h.W.onTh({ op: 'nav-test', cfg }); let r = last(h).result.navTest;
    assert.deepEqual([r.ok, r.status], [true, 200]); assert.equal(seen[0][0], 'https://api.example/v1/chat/completions'); assert.equal(seen[0][1].authorization, 'Bearer ' + KEY);
    assert.deepEqual([seen[0][2].max_tokens, seen[0][2].messages], [8, [{ role: 'user', content: 'ping' }]]);
    await h.W.onTh({ op: 'nav-test', cfg }); r = last(h).result.navTest; assert.deepEqual([r.ok, r.status, r.error], [false, 401, 'HTTP 401']);
    await h.W.onTh({ op: 'nav-test', cfg: { provider: 'openai', base: '', model: '', key: '' } }); r = last(h).result.navTest; assert.equal(r.ok, false); assert.match(r.error, /^config/);
    assert.equal(h.ls.get('edenMapNavCfg'), undefined, 'nothing stored by a test'); assert.ok(!JSON.stringify(h.posts).includes(KEY), 'the key is not echoed');
  } finally { globalThis.fetch = hadF; }
});
test('nav-test: a request that never answers stops after 15 s with a timeout; one test at a time', async t => {
  const h = host(), hadF = globalThis.fetch; t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let n = 0; globalThis.fetch = (u, o) => { n++; return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))); };
    const p = h.W.onTh({ op: 'nav-test', cfg: { provider: 'openai', base: 'https://api.example/v1', model: 'm', key: 'k' } });
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); await h.W.onTh({ op: 'nav-test', cfg: { provider: 'openai', base: 'https://x/v1', model: 'm', key: 'k' } }); assert.equal(n, 1, 'busy: the second test is ignored');
    t.mock.timers.tick(15000); await p; const r = last(h).result.navTest; assert.deepEqual([r.ok, r.error], [false, 'timeout']);
  } finally { globalThis.fetch = hadF; t.mock.timers.reset(); }
});
test('watch gates the full health: without it only healthSum; with it the cards and the providers (no key), at most one th-state per second', async t => {
  const h = host(); t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  await h.W.onTh({ op: 'state' }); assert.ok(last(h).healthSum && !('health' in last(h)) && !('providers' in last(h)));
  assert.deepEqual(Object.keys(last(h).healthSum), ['n', 'm']);
  await h.W.onTh({ op: 'watch', ai: true }); assert.ok(last(h).health.digest && last(h).health.nav && Array.isArray(last(h).providers));
  const n = h.posts.length; await h.W.onTh({ op: 'state' }); await h.W.onTh({ op: 'state' }); assert.equal(h.posts.length, n, 'throttled inside one second');
  t.mock.timers.tick(1100); await Promise.resolve(); await new Promise(r => setImmediate(r)); assert.equal(h.posts.length, n + 1, 'the trailing one goes out');
  await h.W.onTh({ op: 'watch', ai: false }); t.mock.timers.reset();
});
test('no blocking dialog where the advisor asks for consent and its endpoint; the host never switches the feature off or asks', () => {
  for (const f of ['map/tavern/llm-flow.mjs', 'map/app/tavernhelper-settings.mjs', 'map/app/ai-nav-form.mjs', 'map/app/ai-cards.mjs', 'map/app/topbar.mjs']) {
    const src = fs.readFileSync(ROOT + f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(window\.)?(confirm|prompt|alert)\s*\(/, f);
  }
  const flow = fs.readFileSync(ROOT + 'map/tavern/llm-flow.mjs', 'utf8');
  assert.match(flow, /if \(lsGet\(plannerGatewayModule\.CONSENT_KEY\) !== '1'\) return;/); assert.ok(!/PLANNER_GATEWAY_STORAGE_KEY, '0'/.test(flow));
});
