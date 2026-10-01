// The host side of a planned route (docs/kernel-schema.md K-R111, K-R113, docs/transit-schema.md §5.2, §5.3, §7): the viewer sends the plan the user chose (`eden-map:route-plan`), the host re-checks it against the
// pack's network (core/router.mjs checkPlan), holds it for the session and echoes the result (`eden-map:route`); a new location that is the destination (or inside it) clears it, so does a chat change and
// age (20 messages). Session only: nothing is persisted, written to the chat, the chat variable, stat_data or a worldbook. The class macros (`{{eden_here}}`, `{{eden_route}}`, `{{eden_fly}}`) live here too:
// `{{eden_route}}` is the last player trip, plus the planned route when one is held (no plan: exactly the old text). Factory style as the other flows: createRouteFlow(host), `host` = the dependency bag.
import { thFn } from './host-tavernhelper.mjs';
import { getGeo } from './events-parse.mjs';
import { checkPlan, planText } from '../core/router.mjs';
import { stationName, modeLabel, lineName } from '../core/transit-spec.mjs';
export const DEPS = ['here', 'floorNow', 'post', 'alive', 'life', 'contextPipeline', 'userName', 'tavernhelperApiModule', 'addRoutes', 'flyMark'];
export const PLAN_AGE = 20;

export function createRouteFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('route-flow: missing dep ' + k);
  let held = null, macroOff = null;   // held = { plan, at } (the floor it was chosen on)
  const echo = () => { if (host.alive) host.post({ type: 'eden-map:route', plan: held?.plan ?? null }); };
  const drop = () => { if (!held) return; held = null; echo(); };
  const inside = (node, dest) => !!node && !!dest && (node === dest || !!getGeo()?.tree?.isAncestor?.(dest, node));

  /** onPlan(msg): the viewer's choice; accepted after checkPlan (held, echoed), refused (the held plan stays, echoed), null (cleared, echoed) */
  function onPlan(msg) {
    if (msg?.plan === null || msg?.plan === undefined) { held = null; echo(); return; }
    const geo = getGeo(), g = geo?.graph?.(), ok = g ? checkPlan(g, msg.plan, { tree: geo.tree }) : null;
    if (ok) held = { plan: ok, at: host.floorNow };
    echo();
  }
  /** onHere(here): a new location that is the plan's destination or inside it clears the plan */
  function onHere(here) { if (held && inside(getGeo()?.place?.(String(here || '').replace('{{user}}', ''))?.node, held.plan.to.node)) drop(); }
  /** onRound(floor): a plan older than 20 messages is cleared */
  function onRound(floor) { if (held && Number.isFinite(floor) && floor - held.at > PLAN_AGE) drop(); }
  const onChat = () => { drop(); };
  const onReady = () => { if (held) echo(); };
  /** addSuggestions(rows, { floor, map }): the S7 entry for validated route rows (`routeOp` results); the host keeps at most 3, ages them out after 20 messages and sends them in `eden-map:ops` */
  const addSuggestions = (rows, ctx) => host.addRoutes(rows, ctx);

  function textOf(plan) {
    const geo = getGeo(), T = geo?.transit, lang = geo?.lang || 'zh', tree = geo?.tree;
    return planText(plan, { lang, templates: geo?.templates, nameOf: id => stationName(T, id, lang, n => tree?.get(n)?.name), modeLabel: m => modeLabel(T, m, lang), lineName: l => lineName(T, l, lang) });
  }
  /** macroValue(key, match): the value of a class macro (B9); `eden_route` = the last player trip, plus ` · ` and the planned route when one is held */
  function macroValue(k, m) {
    if (k === 'eden_here') return host.userName(host.here);
    if (k === 'eden_fly') {
      const place = String(m?.[1] || '').trim() || host.here;
      return host.flyMark(place) + host.userName(place);
    }
    const t = (host.contextPipeline.trips || []).filter(x => !x.who).at(-1), last = t ? `${t.from} → ${t.to}` : '';
    return held ? last + (last ? ' · ' : '') + textOf(held.plan) : last;
  }
  // B9 类宏（默认关）：{{eden_here}} 当前地点、{{eden_route}} 最近一段行程（有计划路线时再加上它）、{{eden_fly 地点}}（W8）展开成隐藏 fly 标记；卡 / 预设作者自己引用
  function macroSet(on) {
    macroOff?.(); macroOff = null; if (!on || !host.tavernhelperApiModule || host.life.dead) return;
    macroOff = host.tavernhelperApiModule.registerMacros(thFn, macroValue);
  }
  return { addSuggestions, macroSet, macroValue, onChat, onHere, onPlan, onReady, onRound, get held() { return held; } };
}
