// The AI advisor card's sub-options (S7-1 T5, docs/settings-ia.md §4.3): the endpoint form (provider, base URL, model, key), test connection, the consent block, cadence and the stats line.
// Replaces the old blocking prompt / confirm dialogs. The key is only ever typed here and posted to the host; the host never sends it back (it answers `hasKey`). A test posts the form's current
// values (used once by the host, never stored); "agree" stays disabled until a test of exactly the current values passed, then saves config + consent + switch in one message.
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { setPrefs } from './ai-cards.mjs';
import { testVerdict } from './feature-card.mjs';

const tr = (k, zh, v) => uiTextOr(k, zh, v);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const field = (lbl, zh, ctl) => { const l = el('label', 'row fcfld'); l.append(el('span', '', tr(lbl, zh)), ctl); return l; };
const CAD = [120000, 300000, 600000], CADZH = { 120000: '每 2 分钟 ≈ 每小时 30 次小请求', 300000: '每 5 分钟 ≈ 每小时 12 次小请求', 600000: '每 10 分钟 ≈ 每小时 6 次小请求' };
const when = t => { try { return new Date(t).toLocaleTimeString(); } catch (e) { return ''; } };

export function navForm(s, api) {
  const sel = el('select'), base = el('input'), model = el('input'), key = el('input'), test = el('button', 'btn', tr('fc.nav.test', '测试连接')), save = el('button', 'btn', tr('fc.nav.save', '保存')),
    res = el('small'), cost = el('small', '', tr('fc.nav.test_cost', '测试会发一个很小的请求，消耗几个 token')), consent = el('div', 'fcsub'), agree = el('button', 'btn primary', tr('fc.nav.agree', '同意并开启')),
    why = el('small'), cad = el('select'), stats = el('small'), wd = el('button', 'btn', tr('fc.nav.withdraw', '撤回同意')), form = el('div', 'fcsub'), after = el('div', 'fcsub');
  for (const n of [test, save, agree, wd]) n.type = 'button';
  model.type = 'text'; sel.id = 'thNavProv'; base.type = 'url'; base.id = 'thNavBase'; model.id = 'thNavModel'; key.type = 'password'; key.id = 'thNavKey'; key.autocomplete = 'off'; test.id = 'thNavTest'; agree.id = 'thNavAgree'; save.id = 'thNavSave'; res.id = 'thNavRes';
  let passSig = '', asked = null, dirty = false, provDone = false;
  const cur = () => ({ provider: sel.value, base: base.value.trim(), model: model.value.trim(), key: key.value });
  const sig = () => JSON.stringify(cur());
  const refresh = () => { const ok = passSig === sig(); agree.disabled = !ok; why.textContent = ok ? '' : tr('fc.nav.agree_why', '先测试连接：通过后才能同意并开启'); save.classList.toggle('primary', ok); };
  for (const i of [sel, base, model, key]) i.addEventListener('input', () => { dirty = true; refresh(); });
  sel.addEventListener('change', () => { const p = (api.ST?.providers || []).find(x => x.id === sel.value); if (p && !base.value) base.value = p.base || ''; if (p && !model.value) model.value = p.model || ''; refresh(); });
  test.addEventListener('click', () => { asked = { sig: sig(), nonce: Date.now() + '-' + Math.random().toString(36).slice(2) }; test.disabled = true; res.textContent = tr('fc.nav.testing', '测试中…'); post({ type: 'eden-map:th', op: 'nav-test', cfg: cur(), nonce: asked.nonce }); setTimeout(() => { test.disabled = false; }, 16000); });
  const cfgJson = () => JSON.stringify(cur());
  save.addEventListener('click', () => { setPrefs({ navCfg: cfgJson() }); dirty = false; key.value = ''; passSig = ''; refresh(); });
  agree.addEventListener('click', () => { if (passSig !== sig()) return; setPrefs({ navCfg: cfgJson(), navConsent: true, nav: true }); dirty = false; key.value = ''; });
  wd.addEventListener('click', () => setPrefs({ navConsent: false, nav: false }));
  for (const c of CAD) { const o = el('option', '', tr('fc.nav.cad_' + c, CADZH[c])); o.value = c; cad.append(o); }
  cad.id = 'thNavCad'; cad.addEventListener('change', () => setPrefs({ navCadence: +cad.value }));
  const acts = el('div', 'fcact'); acts.append(test, save);
  form.append(field('fc.nav.provider', '服务商', sel), field('fc.nav.base', '接口地址', base), field('fc.nav.model', '模型', model), field('fc.nav.key', '密钥', key), acts, cost, res);
  const ctext = el('small', '', tr('fc.nav.consent', 'AI 参谋会按你的设置在后台调用你自己的 API，给出地图建议；请求只发往你填的端点，会消耗你的额度。'));
  consent.append(ctext, agree, why); after.append(field('fc.nav.cadence', '运行间隔', cad), stats, wd);
  s.append(form, consent, after); api.ST = null;
  api.patch = (P, row, ST) => {
    api.ST = ST; const c = P.navCfg && typeof P.navCfg === 'object' ? P.navCfg : { hasKey: !!P.navCfg };
    if (!provDone && (ST.providers || []).length) { provDone = true; sel.replaceChildren(...ST.providers.map(p => { const o = el('option', '', tr('fc.nav.p_' + p.id, p.id)); o.value = p.id; return o; })); }
    if (!dirty && !form.contains(document.activeElement)) { sel.value = c.provider || sel.value || 'openai'; base.value = c.base || (ST.providers || []).find(p => p.id === sel.value)?.base || ''; model.value = c.model || (ST.providers || []).find(p => p.id === sel.value)?.model || ''; key.value = ''; }
    key.placeholder = c.hasKey ? tr('fc.nav.key_saved', '已保存（留空沿用）') : '';
    const t = ST.navTest, v = testVerdict(t, asked); if (v.take) { res.textContent = t.ok ? tr('fc.nav.test_ok', '连接正常（HTTP {s}，{ms} ms）', { s: t.status, ms: t.ms }) : tr('fc.nav.test_fail', '没通：{e}', { e: t.error || '?' }); if (v.pass) passSig = asked.sig; asked = null; test.disabled = false; ST.navTest = null; }   // consumed: it can never be applied twice
    const has = !!P.navConsent; consent.hidden = has; after.hidden = !has; if (document.activeElement !== cad) cad.value = CAD.includes(P.navCadence) ? P.navCadence : 120000;
    const st = row?.stats; stats.textContent = st?.runs ? tr('fc.nav.stats', '上次运行 {t}：采用 {k} 条、丢弃 {d} 条 · ≈ {tok} token · 下次约 {nx}', { t: when(st.lastAt), k: st.kept, d: st.dropped, tok: st.tokens, nx: st.nextAt ? when(st.nextAt) : '—' }) : tr('fc.nav.stats0', '还没有运行过');
    refresh();
  };
}
