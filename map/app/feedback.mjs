// 「反馈」按钮：装好日志环形缓冲，点击时拼一份纯文本报告（不含聊天内容，只含地图自身状态）预览 → 复制 / 下载 .txt。
// 挂点：设置「更新与版本」页 + 自检卡片各放一个按钮（见 map/app/settings.mjs、map/tavern/selfcheck.mjs）。
import { buildReportText, buildIssueLink } from './feedback-report.mjs';
import * as logbuf from '../core/logbuf.mjs';
import { $, esc } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { copyText, saveTextFile, openExternal } from './transfer.mjs';
import { about, selfCheck } from './settings.mjs';
import { buildInfo } from './topbar.mjs';
import { mapRegistry, currentMapId } from './state.mjs';
import { PACK } from './current-pack.mjs';

logbuf.install();

function gatherInfo() {
  const a = about || {}, b = buildInfo || {};
  let th = null, st = null;
  // 宿主版本：从自检的 host 条目解析（报告里宿主版本不再空着）
  { const h = (selfCheck?.items || []).find(x => x && x.id === 'host');
    const m = h && `${h.zh || ''} ${h.en || ''}`.match(/(?:酒馆助手|TavernHelper)\s+([\d][\w.+-]*)\s*·\s*(?:酒馆|SillyTavern)\s+([\d][\w.+-]*)/);
    if (m) { th = m[1]; st = m[2]; } }
  return {
    title: uiTextOr('app.report', '=== 空间地图反馈报告 / Spatial Map feedback report ==='),
    time: new Date().toISOString(),
    version: a.version || b.version || '',
    build: a.build != null ? a.build : (b.build || ''),
    channel: a.channel || (window.top === window ? 'local' : ''),
    selfCheckItems: selfCheck?.items || [],
    mapId: currentMapId || '',
    layer: (mapRegistry?.maps?.[currentMapId]?.group) || '',
    thVersion: th,
    stVersion: st,
    viewport: `${innerWidth}x${innerHeight}`,
    logLines: logbuf.lines(),
    logSessions: logbuf.sessions(),
  };
}
export function buildReport() { return buildReportText(gatherInfo()); }
function reportName() { return 'eden-map-feedback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt'; }
export function openFeedback() {
  const info = gatherInfo();
  const baseText = buildReportText(info);
  let dlg = document.getElementById('fbDlg');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'fbDlg'; dlg.className = 'fbdlg';
    dlg.innerHTML = `<b>${esc(uiTextOr('feedback.title', '反馈报告预览'))}</b><p><small>${esc(uiTextOr('feedback.note', '只含地图版本 / 自检 / 位置 / 日志等状态，不含聊天内容'))}</small></p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:12px">
        <label>${esc(uiTextOr('feedback.sess', '日志来源'))}&nbsp;<select id="fbSess" class="btn" style="font:inherit"></select></label>
      </div>
      <textarea id="fbText" readonly rows="14" style="width:100%;font-family:var(--font-mono, monospace)"></textarea>
      <div class="row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn" id="fbGh" title="${esc(uiTextOr('feedback.gh_title', '打开 GitHub 并自动填好标题与正文'))}">${esc(uiTextOr('feedback.gh', '到 GitHub 建 issue'))}</button>
        <input id="fbLink" readonly class="btn" style="flex:1;min-width:0;font-size:12px" hidden>
        <button type="button" class="btn" id="fbDownload">${esc(uiTextOr('feedback.download', '下载 .txt'))}</button>
        <button type="button" class="btn" id="fbCopy">${esc(uiTextOr('feedback.copy', '复制'))}</button>
        <button type="button" class="btn" id="fbClose">${esc(uiTextOr('feedback.close', '关闭'))}</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#fbClose').onclick = () => dlg.close();
    dlg.querySelector('#fbDownload').onclick = () => {
      const b = dlg.querySelector('#fbDownload'), ta = dlg.querySelector('#fbText');
      const flash = zh => { const old = b.textContent; b.textContent = uiTextOr('feedback.copied', zh); setTimeout(() => { b.textContent = old; }, 1500); };
      saveTextFile(reportName(), ta.value).then(r => {
        if (r === 'copied') flash('已复制');                                   // TT：下载会被忽略，已改复制进剪贴板
        else if (r === 'manual') { ta.focus(); ta.select(); }                  // 对话框在最上层：选这里已有的文本框，不再另挂面板
      });
    };
    dlg.querySelector('#fbCopy').onclick = () => {
      const t = dlg.querySelector('#fbText').value, b = dlg.querySelector('#fbCopy');
      const done = () => { b.textContent = uiTextOr('feedback.copied', '已复制'); setTimeout(() => b.textContent = uiTextOr('feedback.copy', '复制'), 1500); };
      copyText(t).then(ok => {
        if (ok) { done(); return; }
        const ta = dlg.querySelector('#fbText'); ta.focus(); ta.select();       // 三级复制全挂：全选报告文本框让用户手动复制
        b.textContent = uiTextOr('feedback.select', '已选中，请手动复制'); setTimeout(() => { b.textContent = uiTextOr('feedback.copy', '复制'); }, 2000);
      });
    };
  }
  // 日志来源切换：本次会话（完整报告视图）或某次历史会话（日志小节换成那一份）
  const sess = dlg.querySelector('#fbSess'), ta = dlg.querySelector('#fbText');
  const all = [{ lines: info.logLines }].concat(info.logSessions || []).filter(s => s.lines && s.lines.length);
  const opts = all.map((s, i) => {
    const op = document.createElement('option'); op.value = String(i);
    const d = s.lines[0] && s.lines[0].t ? new Date(s.lines[0].t) : null;
    const label = i === 0 ? uiTextOr('feedback.cur', '本次打开') : `${uiTextOr('feedback.prev', '上次打开')} #${all.length - i}`;
    op.textContent = `${label} · ${s.lines.length}行${d ? ` · ${d.getMonth() + 1}/${d.getDate()}` : ''}`;
    return op;
  });
  if (!opts.length) { const op = document.createElement('option'); op.textContent = uiTextOr('feedback.nolog', '（无日志）'); opts.push(op); }
  sess.replaceChildren(...opts);
  const show = () => { const i = +sess.value || 0; ta.value = i === 0 ? baseText : buildReportText({ ...info, logLines: all[i].lines, logSessions: [] }); };
  sess.onchange = show; show();
  // GitHub 预填 issue：TT 走系统浏览器接口，其余 window.open；两条都没成时把链接留在只读输入框里供手动复制
  dlg.querySelector('#fbGh').onclick = () => {
    const warns = (info.selfCheckItems || []).filter(x => x && x.status === 'warn').length;
    const url = buildIssueLink({ title: `[eden-map] v${info.version || '?'} build ${info.build || '?'}${warns ? ` · ${warns}⚠` : ''}`, body: ta.value, repo: PACK?.cdn?.repo });   // 反馈提到哪个仓库：清单 cdn.repo（没有就用引擎自己的）
    const link = dlg.querySelector('#fbLink'); link.hidden = false; link.value = url;
    openExternal(url).then(ok => { if (!ok) { link.focus(); link.select(); } });
  };
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
export function mountFeedbackButton(container) {
  if (!container || container.querySelector('.fb-open')) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn fb-open';
  btn.textContent = uiTextOr('feedback.btn', '反馈');
  btn.onclick = () => openFeedback();
  container.appendChild(btn);
}
