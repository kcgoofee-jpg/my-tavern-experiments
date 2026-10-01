// 数据文件只取一次（S5-2 自 util.mjs 拆出）：切换地图、面板休眠后唤醒都不再重复请求。
export const jsonCache = new Map();
// 失败不缓存（2026-09-27 接手 review P0/P1）：以前失败会存一个 resolved null —— maps.json 抖一次，
// 整页就永远停在「加载中…」、所有按钮没有监听；单张地图的点位数据失败也会整个会话都取不回来。
export const getJSON = url => {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(v => { if (v == null) jsonCache.delete(url); return v; }));
  return jsonCache.get(url);
};
