// 加载线路（GitHub 仓库线路；npm 表是封存备选）与版本识别：纯计算，不碰 DOM、不持有状态（C2 第 4 步从 eden-map.js 拆出，行为不变）。
// 当前选中的线路（line / BASE / 页面缓存）与线路选择界面仍在入口 eden-map.js：它们和查看器的加载 / 卸载绑在一起。
import { cdnFetch } from './host-tavernhelper.mjs';
import { createPkgs } from './pkg-bases.mjs';
import { parseScriptBase, refKind } from './follow-pin.mjs';

/** 线路分数：字节 / 毫秒（读得越多、越快，分越高）。纯函数，测试直接断言。 */
export function lineScore(bytes, ms) { return (bytes > 0 && ms > 0) ? bytes / ms : 0; }

/** 分数 → 人话速度（MB/s），给线路选择器显示用。 */
export function scoreText(score) { return (Math.max(0, score) * 1000 / 1048576).toFixed(2) + ' MB/s'; }

/** 有效测量的字节下限：低于它就当没测到（缓存命中 / 错误页 / 空响应都不该拿来比快慢）。 */
export const PROBE_MIN_BYTES = 32 * 1024;

/** 一次测量的判定（纯函数，测试直接断言）。reason: '' | 'small'。 */
export function probeVerdict(bytes, ms, minBytes = PROBE_MIN_BYTES) {
  if (!(bytes > 0) || bytes < minBytes) return { ok: false, score: 0, reason: 'small' };
  return { ok: true, score: lineScore(bytes, ms), reason: '' };
}

/** 引擎自己的 npm 包（清单 cdn.npm 写了别的就用它；不是任何卡的名字）。包的清单与代码一起发，所以名字是常量。 */
export const ENGINE_PKG = 'eden-map-engine';

/** 引擎自己的仓库：「关于」面板与自检的更新检查走它（清单 cdn.repo 写了别的就用别的）。仓库名也是线路地址的默认值（清单 cdn.repo 优先）。 */
export const ENGINE_REPO = 'kcgoofee-jpg/my-tavern-experiments';

/** 主线路表（DIST-3 / docs/delivery.md §3）：一个仓库、按提交号或标签钉死，换线路只换 host 前缀，路径结构完全一致。
 *  顺序 = 优先级：国内镜像 jsdmirror → 官方 jsDelivr → fastly（fastly 是独立缓存层，官方抽风时是第三条真线路）。
 *  statically.io 与 raw.githubusercontent 实测出局：前者 30 s 只回 32 KB、跨源重定向被 CORS 拒，后者模块 MIME 是 text/plain，import 直接被拒（数字在 docs/delivery.md §2）。
 *  地址里的 ref 来自脚本自己所在的地址（提交号 / 标签都不可变），所以 url 只吃 { repo, ref }。 */
export const GH_LINES = [
  { key: 'gh-cn', name: '国内镜像', name_en: 'CN mirror', short_en: 'CN', sub: 'GitHub 仓库 · jsdmirror', host: 'cdn.jsdmirror.com',
    url: ({ repo, ref }) => `https://cdn.jsdmirror.com/gh/${repo}@${ref}/map/` },
  { key: 'gh-js', name: 'jsDelivr', name_en: 'jsDelivr', short_en: 'jsDelivr', sub: 'GitHub 仓库 · jsDelivr', host: 'cdn.jsdelivr.net',
    url: ({ repo, ref }) => `https://cdn.jsdelivr.net/gh/${repo}@${ref}/map/` },
  { key: 'gh-fastly', name: 'fastly', name_en: 'fastly', short_en: 'fastly', sub: 'GitHub 仓库 · fastly', host: 'fastly.jsdelivr.net',
    url: ({ repo, ref }) => `https://fastly.jsdelivr.net/gh/${repo}@${ref}/map/` },
];

/** 备选线路表（§4，封存不删）：仓库约 1 GB，仓库型 CDN 撑不住时（2026-10-03）改成 npm 包的写法，代码留着零维护成本；
 *  只有脚本本身从 npm 地址加载（路径里带版本号）时才会用到它。npm 从未发布（用户 2026-10-04：不做 npm）。
 *  npmmirror 的 unpkg files 服务只对白名单开放（cnpm/unpkg-white-list），新包必然 451/403、自动落选，等白名单下来自动生效（RESULT DIST-2）。 */
export const NPM_LINES = [
  { key: 'npm-cn', name: '国内镜像', name_en: 'CN mirror', short_en: 'CN', sub: 'npm 包 · npmmirror', host: 'registry.npmmirror.com',
    url: ({ pkg, ver }) => `https://registry.npmmirror.com/${pkg}/${ver}/files/map/` },
  { key: 'npm-js', name: 'jsDelivr', name_en: 'jsDelivr', short_en: 'jsDelivr', sub: 'npm 包 · jsDelivr', host: 'cdn.jsdelivr.net',
    url: ({ pkg, ver }) => `https://cdn.jsdelivr.net/npm/${pkg}@${ver}/map/` },
  { key: 'npm-unpkg', name: 'unpkg', name_en: 'unpkg', short_en: 'unpkg', sub: 'npm 包 · unpkg', host: 'unpkg.com',
    url: ({ pkg, ver }) => `https://unpkg.com/${pkg}@${ver}/map/` },
];

/** 认得的线路域名：在这几个域名下、且认得出版本号，才谈得上换线。 */
const CDN_HOST = /(^|\.)(jsdelivr\.net|jsdmirror\.com|unpkg\.com|npmmirror\.com|statically\.io)$/;   // F-TT：跟着引导脚本可能从任何 gh 镜像加载入口（用户手改过HOSTS 的就有 statically.io）

/** scriptBase = 宿主脚本所在的 .../map/；PACK_IN = 设定包注入（可空）；manifest = 包清单（对象或 Promise，内置的第一个包由宿主取来；没有 = 只剩本地线路）
 *  线路表来自清单 cdn.npm：写别的包名就用它（引擎包默认 ENGINE_PKG）。 */
export function createRoutes({ scriptBase, PACK_IN, manifest, fetchJSON, line }) {
  const cdn = PACK_IN?.manifest?.cdn || (manifest && typeof manifest.then !== 'function' ? manifest.cdn : null);
  const PKG = cdn?.npm || ENGINE_PKG, REPO = cdn?.repo || ENGINE_REPO;   // REPO 给「关于」面板与自检（更新检查走仓库），线路本身不用它
  // 版本号：npm 线路路径里有三种写法（jsDelivr/unpkg 的 <包>@<版本>、npmmirror 的 <包>/<版本>/files），
  // 仓库线路路径里是标签（map-v<版本> 或 map-s<n>-v<版本>，系列 1 记成 'S2:0.1.0'）。规则见 docs/versioning.md（selfcheck.mjs tagOf 同一套）。
  const plainVer = v => (v ? String(v).replace(/^S\d+:/, '') : v);   // npm 版本号里没有系列前缀（S2:0.1.0 → 0.1.0；系列在包名外由 VERSION 决定）
  const VER = (() => {
    const t = scriptBase.match(/@map-(?:s(\d+)-)?v([\d.]+)\//);
    if (t) return t[1] && +t[1] > 1 ? `S${+t[1]}:${t[2]}` : t[2];
    const a = scriptBase.match(/@([\d][\d.]*)\//);            // …/npm/<包>@0.9.7/map/ 或 unpkg.com/<包>@0.9.7/
    if (a) return a[1];
    const b = scriptBase.match(new RegExp(`/${PKG}/([\\d][\\d.]*)/files/`));   // registry.npmmirror.com/<包>/0.9.7/files/map/
    return b ? b[1] : null;
  })();
  const tagOf = v => { const m = /^S(\d+):(.+)$/.exec(v); return m && +m[1] > 1 ? `map-s${+m[1]}-v${m[2]}` : 'map-v' + (m ? m[2] : v); };
  // 线路表按脚本自己所在的地址形状选：仓库型（…/gh/<仓库>@<提交号或标签>/map/）走 GH_LINES，换的只是 host；
  // npm 型（路径里带版本号）走封存的 NPM_LINES。分支名地址（@preview）不列进线路表：每条 CDN 对分支名的缓存不一样，
  // 换了 host 可能换内容（docs/branching.md），这种地址照旧用脚本自己所在的地方，只由加载器按提交号重载。
  const GH = parseScriptBase(scriptBase), ghKind = GH ? refKind(GH.ref) : '';
  const ghOk = ghKind === 'sha' || ghKind === 'tag';
  const npmOk = !ghOk && !!VER && CDN_HOST.test(new URL(scriptBase).host);   // 认得出版本号、又在 CDN 域名下，才谈得上换 npm 线路
  const swappable = ghOk || npmOk;
  const LINES = ghOk ? GH_LINES : npmOk ? NPM_LINES : [];
  const lineCtx = ghOk ? { repo: GH.repo, ref: GH.ref } : { pkg: PKG, ver: plainVer(VER) };
  const LINE_KEY = 'edenMapLine';
  // 这条线路上「包名 → 包地址」：npm 线路每个包一个地址；仓库线路整个仓库就在同一个根下，跨包索引不参与（底图、模型照旧按 <base> 取）
  const pkgBases = (key, index) => {
    if (ghOk) return {};
    const l = LINES.find(x => x.key === key) || LINES[0];
    if (!l) return {};
    const names = new Set([PKG]);
    for (const [, pkg] of index?.prefixes || []) names.add(pkg);
    return Object.fromEntries([...names].map(n => [n, l.url({ ...lineCtx, pkg: n })]));
  };
  // 存下来的线路键可能来自旧版本（0.9.x 的 vpn / cn、DIST-2 的 npm-*），
  // 表里没有就退回第一条，不能让它把base 变成 undefined——那会让整张地图都取不到东西。
  const baseFor = key => {
    if (!swappable) return scriptBase;
    const l = LINES.find(x => x.key === key) || LINES[0];
    return l ? l.url(lineCtx) : scriptBase;
  };
  // ---- 测速（2026-09-29 重做）----
  // 老实现：所有线路同时取 data/build.json（约 400 B，还带 ?probe= 绕缓存），**谁先答完谁胜出**，
  // 中选后钉 24 小时。两个毛病：① 它测的是「一个小 JSON 的往返」，测不出带宽——真正吃流量的瓦片一个没测；
  // ② 几十毫秒的偶然差就能定胜负，可能选中一条实际很慢、甚至直连不可用的镜像，而且选中后 24 小时不再重测。
  // 用户 2026-09-29 实测（本机 Mac 关代理）国内镜像不可用、并直说「测速有问题」，就是这两条。
  // 现在：按**真读完响应体的字节数 / 毫秒**算分；响应小于下限算无效测量（缓存命中 / 错误页 / 空响应）；
  // 换线要有意义（新线路至少快 30% 才换——换线要重载瓦片，还可能撞上镜像的旧缓存）。
  // 测速读哪个文件：包清单 data.maps（105 KB 级，每条线路都有，够大能量出带宽）；拿不到清单就取引擎的英文词典
  const PROBE_FALLBACK = 'i18n/en.json', manP = Promise.resolve(PACK_IN?.manifest ?? manifest ?? null).catch(() => null);
  const probePath = async () => { const m = await manP, p = m?.data?.maps; return typeof p === 'string' && p ? (PACK_IN ? 'packs/' + PACK_IN.id + '/' : '') + p : PROBE_FALLBACK; };
  const PROBE_TIMEOUT = 8000;             // 8 s 没读完 = 这条线路不通
  const PROBE_MARGIN = 1.3;               // 至少快 30% 才值得换线
  const nowMs = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

  async function measure(key) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), PROBE_TIMEOUT);
    const t0 = nowMs();
    try {
      const r = await cdnFetch(baseFor(key) + await probePath() + '?probe=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw 0;
      const buf = await r.arrayBuffer();        // 必须真把响应体读完：只等到响应头测的是 TTFB，不是速度
      const ms = nowMs() - t0, bytes = buf.byteLength;
      return { key, bytes, ms, ...probeVerdict(bytes, ms) };
    } catch (e) {
      return { key, ok: false, bytes: 0, ms: nowMs() - t0, score: 0, reason: 'fail' };
    } finally { clearTimeout(to); }
  }
  const probe = measure;   // 旧名保留

  // 所有线路同时测，按分数挑最好的；都比不出结果就返 null（调用方保持原线 / 报不可达）。
  // current：当前在用的线路——它没输给对手 30% 以上就不换（避免为一点噪声来回跳线）。
  // 每次竞速的逐条结果留在 lastRace：调用方要据此给用户一句「有线路连不上，已自动换到 X」（COPY-1：报错可行动）。
  const LINE_TTL = 24 * 3600e3, LINE_AT = LINE_KEY + 'At';
  let lastRace = [];
  async function race(current) {
    const rows = await Promise.all(LINES.map((l) => measure(l.key)));
    lastRace = rows;
    const good = rows.filter((r) => r.ok).sort((a, b) => b.score - a.score);
    if (!good.length) return null;
    const best = good[0];
    const cur = current ? rows.find((r) => r.key === current && r.ok) : null;
    if (cur && cur.key !== best.key && best.score < cur.score * PROBE_MARGIN) return cur.key;
    return best.key;
  }
  const deadLines = () => lastRace.filter((r) => !r.ok).map((r) => r.key);
  // 跨包资源表：只有 npm 线路需要（底图与三维模型在各自的包里）；仓库线路里全仓库同一个根，PKGS 停用，页面照旧按 <base> 与美术根取
  const PKGS = createPkgs({ fetchJSON, base: () => baseFor(line()), line, lines: LINES, swappable, crossPkg: npmOk, enginePkg: PKG, pkgBases });
  return { PKG, REPO, PKGS, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, pkgBases, LINE_TTL, LINE_AT,
    probePath, PROBE_MIN_BYTES, PROBE_TIMEOUT, PROBE_MARGIN, measure, probe, race, deadLines };
}
