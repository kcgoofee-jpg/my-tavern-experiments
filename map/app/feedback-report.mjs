// 「反馈」报告文本组装（纯函数，无 DOM，可离线单测：tests/feedback_report.test.mjs）。
// 隐私边界：只读下面列出的这几个字段——版本/自检/地图状态/TH·ST 版本/日志环形缓冲/视口——绝不读取、也不应该被传入聊天文本或消息内容；
// 调用方（map/app/feedback.mjs）负责只传地图自身状态，这里再兜底一层：白名单字段之外一律忽略，不做「顺手转发」。
export function buildReportText(info = {}) {
  const L = [];
  const push = (label, v) => { if (v != null && v !== '') L.push(`${label}: ${v}`); };
  L.push('=== 伊甸地图反馈报告 / Eden Map feedback report ===');
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
  return L.join('\n');
}
// 白名单以外的字段（尤其聊天文本/消息内容）不会出现在报告里；供单测断言用。
export const REPORT_ALLOWED_KEYS = ['time', 'version', 'build', 'channel', 'selfCheckItems', 'mapId', 'layer', 'location', 'mvuSnapshotStatus', 'thVersion', 'stVersion', 'viewport', 'logLines'];
