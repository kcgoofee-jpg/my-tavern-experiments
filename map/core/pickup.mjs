// 客观动作强制反思探测（任务一第二步）：正文里**写明的物理获取动作** → 单项账目事实。
// 为什么需要它：主模型在 CoT 里判断「卡内没有背包字段 / 这一拍没有变量槽位」时会直接在 UpdateVariable 里
// 漏掉道具——拾取动作发生了，账上却什么都没有，道具凭空蒸发。这里把动作本身当事实来源：
// 动词 + 具体物品名词同时成立 → 产出一条 loot 事实，交给漏项审计器（core/ledger.mjs audit）补**单项**缺口。
// 纪律（与账本同一口径）：
//   ① 宁可漏不可误：只有「获取动词」和「具体物品名词」同时成立才产出；抽象名词（情绪 / 状态 / 关系）不要；
//   ② 名词必须站得住：被引号包住、前面带量词、或命中调用方给的已知物品表（世界藏物表 / 现有仓库），三者至少一项；
//   ③ 纯核心：不碰 DOM / 宿主全局 / 存储 / 网络，数据进、事实出；node 单测 tests/auto_stash.test.mjs。
// 本模块不写任何东西——落盘一律由宿主经 ledger / varssync 的结算闸门做（时序纪律见 tavern/settlement-guard.mjs）。

export const MAX_FACTS = 6;         // 一条正文最多认几件（超出丢弃：宁可少记，也不把一段描写吸成清单）
export const MAX_NAME = 20;         // 物品名的长度上限（更长多半是句子而不是名词）
const NEAR = 24;                    // 已知物品名：动词要出现在它前面这么多字符内才算「这一下拿的是它」

/**
 * 获取动词：只收「把东西弄到手」这一件事。不含制造 / 消耗 / 使用（那三类别的事件由各自域管）。
 * 中文按词长降序排列（长的先匹配，免得「拿起」被「拿」抢走）；英文只收短语形态，避免 take / get 这类泛动词误伤。
 */
export const VERBS = Object.freeze([
  '收入囊中', '据为己有', '揣进口袋', '揣进怀里', '捡了起来', '拿了起来',
  '拿到', '拿起', '拾起', '捡起', '捡到', '拾到', '抓起', '取走', '拿走', '带走', '收下', '收好', '收起',
  '拿出', '取出', '掏出', '摸出', '翻出', '抽出', '摘下', '取下', '夺得', '缴获', '掳走', '顺走', '摸走', '抢到', '收了',
  '揣进', '揣入', '塞进', '装进', '放进', '放入',
  'picks up', 'picked up', 'grabs', 'grabbed', 'pockets', 'pocketed',
]);
/** 动词后面允许缀的体标记（拿了 / 拿起了 / 拿住…） */
const ASPECT = ['了', '着', '过', '到', '起', '住', '下', '进', '入', '走', '来', '去', '好', '上', '出'];
/** 量词：带量词 = 一件具体的东西（「一个银怀表」）；不带量词时名字要更短更干净 */
const QUANTS = ['个', '只', '把', '枚', '张', '本', '瓶', '袋', '盒', '块', '件', '支', '根', '串', '条', '片', '颗', '粒', '罐', '箱', '封', '台', '部', '柄', '具', '副', '身', '套', '管', '筒', '杯', '盘', '束', '堆', '份', '摞', '沓', '捆', '截', '段', '滴', '抹', '缕'];
const QUANT_RE = `(?:[一二三四五六七八九十两几数半整满这那此]?)(?:${QUANTS.join('|')})`;
/** 引号对（成对出现才算「明示的物品名」） */
const QUOTE_PAIRS = [['「', '」'], ['『', '』'], ['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"], ['【', '】'], ['《', '》'], ['[', ']']];
/** 名词里不允许出现的字符：标点 / 空白 / 括号 / 引号 / 标签尖括号（出现即截断） */
const CUT_CHARS = '\\s，。！？；：、,.!?;:()（）\\[\\]【】<>《》「」『』“”‘’"\'';
/**
 * 抽象名词黑名单：这些「拿到」的不是东西（拿到机会 / 拿到主动权）——地图账本不收概念。
 * 只收一眼能认出来的非实物词，不追求穷尽（漏了只是不记，不记比错记好）。
 */
export const NOT_ITEMS = Object.freeze([
  '注意', '机会', '主动权', '主动', '优势', '劣势', '时间', '经验', '教训', '印象', '好感', '信任', '控制',
  '力量', '勇气', '信心', '耐心', '自由', '生命', '呼吸', '视线', '目光', '话语', '话头', '话语权', '感觉',
  '灵感', '线索', '情报', '消息', '许可', '资格', '名额', '任务', '委托', '命令', '承诺', '答案', '结论',
]);
const NOT_SET = new Set(NOT_ITEMS);

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** FNV-1a → 36 进制（纯 ASCII id；与 core/stash.rowId 同一手法，但前缀 x 与藏物表 s 分开） */
const fnv = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const clip = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');

/** 物品 id：由名字混出来——同名同物，正文重复提到不会记成两件 */
export const itemId = name => 'x' + fnv(String(name ?? '').trim());
/** 这个名词像不像一件**东西**（黑名单 / 长度 / 空） */
export const isItemName = n => { const s = clip(n, MAX_NAME); return !!s && !NOT_SET.has(s) && s.length >= 1 && s.length <= MAX_NAME; };
/**
 * 泛指 / 方位 / 代词：这些位置词不是东西（「拿到手」「拿到这里」「拿到的」）——只有不带量词的短名字才查它，
 * 因为带量词时（「一枚手里的钥匙」这种怪句子）本来就少见，宁可放过。
 */
const GENERIC = new Set(['手', '手里', '手中', '手上', '身上', '身边', '眼前', '这里', '那里', '之后', '以前', '之前',
  '上面', '下面', '里面', '外面', '背后', '怀中', '怀里', '一半', '东西', '那个', '这个', '什么', '一切']);
const PRONOUN = /^[这那此其之我你他她它们谁上下里外前后内]/;
/**
 * 分句断点：抓取到的东西后面往往接着下一句（「拿到钥匙然后打开门」）——物品名到断点为止。
 * 只收长词与一眼能认的连词 / 副词，避免把「钥匙扣」这种复合词从中间切断。
 */
const CLAUSE_BREAK = ['然后', '接着', '随后', '于是', '之后', '并且', '而且', '可是', '但是', '不过',
  '因此', '所以', '因为', '如果', '只要', '立刻', '马上', '转身', '回头', '顺手', '放进', '塞进', '揣进'];
const BREAK_RE = new RegExp(`(?:${CLAUSE_BREAK.map(esc).join('|')})`);
/** 单字连接 / 副词：出现在第 2 个字之后就当分句断点（「钥匙就掉了」→「钥匙」） */
const BREAK_CH = /[就便才又再并而但却且]/;
/**
 * 第二个动作 / 体标记：出现在第 2 个字之后即断（「银怀表看了看」→「银怀表」）。
 * 只收几乎不会出现在名词内部的字：打 / 拉 / 走 / 站 这些在「打火机」这类词里出现，不能当断点。
 */
const POST_CH = /[了着过看见听闻摸尝试递给扔丢]/;
/**
 * 名词收尾清理：断句 → 只留「……的」后面的名词 → 剥掉尾巴上的体标记 / 方位词。
 * 刻意**不**剥名词末尾的量词：账本 / 咖啡杯 / 纸条 这些词本身就带量词字（「本 / 杯 / 条」），
 * 剥掉会把名字啃成半个词。min = 剥完至少要剩几个字（量词 / 引号明示的名字允许只剩 1 个字）。
 */
function tidy(s, min = 2) {
  let v = String(s ?? '').trim();
  const b = v.search(BREAK_RE); if (b > 0) v = v.slice(0, b);
  const c = v.search(BREAK_CH); if (c > 0) v = v.slice(0, c);
  const d = v.slice(2).search(POST_CH); if (d >= 0) v = v.slice(0, d + 2);
  const k = v.lastIndexOf('的'); if (k >= 0 && k < v.length - 1) v = v.slice(k + 1);   // 「桌上的打火机」→「打火机」
  const cut = re => { const nx = v.replace(re, ''); if (nx.length >= Math.min(min, v.length) && nx.length >= 1) v = nx; };
  cut(new RegExp(`(?:${ASPECT.join('|')})$`));
  cut(/(?:的|地|得|在|和|与|跟|向|从|把|将|我|他|她|它)$/);
  return clip(v, MAX_NAME);
}
/** 不带量词 / 引号的短名字：要 2–8 字、不是方位代词、不是泛指词（「拿到钥匙」收，「拿到手」/「拿到这里」不收） */
const bareOk = n => n.length >= 2 && n.length <= 8 && !GENERIC.has(n) && !PRONOUN.test(n);
/** 英文名词收尾清理：切在标点与常见介词 / 连词处 */
const tidyEn = s => String(s ?? '').split(/[.,;:!?\n]|\b(?:and|then|from|into|off|with|for|to)\b/i)[0].trim().replace(/\s+/g, ' ').slice(0, 40);

const VERB_ALT = VERBS.map(esc).join('|');
const ASPECT_RE = `(?:${ASPECT.join('|')})?`;
// 四种形状：
//   A 引号明示  拿到「锈迹斑斑的黄铜钥匙」       —— 引号里原样收，不做断句清理
//   B 动词直接带（可带量词）  拿到钥匙 / 拿到一枚银怀表
//   C 把字句    把账本揣进怀里
//   D 已知物品  名词命中调用方给的已知表，且前面 NEAR 字内出现过获取动词
const RX_QUOTED = QUOTE_PAIRS.map(([a, b]) => new RegExp(`(?:${VERB_ALT})${ASPECT_RE}\\s*${esc(a)}([^${esc(b)}\\n]{1,${MAX_NAME}})${esc(b)}`, 'g'));
const RX_BARE = new RegExp(`(?:${VERB_ALT})${ASPECT_RE}\\s*(${QUANT_RE})?\\s*([^${CUT_CHARS}]{1,12})`, 'g');
const RX_BA = new RegExp(`[把将將]\\s*([^${CUT_CHARS}]{1,${MAX_NAME}}?)\\s*(?:${VERB_ALT})`, 'g');
const EN_VERB = '(?:picks up|picked up|grabs|grabbed|pockets|pocketed)';
const RX_EN = new RegExp(`${EN_VERB}\\s+(?:a|an|the)?\\s*([A-Za-z][A-Za-z'\\- ]{1,60})`, 'g');
const KNOWN_VERB = new RegExp(`(?:${VERB_ALT})`);

/**
 * 扫描一段正文，产出物理拾取事实。
 * s：正文（**已过净化管线**的解析文本，思考链与变量块不该出现在里面；调用方负责）。
 * o = { known?: Set<string>|string[]（已知物品名：世界藏物表 + 现有仓库，命中即视为名词站得住）,
 *       floor?: number, place?: string（当前地点，写进 来源）, map?: string（当前地图 id）, limit?: number }
 * 返回 [{ kind:'loot', id, name, place, map, floor, authority:'verified', why }]（按正文出现顺序，同一件只出一条）。
 * authority 恒为 verified：这是地图侧的客观物理判定，不是自称（权威阶梯见 core/ledger.mjs）。
 */
export function scan(s, o = {}) {
  const text = String(s ?? '');
  if (!text) return [];
  const known = o.known instanceof Set ? o.known : new Set(Array.isArray(o.known) ? o.known : []);
  const limit = Math.max(0, Math.round(Number(o.limit) || MAX_FACTS));
  const floor = Number.isInteger(o.floor) ? o.floor : null;
  const place = clip(o.place, 60), map = clip(o.map, 40);
  const hits = [];   // [{ at, name, raw? }]：带位置以便按出现顺序排； quoted = true 的名字原样收（不做断句清理）
  for (const re of RX_QUOTED) { re.lastIndex = 0; for (let m; (m = re.exec(text));) hits.push({ at: m.index, name: m[1], quoted: true }); }
  RX_BARE.lastIndex = 0; for (let m; (m = RX_BARE.exec(text));) hits.push({ at: m.index, name: m[2], quant: !!m[1] });
  RX_BA.lastIndex = 0; for (let m; (m = RX_BA.exec(text));) hits.push({ at: m.index, name: m[1] });
  RX_EN.lastIndex = 0; for (let m; (m = RX_EN.exec(text));) hits.push({ at: m.index, name: m[1], en: true });
  for (const k of known) {
    const nm = String(k ?? '').trim(); if (!nm) continue;
    for (let from = 0; ;) {
      const at = text.indexOf(nm, from); if (at < 0) break; from = at + 1;
      if (KNOWN_VERB.test(text.slice(Math.max(0, at - NEAR), at))) { hits.push({ at, name: nm, known: true }); break; }
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const out = [], seen = new Set();
  for (const h of hits) {
    if (out.length >= limit) break;
    const name = h.en ? tidyEn(h.name) : h.quoted || h.known ? clip(h.name, MAX_NAME) : tidy(h.name, h.quant ? 1 : 2);
    if (!isItemName(name) || seen.has(name)) continue;
    if (!h.quoted && !h.known && !h.en && !h.quant && !bareOk(name)) continue;   // 无引号 / 无量词 / 不在已知表：只在名字够具体时才收
    seen.add(name);
    out.push({ kind: 'loot', id: itemId(name), name, ...(place ? { place } : {}), ...(map ? { map } : {}), floor,
      authority: 'verified', why: h.known ? '正文客观获取动作 + 已知物品名核对（verified）' : '正文客观获取动作（动词 + 具体物品名）' });
  }
  return out;
}

/** 只取名字（宿主 / 测试少写代码用） */
export const names = (s, o) => scan(s, o).map(f => f.name);

const API = { MAX_FACTS, MAX_NAME, VERBS, NOT_ITEMS, itemId, isItemName, scan, names };
export default API;
