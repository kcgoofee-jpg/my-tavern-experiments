// 查看器「起没起来」的看门狗（F-TT；docs/extension-study.md §5.1 的缺陷）。
//
// 背景：查看器文档靠一堆子资源启动（模块图、设定包数据、瓦片库脚本）。任何一个请求永远不回来，
// DOMContentLoaded 就不触发，app/boot.mjs 的启动函数根本不跑，界面只停在「加载中…」——地图不出图，
// 而且不报错（Mac TauriTavern 的 WKWebView 上实测：某个取件域名只回响应头不回响应体，瓦片库脚本与
// 设定包数据各卡掉一次，45 秒内一条 eden-map:boot 都没有）。所以宿主不能只看「文档挂上了」，
// 还要看它有没有真的开始说话：启动消息没来就重挂一次，再不行换一条线路重挂。
//
// 「换到哪儿」由调用方给（alts()：拿引擎自己的线路表排出下一批地址）。这里不写死任何域名：
// 取件方式换过一次（仓库型 CDN → npm 包），写死的名单就会变成指向不存在路线的死代码。
//
// 这里只有判定与调度，没有 DOM、除了计时器没有副作用，node 单测直接测（tests/viewer_boot.test.mjs）。

/** 挂上之后多久还没有启动消息就算卡住（毫秒）。冷缓存下查看器从挂上到 DOMContentLoaded 约 2–8 秒。 */
export const BOOT_WAIT_MS = 15000;
/** 卡住之后最多换几条线路（不含第一次「同一个地址重挂」）。 */
export const MAX_HOPS = 3;

/** 这一轮按什么顺序重挂：先在同一个地址重挂一次（可能只是那一次请求丢了），再依次换线路。 */
export function bootPlan(alts, maxHops = MAX_HOPS) {
  const list = (Array.isArray(alts) ? alts : []).filter(Boolean).slice(0, Math.max(0, maxHops));
  return [null, ...list];
}

/** 从当前线路往后轮，最多 max 条，不含自己（换哪条由调用方的线路表决定，这里不写死任何域名）。 */
export function rotateKeys(keys, current, max = MAX_HOPS) {
  const list = (Array.isArray(keys) ? keys : []).filter(Boolean), at = list.indexOf(current);
  const order = at < 0 ? list : [...list.slice(at + 1), ...list.slice(0, at)];
  return order.filter(k => k !== current).slice(0, Math.max(0, max));
}

/**
 * 看门狗本体。宿主在挂上查看器之后 arm()，收到查看器的任何消息 saw()（停表，并把这一轮的次数清零：
 * 下次挂上重新给满额度），时间到没人说话就 onStall(第几次, 下一个地址或 null) + onMount(下一个地址或 null) 重挂。
 * 地址换完只通报，不再自己挂，把出路留给界面上的「重试 / 换线路」按钮。setTimer / clearTimer 由调用方注入，
 * node 单测用假的。
 */
export function createBootWatchdog({ base, alts, onStall, onMount, waitMs = BOOT_WAIT_MS, maxHops = MAX_HOPS,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let t = 0, i = 0, rounds = 0, live = false, plan = null, from = null, mounted = null;
  const stop = () => { clearTimer(t); t = 0; live = false; };
  const fire = () => {
    if (!live) return;
    stop();
    const cur = base?.() ?? '';
    if (cur !== mounted && cur !== from) { from = cur; plan = bootPlan(alts?.(cur), maxHops); i = 0; rounds += 1; }   // 不是看门狗自己换的（首次或用户换了线路）：重排一张顺序表
    i += 1;
    if (rounds > 2 || i > plan.length) { onStall?.(i, null); return; }   // 线路换完了：只通报，把出路留给界面
    onStall?.(i, plan[i - 1]);
    mounted = plan[i - 1] ?? cur; onMount?.(plan[i - 1]);   // null = 同一个地址重挂
  };
  return { arm() { stop(); live = true; t = setTimer(fire, waitMs); }, saw() { i = 0; stop(); }, stop, fire, get tries() { return i; } };
}
