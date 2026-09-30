// 「反馈」报告文本组装（纯函数，无 DOM，可离线单测：tests/feedback_report.test.mjs）。
// 隐私边界：只读下面列出的这几个字段——版本/自检/地图状态/TH·ST 版本/日志环形缓冲/视口——绝不读取、也不应该被传入聊天文本或消息内容；
// 调用方（map/app/feedback.mjs）负责只传地图自身状态，这里再兜底一层：白名单字段之外一律忽略，不做「顺手转发」。
export function buildReportText(info = {}) {
  const L = [];
  const push = (label, v) => { if (v != null && v !== '') L.push(`${label}: ${v}`); };
  L.push(typeof info.title === 'string' && info.title ? info.title : '=== 空间地图反馈报告 / Spatial Map feedback report ===');   // 标题行由调用方从词典 app.report 给（包可换成自己的名字）
  push('时间 / time', info.time || new Date().toISOString());
  push('版本 / version', info.version);
  push('构建 / build', info.build);
  push('通道 / channel', info.channel);
  L.push('');
  L.push('-- 自检 / self-check --');
  const items = Array.isArray(info.selfCheckItems) ? info.selfCheckItems : [];
  if (!items.length) L.push('(none)');
  for (const it of items) { if (!it) continue; const mark = { ok: '✓', warn: '⚠', skip: '-', info: '↑' }[it.status] || it.status || '?'; L.push(`${mark} ${it.zh || it.en || it.id || ''}`); }
  L.push('');
  L.push('-- 地图状态 / map state --');
  push('当前地图 / map', info.mapId);
  push('层 / layer', info.layer);
  push('位置 / location', info.location);
  push('MVU 快照 / MVU snapshot', info.mvuSnapshotStatus);
  L.push('');
  L.push('-- 宿主版本 / host versions --');
  push('酒馆助手 TH / Tavern Helper', info.thVersion);
  push('酒馆 ST / SillyTavern', info.stVersion);
  L.push('');
  push('视口 / viewport', info.viewport);
  L.push('');
  L.push('-- 最近日志 / recent console log (ring buffer) --');
  const logs = Array.isArray(info.logLines) ? info.logLines : [];
  if (!logs.length) L.push('(none)');
  for (const l of logs) { if (!l) continue; const t = l.t ? new Date(l.t).toISOString().slice(11, 19) : ''; L.push(`[${t}] ${(l.level || 'log').padEnd(5)} ${l.text || ''}`); }
  // 历史会话（logbuf.boot() 归档的「上一次打开」；反馈弹层选哪份就传哪份，也可以带全部）
  const pastSess = Array.isArray(info.logSessions) ? info.logSessions : [];
  pastSess.forEach((s, i) => {
    const ls = (Array.isArray(s && s.lines) ? s.lines : []).filter(Boolean);
    if (!ls.length) return;
    const d0 = new Date(ls[0].t), d1 = new Date(ls[ls.length - 1].t);
    const hm = d => (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    L.push('');
    L.push(`-- 日志 · 上一次打开 #${pastSess.length - i}（${hm(d0)} – ${hm(d1)}，共 ${s.n || ls.length} 行）--`);
    for (const l of ls) { const t = l.t ? new Date(l.t).toISOString().slice(11, 19) : ''; L.push(`[${t}] ${(l.level || 'log').padEnd(5)} ${l.text || ''}`); }
  });
  return L.join('\n');
}

// GitHub 预填 issue 链接（反馈弹层「到 GitHub 建 issue」用）；GitHub 对 URL 有长度上限（~8k），
// 正文超 GH_BODY_CAP 截断并注明，保证链接能打开。纯函数可单测。
const GH_BODY_CAP = 6000;
export function buildIssueLink(opts) {
  const o = opts || {};
  const repo = o.repo || 'kcgoofee-jpg/my-tavern-experiments';
  const title = o.title || 'eden-map feedback';
  const raw = o.body || '';
  const b = raw.length > GH_BODY_CAP ? raw.slice(0, GH_BODY_CAP - 26) + '\n\n(超长已截断 / truncated)' : raw;
  return 'https://github.com/' + repo + '/issues/new?' + new URLSearchParams({ title: title, body: b }).toString();
}
// 白名单以外的字段（尤其聊天文本/消息内容）不会出现在报告里；供单测断言用。
export const REPORT_ALLOWED_KEYS = ['title', 'time', 'version', 'build', 'channel', 'selfCheckItems', 'mapId', 'layer', 'location', 'mvuSnapshotStatus', 'thVersion', 'stVersion', 'viewport', 'logLines', 'logSessions'];
