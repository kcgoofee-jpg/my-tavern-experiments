// 版本信息与检查更新（P2 解耦：从 eden-map.js 拆出来的宿主胶水，行为不变）。
// 入口里原来这一段混着取数、发消息、分支识别、跟随分支比较四件事；现在全部由调用方注入（deps），
// 本模块只管编排——node 单测喂桩即可覆盖（tests/host_about.test.mjs），不需要浏览器与真实 CDN。
//
// 三个出口的形状与原来逐字一致：
//   sendAbout()    → post({ type: 'eden-map:about', ... })（设置「更新与版本」页的数据来源）
//   checkUpdate()  → { status, ... } 正式版标签比对（只报告不安装）
//   followUpdate() → { status, follow: true, ... } 跟随分支头指针比对
// 取不到 / 超时一律降级为 { status: 'fail' }，不抛——检查更新不是主流程。

/** deps：{ cdnFetch, post, base(), REPO, scriptBase, VER, tagOf, LINES, swappable, SCRIPT,
 *    lineKey(), lang(), followHead(), followNewer(h), loadSelfcheck(), loadSources() } */
export function createAbout(d = {}) {
  const {
    cdnFetch = async () => null, post = () => {}, base = () => '', REPO = '', scriptBase = '', VER = null,
    tagOf = (v => v), LINES = [], swappable = false, SCRIPT = {},
    lineKey = () => '', lang = () => 'zh',
    followHead = async () => null, followNewer = () => false,
    loadSelfcheck = async () => null, loadSources = async () => null,
  } = d;

  /** 脚本地址里钉的 ref（@<ref>/map/）；正式版脚本按烘焙信息走，这里只作兜底 */
  const refOf = () => (String(scriptBase).match(/@([^/]+)\/map\/$/) || [])[1] || '';
  /** tag = 正式版标签；ref = 跟随分支（可换线路）；local = 本地 / 旧脚本 */
  const channel = () => SCRIPT.channel || (VER ? 'tag' : swappable ? 'ref' : 'local');

  let aboutBuild = null;
  const buildNow = () => aboutBuild ??= cdnFetch(base() + 'data/build.json?t=' + Date.now(), { cache: 'no-store' })
    .then(r => (r && r.ok ? r.json() : null)).catch(() => null);

  async function sendAbout() {
    const b = await buildNow(), l = LINES.find(x => x.key === lineKey());
    const dataSourceRegistryModule = await loadSources().catch(() => null);
    const br = dataSourceRegistryModule ? (dataSourceRegistryModule.branchOf(SCRIPT.ref) || dataSourceRegistryModule.branchOf(refOf()) || (VER ? 'main' : null)) : null;
    const en = lang() === 'en';
    post({
      type: 'eden-map:about', version: b?.version || SCRIPT.version || VER || null, code: b?.code || SCRIPT.code || null,
      channel: channel(), ref: SCRIPT.ref || (VER ? tagOf(VER) : refOf()), sha: SCRIPT.sha || null,
      build: Number.isInteger(SCRIPT.build) ? SCRIPT.build : null, source: SCRIPT.source || null, locked: !!SCRIPT.locked,
      line: l ? (en && l.name_en) || l.name : '', branch: br, branches: dataSourceRegistryModule ? dataSourceRegistryModule.BRANCHES : [],
      branchSw: !!dataSourceRegistryModule?.branchUrl(scriptBase || '', 'main'),
    });
  }

  /** 跟随分支：设置里「检查更新」走 head.json 链（与加载器、followCheck 同源；不看正式版标签） */
  async function followUpdate() {
    const h = await followHead();
    if (!h) return { status: 'fail', follow: true };
    return { status: followNewer(h) ? 'new' : 'latest', follow: true, build: h.build, sha: String(h.sha).slice(0, 12), source: h.source, cur: SCRIPT.build ?? null };
  }

  /** 正式版：查最新 map-v 标签（jsDelivr 数据接口，绕缓存），再取该标签的 build.json；比较后只报告 */
  async function checkUpdate() {
    try {
      const SC = await loadSelfcheck();
      if (!SC) return { status: 'fail' };
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const to = setTimeout(() => ctl?.abort(), 10000);
      const j = await cdnFetch(SC.UPDATE_API(REPO) + '?t=' + Date.now(), { cache: 'no-store', signal: ctl?.signal })
        .then(r => (r && r.ok ? r.json() : null)).finally(() => clearTimeout(to));
      const latest = SC.latestTag(j);
      if (!latest) return { status: 'fail' };
      const host = (LINES.find(x => x.key === lineKey()) || LINES[0] || {}).host || 'cdn.jsdelivr.net';
      const lb = await cdnFetch(`https://${host}/gh/${REPO}@${SC.tagOf(latest)}/map/data/build.json?t=${Date.now()}`, { cache: 'no-store' })
        .then(r => (r && r.ok ? r.json() : null)).catch(() => null);
      const cur = SC.buildVer(await buildNow()) || SCRIPT.version || VER;
      return { ...SC.updateVerdict(cur, latest, channel()), code: lb?.code || null, min: lb?.min_version || null,
        reason: lb?.force_reason || '', notes: `https://github.com/${REPO}/blob/${SC.tagOf(latest)}/CHANGELOG.md` };
    } catch (e) { return { status: 'fail' }; }
  }

  return { channel, buildNow, sendAbout, checkUpdate, followUpdate, refOf };
}
