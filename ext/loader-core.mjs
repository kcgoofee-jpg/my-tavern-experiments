// 扩展加载器的纯计算部分：线路表、地址拼装、head 校验、按卡开关判定、完整性判定、旗标名。
// 不放 DOM、不放网络：这一层全部能在 node 单测里跑（tests/f2_ext_loader.test.mjs）。
// 线路与版本锚点的口径和 docs/delivery.md（DIST-3）一致：单一仓库 + 按提交号钉死 + 三条 gh 线路。

export const ENGINE_REPO = 'kcgoofee-jpg/my-tavern-experiments';
export const SETTINGS_KEY = 'eden_map_ext';

export const HEAD_PATH = 'map/data/head.json';
export const INTEGRITY_PATH = 'map/data/integrity.json';
export const ADAPTER_PATH = 'map/tavern/host-adapter.mjs';
export const NATIVE_PATH = 'map/tavern/host-native.mjs';
export const ENTRY_PATH = 'map/tavern/eden-map.js';

// 双开握手旗标（docs/extension-study.md §6「两种形态能不能并存」）：
// 扩展一上来先在页面上置 EXT_INSTALLED_FLAG —— 卡内脚本的入口看到就不挂；
// 反过来，扩展挂载前查 SCRIPT_IDS_KEY —— 页面上已有活着的脚本实例就让路。
export const EXT_INSTALLED_FLAG = '__edenMapExtInstalled';
export const EXT_IMPORT_MARKER = '__edenMapExtImport';
export const SCRIPT_IDS_KEY = '__edenMapIds';

/** gh 线路表（DIST-3 §3：国内镜像 → 官方 → fastly；statically 与 raw 已剔除）。 */
export const GH_LINES = [
  { key: 'gh-cn', host: 'cdn.jsdmirror.com', name: '国内镜像' },
  { key: 'gh-js', host: 'cdn.jsdelivr.net', name: 'jsDelivr' },
  { key: 'gh-fastly', host: 'fastly.jsdelivr.net', name: 'Fastly' },
];

export const SHA_RE = /^[0-9a-f]{7,40}$/;

/** 按线路、引用（分支名或提交号）与仓库内路径拼地址。 */
export function ghUrl(host, ref, path) {
  return `https://${host}/gh/${ENGINE_REPO}@${ref}/${path}`;
}

/** head.json 的最小校验：构建号是整数、提交号形状对。 */
export function headValid(j) {
  return !!j && Number.isInteger(j.build) && SHA_RE.test(String(j.sha || ''));
}

/** 多条线路各自取回的 head：取构建号最大且形状对的一条（与引擎 branch-follow 同一口径）。 */
export function pickHead(rows) {
  let best = null;
  for (const j of rows) if (headValid(j) && (!best || j.build > best.build)) best = j;
  return best;
}

/** 设置里的线路键 → 线路对象；不认识就用第一条。 */
export function lineFor(key) {
  return GH_LINES.find(l => l.key === key) || GH_LINES[0];
}

/** 设置里的卡名列表文本 → 数组（一行一个，空行忽略）。 */
export function parseCards(text) {
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
}

/**
 * 这张卡要不要挂地图。settings.perCard 关（默认）= 所有卡都挂（与今天的全局脚本一致）；
 * 开 = 只挂在 allowedCards 里按「卡的内部名」或「角色名」点到的卡。
 * charKey = getContext().characterId，charName = getContext().name1 / 显示名。
 */
export function cardAllowed(settings, charKey, charName) {
  if (!settings || settings.perCard !== true) return true;
  const cards = Array.isArray(settings.allowedCards) ? settings.allowedCards : [];
  if (!cards.length) return false;
  return cards.some(c => String(c) === String(charKey) || (!!charName && c === charName));
}

/** 完整性清单与 head 提交号对不对得上（清单按分支取、内容按提交号钉，中间有人推新版本就是不一致）。前缀形状（12 位历史行）也算对得上。 */
export function headMatchesIntegrity(head, manifest) {
  const a = String(head?.sha || '').toLowerCase(), b = String(manifest?.head_sha || '').toLowerCase();
  if (!SHA_RE.test(a) || !SHA_RE.test(b)) return false;
  const short = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  return short.length >= 7 && long.startsWith(short);
}

/**
 * 逐文件比对：manifest.files = { 路径: sha256 }，hashes = 取回文本算出的 { 路径: sha256 }。
 * 取不回 / 算不出 / 对不上都算失败（fail closed，和清单里没这个文件一样处理）。
 */
export function integrityVerdict(manifest, hashes) {
  if (!manifest || typeof manifest.files !== 'object' || !Object.keys(manifest.files).length) {
    return { ok: false, bad: [{ path: '(manifest)', reason: 'no-manifest' }] };
  }
  const bad = [];
  for (const [path, want] of Object.entries(manifest.files)) {
    const got = hashes && hashes[path];
    if (got === undefined || got === null) bad.push({ path, reason: 'unreadable', expected: want });
    else if (String(got) !== String(want)) bad.push({ path, reason: 'mismatch', expected: want, got });
  }
  return { ok: bad.length === 0, bad };
}
