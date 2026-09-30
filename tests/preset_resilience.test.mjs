// 任务二：预设韧性（Anti-Preset Interceptor）——用第三方高级预设的真实输出形状灌进接收管线，断言三件事：
//   ① 多重 <thinking> / <!-- Prism --> / <meow_FM> / 截断 HTML 都拦得住，解析文本里不残留 CoT 回声；
//   ② 被各种容器裹住的 {{eden_fly: …}} 宏与 <UpdateVariable> JSON 块仍然 100% 提取得到；
//   ③ 正文末尾裸露的一整段 HTML 源码（<!DOCTYPE html> / statusbar-container）静默熔断，且幂等。
// mock 文本按《双星纪·RUAN V-LINK》一类预设的 findRegex / 替换产物形状手工构造（不引入第三方预设文件本体）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../map/tavern/msgtext.mjs';
import { DEFAULT_STRIP_TAGS, sanitize, stripBlocks, stripMarks, stripLeaks, hasLeak } from '../map/tavern/sanitize.mjs';
import { ContextPipeline } from '../map/tavern/context.mjs';
import { parseMarks } from '../map/tavern/events.mjs';
import { patchPlace } from '../map/tavern/trips.mjs';
import { flyTarget, MACROS } from '../map/tavern/th.mjs';

const PRISM = '<!-- Prism 3/5 · reasoning cache -->';
const UV_JSON = '\n{"op":"replace","path":"/世界/当前地点","value":"中层·霓虹街"}\n';
const RAW_HTML = '<!DOCTYPE html>\n<html lang="zh-CN"><head><style>.sb{color:#c33}</style></head>'
  + '<body><div class="statusbar-container"><div>日期 3/5</div></div></body></html>';
/** 一份「预设 + 模型都出问题了」的楼层原文：双重思考块、Prism 标记、摘要块、对话块、变量块、宏、裸源码 */
const MOCK = [
  PRISM,
  '<thinking>草稿：他决定 ⌖火灾｜下层·7号井黑市｜2｜思考链假事件</thinking>',
  '<thinking>二次思考：把上面那条又复述了一遍 ⌖火灾｜下层·7号井黑市｜2｜又一次</thinking>',
  '<!-- 1·思考结束 -->',
  '正文：他把黄铜钥匙拿到手，随后走进大厅。',
  '<meow_FM>time: 3/5 21:10 ☆ 夜 scene: 大厅 chars: 她 plot: 拿到钥匙 seeds: 后续 seri: 2</meow_FM>',
  '<now_plot>「钥匙给我。」她伸出手。</now_plot>',
  '<UpdateVariable>' + UV_JSON + '</UpdateVariable>',
  '{{eden_fly: 玫瑰园}}',
  RAW_HTML,
].join('\n');

test('parseText：多重思考块与 Prism 标记剥干净，正文留下；CoT 里复述的 ⌖ 标签一株都不种进事态', () => {
  const text = parseText(MOCK);
  assert.equal(parseMarks(text).length, 0, '思考链里复述的两种事件写法都零匹配');
  assert.doesNotMatch(text, /Prism|思考结束/, '闭合的 CoT 分隔标记一并剥掉');
  assert.doesNotMatch(text, /思考链假事件|又一次/, '双重思考块两块都要走（不是只剥第一块）');
  assert.match(text, /正文：他把黄铜钥匙拿到手/, '正文一个字节不动');
  assert.match(text, /「钥匙给我。」/, '对话块是叙事，保留');
});

test('parseText：未闭合的思考块（流式半截）与截断 HTML 注释都当块内', () => {
  const half = parseText('<thinking>半截草稿 ⌖火灾｜下层·7号井黑市｜2｜假的');
  assert.equal(parseMarks(half).length, 0);
  const cut = parseText('正文一句。\n<!-- Prism 溢出的标记');
  assert.match(cut, /正文一句。/, '标记是 ASCII：从标记起到末尾切掉');
  assert.doesNotMatch(cut, /Prism/);
  const keep = parseText('正文一句。\n<!-- 他抬头看去，天边一道光');
  assert.match(keep, /他抬头看去/, '标记后面是汉字（正文）就不敢乱切，原样留着');
});

test('sanitize：预设展示块剥掉、变量块 JSON 一字不动（行程 JSONPatch 还要用）', () => {
  const raw = sanitize(MOCK, DEFAULT_STRIP_TAGS);
  assert.doesNotMatch(raw, /meow_FM/, '摘要块是展示容器，剥掉');
  assert.match(raw, /<now_plot>/, '对话块**不能**剥：块内是叙事本体（剥掉等于删正文）');
  assert.match(raw, /<UpdateVariable>/);
  assert.equal(patchPlace(raw, '/世界/当前地点'), '中层·霓虹街', '被 Prism 标记与思考块裹着，JSONPatch 仍然精准锚定');
});

test('sanitize：htm1fenge 明确不剥（⌖ 事件标签就写在里面）', () => {
  const raw = sanitize('<htm1fenge><span style="display:none">⌖火灾｜下层·7号井黑市｜2｜真事件</span></htm1fenge>', DEFAULT_STRIP_TAGS);
  assert.match(raw, /⌖火灾/, '把 htm1fenge 收进剥离表就会把地图自己的标签一起吃掉');
});

test('stripBlocks / resolveTags：中文标签名也认，非法标签名拒绝', () => {
  assert.doesNotMatch(stripBlocks('前<状态面板>面板</状态面板>后', DEFAULT_STRIP_TAGS), /状态面板/);
  assert.equal(stripBlocks('前<b>粗</b>后', ['b']), '前 后');
  assert.equal(stripBlocks('前<b>粗</b>后', ['b; alert(1)', '']), '前<b>粗</b>后', '非法标签名不进正则（防注入）');
  assert.equal(stripMarks('a<!-- x -->b'), 'a b');
  assert.equal(stripMarks('a<!-- x-->b<!-- y-->c'), 'a b c');
});

test('flyTarget：已展开的隐藏标记、冒号宏、空格宏、被未闭合注释裹着的宏都能锚住', () => {
  assert.equal(flyTarget('<span style="display:none" data-eden-fly="主卧"></span>子元素'), '主卧');
  assert.equal(flyTarget(MOCK), '玫瑰园', '{{eden_fly: 地点}} 是预设 / 用户实际写法');
  assert.equal(flyTarget('{{eden_fly 玫瑰园}}'), '玫瑰园');
  assert.equal(flyTarget('{{eden_fly：玫瑰园}}'), '玫瑰园');
  assert.equal(flyTarget('{{eden_fly}}'), '', '没有地名：安静放过，绝不猜');
  assert.equal(flyTarget('{{eden_fly: <b>玫瑰园</b>}}'), '玫瑰园', '尖括号剥掉');
  assert.equal(flyTarget('完全无关的一楼'), '');
  const flyRe = MACROS.find(([k]) => k === 'eden_fly')[1];
  assert.equal([...MOCK.matchAll(flyRe)].length, 1, '宏登记用的正则与提取口径一致');
});

test('泄露熔断：正文末尾裸露的整段源码静默切掉，前后正文与 Markdown 不动；幂等', () => {
  const t = '正文一句。\n\n```js\nconst a = 1;\n```\n\n' + RAW_HTML + '\n\n收尾。';
  const out = stripLeaks(t);
  assert.equal(hasLeak(t), true);
  assert.doesNotMatch(out, /DOCTYPE|statusbar-container|<style/);
  assert.match(out, /正文一句。/); assert.match(out, /const a = 1;/); assert.match(out, /收尾。/);
  assert.equal(stripLeaks(out), out, '幂等：流式反复调用不会越擦越短');
  assert.equal(hasLeak(out), false);
});

test('三层管线端到端（ContextPipeline）：text 无 CoT 回声（且指纹稳定），raw 保留变量块', () => {
  const p = new ContextPipeline({ stripTags: DEFAULT_STRIP_TAGS });
  const msgs = p.readMsgs([{ message_id: 7, message: MOCK }], 7);
  assert.equal(msgs.length, 1);
  const m = msgs[0];
  assert.equal(parseMarks(m.text).length, 0);
  assert.match(m.raw, /<UpdateVariable>/);
  assert.equal(patchPlace(m.raw, '/世界/当前地点'), '中层·霓虹街');
  assert.equal(m.text, parseText(m.raw), 'text 恒等于 parseText(raw)（快照夹具口径）');
  const again = p.readMsgs([{ message_id: 7, message: MOCK }], 7);
  assert.equal(again[0].h, m.h, '同一楼同原文：指纹稳定（缓存命中）');
});
