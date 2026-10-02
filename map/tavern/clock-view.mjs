// 时钟胶囊的时段切换（U-FIX-4，docs/ui-refactor.md §3.1 的补充）：点宿主栏的时钟 → 小弹层「跟随聊天时间 / <包的各时段>」。
// 选了某个时段 = 只换地图的看法（底图档位、时段色调、夜间图层）：时钟消息带 view = 时段 id，tod / night 跟着改；
// 时间本身（time / date）不动——日程、行程、注入一律仍按聊天时间算。只在本次会话里有效（不存储），换聊天或重载回到跟随。
// 纯宿主 DOM：不碰酒馆全局；chars-flow.mjs 推时钟前过 applyView，选了以后在胶囊上派发 'em-period' 让它重推。
const WORDS = {
  zh: { follow: '跟随聊天时间', title: '地图时段', dawn: '黎明', day: '白天', dusk: '黄昏', night: '夜间', preview: '预览：{b}（聊天时间不变）' },
  en: { follow: 'Follow chat time', title: 'Map period', dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night', preview: 'Preview: {b} (chat time unchanged)' },
};
const state = { view: '', bands: [] };
const words = lang => WORDS[lang === 'en' ? 'en' : 'zh'];
export const bandName = (id, lang) => words(lang)[id] || id;

/** 时钟对象 → 推给查看器的样子：选了时段就覆盖 tod / night，加 view；没选或这个包没有这一档 = 原样 */
export function applyView(clock) {
  if (!clock) return clock;
  if (Array.isArray(clock.bands) && clock.bands.length) state.bands = clock.bands.map(b => ({ id: String(b.id), dark: !!b.dark }));
  const b = state.view && state.bands.find(x => x.id === state.view);
  if (!b) return clock;
  return { ...clock, tod: b.id, night: b.dark, view: b.id };
}
export const viewNow = () => state.view;
export function setView(id) { state.view = id && state.bands.some(b => b.id === id) ? String(id) : ''; return state.view; }

/** 胶囊上挂弹层。lang() 现取界面语言；选完派发 'em-period'（chars-flow 收到后重推时钟） */
export function mountClockPop(clk, { lang = () => 'zh' } = {}) {
  const pop = clk.ownerDocument.createElement('div');
  pop.className = 'em-clock-pop'; pop.setAttribute('role', 'menu'); pop.hidden = true;
  clk.after(pop);
  clk.setAttribute('role', 'button'); clk.tabIndex = 0; clk.setAttribute('aria-haspopup', 'menu'); clk.setAttribute('aria-expanded', 'false');
  const render = () => {
    const w = words(lang());
    const row = (id, text) => `<button type="button" role="menuitemradio" data-band="${id}" aria-checked="${state.view === id}">${text}</button>`;
    pop.setAttribute('aria-label', w.title);
    pop.innerHTML = `<b>${w.title}</b>` + row('', w.follow) + state.bands.map(b => row(b.id, bandName(b.id, lang()))).join('');
  };
  const open = on => { if (on) render(); pop.hidden = !on; clk.setAttribute('aria-expanded', String(on)); clk.classList.toggle('em-open', on); };
  clk.addEventListener('click', e => { e.stopPropagation(); open(pop.hidden); });
  clk.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(pop.hidden); } });
  pop.addEventListener('click', e => {
    const b = e.target.closest('button[data-band]'); if (!b) return;
    e.stopPropagation(); setView(b.dataset.band); open(false);
    clk.dispatchEvent(new CustomEvent('em-period', { detail: { view: state.view } }));
  });
  // 弹层是最上面一层：Esc 只关它（捕获阶段先拿到，不让查看器 / 面板跟着关）；点别处也关
  clk.ownerDocument.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.stopImmediatePropagation(); e.preventDefault(); open(false); clk.focus(); } }, true);
  clk.ownerDocument.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) open(false); });
  return { open, render, pop };
}

/** 胶囊上的「预览中」标记与说明（时间文字不变；图标跟着 data-band 走，由调用方设） */
export function paint(clk, lang) {
  if (!clk) return;
  const base = String(clk.title || '').split('\n')[0];
  if (state.view) { clk.dataset.view = state.view; clk.title = base + '\n' + words(lang).preview.replace('{b}', bandName(state.view, lang)); }
  else { delete clk.dataset.view; clk.title = base; }
  clk.setAttribute('aria-label', clk.title);
}
