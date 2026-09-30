// The variable trees (stat_data) the tavern tests and the two recorded sessions feed to the roster, location, clock and outfit readers: the literals of the tests that exercise them,
// the recorded sessions' own state, and two trees shaped like the first pack's card (docs/card-digest.md §8). Shared by tests/vars_roster_shadow.test.mjs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
export const FALLBACK = J('map/data/fallback_roster.json').members;

const card = {   // the card's own shape (real table names, field names, value kinds)
  世界: { 当前日期: '新历2088年01月01日', 当前时刻: '21:40', 当日时段: '就寝', 当前地点: '伊甸庄园·书房' },
  主角: { 着装: { 衣服: '白衬衫', 裤子: '深色长裤', 鞋子: '皮鞋' }, 当前调教玩法: '无', 庄园声望: 50 },
  已收服母畜: {
    绫濑遥: { 身份: '伊甸庄园女仆长', 母畜等级: 'S', 母畜值: 72, 母畜代号: '青鸟', 社会身份: '女仆长', 身高: 168, 体重: 52, 外界知情: false, 项圈: '银链' },
    苍穹: { 身份: '骑士团战斗修女，代号「天灾」', 母畜等级: 'B', 母畜值: 15.5, 社会身份: '修女', 外界知情: true, 战力: '天灾级' },
    新人: { 身份: '超凡三阶的影卫', 母畜等级: 'D', 母畜值: '40', 身高: '170' },
  },
  在场人物: { 绫濑遥: { 身份: '女仆长', 位置: '伊甸庄园·书房' }, 访客: { 身份: '商人' } },
  狩猎清单: { 某乙: { 身份: '议员', 等级: 'A', 特点: 'x', 狩猎阶段: '试探' }, 某丙: { 身份: '学者', 等级: 'B', 狩猎阶段: '锁定' } },
};
const cardOld = JSON.parse(JSON.stringify(card)); delete cardOld.在场人物;

export const CORPUS = {
  card, cardOld,
  adapter: { 世界: { 当前地点: '甲地', 当前时刻: '08:00', 当日时段: '日间', 当前日期: 'x' }, 主角: { 着装: { 衣服: 'a' } } },
  other: { world: { location: 'Town', time: '09:30', date: 'd1' }, hero: { outfit: 'coat', reputation: 40 }, present: { Ann: { role: 'guide' } } },
  details: { 世界: { 当前地点: 'x' }, 主角: {}, 表一: { 甲: { 社会身份: '讲师', 园丁代号: '青鸟', 身高: 168, 体重: 52, 外界知情: false, 项圈: '银链' } } },
  details2: { 世界: {}, 主角: {}, 名册: { 乙: { 身份: '园丁', 代号: 'K', height: '170', 饰物: '胸针' } } },
  tierRow: { 世界: {}, 主角: {}, 表: { 甲: { 战力: '超凡二阶' } } },
  tierScan: { 世界: {}, 主角: {}, 表: { 甲: { 身份: '天灾级战力' }, 乙: { 身份: '骑士团战斗修女，代号「天灾」' }, 丙: { 身份: '超凡 5 阶' }, 丁: { 身份: '一个普通人家的孩子' } } },
  stats: { 世界: { 当前地点: 'x' }, 主角: { 声望: 5 }, 表一: { 甲: { 身份: '园丁', 级别: 'B', 数值: 72 }, 乙: { 身份: '厨师', $meta: 1 } }, 表二: { 丙: { 身份: '商人', 进度: '二' } } },
  statsOwn: { 世界: {}, 主角: {}, 表一: { 甲: { 身份: 'a', 园丁等级: 'S', 园艺值: 30, 身高: 170 } } },
  roster: { 世界: { 当前地点: '甲地' }, 主角: { 声望: 62, 着装: {} }, 表一: { 甲: { 身份: '园丁', 等级: 'B' } }, 在场人物: { 乙: { 身份: '访客' } }, 表三: { 丙: { 身份: '商人', 进度: '第二步' }, 丁: { 身份: ['学者', '说明'], 进度: '第一步' } } },
  rosterNew: { 世界: {}, 主角: {}, 表一: { 绫濑遥: { 身份: '女仆长（剧情版）' }, 新人: { 身份: '新加入' } } },
  maids: { 世界: { 当前地点: '书房' }, 主角: { 着装: {} }, 女仆名册: { 绫濑遥: { 身份: '女仆长' } }, 训练目标: { 某乙: { 身份: 'x', 阶段: '二阶' } } },
  empty: { 世界: {}, 主角: {} },
  chars: { 世界: { 当前地点: 'x' }, 在场人物: { 米拉: { 身份: '向导' } }, 角色: { 卡尔: { 位置: '上层·银冠堡' }, 空: 3 } },
  items: { 物品: { 钥匙: { 位置: '中层' } }, 势力: { 骑士团: { 所在地: '上层' } } },
  tracked: { 追踪: { 甲: { 身份: '商人', 位置: '中层' } } },
  presentMix: { 世界: { 当前地点: '书房' }, 在场人物: { 甲: { 位置: '中层·霓虹街' }, 乙: { 身份: 'x' }, 丙: '一句描述' } },
  presentArr: { 在场人物: ['安娜', { 名字: '乙', 位置: '下层·7号井' }, { name: 'C' }] },
  presentStr: { 在场角色: '甲、乙,丙' },
  timeline: { 世界: { 当前地点: '执法局总局', 当前时刻: '23:40' }, 在场人物: { 维克多: {} } },
  pairs: { 世界: { 当前时刻: ['08:00', '说明'], 当前地点: ['主卧', '说明'] }, 主角: { 着装: { 衣服: ['制服', '说明'], 裤子: '待初始化' } } },
  nothing: {}, nul: null,
};
for (const f of ['session_a.json', 'session_b.json']) {
  const snap = J('tests/fixtures/sessions/' + f);
  CORPUS[f.replace('.json', '')] = snap.mvu.stat;
  for (const [fl, st] of Object.entries(snap.mvu.floors || {})) CORPUS[`${f.replace('.json', '')}_f${fl}`] = st;
}
