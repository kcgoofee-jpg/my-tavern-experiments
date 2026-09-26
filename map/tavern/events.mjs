// 天城事态：从聊天原文解析事件标签（纯函数，eden-map.js 与 node 单测共用；不碰 DOM、不碰酒馆接口）
// 两种写法都认（世界书「地图联动规范」教的是第一种）：
//   <span style="display:none" data-tcmap="类型=火灾;地点=7号井黑市;标题=仓库起火;等级=3;状态=发生中;编号=LEB-88-0317"></span>
//     可选：层、来源、时间、编号（同一事件后续沿用）、范围 / 持续（网络攻击）、坐标（0–1 归一化 x,y）；状态写 已解除 / 已扑灭 / 已恢复 = 关闭该事件
//   <span style="display:none">⌖类别｜层·地点｜等级｜一句话｜发布方</span>（紧凑写法；等级 0 = 平息）
//   一楼最多 3 条；全角 / 半角分隔都认。
// 聊天记录是唯一真相：每次都从最近 N 楼重算，所以 swipe、删楼、编辑后自然一致。

// 事件体系：8 个大类（地图图例只有 8 种颜色），具体类型靠图标字区分。稀有度：1 常见、2 少见、3 罕见、4 传说。完整设计见 docs/event-taxonomy.md
export const GROUPS = {
  空防: '#d9a441', 气候: '#7fd6ff', 治安: '#3d7dff', 政治: '#6f9be0', 媒体: '#3de0ff', 民生: '#e8d08a', 军事: '#a3b18a', 灾害: '#ff5a2a', 其他: '#cfd8e0',
};
const T = (g, ch, src, rare) => ({ g, ch, src, rare });
export const CATS = {   // 具体类型 → 大类、图标字、默认发布方、稀有度
  巡空令: T('空防', '巡', '议会骑士团', 1), 结界警报: T('空防', '结', '庄园结界系统', 2), 锚泊校正: T('空防', '锚', '天城执政厅', 3), 空域临检: T('空防', '检', '议会骑士团', 2), 宴会加警: T('空防', '宴', '议会骑士团', 2),
  塔体保养: T('气候', '塔', '以太气候塔', 1), 气候故障: T('气候', '候', '以太气候塔', 2), 结界过载: T('气候', '过', '资产管理委员会', 3), 气压异常: T('气候', '压', '执法局', 3), 人工极光: T('气候', '光', '天城一台', 4),
  黑市查抄: T('治安', '抄', '执法局', 2), 检查点管控: T('治安', '管', '执法局', 1), 通缉: T('治安', '缉', '执法局', 2), 持械: T('治安', '械', '执法局', 2), 凶案: T('治安', '凶', '执法局', 3),
  抢劫: T('治安', '劫', '执法局', 2), 盗窃: T('治安', '盗', '执法局', 1), 资产纠纷: T('治安', '产', '资产管理委员会', 2), 灰票造假: T('治安', '票', '黑市终端', 2),
  政策: T('政治', '策', '天城议会', 2), 议会质询: T('政治', '议', '天城议会', 2), 联盟内讧: T('政治', '盟', '庄园主联盟', 3), 通行税: T('政治', '税', '天城执政厅', 2), 评级复核: T('政治', '评', '资产管理委员会', 2),
  网络攻击: T('媒体', '网', '天城一台', 2), 数据泄露: T('媒体', '泄', '黑市终端', 2), 广告劫持: T('媒体', '屏', '天城一台', 2), 直播事故: T('媒体', '播', '天城一台', 3), 公共直播: T('媒体', '播', '天城一台', 1), 舆情: T('媒体', '传', '霓讯', 1),
  施粥告急: T('民生', '粥', '圣光教会', 1), 教会仪式: T('民生', '祷', '圣光教会', 1), 修女出巡: T('民生', '铁', '圣铁摇篮', 3), 急救: T('民生', '救', '施奈德诊所', 2), 兑价波动: T('民生', '兑', '黑市终端', 2), 骚乱: T('民生', '乱', '血肉磨坊', 2),
  军事调动: T('军事', '调', '天城防卫军', 2), 哨所换防: T('军事', '防', '天城防卫军', 1), 联合演习: T('军事', '演', '天城防卫军', 2), 边境警戒: T('军事', '境', '天城防卫军', 3),
  火灾: T('灾害', '火', '天城一台', 1), 爆炸: T('灾害', '爆', '天城一台', 3), 交通事故: T('灾害', '撞', '天城一台', 1), 停电: T('灾害', '电', '天城一台', 1), 轨道故障: T('灾害', '轨', '天城一台', 2), 结构坍塌: T('灾害', '塌', '执法局', 3),
  其他: T('其他', '!', '', 1),
};
for (const v of Object.values(CATS)) v.color = GROUPS[v.g];
const ALIAS_CAT = { 巡查: '巡空令', 巡空: '巡空令', 空域巡查: '巡空令', 结界事故: '结界警报', 结界: '结界警报', 锚泊: '锚泊校正', 临检: '空域临检', 气候: '气候故障', 天气: '气候故障', 酸雨: '气候故障', 骤寒: '气候故障',
  保养: '塔体保养', 停机: '塔体保养', 过载: '结界过载', 气压: '气压异常', 极光: '人工极光', 查抄: '黑市查抄', 黑市: '黑市查抄', 管控: '检查点管控', 封锁: '检查点管控', 执法管控: '检查点管控', 执法: '检查点管控', 搜查: '检查点管控',
  悬赏: '通缉', 枪击: '持械', 劫持: '持械', 持械冲突: '持械', 命案: '凶案', 劫案: '抢劫', 劫盗: '抢劫', 失窃: '盗窃', 入室: '盗窃', 权属: '资产纠纷', 假票: '灰票造假', 造假: '灰票造假',
  政策变动: '政策', 法案: '政策', 质询: '议会质询', 内讧: '联盟内讧', 税: '通行税', 复核: '评级复核', 网攻: '网络攻击', 黑客: '网络攻击', 数据链路受扰: '网络攻击', 入侵: '网络攻击', 信号干扰: '网络攻击', 电子攻击: '网络攻击',
  泄露: '数据泄露', 广告: '广告劫持', 直播: '公共直播', 谣言: '舆情', 传闻: '舆情', 施粥: '施粥告急', 民生: '施粥告急', 晚祷: '教会仪式', 晨祷: '教会仪式', 仪式: '教会仪式', 修女: '修女出巡', 医疗: '急救', 兑价: '兑价波动', 汇率: '兑价波动',
  拳场骚乱: '骚乱', 抗议: '骚乱', 斗殴: '骚乱', 冲突: '骚乱', 暴动: '骚乱', 军营调动: '军事调动', 调动: '军事调动', 换防: '哨所换防', 演习: '联合演习', 警戒: '边境警戒',
  起火: '火灾', 失火: '火灾', 火警: '火灾', 爆燃: '爆炸', 交通: '交通事故', 事故: '交通事故', 撞车: '交通事故', 断电: '停电', 以太中断: '停电', 轨道: '轨道故障', 停运: '轨道故障', 坍塌: '结构坍塌', 倒塌: '结构坍塌' };
const catOf = s => { s = (s || '').trim(); if (CATS[s]) return s; if (ALIAS_CAT[s]) return ALIAS_CAT[s];
  for (const k of Object.keys(CATS)) if (k !== '其他' && s.includes(k)) return k; for (const [k, v] of Object.entries(ALIAS_CAT)) if (s.includes(k)) return v; return '其他'; };
// 地点 → 层：先看显式前缀，再按设定地名推断（地名表见 maps.json）
const layerGuess = loc => LAYERS.find(l => loc.startsWith(l)) || LAYERS.find(l => l !== '天城外' && loc.includes(l)) ||
  (/庄园|悬浮岛|浮岛|伊甸|银冠|气候调节塔|骑士团/.test(loc) ? '上层' : /井|地基|血肉磨坊|施粥|哨所|货运|下层分局|资产管理委员会下层/.test(loc) ? '下层'
    : /霓虹|C区|检查点|执法局总局|大教堂|圣铁摇篮|军营|星渊|议会|商业区/.test(loc) ? '中层' : /圣都|原域|旷野|大陆/.test(loc) ? '天城外' : '');
const CLOSED = /解除|结束|恢复|扑灭|已控制|平息/;
export const LAYERS = ['上层', '中层', '下层', '天城外'];
export const LAYER_MAP = { 上层: 'tc_upper', 中层: 'tc_mid', 下层: 'tc_low', 天城外: 'world' };
export const AGE = { live: 7, after: 20, fade: 40 };        // 楼层差：≤7 活跃、≤20 余波、≤40 淡出（只在列表）、更早丢弃
export const MERGE_WINDOW = 15;                               // 同一类别 + 地点在 15 楼内再次出现 = 同一事件的更新
const MAX_PER_FLOOR = 3;
// 内容硬边界：事件只做城市治安、灾害、网络、公共事务；含这些词的整条丢弃
const BLOCK = /母畜|项圈|调教|侍寝|性奴|束缚|拘束|捆绑|凌辱|强奸|猥亵|裸/;
// 世界书里的示范标记原文：模型原样复述时不上图
export const EXAMPLES = new Set([
  '⌖政策｜中层·商业区｜1｜议会通过跨层通行税修正案｜天城议会',
  '⌖检查点管控｜中层·C区检查点｜2｜查验身份芯片与资产铭牌｜执法局',
  '⌖黑市查抄｜下层·7号井｜2｜执法局突击查抄黑市终端，三名中间人被带走',
  '⌖类别｜层·地点｜等级｜一句话｜发布方',
  '⌖火灾｜中层·霓虹街｜2｜霓街17号仓库起火，三人被困',
  '⌖火灾｜中层·霓虹街｜0｜明火扑灭，两栋楼停电',
  '⌖网络攻击｜中层·商业区｜2｜全息广告被劫持，滚动反议会标语｜天城一台',
  // 世界书「地图联动规范」和两条样例里的 data-tcmap 原文
  '类型=火灾;地点=7号井黑市;标题=仓库起火;等级=3;状态=发生中;时间=2088.01.12 21:40',
  '类型=火灾;地点=7号井黑市;标题=仓库起火;等级=3;状态=发生中;时间=2088.01.12 21:40;编号=LEB-88-0317',
  '类型=网络攻击;地点=中层;范围=中层;标题=霓虹网络遭入侵;等级=2;持续=3',
]);

const decode = s => s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' })[k]);
const norm = s => s.replace(/\s+/g, '').replace(/[·•・.]/g, '·');
export function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/** 一楼原文 → 标签列表 [{cat, layer, place, lvl, text, src, code?, time?, scope?, dur?, xy?}]；代码块里的、示范原文、越界内容跳过 */
export function parseMarks(raw) {
  if (!raw || (raw.indexOf('⌖') < 0 && raw.indexOf('data-tcmap') < 0)) return [];
  const text = decode(String(raw)).replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, '');
  const found = [];   // [位置, 字段]
  for (const m of text.matchAll(/data-tcmap\s*=\s*(["'])(.*?)\1/g)) {
    if (EXAMPLES.has(m[2].trim())) continue;
    const o = {}; for (const kv of m[2].split(/[;；]/)) { const k = kv.search(/[=＝]/); if (k > 0) o[kv.slice(0, k).trim()] = kv.slice(k + 1).trim(); }
    if (!o.类型 && !o.标题) continue;
    const lvl = CLOSED.test(o.状态 || '') ? 0 : Math.max(1, Math.min(3, parseInt(o.等级, 10) || 2));
    found.push([m.index, { cat: catOf(o.类型 || o.标题), loc: (o.层 && !(o.地点 || '').includes(o.层) ? o.层 + '·' : '') + (o.地点 || ''), lvl, text: o.标题 || '', src: o.来源 || '',
      code: o.编号 || '', time: o.时间 || '', scope: o.范围 || '', dur: parseInt(o.持续, 10) || 0, xy: o.坐标 || '', status: o.状态 || '', line: m[2] }]);
  }
  for (const m of text.matchAll(/⌖([^<\n⌖]{3,200})/g)) {
    const line = '⌖' + m[1].trim();
    if (EXAMPLES.has(line.replace(/\|/g, '｜'))) continue;
    const f = m[1].split(/[｜|]/).map(x => x.trim());
    if (f.length < 4) continue;
    const n = parseInt(String(f[2]).replace(/[^\d]/g, ''), 10);
    if (!(n >= 0 && n <= 3)) continue;
    found.push([m.index, { cat: catOf(f[0]), loc: f[1], lvl: n, text: f[3] || '', src: f[4] || '', line }]);
  }
  const out = [];
  for (const [, e] of found.sort((a, b) => a[0] - b[0])) {
    if (BLOCK.test(e.line)) continue;
    const loc = norm(e.loc), layer = layerGuess(loc);
    if (!layer) continue;
    const place = loc.slice(loc.startsWith(layer) ? layer.length : 0).replace(/^·+/, '');
    const { line, loc: _, ...rest } = e;
    const c = CATS[e.cat];
    out.push({ ...rest, layer, place, grp: c.g, ch: c.ch, color: c.color, rare: c.rare, text: e.text.slice(0, 60), src: (e.src || c.src || '').slice(0, 20) });
    if (out.length >= MAX_PER_FLOOR) break;
  }
  return out;
}

/** 最近若干楼 [{floor, text}]（按楼层升序）→ 合并后的事件列表（新的在前）。now = 最新楼层号 */
export function collect(msgs, now) {
  const open = new Map(), done = [];
  for (const { floor, text } of msgs) {
    for (const e of parseMarks(text)) {
      const key = e.code ? '#' + e.code : e.cat + '|' + e.layer + '|' + e.place;
      const cur = open.get(key);
      if (cur && floor - cur.last <= MERGE_WINDOW) {
        cur.last = floor; cur.count++; cur.text = e.text || cur.text; cur.src = e.src || cur.src;
        for (const k of ['status', 'time', 'scope', 'dur', 'xy']) if (e[k]) cur[k] = e[k];
        if (e.lvl === 0) { cur.closed = true; cur.lvl = 0; done.push(cur); open.delete(key); } else { cur.lvl = e.lvl; }
      } else if (e.lvl > 0) {
        if (cur) done.push(cur);
        open.set(key, { id: hash(key + '#' + floor), key, ...e, first: floor, last: floor, count: 1, closed: false });
      }
    }
  }
  const all = [...done, ...open.values()].map(e => ({ ...e, tier: tierOf(now - e.last, e.closed) })).filter(e => e.tier);
  return all.sort((a, b) => b.last - a.last || b.lvl - a.lvl);
}
export function tierOf(age, closed) {
  if (age > AGE.fade) return '';
  if (closed) return age <= AGE.after ? 'after' : 'fade';
  return age <= AGE.live ? 'live' : age <= AGE.after ? 'after' : 'fade';
}

/** 当前地点（MVU 世界.当前地点）→ 所在层；认不出返回 '' */
export function layerOf(here) {
  if (!here) return '';
  const s = String(here);
  for (const l of LAYERS) if (s.includes(l)) return l;
  if (/伊甸|庄园|悬浮岛|银冠|骑士团|上城/.test(s)) return '上层';
  if (/井|地基|血肉磨坊|施粥|灰票|下城/.test(s)) return '下层';
  if (/霓虹|执法局总局|大教堂|星渊|议会|检查点|中城/.test(s)) return '中层';
  if (/圣都|原域|旷野|大陆/.test(s)) return '天城外';
  return '';
}

/** 注入给模型的一句话：只说角色所在层的活跃事件；没有就返回 '' */
export function summarize(items, hereLayer, maxLen = 80) {
  if (!hereLayer) return '';
  const live = items.filter(e => e.layer === hereLayer && e.tier === 'live' && !e.closed).slice(0, 2);
  if (!live.length) return '';
  let s = live.map(e => `${e.layer}${e.place ? '·' + e.place : ''}：${e.src ? e.src + '通报' : ''}${e.cat}${e.lvl >= 3 ? '（严重）' : ''}${e.text ? '，' + e.text : ''}`).join('；');
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return `[天城事态·仅背景，不要求提及，已标记的事件勿重复标记] ${s}。`;
}
