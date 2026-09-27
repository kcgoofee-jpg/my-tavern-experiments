// v0.9.5 开场自检（导入后第一次、换版本后第一次；设置「重新显示开场自检」/ EdenMap.selfcheck({ show: true }) 也能再开）。
// 一张不挡聊天的小卡（右下角，手机上贴底）：标题「伊甸地图 vX」+ 慢慢转的罗盘、进度条、自检清单（逐项打勾）。
// 进度故意不会一下满：自检很快做完，之后跟着后台真实的预加载慢慢走（地图程序与首屏图块、庄园三维页面、云图；省流时只做第一项），
// 全部加载完才到 100%；超过 cap 秒还没完就写「后台继续加载」并收尾。随时可以点「开始」或 × 关掉，后台加载照常继续。
// 纯 DOM，没有依赖；样式用宿主栏的 --em-* 令牌（跟深 / 浅主题）。
export const SEEN_KEY = 'edenMapSplashSeen';
/** 这一版有没有显示过（ver 为 null 时按 'dev' 算） */
export function shouldShow(store, ver) { try { return store.getItem(SEEN_KEY) !== String(ver || 'dev'); } catch (e) { return false; } }
export function markSeen(store, ver) { try { store.setItem(SEEN_KEY, String(ver || 'dev')); } catch (e) {} }
/** 进度的上限：自检占 35%，加载任务按完成数分剩下的 65%；没全完时比「下一格」少一点，永远到不了 100 */
export function progressCap(checksDone, checksTotal, tasksDone, tasksTotal) {
  const c = checksTotal ? Math.min(1, checksDone / checksTotal) : 1, t = tasksTotal ? tasksDone / tasksTotal : 1;
  if (c >= 1 && t >= 1) return 100;
  return Math.min(97, 35 * c + 65 * t + (c >= 1 ? 6 : 0));
}

const CSS = id => `
#${id} .em-splash{position:fixed;z-index:30003;right:88px;bottom:calc(env(safe-area-inset-bottom) + 16px);width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:16px 16px 12px;
  border-radius:12px;background:var(--em-bg);color:var(--em-ink);border:1px solid var(--em-line-2);box-shadow:0 12px 32px rgba(0,0,0,.38);font:13px/1.5 var(--em-font)}
#${id} .em-splash[hidden]{display:none}
#${id} .em-splash header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
#${id} .em-splash h2{flex:1;margin:0;font-size:16px;font-weight:600}
#${id} .em-splash .cmp{width:32px;height:32px;flex:none;color:var(--em-accent)}
#${id} .em-splash .cmp g{transform-origin:16px 16px;animation:em-spin 14s linear infinite}
#${id} .em-splash .x{width:44px;height:44px;margin:-8px -8px -8px 0;border:0;background:none;color:var(--em-muted);font:20px/1 system-ui;cursor:pointer;border-radius:8px}
#${id} .em-splash .pb{height:6px;border-radius:999px;background:var(--em-surface-2);overflow:hidden}
#${id} .em-splash .pb i{display:block;height:100%;width:0;background:var(--em-accent);transition:width .6s ease-out}
#${id} .em-splash .pt{display:flex;justify-content:space-between;margin:4px 0 8px;color:var(--em-muted);font-size:12px;font-variant-numeric:tabular-nums}
#${id} .em-splash ul{list-style:none;margin:0 0 10px;padding:0}#${id} .em-splash ul.ck{max-height:32vh;overflow-y:auto}#${id} .em-splash ul.tk{padding-top:6px;border-top:1px solid var(--em-line)}
#${id} .em-splash li{display:grid;grid-template-columns:18px 1fr;gap:0 6px;padding:3px 0;opacity:0;transform:translateY(4px);transition:opacity .3s,transform .3s}
#${id} .em-splash li.on{opacity:1;transform:none}
#${id} .em-splash li b{font-weight:700}#${id} .em-splash li.ok b{color:var(--em-ok)}#${id} .em-splash li.warn b{color:var(--em-alert)}#${id} .em-splash li.skip b,#${id} .em-splash li.info b,#${id} .em-splash li.load b{color:var(--em-muted)}
#${id} .em-splash li small{grid-column:2;color:var(--em-muted);font-size:12px}
#${id} .em-splash .go{width:100%;min-height:44px;border:0;border-radius:8px;background:var(--em-accent);color:var(--em-on-accent);font:600 14px var(--em-font);cursor:pointer}
@media (max-width:640px){#${id} .em-splash{right:8px;left:8px;width:auto;bottom:auto;top:calc(env(safe-area-inset-top) + 56px)}}   /* 手机：放上面，不压住右下的地图按钮和输入框 */
@media (prefers-reduced-motion:reduce){#${id} .em-splash .cmp g{animation:none}#${id} .em-splash li{transition:none;opacity:1;transform:none}#${id} .em-splash .pb i{transition:none}}`;

/** 打开开场卡。o = { root, id, pdoc, ver, en, lean, checks: () => Promise<items[]>, tasks: [{ key, zh, en, run: () => Promise, skip? }], cap: 秒, onStart, onClose } */
export function openSplash(o) {
  const { root, pdoc } = o, L = (zh, en) => (o.en ? en : zh);
  root.querySelector('.em-splash')?.remove();
  if (!root.querySelector('style[data-splash]')) { const st = pdoc.createElement('style'); st.dataset.splash = '1'; st.textContent = CSS(o.id); root.appendChild(st); }
  const el = pdoc.createElement('div'); el.className = 'em-splash'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'emSplashT');
  el.innerHTML = `<header><svg class="cmp" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1.5"/><g><path d="M16 5l3 11-3 11-3-11z" fill="currentColor" opacity=".9"/><path d="M16 16l3 0-3 11-3-11z" fill="var(--em-bg)" opacity=".7"/></g></svg>`
    + `<h2 id="emSplashT"></h2><button type="button" class="x"></button></header><div class="pb" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>`
    + `<div class="pt"><span class="st"></span><span class="pc">0%</span></div><ul class="ck"></ul><ul class="tk"></ul><button type="button" class="go"></button><footer class="vf"></footer>`;
  el.querySelector('h2').textContent = L('伊甸地图', 'Eden Map') + (o.ver ? ' v' + o.ver : '');
  el.querySelector('.x').textContent = '×'; el.querySelector('.x').setAttribute('aria-label', L('关闭（后台继续加载）', 'Close (loading continues)'));
  el.querySelector('.go').textContent = L('开始', 'Start');
  // v0.9.6：页脚写版本、构建号、跟随方式（o.about = { version, code, channel, ref }）
  { const a = o.about || {}, ch = { tag: L('固定版本', 'pinned'), follow: L('跟随 ', 'following ') + (a.ref || ''), ref: L('预览 ', 'preview ') + (a.ref || ''), local: L('本地', 'local') }[a.channel] || '';
    el.querySelector('.vf').textContent = [(a.version || o.ver) ? 'v' + (a.version || o.ver) : '', a.code || '', ch].filter(Boolean).join(' · ');
    el.querySelector('.vf').style.cssText = 'margin-top:10px;font:11px/1.4 ui-monospace,Menlo,monospace;opacity:.7;text-align:center'; }
  root.appendChild(el); markSeen(o.store, o.ver);   // 显示过就算（不因为没点关闭而每次都弹）
  const ul = el.querySelector('ul.ck'), tk = el.querySelector('ul.tk'), bar = el.querySelector('.pb'), stEl = el.querySelector('.st'), pcEl = el.querySelector('.pc');
  const RM = (() => { try { return pdoc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  let checksDone = 0, checksTotal = 1, tasksDone = 0, shown = 0, closed = false, finished = false;
  const tasks = o.tasks.filter(t => !t.skip), t0 = Date.now();
  const li = (cls, mark, text, hint, list = ul) => { const x = pdoc.createElement('li'); x.className = cls; x.innerHTML = '<b></b><span></span>' + (hint ? '<small></small>' : '');
    x.querySelector('b').textContent = mark; x.querySelector('span').textContent = text; if (hint) x.querySelector('small').textContent = hint; list.appendChild(x);
    if (RM) x.classList.add('on'); else requestAnimationFrame(() => requestAnimationFrame(() => x.classList.add('on'))); return x; };
  const MARK = { ok: '✓', warn: '⚠', skip: '–', info: 'i' };
  stEl.textContent = L('自检中…', 'Checking…');
  // 自检：逐项打勾（每项 300 ms；减少动态效果时一次出齐）
  o.checks().then(async items => {
    checksTotal = items.length || 1;
    for (const it of items) { if (closed) break; const full = String(o.en ? it.en : it.zh), [main, ...rest] = full.split(/：|: /), w = it.status === 'warn' && rest.length;   // 警告：前半句是问题，后半句当一行修法提示
      li(it.status, MARK[it.status] || '·', w ? main : full, w ? rest.join('：') : ''); checksDone++; if (!RM) await new Promise(r => setTimeout(r, 300)); }
    checksDone = checksTotal; if (!finished) stEl.textContent = L('后台加载地图…', 'Loading the map in the background…');
  }).catch(() => { checksDone = checksTotal; });
  // 加载任务：一项一行，完成打勾
  for (const t of o.tasks) {
    const row = li(t.skip ? 'skip' : 'load', t.skip ? '–' : '…', L(t.zh, t.en) + (t.skip ? L('（省流：跳过）', ' (data saver: skipped)') : ''), '', tk);
    if (t.skip) continue;
    Promise.resolve().then(t.run).then(() => { row.className = 'ok on'; row.querySelector('b').textContent = '✓'; }, () => { row.className = 'warn on'; row.querySelector('b').textContent = '⚠'; })
      .finally(() => { tasksDone++; });
  }
  // 进度：朝上限慢慢爬（到不了 100，除非真的都完了）；超过 cap 秒收尾
  const tick = setInterval(() => {
    if (closed) return clearInterval(tick);
    const cap = progressCap(checksDone, checksTotal, tasksDone, tasks.length), over = (Date.now() - t0) / 1000 > (o.cap || 25);
    shown = cap >= 100 || over ? 100 : Math.min(cap, shown + Math.max(.15, (cap - shown) * .06));
    bar.querySelector('i').style.width = shown.toFixed(1) + '%'; bar.setAttribute('aria-valuenow', String(Math.round(shown))); pcEl.textContent = Math.floor(shown) + '%';
    if (shown >= 100 && !finished) { finished = true; clearInterval(tick);
      stEl.textContent = cap >= 100 ? L('全部就绪', 'All set') : L('后台继续加载', 'Still loading in the background'); }
  }, 200);
  const close = start => { if (closed) return; closed = true; clearInterval(tick); el.remove(); (start ? o.onStart : o.onClose)?.(); };
  el.querySelector('.x').onclick = () => close(false); el.querySelector('.go').onclick = () => close(true);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } });
  el.querySelector('.go').focus({ preventScroll: true });
  return { close, get progress() { return shown; }, el };
}
