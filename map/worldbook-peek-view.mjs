// 世界书档案胶囊（W8，docs/plans/llm-campaign.md Part B 任务四「地图 → 世界书」半边）：
// 地点卡多一枚「世界书档案」胶囊——点一下把当前地点名发给宿主（eden-map:th {op:'wb-peek'}），
// 宿主在附加书里按触发词 / 名字匹配条目、回 eden-map:wb-peek（条目名 + 摘要），这里渲染进卡片抽屉。
// 只读：不写任何条目、不发请求；宿主没这本书 / 没这接口时点了就显示「附加书不可用」。摘要只取前 300 字。
// 插件模式与 scrapbook.mjs 一致（app/plugins.mjs 的 P.TCWb；没加载时 markers.mjs 调用处带守卫）。
import { esc, post } from './app/util.mjs';
import { busOn } from './app/bus.mjs';
import { register } from './app/plugins.mjs';

const TRIM = 300;
const T = (k, zh) => { try { return window.I18N.tx(k, zh); } catch (e) { return zh; } };   // 共享 i18n 服务（viewer.html window.I18N）
const TCWb = (() => {
  let openPlace = null, box = null;

  function render(items, name) {
    if (!box || openPlace !== name) return;   // 用户已经换了卡
    if (!Array.isArray(items) || !items.length) { box.querySelector('.wb-out').textContent = T('wb.none', '附加书里没有这个地点的条目。'); return; }
    box.querySelector('.wb-out').innerHTML = items.map(it =>
      `<div class="wb-item"><b>${esc(it.name)}</b><p>${esc(String(it.summary || '').slice(0, TRIM))}</p></div>`).join('');
  }

  function decorate(el, title) {
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const ex = c.querySelector('.extra'); if (!ex) return;
    const place = String(title || el?.dataset?.name || '').trim();
    if (!place) return;
    ex.querySelectorAll('.cu-wb').forEach(n => n.remove());
    box = document.createElement('div'); box.className = 'cu-wb';
    box.innerHTML = `<button type="button" class="wb-go">📚 ${esc(T('wb.capsule', '世界书档案'))}</button><div class="wb-out" hidden></div>`;
    box.querySelector('.wb-go').addEventListener('click', () => {
      const out = box.querySelector('.wb-out');
      out.hidden = false; out.textContent = T('wb.peeking', '查看中…');
      openPlace = place;
      post({ type: 'eden-map:th', op: 'wb-peek', name: place });
    });
    ex.appendChild(box);
    openPlace = place;
  }

  busOn({ key: 'wbpeek.hostMsg', type: 'message', fn: e => {
    try { if (window.__fromHost?.(e) && e.data?.type === 'eden-map:wb-peek') render(e.data.items || [], e.data.name || ''); } catch (x) {}
  } });

  return { decorate, show: render };
})();
register('TCWb', TCWb);
