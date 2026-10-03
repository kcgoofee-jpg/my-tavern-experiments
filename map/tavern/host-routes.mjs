// 加载线路（npm 包）与版本识别：纯计算，不碰 DOM、不持有状态（C2 第 4 步从 eden-map.js 拆出，行为不变）。
// 当前选中的线路（line / BASE / 页面缓存）与线路选择界面仍在入口 eden-map.js：它们和查看器的加载 / 卸载绑在一起。
import { cdnFetch } from './host-tavernhelper.mjs';
import { createPkgs } from './pkg-bases.mjs';

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

/** 线路表：仓库约 1 GB，仓库型 CDN 撑不住（2026-10-03 用户决定走 npm）。顺序 = 优先级：npmmirror → jsDelivr-npm → unpkg（Q-26）。
 *  npmmirror 排在最前是用户定的顺序；它的 unpkg files 服务只对白名单开放（cnpm/unpkg-white-list），
 *  新包一律 451/403，所以它现在必然测不过、自动落选，等白名单下来就自动生效——不用改代码（RESULT DIST-2）。
 *  每包体积上限实测 ≥ 90 MB（探针 eden-map-probe 0.0.2/0.0.3 = 45/90 MB，jsDelivr-npm 与 unpkg 都完整取回）。 */
export const NPM_LINES = [
  { key: 'npm-cn', name: '国内镜像', name_en: 'CN mirror', short_en: 'CN', sub: 'npm 包 · npmmirror', host: 'registry.npmmirror.com',
    pkgUrl: (pkg, v) => `https://registry.npmmirror.com/${pkg}/${v}/files/map/` },
  { key: 'npm-js', name: 'jsDelivr', name_en: 'jsDelivr', short_en: 'jsDelivr', sub: 'npm 包 · jsDelivr', host: 'cdn.jsdelivr.net',
    pkgUrl: (pkg, v) => `https://cdn.jsdelivr.net/npm/${pkg}@${v}/map/` },
  { key: 'npm-unpkg', name: 'unpkg', name_en: 'unpkg', short_en: 'unpkg', sub: 'npm 包 · unpkg', host: 'unpkg.com',
    pkgUrl: (pkg, v) => `https://unpkg.com/${pkg}@${v}/map/` },
];

/** 认得的线路域名：在这几个域名下、且认得出版本号，才谈得上换线。 */
const CDN_HOST = /(^|\.)(jsdelivr\.net|jsdmirror\.com|unpkg\.com|npmmirror\.com|statically\.io)$/;   // F-TT：跟着引导脚本可能从任何 gh 镜像加载入口（用户手改过HOSTS 的就有 statically.io）

/** scriptBase = 宿主脚本所在的 .../map/；PACK_IN = 设定包注入（可空）；manifest = 包清单（对象或 Promise，内置的第一个包由宿主取来；没有 = 只剩本地线路）
 *  线路表来自清单 cdn.npm：写别的包名就用它（引擎包默认 ENGINE_PKG）。 */
export function createRoutes({ scriptBase, PACK_IN, manifest, fetchJSON, line }) {
  const cdn = PACK_IN?.manifest?.cdn || (manifest && typeof manifest.then !== 'function' ? manifest.cdn : null);
  const PKG = cdn?.npm || ENGINE_PKG;
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
  // 认得出版本号、又在 CDN 域名下，才开线路：版本号就是 npm 路径的必需参数（仓库分支 / 提交号没有）
  const swappable = !!VER && CDN_HOST.test(new URL(scriptBase).host);
  const LINES = swappable ? NPM_LINES : [];
  const LINE_KEY = 'edenMapLine';
  // 这条线路上「包名 → 包地址」。引擎包自己也在表里（第一个），art/props 包跟着 assets.json 的索引一起进来。
  const pkgBases = (key, index) => {
    const l = LINES.find(x => x.key === key) || LINES[0];
    if (!l) return {};
    const names = new Set([PKG]);
    for (const [, pkg] of index?.prefixes || []) names.add(pkg);
    return Object.fromEntries([...names].map(n => [n, l.pkgUrl(n, plainVer(VER))]));
  };
  const baseFor = key => {
    const l = LINES.find(x => x.key === key) || (key ? null : LINES[0]);
    return l ? l.pkgUrl(PKG, plainVer(VER)) : scriptBase;   // 认不出线路（本地 / 没选）：照旧用脚本自己所在的地方
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
  // 跨包资源表（DIST-2 / pkg-bases.mjs）：底图与三维模型在各自的包里，包地址按当前线路拼
  const PKGS = createPkgs({ fetchJSON, base: () => baseFor(line()), line, lines: LINES, swappable, enginePkg: PKG, pkgBases });
  return { PKG, PKGS, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, pkgBases, LINE_TTL, LINE_AT,
    probePath, PROBE_MIN_BYTES, PROBE_TIMEOUT, PROBE_MARGIN, measure, probe, race, deadLines };
}
