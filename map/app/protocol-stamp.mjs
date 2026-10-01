// 协议版本戳与消息出口（S5-2 自 util.mjs 拆出）。
// 协议 v2（core/protocol.mjs，arch-v2 §3）：发出的消息都盖 v；收到的消息经 PR.accept 校验（模块未到时照旧处理，宿主在 ready 之后才推数据）
export const PROTO = 2; export let protocol = null;
export const post = msg => { if (window.top !== window) parent.postMessage({ ...msg, v: PROTO }, '*'); };
// 庄园 / 3D 子页与查看器同源：往下发消息用具体 origin（A-6）；file:// 等 opaque origin 只能退回 '*'
export const SUB_ORIGIN = (() => { const o = self.origin || location.origin; return o && o !== 'null' ? o : '*'; })();   // srcdoc 里 location.origin 是 'null'，self.origin 才是继承来的真实 origin
export function setProtocol(v) { return (protocol = v); }
