// 状态行「卡的提示词里已有的字段就跳过」只该看**真正会送到模型**的文本（I-19）。纯函数，不碰酒馆全局；node 单测 tests/model_texts.test.mjs。
// 算数的（会进提示词）：角色描述 description、性格 personality、场景 scenario、系统提示 system_prompt、历史后指令 post_history_instructions、
//   已启用的世界书条目（content）、作者注 note、能读到的预设里已启用的提示词（content）。
// 不算数的（只在界面 / 脚本里，模型看不到）：正则脚本（regex_scripts）、酒馆助手脚本、状态栏等显示用的 HTML / JS、
//   开场白与示例对话（它们是聊天内容，不是常驻提示词）、本地图自己的世界书条目（extra.eden_id 标记）。
const s = v => (typeof v === 'string' && v ? [v] : []);
const entriesOf = list => (Array.isArray(list) ? list : []).filter(e => e && e.enabled !== false && e.disable !== true && !e.extra?.eden_id).flatMap(e => s(e.content));

/** card = 角色卡数据（data 层）；books = [[条目…], …]（卡内书 + 绑定的书）；note = 作者注文本；preset = 预设提示词 [{ content, enabled }] */
export function modelTexts({ card, books, note, preset } = {}) {
  const x = card && typeof card === 'object' ? card : {};
  return [
    ...s(x.description), ...s(x.personality), ...s(x.scenario), ...s(x.system_prompt), ...s(x.post_history_instructions),
    ...entriesOf(x.character_book?.entries), ...(Array.isArray(books) ? books : []).flatMap(entriesOf),
    ...s(note), ...(Array.isArray(preset) ? preset : []).filter(p => p && p.enabled !== false && typeof p.content === 'string').flatMap(p => s(p.content)),
  ];
}

/** 不注入的原因（设置里「当前不注入：…」）：off = 开关关；skipped = 每个字段卡的提示词里都有了；empty = 还没有可注入的状态 */
export function injectReason({ on, text, skip } = {}) {
  if (!on) return 'off';
  if (text) return '';
  const k = skip || {};
  return k.here && k.time && k.present ? 'skipped' : 'empty';
}
