// 空间化背包 · 地上的发光拾取物（Part 5-1 第三步，2026-09-30）：设定包（core/stash.mjs）写在某张图某个地标上的藏物，
// 在这里画成一枚会呼吸的小光点；点一下 = 拾起（发 eden-map:loot 给宿主，宿主写进 eden_map.仓库 并按设置注入一句）。
// 暗格里藏的东西要人真的走到那儿才看得见（当前地点 = 该地标）；拿到手的不重复画（拿背包的 id 对账）。
// 节拍与兄弟层一致：OSD 叠加元素跟着底图走，图层开关 / 可见性调度走 LayerRegistry。
//   样式在本模块里注入（tavernhelper-settings.mjs 一个路子），viewer.html 不为这一层留 CSS。
import { normStash, rows } from '../core/stash.mjs';
import { registry } from './layer-host.mjs';
import { esc } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { tx } from './text-lookup.mjs';
import { aspect, cur, curData, viewer } from './state.mjs';
import { P } from './plugins.mjs';
import { busOn } from './bus.mjs';
import { hereRes } from './locate.mjs';

const CSS_ID = 'lootCss';
let stash = null, els = [], watch = null;

const CSS = `
.loot { position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;
  z-index: var(--zv-interaction, 100); pointer-events: auto; }
.loot i.ld { width: 12px; height: 12px; border-radius: 50%; background: var(--gold, #e6c36a); box-shadow: var(--glow, 0 0 8px #e6c36a);
  border: 1.5px solid #fff8; animation: lootPulse 2.4s ease-in-out infinite; }
.loot b { width: max-content; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px;
  padding: 1px 6px; border-radius: var(--r-pill, 999px); background: var(--map-label-bg, #14121ae6); border: 1px solid var(--map-label-line, #ffffff26);
  font: 500 var(--fs-micro, 11px)/1.5 var(--font-ui, system-ui); color: var(--map-label-ink, #fff); box-shadow: var(--sh-1); }
.loot.hid i.ld { background: color-mix(in srgb, var(--gold, #e6c36a) 55%, transparent); }
.loot.got { opacity: .35; pointer-events: none; }
.loot.got i.ld { animation: none; }
.loot:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@keyframes lootPulse { 0%, 100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.35); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .loot i.ld { animation: none; transform: scale(1.2); } }`;

function css() { if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS; document.head.appendChild(s); }

const markerXY = id => (curData?.markers || []).find(k => k.id === id) || null;
const takenIds = () => { try { return new Set((P.TCInv?.rows || []).map(r => r.id).filter(Boolean)); } catch (e) { return new Set(); } };
// the landmark the current location places the player at (the node tree's answer, not the highlighted label): a hidden compartment shows only there
const hereNow = () => { try { return hereRes(String(document.getElementById('here')?.value || '').replace('{{user}}', ''))?.marker || ''; } catch (e) { return ''; } };

/** 宿主推来的世界藏物表（原始 JSON：{ items: [...] }）→ 规范化存下，按当前图重画 */
export function setLootStash(raw) { stash = normStash(raw); rebuildLoot(); }

/** 当前图上该画出来的藏物：不看第十二层rif过滤之外的东西；暗格的只在「人就在这儿」时出现 */
export function lootRows() {
  if (!stash || !cur) return [];
  const here = hereNow(), taken = takenIds();
  return rows(stash, { map: cur, taken }).filter(r => !!markerXY(r.marker) && (!r.hidden || here === r.marker));
}

function clearLoot() {
  for (const el of els) { try { viewer?.removeOverlay?.(el); } catch (e) {} try { el.remove(); } catch (e) {} }
  els = [];
}

/** 重画：切图 / 来新数据 / 当前地点变了都跑一遍（点数很少，整清整画最省心，不用逐个 diff） */
export function rebuildLoot() {
  clearLoot();
  if (!stash || !viewer?.world?.getItemCount || !viewer.world.getItemCount()) return 0;
  if (!registry.has('loot') || !registry.isVisible('loot')) return 0;
  for (const r of lootRows()) {
    const k = markerXY(r.marker); if (!k) continue;
    const el = document.createElement('div'); el.className = 'loot' + (r.hidden ? ' hid' : '');
    const lab = document.createElement('b'); lab.textContent = r.name;
    const dot = document.createElement('i'); dot.className = 'ld';
    el.append(lab, dot);
    el.dataset.id = r.id; el.dataset.place = esc(r.place || '');
    const where = r.hidden ? `（${tx('loot.hidden', '暗格')}：${r.hidden}）` : '';
    el.title = tx('loot.pick', '拾取') + '：' + r.name + where;
    el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', el.title);
    const take = ev => { try { ev?.preventDefault?.(); ev?.stopPropagation?.(); } catch (e) {}
      el.classList.add('got');   // 先按下：等背包数据回来时会被重建，中间这半秒不重复点
      post({ type: 'eden-map:loot', id: r.id, name: r.name, map: r.map || cur, place: r.place || '', hidden: !!r.hidden }); };
    el.addEventListener('click', take);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') take(e); });
    try { viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(k.nx, k.ny * aspect), placement: OpenSeadragon.Placement.CENTER }); els.push(el); }
    catch (e) {}
  }
  return els.length;
}

let done = false;
export function registerLootLayer() {
  if (done) return registry.has('loot'); done = true;
  registry.register({
    id: 'loot', slot: 'interaction', kind: 'dom', order: 10, initialVisible: true,
    menu: { order: 48, boxId: 'tgLoot', labelKey: 'loot.layer', label: '藏物', titleKey: 'loot.layer_title', title: '设定包里登记在世界上的东西（走到近处才看得到暗格里的）' },
    mount: () => { css(); rebuildLoot(); return true; },
    unmount: () => { clearLoot(); },
    setVisible: v => { v ? rebuildLoot() : clearLoot(); },
  });
  // 切图 / 休眠后重开：body 的 data-map 变了就跟着重画（clouds.mjs 一个路子）
  try { watch = new MutationObserver(() => setTimeout(rebuildLoot, 0)); watch.observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'loot.resize', type: 'resize', fn: () => rebuildLoot() });
  busOn({ key: 'loot.hostMsg', type: 'message', fn: e => {
    if (!window.__fromHost?.(e)) return;
    const d = e.data; if (!d) return;
    if (d.type === 'eden-map:stash') setLootStash(d);
    else if (d.type === 'eden-map:inv' || d.type === 'eden-map:here' || d.type === 'eden-map:wake') setTimeout(rebuildLoot, 0);
  } });
  window.TCLoot = { set: setLootStash, rebuild: rebuildLoot, rows: lootRows, now: () => els.length,
    all: () => stash?.items || [] };   // Part 8-1：整张藏物表（庄园三维页自己按房间 / 区域落点）
  return true;
}
