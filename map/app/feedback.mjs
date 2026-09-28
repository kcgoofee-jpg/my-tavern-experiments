// 「反馈」按钮：装好日志环形缓冲，点击时拼一份纯文本报告（不含聊天内容，只含地图自身状态）预览 → 复制 / 下载 .txt。
// 挂点：设置「更新与版本」页 + 自检卡片各放一个按钮（见 map/app/settings.mjs、map/tavern/selfcheck.mjs）。
import { buildReportText } from './feedback-report.mjs';
import * as logbuf from '../core/logbuf.mjs';
import { $, esc, tx } from './util.mjs';
import { about, selfCheck } from './settings.mjs';
import { buildInfo } from './topbar.mjs';
import { REG, cur } from './state.mjs';

logbuf.install();

function gatherInfo() {
  const a = about || {}, b = buildInfo || {};
  let th = null, st = null;
  try { const hv = window.__edenHostVersions; if (hv) { th = hv.th; st = hv.st; } } catch (e) {}
  let mvu = null; try { mvu = window.__edenMvuSnapshotStatus || null; } catch (e) {}
  return {
    time: new Date().toISOString(),
    version: a.version || b.version || '',
    build: a.build != null ? a.build : (b.build || ''),
    channel: a.channel || (window.top === window ? 'local' : ''),
    selfCheckItems: selfCheck?.items || [],
    mapId: cur || '',
    layer: (REG?.maps?.[cur]?.group) || '',
    location: (typeof window.__edenHereText === 'string' ? window.__edenHereText : '') || '',
    mvuSnapshotStatus: mvu,
    thVersion: th,
    stVersion: st,
    viewport: `${innerWidth}x${innerHeight}`,
    logLines: logbuf.lines(),
  };
}
export function buildReport() { return buildReportText(gatherInfo()); }
function download(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const el = document.createElement('a');
  el.href = url; el.download = 'eden-map-feedback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
  document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function openFeedback() {
  const text = buildReport();
  let dlg = document.getElementById('fbDlg');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'fbDlg'; dlg.className = 'fbdlg';
    dlg.innerHTML = `<b>${esc(tx('feedback.title', '反馈报告预览'))}</b><p><small>${esc(tx('feedback.note', '只含地图版本 / 自检 / 位置 / 日志等状态，不含聊天内容'))}</small></p>
      <textarea id="fbText" readonly rows="14" style="width:100%;font-family:var(--font-mono, monospace)"></textarea>
      <div class="row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn" id="fbDownload">${esc(tx('feedback.download', '下载 .txt'))}</button>
        <button type="button" class="btn" id="fbCopy">${esc(tx('feedback.copy', '复制'))}</button>
        <button type="button" class="btn" id="fbClose">${esc(tx('feedback.close', '关闭'))}</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#fbClose').onclick = () => dlg.close();
    dlg.querySelector('#fbDownload').onclick = () => download(dlg.querySelector('#fbText').value);
    dlg.querySelector('#fbCopy').onclick = () => {
      const t = dlg.querySelector('#fbText').value, b = dlg.querySelector('#fbCopy');
      const done = () => { b.textContent = tx('feedback.copied', '已复制'); setTimeout(() => b.textContent = tx('feedback.copy', '复制'), 1500); };
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done).catch(() => download(t));
    };
  }
  dlg.querySelector('#fbText').value = text;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
export function mountFeedbackButton(container) {
  if (!container || container.querySelector('.fb-open')) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn fb-open';
  btn.textContent = tx('feedback.btn', '反馈');
  btn.onclick = () => openFeedback();
  container.appendChild(btn);
}
