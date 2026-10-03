// 查看器「起没起来」的看门狗（F-TT；docs/extension-study.md §5 的缺陷）。
//
// 背景：查看器文档靠一堆子资源启动（模块图、设定包数据、瓦片库脚本）。任何一个请求永远不回来，
// DOMContentLoaded 就不触发，app/boot.mjs 的启动函数根本不跑，界面只停在「加载中…」——地图不出图，
// 而且不报错（Mac TauriTavern 的 WKWebView 上实测：某个镜像只回响应头不回响应体，瓦片库脚本与
// 设定包数据各卡掉一次，45 秒内一条 eden-map:boot 都没有）。所以宿主不能只看「文档挂上了」，
// 还要看它有没有真的开始说话：启动消息没来就重挂一次，再不行换镜像域名重挂。
//
// 这里只有判定与调度，没有 DOM、没有计时器之外的副作用，node 单测直接测（tests/viewer_boot.test.mjs）。

/** 挂上之后多久还没有启动消息就算卡住（毫秒）。冷缓存下查看器从挂上到 DOMContentLoaded 约 2–8 秒。 */
export const BOOT_WAIT_MS = 15000;
/** 最多换几个镜像域名（每次都是「同域名重挂」或「换域名重挂」之后的一次等待）。 */
export const MAX_HOPS = 3;
/** 仓库的 gh 镜像域名：换域名时按这个顺序轮，转一圈。线路表（tavern/host-routes.mjs）管的是「用户选的线路」，
 *  这里管的是「卡住之后往哪儿挪」，两件事分开：线路是偏好，这里是兜底。 */
export const MIRROR_HOSTS = ['cdn.jsdelivr.net', 'cdn.jsdmirror.com', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net',
  'testingcf.jsdelivr.net', 'cdn.statically.io'];

/** 换域名后的地址列表：从当前域名的下一个开始，绕一圈，最多 max 个。只认 gh 镜像路径
 *  （…/gh/<仓库>@<版本>/map/）；本地服务、npm 线路的路径形状不同，换域名只会取不到东西，所以返回空。 */
export function hopBases(base, hosts = MIRROR_HOSTS, max = MAX_HOPS) {
  let u;
  try { u = new URL(base); } catch (e) { return []; }
  if (!/\/gh\/[^/]+\/[^/]+\/map\/$/.test(u.pathname)) return [];   // …/gh/<主>@<仓库>@<版本>/map/
  const list = hosts.filter(Boolean), cur = u.host, at = list.indexOf(cur);
  const order = at < 0 ? list : [...list.slice(at + 1), ...list.slice(0, at)];
  return order.filter(h => h !== cur).slice(0, Math.max(0, max)).map(h => { const v = new URL(u.href); v.host = h; return v.href; });
}

/**
 * 看门狗本体。宿主在挂上查看器之后 arm()，收到查看器的任何消息 saw()（停表，并把这一轮的次数清零：
 * 下次挂上重新给满额度），时间到没人说话就 onStall(第几次, 下一个地址或 null) + onMount(下一个地址或 null) 重挂。
 * 第一次重挂留在同一个域名（可能只是那一次请求丢了），之后依次换镜像域名；域名换完只通报，不再自己挂，
 * 把出路留给界面上的「重试 / 换线路」按钮。setTimer / clearTimer 由调用方注入，node 单测用假的。
 */
export function createBootWatchdog({ base, onStall, onMount, waitMs = BOOT_WAIT_MS, maxHops = MAX_HOPS,
  hosts = MIRROR_HOSTS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let t = 0, i = 0, rounds = 0, live = false, plan = null, from = null, mounted = null;
  const stop = () => { clearTimer(t); t = 0; live = false; };
  const fire = () => {
    if (!live) return;
    stop();
    const cur = base?.() ?? '';
    if (cur !== mounted && cur !== from) { from = cur; plan = [null, ...hopBases(cur, hosts, maxHops)]; i = 0; rounds += 1; }   // 不是看门狗自己换的（首次或用户换了线路）：重排一张顺序表
    i += 1;
    if (rounds > 2 || i > plan.length) { onStall?.(i, null); return; }   // 域名换完了：只通报，把出路留给界面
    onStall?.(i, plan[i - 1]);
    mounted = plan[i - 1] ?? cur; onMount?.(plan[i - 1]);   // null = 同一个域名重挂
  };
  return { arm() { stop(); live = true; t = setTimer(fire, waitMs); }, saw() { i = 0; stop(); }, stop, fire, get tries() { return i; } };
}
