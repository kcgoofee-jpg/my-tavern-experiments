// 天城 · 安保叠加层（v0.9.6，card-omissions D3 / D7 / D14 / D15 / D16）：图层菜单「安保」开关（默认关，本机 edenMapSecurity）。
// 开着时：层级图上有安保事实的地点（data/security.json）图钉旁多一个小盾牌签（结 / 监 / 门 / 警），地点卡里多一栏「安保」列出结界 / 监控 / 门禁 / 警报规则。
// 只读、中性措辞；数据只来自卡里写明的规则。查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { REG, cur } from './app/state.mjs';
import { esc } from './app/dom-helpers.mjs';
import { LANG } from './app/i18n.mjs';
import { registry } from './app/layer-host.mjs';
import { register } from './app/plugins.mjs';
import { packData } from './app/current-pack.mjs';   // 安保数据是包级挂载点（manifest.data.security，通用化 v1）——内核与外挂都不写死 eden 的文件名
const TCSecurity = (() => {
  const T = (k, zh, v) => window.I18N.tx(k, zh, v);   // 共享 i18n 服务（viewer.html window.I18N）
  const KEY = 'edenMapSecurity';
  let data = null, loading = null;
  const en = () => typeof LANG !== 'undefined' && LANG === 'en';
  const isOn = () => { try { return TCStore.get(KEY) === '1'; } catch (e) { return false; } };
  const load = () => data ? Promise.resolve(data) : (loading ??= Promise.resolve(packData('security')).then(p => p ? fetch(new URL(p, document.baseURI)).then(r => r.ok ? r.json() : null) : null).then(d => (data = d)).catch(() => null));
  const kindName = k => { const n = data?.kinds?.[k]; return n ? (en() ? n[1] : n[0]) : k; };
  /** 当前图某个标记名（中文 dataset.name）的事实 */
  function factsFor(name) {
    if (!data || typeof REG === 'undefined' || !cur) return null;
    const m = REG.maps[cur]; if (!m?.markers) return null;
    const id = Object.keys(m.markers).find(k => m.markers[k].name === name); if (!id) return null;
    return data.items.find(i => i.map === cur && i.marker === id)?.facts || null;
  }
  function render() {
    document.querySelectorAll('.mk .secb').forEach(e => e.remove());
    document.body.classList.toggle('secon', isOn());
    if (!isOn() || !data) return;
    for (const el of document.querySelectorAll('.mk[data-name]')) {
      const f = factsFor(el.dataset.name); if (!f) continue;
      const kinds = [...new Set(f.map(x => x.kind))];
      const b = document.createElement('span'); b.className = 'secb'; b.setAttribute('aria-hidden', 'true');
      b.textContent = kinds.map(k => kindName(k).slice(0, en() ? 3 : 1)).join(en() ? '·' : '');
      b.title = T('sec.badge', '安保：{s}', { s: kinds.map(kindName).join('、') });
      el.appendChild(b);
    }
  }
  /** 地点卡：开着时加「安保」一栏 */
  function decorate(el, name) {
    const c = document.getElementById('card'); if (!c || c.hidden || !isOn()) return;
    const f = factsFor(el?.dataset?.name || name); if (!f) return;
    const box = document.createElement('div'); box.className = 'secbox';
    box.innerHTML = `<b>${esc(T('sec.title', '安保'))}</b><dl class="fields">${f.map(x => `<dt>${esc(kindName(x.kind))}</dt><dd>${esc(en() ? x.text_en || x.text : x.text)}${x.src ? `<small>${esc(x.src)}</small>` : ''}</dd>`).join('')}</dl>`;
    c.querySelector('.extra').before(box);
  }
  function set(on) { try { TCStore.set(KEY, on ? '1' : '0'); } catch (e) {} load().then(render); }
  // P3-C：「安保」菜单行由 LayerRegistry 渲染（app/layer-host.mjs，行序在航线与行程之间，与旧 insertBefore 位置一致）；勾选 → setVisible → set()
  registry.register({ id: 'security', slot: 'markers', order: 2, kind: 'osd', initialVisible: isOn(),
    menu: { order: 40, id: 'tgSec', boxId: 'tgSecBox', labelKey: 'sec.title', label: '安保', titleKey: 'sec.hint', title: '结界、监控、门禁规则（只列卡里写明的）' },
    setVisible: v => set(v) });
  function afterOpen() { const lab = document.getElementById('tgSec'); if (lab) lab.hidden = !(typeof REG !== 'undefined' && REG.maps[cur]?.kind === 'points' && data?.items?.some(i => i.map === cur)); load().then(() => { if (lab) lab.hidden = !data?.items?.some(i => i.map === cur); render(); }); }
  const css = `
  .mk .secb{position:absolute;left:50%;top:100%;transform:translate(-50%,2px);padding:0 5px;border-radius:var(--r-pill,999px);background:var(--map-label-bg,rgba(8,10,14,.8));border:1px solid rgba(140,230,255,.75);color:rgba(170,235,255,.95);font:600 var(--fs-micro,11px)/15px var(--font-ui,sans-serif);white-space:nowrap;pointer-events:none;letter-spacing:.08em}
  #card .secbox{margin-top:var(--sp-5);padding-top:var(--sp-4);border-top:1px solid var(--line)}
  #card .secbox>b{font-size:var(--fs-small);color:var(--ink-2)}
  #card .secbox dl.fields{margin-top:var(--sp-3)}
  #card .secbox dd small{display:block;color:var(--muted);font-size:var(--fs-micro)}`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  return { render, decorate, set, afterOpen, factsFor, get on() { return isOn(); } };
})();
register('TCSecurity', TCSecurity);
export { TCSecurity };
