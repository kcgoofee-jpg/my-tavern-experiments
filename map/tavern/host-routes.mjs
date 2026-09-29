// 加载线路（CDN 节点）与版本推断：纯计算，不碰 DOM、不持有状态（C2 第 4 步从 eden-map.js 拆出，行为不变）。
// 当前选中的线路（line / BASE / 页面缓存）与线路选择界面仍在入口 eden-map.js：它们和查看器的加载 / 卸载绑在一起。
import { cdnFetch } from './host-th.mjs';

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

/** SELF = 宿主脚本所在的 .../map/；PACK_IN = 设定包注入（可空） */
export function createRoutes({ SELF, PACK_IN }) {
  // 线路：地图的图片和数据可以走不同的 CDN 节点。gh 线路路径格式相同，只换域名；npm 线路路径不同（包名 / 版本 / files/map/），单独拼。本地测试地址不换
  const PKG = PACK_IN?.manifest?.cdn?.npm || 'tiancheng-map-assets', REPO = PACK_IN?.manifest?.cdn?.repo || 'kcgoofee-jpg/my-tavern-experiments';
  const LINES = [
    { key: 'vpn', name: '有梯子', name_en: 'Global CDN', short_en: 'Global', sub: '官方 CDN · jsDelivr', host: 'cdn.jsdelivr.net' },
    // 2026-09-29：用户在本机 Mac 关代理实测「直连用不了」。它确实是第三方薄代理（响应头 server: ayao），
    // 不是 jsDelivr 官方节点：content 一致、返回 200，但本机走代理时也慢 3.7 倍（2.99s vs 0.80s / 105 KB），
    // 且 cache-control 只有 max-age=300 + stale-while-revalidate=86400（jsDelivr 是 7 天），
    // 还不理会 query string（见 CHANGELOG 0.9.5）——我们清缓存 / 预热那套对它不成立。
    // 保留它只为「没梯子的人还能手动试一次」，不再宣称可用；自动选线里它必须**明显更快**才会被选中。
    { key: 'cn', name: '没梯子', name_en: 'CN mirror', short_en: 'CN', sub: '国内镜像 · jsdmirror（2026-09-29 直连实测不可用）', host: 'cdn.jsdmirror.com' },
    // npm 包的国内镜像：首次 npm publish 并验证后再把 enabled 改成 true
    { key: 'npm', name: 'npm 镜像', sub: '国内 · npmmirror', enabled: false, url: v => `https://registry.npmmirror.com/${PKG}/${v}/files/map/` },
  ].filter(l => l.enabled !== false);
  const LINE_KEY = 'edenMapLine';
  const swappable = /(^|\.)(jsdelivr\.net|jsdmirror\.com|npmmirror\.com)$/.test(new URL(SELF).host);
  // 当前版本：gh 标签 map-v<版本>（系列 1）或 map-s<n>-v<版本>（系列 ≥ 2，版本写成 'S2:0.1.0'），或 npm 路径里的版本号；标签规则见 docs/versioning.md（selfcheck.mjs tagOf 同一套）
  const VER = (() => { const m = SELF.match(/@map-(?:s(\d+)-)?v([\d.]+)\//); if (m) return m[1] && +m[1] > 1 ? `S${+m[1]}:${m[2]}` : m[2];
    return (SELF.match(new RegExp(`/${PKG}/([\\d.]+)/files/`)) || [])[1] || null; })();
  const tagOf = v => { const m = /^S(\d+):(.+)$/.exec(v); return m && +m[1] > 1 ? `map-s${+m[1]}-v${m[2]}` : 'map-v' + (m ? m[2] : v); };
  const plainVer = v => (v ? String(v).replace(/^S\d+:/, '') : v);
  const baseFor = key => {
    if (!swappable || !key) return SELF;
    const l = LINES.find(x => x.key === key);
    if (l.url) return VER ? l.url(plainVer(VER)) : SELF;                    // npm 线路：需要知道版本号
    if (VER) return `https://${l.host}/gh/${REPO}@${tagOf(VER)}/map/`;
    const u = new URL(SELF); u.host = l.host; return u.href;     // 不知道版本（例如指向分支）：只换域名
  };
  // ---- 测速（2026-09-29 重做）----
  // 老实现：所有线路同时取 data/build.json（约 400 B，还带 ?probe= 绕缓存），**谁先答完谁胜出**，
  // 中选后钉 24 小时。两个毛病：① 它测的是「一个小 JSON 的往返」，测不出带宽——真正吃流量的瓦片一个没测；
  // ② 几十毫秒的偶然差就能定胜负，可能选中一条实际很慢、甚至直连不可用的镜像，而且选中后 24 小时不再重测。
  // 用户 2026-09-29 实测（本机 Mac 关代理）国内镜像不可用、并直说「测速有问题」，就是这两条。
  // 现在：按**真读完响应体的字节数 / 毫秒**算分；响应小于下限算无效测量（缓存命中 / 错误页 / 空响应）；
  // 换线要有意义（新线路至少快 30% 才换——换线要重载瓦片，还可能撞上镜像的旧缓存）。
  const PROBE_PATH = 'data/maps.json';    // 105 KB，每条线路都有，够大能量出带宽
  const PROBE_TIMEOUT = 8000;             // 8 s 没读完 = 这条线路不通
  const PROBE_MARGIN = 1.3;               // 至少快 30% 才值得换线
  const nowMs = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

  async function measure(key) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), PROBE_TIMEOUT);
    const t0 = nowMs();
    try {
      const r = await cdnFetch(baseFor(key) + PROBE_PATH + '?probe=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
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
  const LINE_TTL = 24 * 3600e3, LINE_AT = LINE_KEY + 'At';
  async function race(current) {
    const rows = await Promise.all(LINES.map((l) => measure(l.key)));
    const good = rows.filter((r) => r.ok).sort((a, b) => b.score - a.score);
    if (!good.length) return null;
    const best = good[0];
    const cur = current ? rows.find((r) => r.key === current && r.ok) : null;
    if (cur && cur.key !== best.key && best.score < cur.score * PROBE_MARGIN) return cur.key;
    return best.key;
  }
  return { PKG, REPO, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, LINE_TTL, LINE_AT,
    PROBE_PATH, PROBE_MIN_BYTES, PROBE_TIMEOUT, PROBE_MARGIN, measure, probe, race };
}
