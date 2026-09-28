// 加载线路（CDN 节点）与版本推断：纯计算，不碰 DOM、不持有状态（C2 第 4 步从 eden-map.js 拆出，行为不变）。
// 当前选中的线路（line / BASE / 页面缓存）与线路选择界面仍在入口 eden-map.js：它们和查看器的加载 / 卸载绑在一起。
import { cdnFetch } from './host-th.mjs';

/** SELF = 宿主脚本所在的 .../map/；PACK_IN = 设定包注入（可空） */
export function createRoutes({ SELF, PACK_IN }) {
  // 线路：地图的图片和数据可以走不同的 CDN 节点。gh 线路路径格式相同，只换域名；npm 线路路径不同（包名 / 版本 / files/map/），单独拼。本地测试地址不换
  const PKG = PACK_IN?.manifest?.cdn?.npm || 'tiancheng-map-assets', REPO = PACK_IN?.manifest?.cdn?.repo || 'kcgoofee-jpg/my-tavern-experiments';
  const LINES = [
    { key: 'vpn', name: '有梯子', name_en: 'Global CDN', short_en: 'Global', sub: '官方 CDN · jsDelivr', host: 'cdn.jsdelivr.net' },
    { key: 'cn', name: '没梯子', name_en: 'CN mirror', short_en: 'CN', sub: '国内镜像 · jsdmirror', host: 'cdn.jsdmirror.com' },
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
  // 自动选线（v0.9.5 性能 P1）：所有线路同时取小文件 data/build.json（加时间戳绕过缓存），最先成功的胜出，其余请求立即取消；
  // 胜出线路记 24 小时（edenMapLineAt），过期或加载失败才重测。用户手动选过就尊重手动选择
  const LINE_TTL = 24 * 3600e3, LINE_AT = LINE_KEY + 'At';
  function probe(key, ctl) {
    const to = setTimeout(() => ctl.abort(), 6000);
    return cdnFetch(baseFor(key) + 'data/build.json?probe=' + Date.now(), { cache: 'no-store', signal: ctl.signal })
      .then(r => { if (!r.ok) throw 0; return key; }).finally(() => clearTimeout(to));
  }
  // 所有线路同时测，最先成功的胜出，其余请求立即取消；都失败 → null（原 autoLine 内联的一段）
  const race = () => { const ctls = LINES.map(() => new AbortController());
    return Promise.any(LINES.map((l, i) => probe(l.key, ctls[i]).then(k => { ctls.forEach((c, j) => { if (j !== i) c.abort(); }); return k; }))).catch(() => null); };
  return { PKG, REPO, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, LINE_TTL, LINE_AT, probe, race };
}
