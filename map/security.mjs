// 主城 · 安保叠加层（v0.9.6，card-omissions D3 / D7 / D14 / D15 / D16；LOOK-1 A8 / D42 改签样式）：图层菜单「安保」开关（默认关，本机 edenMapSecurity）。
// 开着时：层级图上有安保事实的地点（data/security.json）图钉旁一枚「安保」小签，内含每类事实的小图标（结界 / 监控 / 门禁 / 警报）；
// 点签 = 开这个地点卡，卡里「安保」一栏列出各类规则（替代旧版「结警监门」首字签——可读性差）。
// 只读、中性措辞；数据只来自卡里写明的规则。查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { mapRegistry, currentMapId } from './app/state.mjs';
import { esc } from './app/dom-helpers.mjs';
import { LANG } from './app/i18n.mjs';
import { registry, declared } from './app/layer-host.mjs';
import { register } from './app/plugins.mjs';
import { packData } from './app/current-pack.mjs';
import { uiTextOr } from './app/text-lookup.mjs';   // 安保数据是包级挂载点（manifest.data.security，通用化 v1）——内核与外挂都不写死 eden 的文件名
const SecurityView = (() => {
  const KEY = 'edenMapSecurity';
  let data = null, loading = null;
  const en = () => typeof LANG !== 'undefined' && LANG === 'en';
  const isOn = () => { try { return LocalStore.get(KEY) === '1'; } catch (e) { return false; } };
  const load = () => data ? Promise.resolve(data) : (loading ??= Promise.resolve(packData('security')).then(p => p ? fetch(new URL(p, document.baseURI)).then(r => r.ok ? r.json() : null) : null).then(d => (data = d)).catch(() => null));
  const kindName = k => { const n = data?.kinds?.[k]; return n ? (en() ? n[1] : n[0]) : k; };
  // A8（D42）：每类事实一枚 11 px 描边小图标（静态常量，无数据进 markup）；unknown kinds fall back to no icon, the title still names them
  const ICONS = {
    barrier: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 13.4 4v4c0 3.1-2.2 5.5-5.4 6.4C4.8 13.5 2.6 11.1 2.6 8V4Z"/></svg>',
    monitor: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 8S4.2 3.6 8 3.6 14.4 8 14.4 8 11.8 12.4 8 12.4 1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="1.9"/></svg>',
    access: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/></svg>',
    alarm: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4a4 4 0 0 1 4 4v3l1.4 2.4H2.6L4 9.4v-3a4 4 0 0 1 4-4Z"/><path d="M6.6 14a1.4 1.4 0 0 0 2.8 0"/></svg>',
  };
  /** 当前图某个标记名（中文 dataset.name）的事实 */
  function factsFor(name) {
    if (!data || typeof mapRegistry === 'undefined' || !currentMapId) return null;
    const m = mapRegistry.maps[currentMapId]; if (!m?.markers) return null;
    const id = Object.keys(m.markers).find(k => m.markers[k].name === name); if (!id) return null;
    return data.items.find(i => i.map === currentMapId && i.marker === id)?.facts || null;
  }
  function render() {
    document.querySelectorAll('.mk .secb').forEach(e => e.remove());
    document.body.classList.toggle('secon', isOn());
    if (!isOn() || !data) return;
    for (const el of document.querySelectorAll('.mk[data-name]')) {
      const f = factsFor(el.dataset.name); if (!f) continue;
      const kinds = [...new Set(f.map(x => x.kind))];
      const b = document.createElement('span'); b.className = 'secb'; b.setAttribute('role', 'button');
      const ic = document.createElement('i'); ic.className = 'sic'; ic.setAttribute('aria-hidden', 'true');
      ic.innerHTML = kinds.map(k => ICONS[k] || '').join('');   // A8: one icon per kind of fact
      b.appendChild(document.createTextNode(uiTextOr('sec.title', '安保'))); b.appendChild(ic);
      b.title = uiTextOr('sec.badge', '安保：{s}', { s: kinds.map(kindName).join('、') });
      el.appendChild(b);   // tappable: the click bubbles to the marker's MouseTracker and opens the place card (its security section)
    }
  }
  /** 地点卡：开着时加「安保」一栏 */
  function decorate(el, name) {
    const c = document.getElementById('card'); if (!c) return;
    c.querySelectorAll('.secbox').forEach(n => n.remove());   // U-FIX-3：这一栏在 .extra 外面，换卡不会被冲掉——先清上一张卡的
    if (c.hidden || !isOn()) return;
    const f = factsFor(el?.dataset?.name || name); if (!f) return;
    const box = document.createElement('div'); box.className = 'secbox';
    box.innerHTML = `<b>${esc(uiTextOr('sec.title', '安保'))}</b><dl class="fields">${f.map(x => `<dt>${esc(kindName(x.kind))}</dt><dd>${esc(en() ? x.text_en || x.text : x.text)}${x.src ? `<small>${esc(x.src)}</small>` : ''}</dd>`).join('')}</dl>`;
    c.querySelector('.extra').before(box);
  }
  function set(on) { try { LocalStore.set(KEY, on ? '1' : '0'); } catch (e) {} load().then(render); }
  // P3-C：「安保」菜单行由 LayerRegistry 渲染（app/layer-host.mjs，行序在航线与行程之间，与旧 insertBefore 位置一致）；勾选 → setVisible → set()
  registry.register(declared('security', { initialVisible: isOn(),
    setVisible: v => set(v) }));
  function afterOpen() { const lab = document.getElementById('tgSec'); if (lab) lab.hidden = !(typeof mapRegistry !== 'undefined' && mapRegistry.maps[currentMapId]?.kind === 'points' && data?.items?.some(i => i.map === currentMapId)); load().then(() => { if (lab) lab.hidden = !data?.items?.some(i => i.map === currentMapId); render(); }); }
  // U-FIX-5 U-02: the badge sits below-left of the pin; the people ring of the player's place is on the right
  const css = `
  .mk .secb{position:absolute;right:calc(50% + 4px);top:100%;transform:translateY(2px);display:inline-flex;align-items:center;gap:4px;padding:0 6px;border-radius:var(--r-pill,999px);background:var(--map-label-bg,rgba(8,10,14,.8));border:1px solid var(--map-label-line,rgba(255,255,255,.2));color:var(--map-label-ink,#f0f3f6);font:600 var(--fs-micro,11px)/16px var(--font-ui,sans-serif);white-space:nowrap;letter-spacing:.08em;cursor:pointer}
  .mk .secb .sic{display:inline-flex;align-items:center;gap:2px}
  .mk .secb .sic svg{width:11px;height:11px;display:block;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
  #card .secbox{margin-top:var(--sp-5);padding-top:var(--sp-4);border-top:1px solid var(--line)}
  #card .secbox>b{font-size:var(--fs-small);color:var(--ink-2)}
  #card .secbox dl.fields{margin-top:var(--sp-3)}
  #card .secbox dd small{display:block;color:var(--muted);font-size:var(--fs-micro)}`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  return { render, decorate, set, afterOpen, factsFor, get on() { return isOn(); } };
})();
register('SecurityView', SecurityView);
export { SecurityView };
