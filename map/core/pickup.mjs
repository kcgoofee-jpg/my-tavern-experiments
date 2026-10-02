// 客观动作强制反思探测（任务一第二步）：正文里**写明的物理获取动作** → 单项账目事实。
// 为什么需要它：主模型在 CoT 里判断「卡内没有背包字段 / 这一拍没有变量槽位」时会直接在 UpdateVariable 里
// 漏掉道具——拾取动作发生了，账上却什么都没有，道具凭空蒸发。这里把动作本身当事实来源：
// 动词 + 具体物品名词同时成立 → 产出一条 loot 事实，交给漏项审计器（core/ledger.mjs audit）补**单项**缺口。
// 纪律（与账本同一口径）：
//   ① 宁可漏不可误：只有「获取动词」和「具体物品名词」同时成立才产出；抽象名词（情绪 / 状态 / 关系）不要；
//   ② 名词必须站得住：被引号包住、前面带量词、或命中调用方给的已知物品表（世界藏物表 / 现有仓库），三者至少一项；
//   ③ 纯核心：不碰 DOM / 宿主全局 / 存储 / 网络，数据进、事实出；node 单测 tests/auto_stash.test.mjs。
// 本模块不写任何东西——落盘一律由宿主经 ledger / varssync 的结算闸门做（时序纪律见 tavern/settlement-guard.mjs）。

import { stripOoc } from './ooc.mjs';
import { SELF_WORDS } from './vocab.mjs';

/** 扫描规则的版本：规则改了就加一——存着的文字行带旧版本的指纹，下一轮在窗口里按新规则重放一次（误收的行自愈） */
export const SCAN_VER = 5;   // 5: self / body words are never items (DRAWER-1); 4: OOC segments are stripped before the scan (D32). A line scanned by an older build is replayed once
export const MAX_FACTS = 6;         // 一条正文最多认几件（超出丢弃：宁可少记，也不把一段描写吸成清单）
export const MAX_NAME = 20;         // 物品名的长度上限（更长多半是句子而不是名词）
const NEAR = 24;                    // 已知物品名：动词要出现在它前面这么多字符内才算「这一下拿的是它」

/**
 * 获取动词（普通类）：只收「把东西弄到手」这一件事。不含制造 / 消耗 / 使用（那三类别的事件由各自域管）。
 * 中文按词长降序排列（长的先匹配，免得「拿起」被「拿」抢走）；英文只收短语形态，避免 take / get 这类泛动词误伤。
 * 中文与英文分列：中文三种形状（引号 / 直接带 / 把字句）只认中文动词，英文有自己的形状（见 compile）。
 */
export const ZH_VERBS = Object.freeze([
  '收入囊中', '据为己有', '揣进口袋', '揣进怀里', '捡了起来', '拿了起来',
  '拿到', '拿起', '拾起', '捡起', '捡到', '拾到', '抓起', '取走', '拿走', '带走', '收下', '收好', '收起',
  '拿出', '取出', '掏出', '摸出', '翻出', '抽出', '摘下', '取下', '夺得', '缴获', '掳走', '顺走', '摸走', '抢到', '收了',
  '揣进', '揣入', '塞进', '装进', '放进', '放入',
]);
export const EN_VERBS = Object.freeze(['picks up', 'picked up', 'grabs', 'grabbed', 'pockets', 'pocketed']);
/** 严格类：这些词太泛（「得到消息」「获得勇气」），宾语要被引号包住、带量词或命中已知物品名才算（英文：引号或已知名） */
export const STRICT_VERBS = Object.freeze(['获得', '得到', '拿取']);
export const STRICT_EN = Object.freeze(['obtains', 'obtained', 'gets', 'got', 'takes', 'took', 'receives', 'received', 'acquires', 'acquired']);
export const VERBS = Object.freeze([...ZH_VERBS, ...EN_VERBS]);
/** 「放进 / 塞进」类：后面跟的是去处（塞进她的嘴里、揣进口袋），东西在前面（把字句）——直接带 / 引号形不收 */
const INTO = new Set(['揣进口袋', '揣进怀里', '揣进', '揣入', '塞进', '装进', '放进', '放入']);
/** 方位收尾的名字是去处不是东西（嘴里、箱中、柜内、桌上） */
const PLACE_END = /[里中内上下旁边]$/;

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
  '认可', '回应', '回报', '好处', '帮助', '支持', '原谅', '安慰', '满足', '乐趣', '成就', '成功', '胜利', '荣誉',
  '名声', '地位', '权力', '知识', '技能', '能力', '启发', '结果', '进展', '同意', '批准', '允许', '保证', '关注',
  '青睐', '赏识', '体验', '收获', '平静', '安宁', '休息',
]);
export const NOT_ITEMS_EN = Object.freeze(['chance', 'opportunity', 'attention', 'lead', 'breath', 'look', 'moment', 'hint', 'idea', 'news', 'message', 'hold']);
const DET = '(?:a|an|the|some|his|her|their|my|your|its)';
const DET_LEAD = new RegExp(`^${DET}\\s+`, 'i');
const NOT_SET = new Set(NOT_ITEMS), NOT_EN = new Set(NOT_ITEMS_EN);
const SELF_ZH = new Set(SELF_WORDS.zh), SELF_EN = new Set(SELF_WORDS.en);
/** a self / body word, ignoring a leading ellipsis or dash (「……肉棒」) and an English determiner */
const isSelf = n => { const z = String(n ?? '').replace(/^[\s….·—-]+/, ''); return SELF_ZH.has(z) || SELF_EN.has(z.toLowerCase().replace(DET_LEAD, '')); };

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** FNV-1a → 36 进制（纯 ASCII id；与 core/stash.rowId 同一手法，但前缀 x 与藏物表 s 分开） */
const fnv = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const clip = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');

/** 物品 id：由名字混出来——同名同物，正文重复提到不会记成两件 */
export const itemId = name => 'x' + fnv(String(name ?? '').trim());
/** 这个名词像不像一件**东西**（黑名单 / 长度 / 空） */
export const isItemName = n => { const s = clip(n, MAX_NAME); return !!s && !NOT_SET.has(s) && !NOT_EN.has(s.toLowerCase().replace(DET_LEAD, '')) && s.length >= 1 && s.length <= MAX_NAME; };
/**
 * 泛指 / 方位 / 代词：这些位置词不是东西（「拿到手」「拿到这里」「拿到的」）——只有不带量词的短名字才查它，
 * 因为带量词时（「一枚手里的钥匙」这种怪句子）本来就少见，宁可放过。
 */
const GENERIC = new Set(['手', '手里', '手中', '手上', '身上', '身边', '眼前', '这里', '那里', '之后', '以前', '之前',
  '上面', '下面', '里面', '外面', '背后', '怀中', '怀里', '一半', '东西', '那个', '这个', '什么', '一切']);
const PRONOUN = /^[这那此其之我你他她它们谁上下里外前后内自]/;   // 自 = 自己 / 自身
/**
 * 分句断点：抓取到的东西后面往往接着下一句（「拿到钥匙然后打开门」）——物品名到断点为止。
 * 只收长词与一眼能认的连词 / 副词，避免把「钥匙扣」这种复合词从中间切断。
 */
const CLAUSE_BREAK = ['然后', '接着', '随后', '于是', '之后', '并且', '而且', '可是', '但是', '不过',
  '因此', '所以', '因为', '如果', '只要', '立刻', '马上', '转身', '回头', '顺手', '放进', '塞进', '揣进', '获得', '得到'];
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
  const h = v.indexOf('后', 2); if (h >= 2) v = v.slice(0, h);   // 「掏出石头后坐下」→「石头」（第 2 个字以后才断：皇后 / 后视镜不动）
  const k = v.lastIndexOf('的'); if (k >= 0 && k < v.length - 1) v = v.slice(k + 1);   // 「桌上的打火机」→「打火机」
  const cut = re => { const nx = v.replace(re, ''); if (nx.length >= Math.min(min, v.length) && nx.length >= 1) v = nx; };
  cut(new RegExp(`(?:${ASPECT.join('|')})$`));
  cut(/(?:的|地|得|在|和|与|跟|向|从|把|将|我|他|她|它)$/);
  return clip(v, MAX_NAME);
}
/** 不带量词 / 引号的短名字：要 2–8 字、不是方位代词、不是泛指词（「拿到钥匙」收，「拿到手」/「拿到这里」不收） */
const bareOk = n => n.length >= 2 && n.length <= 8 && !GENERIC.has(n) && !PRONOUN.test(n);
const ASPECT_RE = `(?:${ASPECT.join('|')})?`;
/** 只剩一个量词短语（「一把」「两枚」）：那是量词，后面的东西没抓到——不是物品名 */
const QUANT_ONLY = new RegExp(`^${QUANT_RE}$`);
/** 英文名词收尾清理：切在标点与常见介词 / 连词处，再去掉开头的限定词 */
const tidyEn = s => String(s ?? '').split(/[.,;:!?\n]|\b(?:and|then|from|into|off|with|for|to)\b/i)[0].trim().replace(/\s+/g, ' ').replace(DET_LEAD, '').slice(0, 40);

// ---- 不算拾取的句式（K-R77）：对每一条命中（所有类，含已知名路径）逐条检查，只否决，不改写正文 ----
const NEG = ['没有', '没能', '无法', '不能', '没', '未', '不', '别'];
const NEG_EXCEPT = ['不由得', '不由', '不禁', '不得不', '不一会', '不久', '不料', '不觉', '不住'];
const INTENT = ['想', '要', '打算', '准备', '试图', '企图', '希望', '如果', '要是', '假如', '若'];
const NEG_EN = /(?:^|\s)(?:not|never)(?:\s|$)|n['’]t\b|\bno longer\b/i;
const INTENT_EN = /\b(?:want to|wants to|try to|tries to|wish(?:es|ed)?|hope[sd]?|if|would|will)\b/i;
const POTENTIAL = '看听想做找买办猜闻感觉等赶追吃用见';
const TERMS = '。！？；…!?;\n';
const isTerm = (t, i) => TERMS.includes(t[i]) || (t[i] === '.' && (i + 1 >= t.length || /\s/.test(t[i + 1])));
/** 对话 / 引文区间：“…” 「…」 『…』 与成对的 "…"（从左到右配对） */
function spans(t) {
  const out = [];
  for (const [a, b] of [['“', '”'], ['「', '」'], ['『', '』']]) for (let i = t.indexOf(a); i >= 0;) { const j = t.indexOf(b, i + 1); if (j < 0) break; out.push([i, j]); i = t.indexOf(a, j + 1); }
  for (let i = 0, open = -1; i < t.length; i++) if (t[i] === '"') { if (open < 0) open = i; else { out.push([open, i]); open = -1; } }
  return out;
}
/** 这条命中是不是「没发生」的拾取：否定 / 疑问 / 对话 / 意图条件 / 可能补语 / 复合词。at = 动词下标（把字句：把字的下标） */
function blocked(t, at, verb, sp) {
  if (sp.some(([a, b]) => at > a && at < b)) return true;                                    // 对话：动词严格落在引号区间里面（名字前的引号是引号名形，不算）
  const after = t.charAt(at + verb.length);
  if (verb === '得到' && at > 0 && POTENTIAL.includes(t[at - 1])) return true;               // 看得到 / 找得到
  if (verb === '获得' && after && '者感'.includes(after)) return true;                       // 获得者 / 获得感
  if (/被(?:[人他她它我你谁]|[他她它我你]们)?$/.test(t.slice(Math.max(0, at - 3), at))) return true;   // 被动：「被掏出」「被人带走」是东西被拿走，不是谁拿到了
  let s = at, e = at; while (s > 0 && !isTerm(t, s - 1)) s--; while (e < t.length && !isTerm(t, e)) e++;
  const pre = t.slice(s, at), cl = t.slice(s, e).trim();
  for (const w of NEG) for (let i = pre.indexOf(w); i >= 0; i = pre.indexOf(w, i + 1)) {
    if (i + w.length < pre.length - 3) continue;                                              // 否定词的词尾要在动词前 4 个字内
    if (w === '不' && NEG_EXCEPT.some(x => { for (let j = pre.indexOf(x); j >= 0; j = pre.indexOf(x, j + 1)) if (i >= j && i < j + x.length) return true; return false; })) continue;
    return true;
  }
  if (NEG_EN.test(pre.split(/\s+/).filter(Boolean).slice(-3).join(' '))) return true;
  const last = cl.replace(/[”」』"’\s]+$/, '').slice(-1);
  if (t[e] === '？' || t[e] === '?' || (last && '吗呢么'.includes(last)) || /^[\s“「『"]*(?:是否|能否|有没有|要不要)/.test(cl)) return true;   // 疑问
  return INTENT.some(w => pre.includes(w)) || INTENT_EN.test(pre);                            // 想 / 要 / 如果 …… 还没发生
}

// ---- 词表编译（内核词 + 包词）：按词表的 JSON 记一份，同一词表同一套正则 ----
const CJK = /[⺀-鿿豈-﫿぀-ヿ가-힯]/;
const wordList = v => { const out = []; for (const w of Array.isArray(v) ? v : []) { const t = clip(w, 40); if (t && !out.includes(t) && out.length < 100) out.push(t); } return out; };
const lenDesc = a => [...new Set(a)].sort((x, y) => y.length - x.length);
const alt = a => (a.length ? a.map(esc).join('|') : '(?!)');
const altEn = a => (a.length ? a.map(w => esc(w).replace(/ +/g, '\\s+')).join('|') : '(?!)');
let CACHE = { key: null, val: null };
/** vocab = { verbs, verbs_strict, verbs_off, not_items }（词都按字面，不当正则）。返回编译好的正则与名词否决函数。 */
export function compile(vocab) {
  const v = vocab && typeof vocab === 'object' ? vocab : {};
  const w = { verbs: wordList(v.verbs), verbs_strict: wordList(v.verbs_strict), verbs_off: wordList(v.verbs_off), not_items: wordList(v.not_items) };
  const key = JSON.stringify(w);
  if (CACHE.key === key) return CACHE.val;
  const off = new Set(w.verbs_off), keep = a => a.filter(x => !off.has(x)), zh = a => a.filter(x => CJK.test(x)), en = a => a.filter(x => !CJK.test(x));
  const zhN = lenDesc(keep([...ZH_VERBS, ...zh(w.verbs)])), enN = lenDesc(keep([...EN_VERBS, ...en(w.verbs)]));
  const zhS = lenDesc(keep([...STRICT_VERBS, ...zh(w.verbs_strict)])), enS = lenDesc(keep([...STRICT_EN, ...en(w.verbs_strict)]));
  const bare = vs => new RegExp(`(${alt(vs)})${ASPECT_RE}\\s*(${QUANT_RE})?\\s*([^${CUT_CHARS}]{1,12})`, 'g');
  const nots = new Set([...NOT_ITEMS, ...w.not_items]), notsEn = new Set([...NOT_ITEMS_EN, ...w.not_items.map(x => x.toLowerCase().replace(DET_LEAD, ''))]);
  const val = {
    quoted: QUOTE_PAIRS.map(([a, b]) => new RegExp(`(${alt([...zhN, ...zhS])})${ASPECT_RE}\\s*(?:${QUANT_RE})?\\s*${esc(a)}([^${esc(b)}\\n]{1,${MAX_NAME}})${esc(b)}`, 'g')),
    bare: bare(zhN), bareStrict: bare(zhS),
    ba: new RegExp(`[把将將]\\s*([^${CUT_CHARS}]{1,${MAX_NAME}}?)\\s*(${alt(lenDesc(keep([...zhN, '拿取'])))})`, 'g'),
    en: new RegExp(`\\b(${altEn(enN)})\\b\\s+(?:${DET}\\s+)?([A-Za-z][A-Za-z'\\- ]{1,60})`, 'gi'),
    enQuoted: QUOTE_PAIRS.map(([a, b]) => new RegExp(`\\b(${altEn(enS)})\\b\\s+(?:${DET}\\s+)?${esc(a)}([^${esc(b)}\\n]{1,${MAX_NAME}})${esc(b)}`, 'gi')),
    known: new RegExp(`(?:${alt([...zhN, ...zhS])})|\\b(?:${altEn([...enN, ...enS])})\\b`, 'gi'),
    not: n => isSelf(n) || nots.has(n) || notsEn.has(String(n).toLowerCase().replace(DET_LEAD, '')),
  };
  CACHE = { key, val };
  return val;
}

/**
 * 扫描一段正文，产出物理拾取事实。
 * s：正文（**已过净化管线**的解析文本，思考链与变量块不该出现在里面；调用方负责）。
 * o = { known?: Set<string>|string[]（已知物品名：世界藏物表 + 现有仓库，命中即视为名词站得住）,
 *       floor?: number, place?: string（当前地点，写进 来源）, map?: string（当前地图 id）, limit?: number,
 *       vocab?: { verbs, verbs_strict, verbs_off, not_items }（包词表，已合并语言） }
 * 返回 [{ kind:'loot', id, name, place, map, floor, authority:'verified', why }]（按正文出现顺序，同一件只出一条）。
 * authority 恒为 verified：这是地图侧的客观物理判定，不是自称（权威阶梯见 core/ledger.mjs）。
 */
export function scan(s, o = {}) {
  const text = stripOoc(s);   // OOC lines are the player talking to the model, never an action (D32)
  if (!text) return [];
  const C = compile(o.vocab), sp = spans(text);
  const known = o.known instanceof Set ? o.known : new Set(Array.isArray(o.known) ? o.known : []);
  const limit = Math.max(0, Math.round(Number(o.limit) || MAX_FACTS));
  const floor = Number.isInteger(o.floor) ? o.floor : null;
  const place = clip(o.place, 60), map = clip(o.map, 40);
  const hits = [];   // [{ at, verb, name, … }]：带位置以便按出现顺序排； quoted = true 的名字原样收（不做断句清理）
  const each = (re, f) => { re.lastIndex = 0; for (let m; (m = re.exec(text));) f(m); };
  for (const re of C.quoted) each(re, m => { if (!INTO.has(m[1])) hits.push({ at: m.index, verb: m[1], name: m[2], quoted: true }); });
  each(C.bare, m => { if (!/^\s*的/.test(m[3]) && !INTO.has(m[1])) hits.push({ at: m.index, verb: m[1], name: m[3], quant: !!m[2] }); });   // 「带走的动静」：动词在修饰后面的名词，不是拿到了它
  each(C.bareStrict, m => { if (m[2]) hits.push({ at: m.index, verb: m[1], name: m[3], quant: true }); });   // 严格类：必须带量词
  each(C.ba, m => hits.push({ at: m.index, verb: m[2], name: m[1] }));
  each(C.en, m => hits.push({ at: m.index, verb: m[1], name: m[2], en: true }));
  for (const re of C.enQuoted) each(re, m => hits.push({ at: m.index, verb: m[1], name: m[2], quoted: true }));   // 英文严格类：必须是引号名
  for (const k of known) {
    const nm = String(k ?? '').trim(); if (!nm) continue;
    for (let from = 0; ;) {
      const at = text.indexOf(nm, from); if (at < 0) break; from = at + 1;
      const w0 = Math.max(0, at - NEAR), win = text.slice(w0, at); let vm = null;
      C.known.lastIndex = 0; for (let m; (m = C.known.exec(win));) vm = m;
      if (vm && !blocked(text, w0 + vm.index, vm[0], sp)) { hits.push({ at, verb: vm[0], name: nm, known: true }); break; }
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const out = [], seen = new Set();
  for (const h of hits) {
    if (out.length >= limit) break;
    const name = h.en ? tidyEn(h.name) : h.quoted || h.known ? clip(h.name, MAX_NAME) : tidy(h.name, h.quant ? 1 : 2);
    if (!isItemName(name) || C.not(name) || seen.has(name) || QUANT_ONLY.test(name)) continue;
    if (!h.quoted && !h.known && !h.en && !h.quant && !bareOk(name)) continue;
    if (!h.quoted && !h.known && !h.en && PLACE_END.test(name) && name.length <= 3) continue;   // 「嘴里」「手中」：去处   // 无引号 / 无量词 / 不在已知表：只在名字够具体时才收
    if (!h.known && blocked(text, h.at, h.verb, sp)) continue;                    // 否定 / 疑问 / 对话 / 意图（已知名路径在上面查过）
    seen.add(name);
    out.push({ kind: 'loot', id: itemId(name), name, ...(place ? { place } : {}), ...(map ? { map } : {}), floor,
      authority: 'verified', why: h.known ? '正文客观获取动作 + 已知物品名核对（verified）' : '正文客观获取动作（动词 + 具体物品名）' });
  }
  return out;
}

/** 只取名字（宿主 / 测试少写代码用） */
export const names = (s, o) => scan(s, o).map(f => f.name);

const API = { SCAN_VER, MAX_FACTS, MAX_NAME, VERBS, ZH_VERBS, EN_VERBS, STRICT_VERBS, STRICT_EN, NOT_ITEMS, NOT_ITEMS_EN, itemId, isItemName, compile, scan, names };
export default API;
