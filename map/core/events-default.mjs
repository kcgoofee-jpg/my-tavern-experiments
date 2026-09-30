// The kernel's neutral event taxonomy (docs/kernel-schema.md K-R53): what a pack with no events block shows. Groups: safety, weather, politics, society,
// conflict, disaster, people, other; a few types each; labels in zh (the base) and en (`i18n.en.label`). No pack-specific words: a pack that wants its own
// vocabulary ships an events block (its manifest's events.json, or the `events` of its overlay, K-R68).
const g = (id, label, en, color, shape) => ({ id, label, i18n: { en: { label: en } }, color, shape });
const t = (group, label, en, icon, rare, alias) => ({ label, i18n: { en: { label: en } }, group, icon, rare, ...(alias ? { alias } : {}) });

export const DEFAULT_EVENTS = Object.freeze({
  groups: [
    g('safety', '治安', 'Safety', '#3d7dff', 'square'), g('weather', '天气', 'Weather', '#7fd6ff', 'circle'), g('politics', '政治', 'Politics', '#6f9be0', 'penta'),
    g('society', '民生', 'Society', '#e8d08a', 'octa'), g('conflict', '冲突', 'Conflict', '#c2263a', 'tri-down'), g('disaster', '灾害', 'Disaster', '#ff5a2a', 'tri'),
    g('people', '人物', 'People', '#d7a6e8', 'ring'), g('other', '其他', 'Other', '#cfd8e0', 'square'),
  ],
  types: {
    patrol: t('safety', '巡逻', 'Patrol', '巡', 1, ['巡查']), checkpoint: t('safety', '检查点', 'Checkpoint', '检', 1, ['盘查', '查验']), crime: t('safety', '案件', 'Crime', '案', 2, ['盗窃', '抢劫', '通缉', '凶案']),
    storm: t('weather', '风暴', 'Storm', '风', 2, ['暴风']), rain: t('weather', '降雨', 'Rain', '雨', 1, ['下雨', '暴雨']), heat: t('weather', '高温', 'Heatwave', '热', 2), cold: t('weather', '寒潮', 'Cold snap', '寒', 2, ['骤寒']),
    policy: t('politics', '政策', 'Policy', '策', 1, ['法案', '政策变动']), election: t('politics', '选举', 'Election', '选', 2, ['改选']), meeting: t('politics', '会议', 'Meeting', '会', 1, ['听证', '会晤']),
    festival: t('society', '节庆', 'Festival', '节', 1, ['庆典', '纪念日']), market: t('society', '集市', 'Market', '集', 1, ['市集', '拍卖']), notice: t('society', '公告', 'Notice', '告', 1, ['通告', '通知']),
    clash: t('conflict', '交锋', 'Clash', '锋', 2, ['斗殴', '交火', '冲突']), riot: t('conflict', '骚乱', 'Riot', '乱', 2, ['暴动', '抗议']), standoff: t('conflict', '对峙', 'Standoff', '峙', 2), raid: t('conflict', '突袭', 'Raid', '袭', 3, ['袭击']),
    fire: t('disaster', '火灾', 'Fire', '火', 1, ['起火', '失火']), blackout: t('disaster', '停电', 'Power outage', '电', 1, ['断电']), accident: t('disaster', '事故', 'Accident', '故', 1, ['交通事故']),
    collapse: t('disaster', '坍塌', 'Collapse', '塌', 3, ['倒塌']), flood: t('disaster', '洪水', 'Flood', '洪', 3, ['积水']),
    visit: t('people', '到访', 'Visit', '访', 1, ['出席']), appearance: t('people', '露面', 'Appearance', '现', 1, ['现身']), scandal: t('people', '丑闻', 'Scandal', '丑', 3, ['曝光']),
    other: { label: '其他', i18n: { en: { label: 'Other' } }, group: 'other', icon: '!', rare: 1 },
  },
});
/** Words that close an event when they appear in its status, for a pack that lists none (`closed`). */
export const DEFAULT_CLOSED = Object.freeze(['解除', '结束', '恢复', '扑灭', '已控制', '平息', 'resolved', 'all clear']);
/** The label of the injected event line when the pack names none (`llm.templates.<lang>.tag`). */
export const DEFAULT_TAG = '地图事态';
