// 控制台环形缓冲（反馈报告用）：包一层 console.log/warn/error/info，只留最近 N 行，不改变原有输出行为。
// 纯逻辑可离线单测（不碰 DOM）：push()/lines()；install() 才动 window.console，浏览器环境外跳过。
const CAP = 50;
let buf = [];
export function push(level, args) {
  const text = args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); } }).join(' ');
  buf.push({ t: Date.now(), level, text });
  if (buf.length > CAP) buf.shift();
}
export function lines() { return buf.slice(); }
export function clear() { buf = []; }
let installed = false;
export function install(target = (typeof console !== 'undefined' ? console : null)) {
  if (installed || !target) return;
  installed = true;
  for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
    const orig = target[level]?.bind(target); if (!orig) continue;
    target[level] = (...args) => { try { push(level, args); } catch (e) {} orig(...args); };
  }
}
