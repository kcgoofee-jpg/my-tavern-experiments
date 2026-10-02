// The kernel's discovery vocabulary (docs/kernel-schema.md K-R38, K-R41, K-R42; Appendix A.7 "kernel (S4-2)" rows): the field-name words the engine looks for
// in a card's variable tree when a pack does not name a path or a roster field. Word lists per language, matched as case-insensitive substrings (or exact names / name
// endings where a list says so); a card's language is not known, so every language is tried. No regular expressions and no card names: a pack that needs more says so in its
// own blocks (vars, entities) and wins over anything found here. Pure.

const L = (zh, en) => ({ zh, en });
/** words whose presence anywhere in a field name marks it (var paths: K-R38; row fields: K-R42). */
export const HAS = {
  location: L(['地点', '所在地', '位置'], ['location', 'place']),
  time: L(['时刻', '时间'], ['time', 'clock']),
  period: L(['时段'], ['period', 'phase']),
  date: L(['日期'], ['date']),
  outfit: L(['着装', '服装', '衣着'], ['outfit', 'clothes']),
  present: L(['在场'], ['present', 'nearby']),
  reputation: L(['声望', '名望'], ['reputation']),
  role: L(['身份', '职业', '头衔'], ['identity', 'role', 'title']),
  stage: L(['进度', '阶段'], ['stage', 'progress']),
  people: L(['人物', '角色', '人员', '同伴', '成员'], ['npc', 'character', 'people']),   // a table name that says its rows are people
};
/** exact field names, in priority order (lower case). */
export const EXACT = {
  place: L(['当前位置', '当前地点', '所在地', '所在位置', '位置', '地点'], ['location', 'place']),   // the place field of a person's row
  position: L(['位置'], ['position']),                                                                // the place field of a present-table row that has one
  name: L(['名字', '姓名'], ['name']),                                                                // the name field of a row in a list
  person: L(['身份', '姓名', '年龄', '性别', '职业', '外貌', '内心想法', '好感'], []),                   // a field that only a person's row has
  presentKey: L(['在场人物', '在场角色', '当前在场'], []),                                               // the usual name of the table of the people with the player
  presentTable: L(['在场人物', '在场角色', '当前在场', '在场', '同行人物'], ['present']),              // every name that means the same
  outfitOrder: L(['衣服', '裤子', '鞋子'], ['top', 'bottom', 'shoes']),                                // display order of the parts of an outfit
  inventory: L(['物品栏', '背包', '道具栏', '道具', '物品', '储物', '行囊', '仓库'], ['inventory', 'backpack', 'items', 'bag', 'storage']),   // the field of a card's own item table (K-R76); the first word names the map's own slot
  empty: L(['待初始化', '无', '空', '未知', '-', '—'], ['none']),                                     // values that mean "not set"
};
/** the roster slots' field-name words (K-R42; `x-slot`): has = anywhere in the name, end = at the end with `min` characters before it, exact = the whole name. */
export const SLOT = {
  grade: L({ end: [['等级', 1]] }, { exact: ['grade'], has: ['rank'] }),
  core: L({ end: [['值', 2]] }, { has: ['core'] }),
  code: L({ has: ['代号'] }, { has: ['codename', 'alias'] }),
  social: L({ has: ['社会身份', '公开身份'], end: [['身份', 0]] }, { has: ['occupation'] }),
  height: L({ has: ['身高'] }, { has: ['height'] }),
  weight: L({ has: ['体重'] }, { has: ['weight'] }),
  known: L({ has: ['知情'] }, { has: ['public'] }),
  accessory: L({ has: ['饰物', '配饰', '项圈'] }, { has: ['accessor'] }),
  tier: L({ has: ['战力', '战斗力', '实力等级', '超凡阶'] }, { has: ['combat', 'power', 'tier'] }),
};

const low = s => String(s ?? '').toLowerCase();
const langs = l => (l ? [l] : ['zh', 'en']);
const flat = (t, lang) => langs(lang).flatMap(l => t[l] || []);

/** the EXACT words of `kind`, in priority order. */
export const exactWords = (kind, lang) => flat(EXACT[kind], lang);
/** does the name contain one of the words of `kind` (HAS)? */
export const hasWord = (kind, name, lang) => { const n = low(name); return flat(HAS[kind], lang).some(w => n.includes(w)); };
/** the position of the name in the EXACT list of `kind` (priority order), -1 when it is not there. */
export const exactRank = (kind, name, lang) => flat(EXACT[kind], lang).indexOf(low(name));
/** the first key of `obj` that is in the EXACT list of `kind`, taking the list's priority order: the key, else undefined. */
export const exactKey = (kind, obj, lang, ok = () => true) => { for (const w of flat(EXACT[kind], lang)) { const k = Object.keys(obj).find(k => low(k) === w && ok(obj[k])); if (k !== undefined) return k; } return undefined; };
/** does the name fit the slot's words? */
export function slotHit(slot, name, lang) {
  const n = low(name), s = SLOT[slot]; if (!s) return false;
  return langs(lang).some(l => { const d = s[l] || {}; return (d.exact || []).includes(n) || (d.has || []).some(w => n.includes(w)) || (d.end || []).some(([w, min]) => n.endsWith(w) && [...n].length >= [...w].length + min); });
}
/** the first of `keys` that fits the slot, else ''. */
export const slotFind = (slot, keys, lang) => keys.find(k => slotHit(slot, k, lang)) || '';
/** is the value one of the "not set" words? */
export const isEmptyValue = v => { const s = low(v).trim(); return s === '' || flat(EXACT.empty).includes(s); };

// ---- place words (docs/kernel-schema.md K-R93): the generic words that make a worldbook title or key a place candidate; a list per language, at most 60 each ----
export const PLACE = {
  zh: ['城', '市', '镇', '村', '街', '巷', '坊', '区', '港', '码头', '山', '谷', '岛', '湖', '河', '林', '殿', '宫', '堡', '塔', '寺', '庙', '院', '馆', '店', '铺', '楼', '阁', '厅', '室', '房', '屋', '学院', '学园', '学校', '广场', '市场', '酒馆', '旅店', '客栈', '桥', '园', '洞', '窟', '营', '站', '仓', '矿', '关'],
  en: ['town', 'city', 'village', 'street', 'road', 'lane', 'alley', 'inn', 'tavern', 'pub', 'castle', 'hall', 'room', 'harbour', 'harbor', 'port', 'dock', 'docks', 'district', 'quarter', 'forest', 'woods', 'academy', 'school', 'market', 'square',
    'bridge', 'tower', 'temple', 'church', 'garden', 'cellar', 'shop', 'store', 'house', 'manor', 'palace', 'island', 'lake', 'river', 'mountain', 'hill', 'valley', 'cave', 'camp', 'station', 'office', 'library', 'plaza', 'gate', 'bay', 'beach', 'farm', 'mine', 'keep', 'fort', 'ward'],
};
/** the place word `text` contains (Chinese: as a substring; other languages: as a whole word, a plural `s` allowed), else ''. `lang` selects the list (`zh`, else `en`). */
export function placeWord(text, lang) {
  const t = low(String(text ?? '').normalize('NFKC'));
  if (/^zh/i.test(String(lang || ''))) return PLACE.zh.find(w => t.includes(w)) || '';
  const toks = t.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  return PLACE.en.find(w => toks.some(k => k === w || k === w + 's' || k === w + "'s")) || '';
}

// ---- function words (docs/kernel-schema.md K-R107, docs/transit-schema.md §8): the generic words that tint a branch of an automatic schematic by what its places are for; at most 12 per language ----
export const FUNCTION = {
  civic: L(['政府', '议会', '市政', '法院', '行政', '官署', '警局', '监狱'], ['government', 'council', 'court', 'parliament', 'senate', 'embassy', 'magistrate', 'courthouse']),
  commerce: L(['商会', '市场', '集市', '商店', '店铺', '银行', '交易', '酒馆', '客栈', '旅店', '钱庄', '商业'], ['market', 'shop', 'store', 'bazaar', 'bank', 'tavern', 'inn', 'merchant', 'exchange', 'mall', 'emporium']),
  residential: L(['住宅', '公寓', '宿舍', '民居', '别墅', '寓所', '居民', '街坊', '民宅', '小区'], ['apartment', 'house', 'home', 'dormitory', 'residence', 'cottage', 'villa', 'lodge', 'housing', 'dwelling', 'tenement']),
  industry: L(['工厂', '工坊', '作坊', '矿场', '仓库', '车间', '冶炼', '工业', '锻造', '船坞'], ['factory', 'workshop', 'mine', 'warehouse', 'foundry', 'mill', 'forge', 'shipyard', 'plant', 'smithy']),
  military: L(['兵营', '要塞', '哨所', '堡垒', '卫戍', '炮台', '营地', '岗哨', '军械', '校场', '军事'], ['barracks', 'fortress', 'garrison', 'fort', 'armory', 'armoury', 'military', 'camp', 'outpost', 'citadel', 'watchtower']),
  religious: L(['教堂', '神殿', '寺院', '庙宇', '修道院', '神庙', '祭坛', '礼拜', '圣所', '道观', '教会'], ['church', 'temple', 'cathedral', 'chapel', 'monastery', 'abbey', 'shrine', 'mosque', 'sanctuary', 'convent', 'altar']),
  education: L(['学院', '学校', '大学', '学园', '书院', '图书馆', '教室', '研究所', '学堂', '讲堂'], ['school', 'academy', 'university', 'college', 'library', 'institute', 'seminary', 'classroom', 'campus']),
  medical: L(['医院', '诊所', '药房', '疗养', '医疗', '急救', '卫生', '护理', '医馆'], ['hospital', 'clinic', 'pharmacy', 'infirmary', 'hospice', 'sanatorium', 'medical', 'surgery', 'apothecary']),
  leisure: L(['公园', '花园', '剧院', '浴场', '温泉', '游乐', '竞技场', '赌场', '娱乐', '酒吧', '俱乐部', '剧场'], ['park', 'garden', 'theatre', 'theater', 'spa', 'casino', 'arena', 'club', 'stadium', 'cinema', 'resort']),
  transport: L(['车站', '站台', '码头', '港口', '机场', '渡口', '地铁', '轨道', '枢纽', '驿站', '航站'], ['station', 'terminal', 'port', 'harbour', 'harbor', 'airport', 'ferry', 'junction', 'platform', 'pier', 'metro', 'dock']),
  nature: L(['森林', '山林', '湖泊', '河岸', '海岸', '草原', '峡谷', '荒野', '瀑布', '沼泽', '山谷'], ['forest', 'woods', 'mountain', 'lake', 'river', 'coast', 'meadow', 'canyon', 'wilderness', 'waterfall', 'swamp', 'valley']),
  restricted: L(['禁区', '禁地', '地牢', '牢房', '隔离区', '封锁', '管制区', '刑场', '密室', '禁闭'], ['restricted', 'dungeon', 'quarantine', 'forbidden', 'vault', 'prohibited', 'lockdown', 'cell']),
};
/** the function (a key of FUNCTION, in its order) whose word `text` contains (Chinese: as a substring; other languages: as a whole word, a plural `s` allowed), else ''. */
export function functionWord(text, lang) {
  const t = low(String(text ?? '').normalize('NFKC')), zh = /^zh/i.test(String(lang || ''));
  const toks = zh ? [] : t.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  return Object.keys(FUNCTION).find(fn => (zh ? FUNCTION[fn].zh.some(w => t.includes(w)) : FUNCTION[fn].en.some(w => toks.some(k => k === w || k === w + 's' || k === w + "'s")))) || '';
}

// ---- self / body words (DRAWER-1): words that name the player's own self or body, never an item (「拿起自己」「握住了……」). A data list the pickup scan reads: the text is
// left untouched (nothing is moderated), these words only never become an inventory row. A pack extends it through its pickup vocabulary `not_items`.
export const SELF_WORDS = {
  zh: ['自己', '自身', '本人', '身体', '身子', '躯体', '肉体', '头', '脑袋', '脸', '脸颊', '嘴', '嘴唇', '舌头', '牙齿', '脖子', '喉咙', '肩膀', '手臂', '胳膊', '手指', '手掌', '拳头', '胸', '胸口', '乳房', '腹部', '肚子', '腰', '背', '臀部', '屁股', '腿', '大腿', '膝盖', '脚', '脚踝', '头发', '眼睛', '耳朵', '鼻子', '皮肤', '肉棒', '阴茎', '阴蒂', '阴道', '小穴', '乳头', '下体', '私处'],
  en: ['self', 'myself', 'yourself', 'himself', 'herself', 'itself', 'themselves', 'body', 'head', 'face', 'mouth', 'lips', 'tongue', 'neck', 'throat', 'shoulder', 'shoulders', 'arm', 'arms', 'hand', 'hands', 'finger', 'fingers', 'fist', 'chest', 'breast', 'breasts', 'belly', 'waist', 'back', 'hip', 'hips', 'leg', 'legs', 'thigh', 'thighs', 'knee', 'foot', 'feet', 'hair', 'eyes', 'ears', 'nose', 'skin', 'cock', 'penis', 'pussy', 'nipple', 'nipples'],
};
