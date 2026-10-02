// 宿主实例的生命周期：接管旧实例（幂等注入）、挂面板 DOM、事件监听登记与「死亡」标记、清理钩子（C2 第 4 步从 eden-map.js 拆出，行为不变）。
// cleanup 本身仍在入口组装（它要停入口里的计时器 / 观察器），这里只负责登记到 window.parent.__edenMapCleanup 与 pagehide。
import { fnOk, thFn } from './host-tavernhelper.mjs';
import { hostTokensCss } from './host-tokens.mjs';
import { mountClockPop } from './clock-view.mjs';

/** 换版本 / 关脚本时旧实例必须彻底停掉（2026-09-27 接手 review P1）。所有 eventOn 走 listen 登记句柄；kill() 之后旧实例的所有出口都变成空操作。 */
/** N10 (7): the place chain of the status line reads with a spaced middle dot between its parts (a display change only; the title keeps the raw text) */
export const chainText = s => String(s ?? '').replace(/\s*[·・‧•]\s*/g, ' · ').trim();

export function createLife() {
  let dead = false; const offs = [];
  return {
    get dead() { return dead; },
    kill() { dead = true; },
    /** listen(ev, fn, last?)：last = true 时优先用 eventMakeLast 让本处理器**排在所有同事件处理器之后跑**
     *  （参考卡《玄胤世界观》Canon Authority Gate 的 bindLast 同一手法：结算 / 守卫必须晚于别人的写）。
     *  没有 eventMakeLast 就退回 eventOn——语义不变，只是失去「排最后」的保证。 */
    listen: (ev, fn, last) => {
      if (dead) return;
      try {
        const mkLast = last ? thFn('eventMakeLast') : null;   // thFn：全局与 TavernHelper 命名空间都认
        if (mkLast) { const h = mkLast(ev, fn); offs.push([null, null, typeof h?.stop === 'function' ? () => h.stop() : (typeof h === 'function' ? h : () => {})]); return; }
        offs.push([ev, fn, eventOn(ev, fn)]);
      } catch (e) {}
    },
    add: off => offs.push([null, null, off]),   // 非酒馆事件的撤销函数（visibilitychange 等）
    unlisten: () => { for (const [ev, fn, h] of offs.splice(0)) { try { if (ev === null) h(); else if (fnOk('eventRemoveListener')) eventRemoveListener(ev, fn, h); else if (fnOk('eventOff')) eventOff(ev, fn); } catch (e) {} } },
  };
}

/** 幂等：脚本被重复注入（换卡、热重载）时先清掉上一份的元素和全部监听，只留一个悬浮按钮、一套监听 */
export function takeOver(pdoc, ID, scriptOwner) {
  try { window.parent.__edenMapCleanup?.(); } catch (e) { /* host page not reachable: nothing to do */ }
  pdoc.getElementById(ID)?.remove();
  // 地基 A2：父页面上的节点都打 data-eden-owner；启动时清掉不属于本实例的（子 iframe 被异常移除、pagehide 没派发时留下的孤儿）
  try { for (const el of [...pdoc.querySelectorAll('[data-eden-owner]')]) if (el.getAttribute('data-eden-owner') !== scriptOwner || el.id === ID) el.remove(); } catch (e) {}
}

/** 注入宿主页：悬浮按钮 + 面板（样式内联：宿主页里不另发请求）。返回根节点。 */
export function mount(pdoc, ID, scriptOwner) {
  const root = pdoc.createElement('div');
  root.id = ID; root.setAttribute('data-eden-owner', scriptOwner);
  root.innerHTML = `
<style>
  /* 设计令牌（map/ui/tokens.css 的同名值；宿主页里不另发请求，所以内联一份，见 host-tokens.mjs）：唯一的金、唯一的红；面板跟随地图的深 / 浅主题（E5） */
  ${hostTokensCss(ID)}
  /* 自检小提示：跟着面板的深 / 浅主题（v0.9.5，之前写死深色） */
  #${ID} .em-ctoast { position: fixed; left: 50vw; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom) + 76px); z-index: var(--zh-toast); max-width: min(420px, 92vw); box-sizing: border-box;
    padding: 10px 40px 10px 14px; border-radius: 10px; background: var(--em-bg); color: var(--em-ink); border: 1px solid var(--em-accent); box-shadow: 0 6px 20px rgba(0,0,0,.35); font: 12px/1.55 var(--em-font); }
  #${ID} .em-ctoast b { color: var(--em-accent); }
  #${ID} .em-ctoast button { position: absolute; right: 4px; top: 4px; width: 44px; height: 44px; border: 0; background: none; color: var(--em-muted); font: 18px/1 system-ui; cursor: pointer; }
  /* 自动检查更新的提示（v0.9.6）：说明链接 + 「稍后」/「此版本不再提示」 */
  #${ID} .em-ctoast a { color: var(--em-accent); }
  #${ID} .em-ctoast.em-upd { bottom: auto; top: calc(env(safe-area-inset-top) + 12px); }
  #${ID} .em-ctoast.em-force { border-color: var(--em-alert); }
  #${ID} .em-ctoast.em-force > b { color: var(--em-alert); }
  #${ID} .em-ctoast .em-acts { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  #${ID} .em-ctoast .em-acts button { position: static; width: auto; height: 32px; padding: 0 12px; border: 1px solid var(--em-line-2); border-radius: 8px; color: var(--em-ink); font: 12px/1 var(--em-font); }
  #${ID} .em-ctoast .em-acts button:first-child { background: var(--em-accent); border-color: var(--em-accent); color: var(--em-on-accent); font-weight: 700; }
  #${ID} :focus-visible { outline: 2px solid var(--em-focus); outline-offset: 2px; }
  /* 只用视口单位定位：酒馆的 <html> 带 transform，会成为 fixed 的包含块且高度为 0 */
  #${ID} .em-fab { position: fixed; left: calc(100vw - 66px); top: calc(100vh - 144px); top: calc(100dvh - 144px); z-index: var(--zh-fab); width: 48px; height: 48px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent); background: var(--glass-1); color: var(--em-gold); cursor: pointer;
    box-shadow: var(--elev-panel); display: grid; place-items: center; touch-action: none; transition: transform 120ms; }
  #${ID} .em-fab:active { transform: scale(.97); }
  #${ID}.em-yield .em-fab { z-index: var(--zh-yield); }
  #${ID}.em-dbui .em-fab { display: none; }
  #${ID} .em-fab svg { width: 24px; height: 24px; }
  /* 后台预加载：面板照常排版但不可见、不接收点击，地图在里面把首屏加载进缓存 */
  #${ID} .em-panel.em-ghost { visibility: hidden; pointer-events: none; }
  /* 悬浮按钮上的预加载进度环；完成后短暂显示一圈绿色 */
  #${ID} .em-fab.prep::before, #${ID} .em-fab.ready::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid transparent; }
  #${ID} .em-fab.prep::before { border: 0; background: conic-gradient(var(--em-gold) calc(var(--p, 0) * 1%), rgba(230,195,106,.18) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); }
  #${ID} .em-fab.ready::before { border-color: rgba(123,216,143,.8); animation: em-fade 1.8s forwards; }
  /* 预加载失败：红色虚线环（不画满，不像成功），点开重试 */
  #${ID} .em-fab.fail::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px dashed var(--em-alert); }
  @keyframes em-spin { to { transform: rotate(360deg); } }
  @keyframes em-fade { to { opacity: 0; } }
  /* 新事态数：事态计数 = 唯一的红（规范 --alert），深字保证 11 px 的对比度 */
  #${ID} .em-badge { font-variant-numeric: tabular-nums; position: absolute; left: -4px; top: -4px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 999px; background: var(--em-alert); color: var(--em-on-alert);
    font: 700 11px/18px "IBM Plex Mono", ui-monospace, Menlo, monospace; text-align: center; box-shadow: 0 0 0 2px #151b20; }
  #${ID} .em-badge[hidden] { display: none; }
  #${ID} .em-tip { position: absolute; right: 56px; top: 8px; width: max-content; max-width: 180px; padding: 6px 10px; border-radius: 8px; background: #151b20; border: 1px solid rgba(230,195,106,.6); color: #d5dde4;
    font: 12px/1.5 var(--em-font); box-shadow: 0 6px 20px rgba(0,0,0,.3); pointer-events: none; }
  #${ID} .em-tip.em-tip-r { right: auto; left: 56px; }   /* 悬浮按钮在左半边（左手）：提示朝右 */
  #${ID} .em-fab.here::after { content: ''; position: absolute; right: 4px; top: 4px; width: 8px; height: 8px; border-radius: 50%; background: #ff5a5a; box-shadow: 0 0 0 2px #151b20; }
  #${ID} .em-panel { position: fixed; z-index: var(--zh-panel); left: 50vw; top: 50vh; top: 50dvh; transform: translate(-50%, -50%);
    width: min(1200px, 94vw); height: min(820px, 88vh); height: min(820px, 88dvh); grid-template-columns: minmax(0, 1fr); background: var(--em-bg); border: 1px solid var(--em-line-2); color: var(--em-ink); font-family: var(--em-font);
    border-radius: 12px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,.38), 0 24px 64px rgba(0,0,0,.3); display: grid; grid-template-rows: 1fr;
    contain: layout paint style; }   /* 面板内的重排、重绘不波及酒馆页面 */
  #${ID} .em-panel[hidden] { display: none; }
  /* 标题栏（44）：标题 · 当前地点 · 线路 · 关闭 */
  /* UI v2 合并顶栏（spec §2.1）：宿主栏只留 当前地点胶囊 + ✕，浮在查看器顶栏右端（查看器按 eden-map:hostbar 的宽度让位）；标题、线路交给查看器 */
  #${ID} .em-bar { position: absolute; z-index: var(--zh-bar); top: 0; right: 0; max-width: 62%; display: flex; align-items: center; gap: 10px; min-height: 44px; box-sizing: border-box; padding: 0 6px 0 14px; color: var(--em-ink); font-size: 13px;
    background: var(--glass-1); border-left: 1px solid var(--glass-line); border-bottom: 1px solid var(--glass-line); -webkit-backdrop-filter: blur(var(--glass-blur-1)); backdrop-filter: blur(var(--glass-blur-1)); }
  @media (pointer: coarse), (prefers-reduced-transparency: reduce) { #${ID} .em-bar { -webkit-backdrop-filter: none; backdrop-filter: none; background: var(--surface); } }
  #${ID} .em-bar .em-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  #${ID} .em-bar .em-line { display: none !important; }
  /* the one status mark (the viewer's own dot hides when embedded): nothing when loaded; a small spinner while loading; a red dot when it failed (a click opens the line picker) */
  #${ID} .em-bar .em-dot { flex: none; box-sizing: border-box; width: 10px; height: 10px; border-radius: 50%; margin: 0 2px; }
  #${ID} .em-bar .em-dot[data-st="ok"] { display: none; }
  #${ID} .em-bar .em-dot[data-st="loading"] { border: 2px solid var(--em-line-2); border-top-color: var(--em-accent); animation: em-spin .8s linear infinite; }
  #${ID} .em-bar .em-dot[data-st="fail"] { width: 8px; height: 8px; background: var(--em-alert); cursor: pointer; box-shadow: 0 0 0 4px transparent; }
  #${ID} .em-bar .em-dot[data-st="fail"]:hover { box-shadow: 0 0 0 4px var(--em-surface-2); }
  @keyframes em-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { #${ID} .em-bar .em-dot[data-st="loading"] { animation: none; border-top-color: var(--em-line-2); border-right-color: var(--em-accent); } }
  #${ID} .em-body { grid-row: 1; }
  #${ID} .em-bar .em-title { font-weight: 700; letter-spacing: .04em; }
  #${ID} .em-bar .em-here { color: var(--em-muted); margin-left: auto; font-size: 12px; min-width: 0; flex: 0 1 auto; max-width: 46%; overflow: hidden; white-space: nowrap; display: flex; align-items: center; }
  #${ID} .em-bar .em-here .em-nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  #${ID} .em-bar .em-here .em-more { flex: none; margin-left: 2px; color: var(--em-ink); }
  #${ID} .em-bar .em-here.em-full .em-nm { white-space: normal; }
  #${ID} .em-bar .em-here.em-unm { color: var(--em-ink); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
  /* replay on: the clock and the place pill read 「回放」 (accent outline) instead of the live values */
  #${ID}.em-replay .em-bar .em-here[data-rp], #${ID}.em-replay .em-bar .em-clock[data-rp] { box-shadow: inset 0 0 0 1px var(--em-accent); color: var(--em-accent); border-radius: 999px; padding-inline: 10px; }
  #${ID}.em-replay .em-bar .em-here[data-rp] > *, #${ID}.em-replay .em-bar .em-clock[data-rp] > * { display: none; }
  #${ID}.em-replay .em-bar .em-clock[data-rp]::after { display: none; }
  #${ID}.em-replay .em-bar .em-here[data-rp]::before, #${ID}.em-replay .em-bar .em-clock[data-rp]::before { content: attr(data-rp); font-weight: 700; }
  #${ID} .em-bar .em-here.em-unsure { color: var(--em-ink); }   /* pending / stale: normal ink, a hollow ring after the name, the reason in the tooltip (HEADER-1) */
  #${ID} .em-bar .em-here.em-unsure::after { content: ''; flex: none; box-sizing: border-box; width: 7px; height: 7px; margin-left: 6px; border: 1.5px solid currentColor; border-radius: 50%; }
  #${ID} .em-bar .em-here:empty { display: none; }
  #${ID} .em-bar .em-here.em-full { white-space: normal; max-width: 60%; line-height: 1.35; padding: 4px 0; }   /* 触屏没有悬停：点一下看全文 */
  #${ID} .em-bar button { font: inherit; cursor: pointer; }
  #${ID} .em-bar .em-close { flex: none; width: 36px; height: 36px; display: grid; place-items: center; background: none; border: 0; border-radius: 8px; color: var(--em-muted); padding: 0; }
  #${ID} .em-bar .em-close:hover { background: var(--em-surface-2); color: var(--em-ink); }
  #${ID} .em-bar .em-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  /* 时间轴回放（Part 5-4）：标题栏 ⏱ 进入；底部胶囊条拖动楼层，地图整体退回那一刻 */
  #${ID} .em-bar .em-tl-btn { flex: none; width: 32px; height: 32px; display: grid; place-items: center; background: none; border: 0; border-radius: 8px; color: var(--em-muted); padding: 0; }
  #${ID} .em-bar .em-tl-btn:hover { background: var(--em-surface-2); color: var(--em-ink); }
  #${ID} .em-bar .em-tl-btn.on { color: var(--em-accent); }
  #${ID} .em-bar .em-tl-btn[hidden] { display: none; }
  #${ID} .em-bar .em-tl-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  #${ID} .em-tl { position: absolute; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: var(--zh-tl); display: flex; align-items: center; gap: 10px; width: min(86%, 520px); padding: 8px 14px; border-radius: 999px;
    background: var(--glass-1); border: 1px solid var(--em-accent); box-shadow: var(--elev-panel); font: 12px/1.4 var(--em-font); color: var(--em-ink); box-sizing: border-box; }
  #${ID} .em-tl[hidden] { display: none; }
  #${ID} .em-tl .em-tl-l { flex: none; color: var(--em-accent); font-weight: 700; }
  #${ID} .em-tl input[type="range"] { flex: 1 1 80px; min-width: 80px; accent-color: var(--em-accent); }
  #${ID} .em-tl .em-tl-v { flex: 0 1 auto; min-width: 7.5em; color: var(--em-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }   /* R-01: the floor number never ellipsises away */
  #${ID} .em-tl button { flex: none; width: 28px; height: 28px; border: 0; background: none; color: var(--em-muted); font: 16px/1 var(--em-font); cursor: pointer; padding: 0; }
  #${ID} .em-tl button:hover { color: var(--em-ink); }
  #${ID} .em-bar, #${ID} .em-body { min-width: 0; }   /* 标题栏的长地点 / 线路按钮不再把面板撑出屏幕（E5 r2 P0：关闭按钮曾被推到 404–585 px） */
  #${ID} .em-bar .em-title { min-width: 0; }
  #${ID} .em-bar .em-clock { flex: none; position: relative; display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 10px; border-radius: 999px; background: var(--surface-2); color: var(--ink-2); font: 600 13px/1 var(--em-font); font-variant-numeric: tabular-nums; white-space: nowrap; cursor: help; }
  #${ID} .em-bar .em-clock::before { content: ''; position: absolute; inset: -6px 0; }   /* 44 px hit area */
  #${ID} .em-bar .em-clock[data-band] svg { display: none; }   /* the period band shows as the icon (sun / horizon / moon), not as colour alone */
  #${ID} .em-bar .em-clock[data-band]::after { content: ''; order: -1; width: 14px; height: 14px; background: currentColor; -webkit-mask: var(--em-band-ic) center / contain no-repeat; mask: var(--em-band-ic) center / contain no-repeat; }
  #${ID} .em-bar .em-clock[data-band="day"] { --em-band-ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round'%3E%3Ccircle cx='8' cy='8' r='3'/%3E%3Cpath d='M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1'/%3E%3C/svg%3E"); }
  #${ID} .em-bar .em-clock[data-band="dawn"], #${ID} .em-bar .em-clock[data-band="dusk"] { --em-band-ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M3.5 11.5a4.5 4.5 0 0 1 9 0M1.5 11.5h13M8 3v1.6M3 6l1.1 1.1M13 6l-1.1 1.1M4 14h8'/%3E%3C/svg%3E"); }
  #${ID} .em-bar .em-clock[data-band="night"] { --em-band-ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z'/%3E%3C/svg%3E"); }
  #${ID} .em-bar .em-clock svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  #${ID} .em-bar .em-clock[hidden] { display: none; }
  #${ID} .em-bar .em-clock { cursor: pointer; }
  #${ID} .em-bar .em-clock[data-view] { box-shadow: inset 0 0 0 1px var(--em-accent); color: var(--em-accent); }   /* U-FIX-4: a previewed period, not the chat's */
  #${ID} .em-bar .em-clock-pop { position: absolute; top: calc(100% + 4px); right: 6px; display: flex; flex-direction: column; min-width: 168px; padding: 6px; border-radius: 12px; background: var(--glass-2, var(--em-bg)); border: 1px solid var(--line, rgba(255,255,255,.12)); box-shadow: var(--elev-panel); font: 13px/1.3 var(--em-font); color: var(--em-ink); }
  #${ID} .em-bar .em-clock-pop[hidden] { display: none; }
  #${ID} .em-bar .em-clock-pop b { padding: 4px 8px 6px; font-size: 12px; color: var(--em-muted); font-weight: 600; }
  #${ID} .em-bar .em-clock-pop button { min-height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  #${ID} .em-bar .em-clock-pop button:hover, #${ID} .em-bar .em-clock-pop button:focus-visible { background: var(--surface-2); }
  #${ID} .em-bar .em-clock-pop button[aria-checked="true"] { color: var(--em-accent); font-weight: 700; }
  #${ID} .em-bar .em-clock-pop button[aria-checked="true"]::before { content: '✓ '; }
  #${ID} .em-body { position: relative; min-height: 0; contain: strict; }
  #${ID} iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--em-bg); }
  /* 地图程序就绪前的加载遮罩（就绪后由地图自己显示瓦片进度） */
  #${ID} .em-load { position: absolute; inset: 0; display: grid; place-items: center; background: var(--em-bg); color: var(--em-ink); font-size: 13px; }
  #${ID} .em-load[hidden] { display: none; }
  /* 线路选择（首次使用时弹出；标题栏「线路」可重新选） */
  #${ID} .em-pick { position: absolute; inset: 0; z-index: var(--zh-pick); display: grid; place-items: center; background: var(--em-bg); color: var(--em-ink); padding: 16px; }
  #${ID} .em-pick[hidden] { display: none; }
  #${ID} .em-pick h3 { margin: 0 0 6px; font-size: 17px; text-align: center; }
  #${ID} .em-pick p { margin: 0 0 16px; color: var(--em-muted); font-size: 13px; text-align: center; }
  #${ID} .em-pick .row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  #${ID} .em-pick button { width: 200px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--em-line-2); background: var(--em-surface-2); color: var(--em-ink);
    font: inherit; text-align: left; cursor: pointer; transition: border-color 120ms, background 120ms, transform 120ms; }
  #${ID} .em-pick button:hover { border-color: var(--em-accent); }
  #${ID} .em-pick button:active { transform: scale(.97); }
  #${ID} .em-pick button b { display: block; font-size: 15px; }
  #${ID} .em-pick button small { display: block; color: var(--em-muted); font-size: 12px; margin-top: 2px; }
  #${ID} .em-pick button .ms { display: block; margin-top: 8px; font-size: 12px; color: var(--em-muted); }
  #${ID} .em-pick button .ms .rec { color: var(--em-accent); display: inline; font-size: 12px; }
  #${ID} .em-pick button .ms.ok { color: var(--em-ok); } #${ID} .em-pick button .ms.bad { color: var(--em-alert); }
  #${ID} .em-bar .em-line { font-size: 12px; height: 28px; padding: 0 10px; border: 1px solid var(--em-line-2); border-radius: 8px; background: transparent; color: var(--em-muted); white-space: nowrap; flex: none; }
  #${ID} .em-bar .em-line:hover { color: var(--em-accent); border-color: var(--em-accent); }
  #${ID} .em-load > div { text-align: center; }
  #${ID} .em-load .txt { font-variant-numeric: tabular-nums; }
  #${ID} .em-load .bar { width: 200px; height: 3px; margin: 10px auto 0; border-radius: 2px; background: var(--em-line); overflow: hidden; }
  #${ID} .em-load .bar i { display: block; height: 100%; width: 0; background: var(--em-accent); transition: width .25s; }
  #${ID} .em-load .hint { margin-top: 8px; font-size: 12px; color: var(--em-accent); min-height: 1em; }
  #${ID} .em-load .acts { margin-top: 8px; display: flex; gap: 8px; justify-content: center; }
  #${ID} .em-load .acts[hidden] { display: none; }
  #${ID} .em-load .acts button { font: inherit; font-size: 13px; height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--em-line-2); background: transparent; color: var(--em-ink); cursor: pointer; }
  #${ID} .em-load .acts button:first-child { background: var(--em-accent); border-color: var(--em-accent); color: var(--em-on-accent); font-weight: 700; }
  #${ID} .em-load .acts button:hover { border-color: var(--em-accent); }
  /* 地图程序就绪后遮罩变透明：先看到模糊地图，进度卡片（实底）浮在上面 */
  #${ID} .em-load.over { background: transparent; pointer-events: none; }
  #${ID} .em-load.over > div { background: var(--em-bg); padding: 12px 18px; border-radius: 12px; border: 1px solid var(--em-line); box-shadow: 0 6px 20px rgba(0,0,0,.3); pointer-events: auto; }
  @keyframes em-slide { from { background-position: -80px 0, 0 0; } to { background-position: 160px 0, 0 0; } }
  /* 手机：面板全屏，关闭按钮 44 */
  @media (max-width: 640px) {
    #${ID} .em-panel { width: 100vw; height: 100vh; height: 100dvh; border: 0; border-radius: 0; }
    #${ID} .em-bar { padding: env(safe-area-inset-top) 2px 0 10px; font-size: 13px; gap: 8px; }
    #${ID} .em-bar .em-here { overflow: hidden; white-space: nowrap; min-width: 0; }
    #${ID} .em-bar .em-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
    #${ID} .em-bar .em-here { flex: 1 1 0; }
    #${ID} .em-bar .em-line { white-space: nowrap; flex: none; max-width: 6.5em; overflow: hidden; text-overflow: ellipsis; }   /* 手机上标题、线路都不折行（用户实测：「没梯 / 子」断行） */
    #${ID} .em-bar .em-title { max-width: 42%; }
    #${ID} .em-bar .em-here { min-width: 4.5em; }
    #${ID} .em-bar { max-width: 45%; }   /* U19: the host bar <= 45 %, the place field keeps >= 50 % of it */
    #${ID} .em-bar .em-here { flex: 1 1 50%; min-width: 50%; max-width: none; }   /* 线路按钮不再把「当前地点」挤成 0 宽（E5 r3 手机 N-01） */
    #${ID} .em-bar .em-clock:not(.em-open) .em-clock-t { display: none; }   /* folding order: the clock goes to its icon first; a tap shows the time again */
    #${ID} .em-tl { bottom: calc(var(--sheet-peek, 56px) + 10px); }   /* N10 (5): above the drawer peek, not over the zoom stack */
    #${ID} .em-bar .em-close { width: 44px; height: 44px; }
    #${ID} .em-bar .em-close svg { width: 22px; height: 22px; }
    #${ID} .em-panel.em-left .em-close { order: -1; }   /* 左手（E7）：关闭按钮到左上，离左手拇指近一些；底部还有地图菜单里的「关闭地图」 */
    #${ID} .em-panel.em-left .em-bar { padding: env(safe-area-inset-top) 10px 0 2px; right: auto; left: 0; }   /* 左手：宿主栏（✕ 在最左）贴左上，查看器顶栏左端让位 */
  }
</style>
<button class="em-fab" title="世界地图" aria-label="打开世界地图">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>
  <span class="em-badge" hidden></span>
</button>
<div class="em-panel" hidden>
  <div class="em-bar" role="toolbar"><b class="em-title">新历 2088</b><span class="em-clock" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/></svg><span class="em-clock-t"></span></span><span class="em-here"></span><i class="em-dot" role="img" data-st="loading"></i><button class="em-line" title="切换加载线路"></button><button class="em-tl-btn" title="时间轴回放" aria-label="时间轴回放" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4M10.2 9.4 8 8V4.8"/></svg></button><button class="em-close" aria-label="关闭"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
  <div class="em-body"><iframe class="em-frame" title="地图"></iframe><div class="em-load" hidden><div><span class="txt">加载地图 0%</span><div class="bar"><i></i></div><div class="hint"></div><div class="acts" hidden><button class="retry">重试</button><button class="swap">换线路</button></div></div></div>
    <div class="em-pick" hidden><div><h3>选择加载线路</h3><p>地图图片较多，按你的网络选一条更快的线路；之后可以点标题栏的「线路」切换</p><div class="row"></div></div></div></div>
  <div class="em-tl" hidden><span class="em-tl-l">回放</span><input class="em-tl-r" type="range" min="0" max="0" step="1" value="0" aria-label="时间轴：拖动回到过去的楼层"><span class="em-tl-v"></span><button class="em-tl-x" aria-label="退出回放">×</button></div>
</div>`;
  pdoc.body.appendChild(root);
  const clk = root.querySelector('.em-clock'); mountClockPop(clk, { lang: () => { try { return localStorage.getItem('edenMapLang') === 'en' ? 'en' : 'zh'; } catch (e) { return 'zh'; } } });   // U-FIX-4：点时钟 = 时段弹层（窄屏同时展开时间）
  const dot = root.querySelector('.em-dot'), ld = root.querySelector('.em-load'), words = { zh: { loading: '加载中', ok: '已加载', fail: '加载失败' }, en: { loading: 'Loading', ok: 'Loaded', fail: 'Failed to load' } };
  const viewerStuck = () => { try { return !!root.querySelector('.em-frame')?.contentDocument?.querySelector('#tierState.stuck'); } catch (e) { return false; } };   // HEADER-1: the viewer's stuck load shows on this one dot (the viewer's own dot hides when embedded)
  const paintDot = () => { let l = 'zh'; try { l = localStorage.getItem('edenMapLang') === 'en' ? 'en' : 'zh'; } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } const st = viewerStuck() ? 'fail' : ld.hidden ? 'ok' : ld.querySelector('.acts')?.hidden === false ? 'fail' : 'loading'; dot.dataset.st = st; dot.setAttribute('aria-label', words[l][st]); dot.title = words[l][st]; };
  new MutationObserver(paintDot).observe(ld, { attributes: true, subtree: true, attributeFilter: ['hidden'] }); paintDot();
  { const f0 = root.querySelector('.em-frame'), watch = () => { try { const t = f0.contentDocument?.querySelector('#tierState'); if (t) new MutationObserver(paintDot).observe(t, { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* cross-origin frame: no viewer state to mirror */ } paintDot(); }; f0.addEventListener('load', watch); watch(); }
  dot.addEventListener('click', () => { if (viewerStuck()) { try { root.querySelector('.em-frame').contentDocument.querySelector('#tierState').click(); } catch (e) { /* frame gone */ } } else if (dot.dataset.st === 'fail') root.querySelector('.em-line')?.click(); });   // stuck viewer: its own retry; failed load: the reason and the way out is the line picker (the load overlay keeps its retry / swap buttons)
  // N10 (5): the replay bar docks as a glass-1 bar above the drawer peek; the viewer shifts its dock up by the bar's height (--tl-h on the viewer's root, the frame is same-origin)
  const tl = root.querySelector('.em-tl'), fr = root.querySelector('.em-frame'), setTl = () => { try { fr.contentDocument?.documentElement.style.setProperty('--tl-h', tl.hidden ? '0px' : (tl.offsetHeight + 8) + 'px'); } catch (e) {} };
  new MutationObserver(setTl).observe(tl, { attributes: true, attributeFilter: ['hidden'] }); fr.addEventListener('load', setTl);
  return root;
}

/** The panel's visibility for the viewer (S7-2, docs/ui-refactor.md 4): `document.hidden` stays false while the panel is closed or docked, so the host says it:
 *  send(on) when the panel opens / closes (or is a background ghost) and when the frame scrolls out of view. */
export function watchVisible(panel, frame, send) {
  let shown = true, seen = true, last = null;
  const push = () => { const on = shown && seen; if (on !== last) { last = on; send(on); } };
  const calc = () => { shown = !panel.hidden && !panel.classList.contains('em-ghost'); push(); };
  new MutationObserver(calc).observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] });
  if (typeof IntersectionObserver === 'function') new IntersectionObserver(es => { for (const e of es) seen = e.isIntersecting; push(); }, { threshold: 0 }).observe(frame);
  calc();
  return () => { last = null; push(); };   // resend (the viewer just became ready)
}

/** 登记清理钩子：下一次注入会先调它；pagehide（非 bfcache）时也清 */
export function install(cleanup) {
  window.parent.__edenMapCleanup = cleanup;
  if (window.__edenPagehide) window.removeEventListener('pagehide', window.__edenPagehide);   // an in-place restart installs again: one handler per window, not one per restart
  window.addEventListener('pagehide', window.__edenPagehide = e => { if (!e.persisted) cleanup(); });   // bfcache（pageshow 回来）时别把界面拆了：模块不会重新求值，拆了就再也回不来（接手 review P2）
}
