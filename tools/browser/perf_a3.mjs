// A-3 每轮重算代价基准：81 楼（每楼约 3.5 KB，带事件 / 人物标签和 JSONPatch）、MVU 名册 + 卡脚本文本（阶段顺序找不到的失败路径）。
// 量「发送路径」：宿主同步触发 GENERATION_AFTER_COMMANDS 的耗时（酒馆在这之后才发请求）。
//   same：两轮之间什么都没变；changed：最后一楼原文刚被改（debounce 还没跑）。另记闲时补做的部分（__edenMapPerf.rest）。
// 用法：[CPU=4] EDEN_PORT=5391 node tools/browser/perf_a3.mjs [轮数=30]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
const N = +process.argv[2] || 30;
const pad = s => (s + ' 城市的霓虹在雨里晕开，街角的广告牌循环播放着新历二〇八八年的口号。').repeat(40).slice(0, 3400);
const JP = pl => `<UpdateVariable><JSONPatch>[{"op":"replace","path":"/世界/当前地点","value":"${pl}"}]</JSONPatch></UpdateVariable>`;
const msgs = Array.from({ length: 81 }, (_, i) => ({ message_id: i * 2 + 1, message: pad(`第${i}楼。`) + (i % 7 === 0 ? '<span style="display:none">⌖火灾｜下层·7号井｜3｜仓库起火｜执法局</span>' : '')
  + `<span style="display:none">⌖人物 雷恩 @ 下层·7号井</span><span style="display:none">⌖人物 艾琳${i % 5} @ 中层·霓虹街</span>` + JP(i % 2 ? '天城·中层·辉光大教堂' : '天城·中层·天城执法局总局') }));
const stat = { 主角: { 声望: 40, 着装: { 上衣: '外套' } }, 在场人物: { 米拉: { 身份: '向导' } }, 成员: { 甲: { 身份: '护卫' }, 乙: { 身份: '司机' } }, 目标: { 丙: { 身份: '目标', 阶段: '未知阶段A' }, 丁: { 身份: '目标', 阶段: '未知阶段B' } } };
const big = Array.from({ length: 300 }, (_, i) => `const x${i} = ['一', '二', '三']; // ${'注释'.repeat(40)}`).join('\n');
const charData = { data: { extensions: { tavern_helper: { scripts: Array.from({ length: 12 }, (_, i) => ({ name: 's' + i, content: big })) } } } };
B.quietWait(); const srv = await B.ensureServer();
const P = await B.newPage('desktop', { tier: 'save' }), p = P.page;
await openHost(P, { here: '天城·中层·辉光大教堂', msgs, stat, charData, chat: 'perf-a3' });
const CPU = +(process.env.CPU || 4); if (CPU > 1) { const c = await P.ctx.newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }   // 默认 4× 降速，近似中端手机
await B.wait(4000);   // 模块加载、自定义读入、第一次重算
const res = await p.evaluate(async N => {
  const S = window.__stub, med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], idle = () => new Promise(r => setTimeout(r, 400));
  const same = [], changed = []; window.__edenMapPerf = {};
  for (let i = 0; i < N; i++) { const t = performance.now(); window.__fire('g'); same.push(performance.now() - t); await new Promise(r => setTimeout(r, 20)); }
  for (let i = 0; i < N; i++) {
    const last = S.msgs[S.msgs.length - 1]; S.msgs = [...S.msgs.slice(0, -1), { ...last, message: last.message + ' 续' + i }];
    const t = performance.now(); window.__fire('g'); changed.push(performance.now() - t); await idle();
  }
  const P = window.__edenMapPerf, m2 = a => a?.length ? +med(a).toFixed(2) : null;   // 新版才有：lite = 发送路径那一段，rest = 空闲时补做的标签 / 行程
  return { same: +med(same).toFixed(2), sameMax: +Math.max(...same).toFixed(2), changed: +med(changed).toFixed(2), changedMax: +Math.max(...changed).toFixed(2), lite: m2(P.lite), rest: m2(P.rest), injected: (window.__injected || '').length };
}, N);
console.log(JSON.stringify(res));
await B.closeAll(); srv.stop();
