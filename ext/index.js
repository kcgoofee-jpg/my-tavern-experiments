// Eden Map 扩展加载器（F2，docs/extension-study.md §6 / §8）
// 装进 SillyTavern / TauriTavern 的第三方扩展目录：清单 manifest.json + 本目录，几十 KB。
// 引擎本体不打包进来：按 DIST-3（docs/delivery.md §3）从三条 gh 线路取「@提交号钉死」的入口，
// import 之前先对着 map/data/integrity.json 逐文件校 SHA-256，任何一处取不回 / 对不上 → 失败关死，只给一句人话。
// 宿主接口用 F1 的原生适配层（host-native.mjs，也从线路上取）替换引擎的 hostAdapter 单例——业务模块一概不动。
// 双开握手：本扩展一启动就在页面上置 __edenMapExtInstalled，卡内脚本的入口看到就不挂；
// 反向，挂载前查 __edenMapIds —— 页面上已有活着的脚本实例就让路。
// 约定与 CCST 相同：入口不静态 import 任何 ST 模块，一律 getContext()；这样全局 / 仅为我 / 插件副本三个装法都能跑。
import {
  GH_LINES, HEAD_PATH, INTEGRITY_PATH, ADAPTER_PATH, NATIVE_PATH, ENTRY_PATH, SETTINGS_KEY,
  EXT_INSTALLED_FLAG, EXT_IMPORT_MARKER, SCRIPT_IDS_KEY,
  ghUrl, pickHead, lineFor, parseCards, cardAllowed, headMatchesIntegrity, integrityVerdict,
} from './loader-core.mjs';

const FETCH_TIMEOUT = 10000;      // 与 DIST-3 加载器同一口径：10 秒没答完就换下一条线路
const VERIFY_SETTLE = 8;          // 完整性校验的并发上限（再多也只是在每域名 6 条连接上排队）

const context = () => { try { return window.SillyTavern?.getContext?.() ?? null; } catch (e) { return null; } };

function settings() {
  const c = context();
  const s = (c?.extension_settings ?? c?.extensionSettings ?? {})[SETTINGS_KEY];
  return s && typeof s === 'object' ? s : {};
}

function saveSettings(patch) {
  const c = context(); if (!c) return;
  const store = c.extension_settings ?? c.extensionSettings;
  if (!store) return;
  store[SETTINGS_KEY] = { ...(store[SETTINGS_KEY] || {}), ...patch };
  try { c.saveSettingsDebounced?.(); } catch (e) { /* 存不了也只是这次不记住 */ }
}

async function fetchText(url, timeoutMs = FETCH_TIMEOUT, cache = 'no-store') {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache, credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(to); }
}

// 分支路径上的 JSON 一律带 ?t= 绕缓存（和引擎 follow-gate 同一办法）；@提交号路径不可变，不用绕。
async function getJson(url) { try { return JSON.parse(await fetchText(url)); } catch (e) { return null; } }

function bust(url) { return url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(); }

/** 三条线路都问一遍 head，取构建号最大的（和跟随引导 resolveFollow 同一口径）。 */
async function fetchHead() {
  return pickHead(await Promise.all(GH_LINES.map(l => getJson(bust(ghUrl(l.host, 'preview', HEAD_PATH))))));
}

/** 沿线路取一个文本：优先用户钉的线路，其余按默认顺序兜底；返回 { line, text }，全部失败 text 为 null。 */
async function walkLines(path, ref, preferKey) {
  const preferred = lineFor(preferKey);
  for (const l of [preferred, ...GH_LINES.filter(x => x !== preferred)]) {
    const url = ghUrl(l.host, ref, path);
    try { return { line: l, text: await fetchText(ref === 'preview' ? bust(url) : url, FETCH_TIMEOUT, ref === 'preview' ? 'no-store' : 'default') }; } catch (e) { continue; }
  }
  return { line: preferred, text: null };
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function scriptFormActive() {
  try { const ids = window.parent?.[SCRIPT_IDS_KEY]; return !!ids && Object.keys(ids).length > 0; } catch (e) { return false; }
}

function markInstalled() { try { window[EXT_INSTALLED_FLAG] = true; window.parent[EXT_INSTALLED_FLAG] = true; } catch (e) { /* 沙箱窗口：只标本层 */ } }
function clearInstalled() { try { delete window[EXT_INSTALLED_FLAG]; delete window.parent[EXT_INSTALLED_FLAG]; } catch (e) { /* 同上 */ } }

function notice(msg) {
  let box = document.getElementById('eden-ext-notice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'eden-ext-notice';
    box.className = 'emx-notice';
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.hidden = false;
}
function clearNotice() { const box = document.getElementById('eden-ext-notice'); if (box) box.hidden = true; }

/** 逐文件取回并算哈希（并发限额内）；取不回记 null（判定层按失败关死）。 */
async function hashAll(files, line, sha) {
  const out = {};
  const queue = Object.keys(files);
  const workers = Array.from({ length: Math.min(VERIFY_SETTLE, queue.length) }, async () => {
    while (queue.length) {
      const path = queue.shift();
      try { out[path] = await sha256Hex(await fetchText(ghUrl(line.host, sha, path), FETCH_TIMEOUT, 'default')); }
      catch (e) { out[path] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

let mounted = false, mounting = false, headSha = null;

function currentCard() {
  const c = context(); if (!c) return { key: null, name: '' };
  return { key: c.characterId ?? null, name: c.characters?.[c.characterId]?.name || c.name1 || '' };
}

function wantsMap() {
  const s = settings();
  if (s.enabled === false) return false;
  const { key, name } = currentCard();
  return cardAllowed(s, key, name);
}

async function mountEngine() {
  if (mounted || mounting) return;
  mounting = true;
  try {
    if (scriptFormActive()) { notice('卡内地图脚本已经在这一页挂着，扩展这次让路；要让扩展接管，先关掉那个脚本再重开酒馆。'); return; }
    let head = await fetchHead();
    if (!head) { notice('取不到版本号（三条线路都没答话），地图没能启动。'); return; }
    headSha = head.sha;

    let manifest = null;
    const man = await walkLines(INTEGRITY_PATH, 'preview', settings().line);
    try { manifest = man.text !== null ? JSON.parse(man.text) : null; } catch (e) { manifest = null; }

    // 清单在分支上、内容按提交号钉：中间有人推新版本就短暂对不上，重取一次 head 再判。
    if (manifest && !headMatchesIntegrity(head, manifest)) {
      const fresh = await fetchHead();
      if (fresh && headMatchesIntegrity(fresh, manifest)) { head = fresh; headSha = fresh.sha; }
      else { notice('版本清单和内容对不上（可能刚推过新版本），稍后重开酒馆再试。'); return; }
    }

    const entry = await walkLines(ENTRY_PATH, headSha, settings().line);
    if (entry.text === null) { notice('地图程序取不到，三条线路都没答话，可在扩展设置里换一条线路。'); return; }
    const line = entry.line;

    const hashes = await hashAll(manifest?.files || {}, line, headSha);
    if (hashes[ENTRY_PATH] == null) hashes[ENTRY_PATH] = await sha256Hex(entry.text);
    const verdict = integrityVerdict(manifest, hashes);
    if (!verdict.ok) {
      const first = verdict.bad[0];
      notice(first.reason === 'mismatch'
        ? `地图程序完整性校验失败：${first.path} 的内容和签名清单对不上，已阻止加载。`
        : first.reason === 'no-manifest'
          ? '取不到完整性清单（签名清单），已阻止加载；可在扩展设置里换一条线路后重开酒馆。'
          : `地图程序完整性校验取不到文件：${first.path}，可在扩展设置里换一条线路后重开酒馆。`);
      console.warn('[eden-map-ext] integrity fail closed:', verdict.bad);
      return;
    }

    // 原生适配层：从同一线路取（URL 和引擎自己 import 的完全一致，才是同一个模块实例），
    // 再把 F1 的分组接口换进 hostAdapter 单例——引擎里所有 host.* 调用即刻改走酒馆原生接口。
    const { hostAdapter } = await import(ghUrl(line.host, headSha, ADAPTER_PATH));
    const { createNativeAdapter } = await import(ghUrl(line.host, headSha, NATIVE_PATH));
    Object.assign(hostAdapter, createNativeAdapter(context(), 'eden_map'));

    // 自己 import 的入口要认得「这就是扩展在挂」：临时在本窗口置 import 标记（脚本 iframe 读不到自己窗口的这个键）。
    window[EXT_IMPORT_MARKER] = true;
    try {
      await import(ghUrl(line.host, headSha, ENTRY_PATH));
      mounted = true;
      clearNotice();
    } finally {
      try { delete window[EXT_IMPORT_MARKER]; } catch (e) { /* 删不掉也只是让后续脚本误判为扩展上下文 */ }
    }
  } catch (e) {
    console.error('[eden-map-ext] mount failed:', e);
    notice('地图没能启动：' + (e && e.message ? e.message : '未知错误'));
  } finally { mounting = false; }
}

function unmountEngine() {
  if (!mounted) return;
  try { window.parent?.__edenMapCleanup?.(); } catch (e) { /* 清不干净也只是这次会话的残留 */ }
  mounted = false;
}

function onChatChanged() {
  if (wantsMap() && !mounted) mountEngine();
  if (!wantsMap() && mounted) unmountEngine();
}

function row(labelText, input) {
  const label = document.createElement('label');
  label.className = 'emx-row';
  label.append(input, document.createTextNode(' ' + labelText));
  return label;
}

function buildDrawer() {
  const container = document.getElementById('extensions_settings');
  if (!container) return false;
  const s = settings();

  const drawer = document.createElement('div');
  drawer.className = 'inline-drawer emx-drawer';
  const toggle = document.createElement('div');
  toggle.className = 'inline-drawer-toggle inline-drawer-header';
  const title = document.createElement('b');
  title.textContent = '世界地图扩展 (Eden Map)';
  toggle.appendChild(title);
  const content = document.createElement('div');
  content.className = 'inline-drawer-content';
  drawer.append(toggle, content);

  const enabledCb = document.createElement('input');
  enabledCb.type = 'checkbox';
  enabledCb.checked = s.enabled !== false;
  enabledCb.addEventListener('change', () => {
    saveSettings({ enabled: enabledCb.checked });
    if (enabledCb.checked) { markInstalled(); onChatChanged(); }
    else { unmountEngine(); clearInstalled(); }
  });
  content.appendChild(row('启用扩展（卡内脚本形态随之让路；改回脚本形态要重开酒馆）', enabledCb));

  const perCardCb = document.createElement('input');
  perCardCb.type = 'checkbox';
  perCardCb.checked = s.perCard === true;
  const cardsArea = document.createElement('textarea');
  cardsArea.className = 'emx-cards';
  cardsArea.rows = 4;
  cardsArea.placeholder = '一行一个卡名或编号';
  cardsArea.value = (s.allowedCards || []).join('\n');
  cardsArea.hidden = !perCardCb.checked;
  const cardsHint = document.createElement('div');
  cardsHint.textContent = '只在这些卡上启用（卡名或编号，一行一个）：';
  perCardCb.addEventListener('change', () => {
    saveSettings({ perCard: perCardCb.checked });
    cardsArea.hidden = !perCardCb.checked;
    onChatChanged();
  });
  cardsArea.addEventListener('change', () => {
    saveSettings({ allowedCards: parseCards(cardsArea.value) });
    onChatChanged();
  });
  content.append(row('只在选定的卡上启用', perCardCb), cardsHint, cardsArea);

  const lineSel = document.createElement('select');
  lineSel.className = 'emx-line';
  for (const l of GH_LINES) {
    const opt = document.createElement('option');
    opt.value = l.key;
    opt.textContent = `${l.name}（${l.host}）`;
    lineSel.appendChild(opt);
  }
  lineSel.value = s.line || 'gh-cn';
  lineSel.addEventListener('change', () => {
    saveSettings({ line: lineSel.value });
    notice('线路已记下；重开酒馆后按新线路加载。');
  });
  content.appendChild(row('下载线路：', lineSel));

  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'menu_button';
  reloadBtn.textContent = '重新加载地图';
  reloadBtn.addEventListener('click', () => { unmountEngine(); headSha = null; mountEngine(); });
  content.appendChild(reloadBtn);

  container.appendChild(drawer);
  return true;
}

function registerSlash() {
  const c = context();
  if (!c || typeof c.registerCommand !== 'function') return;
  try {
    c.registerCommand('edenmap', {
      isPrefix: true,
      handler: (args) => {
        const sub = String(args || '').trim().toLowerCase();
        if (sub === 'off') { unmountEngine(); return '世界地图已卸载（仅这一页）；要永久关，去扩展设置。'; }
        if (sub === 'status') return mounted ? `世界地图已挂载（@${String(headSha).slice(0, 12)}）` : '世界地图未挂载。';
        unmountEngine(); mountEngine();
        return '世界地图正在重新加载…';
      },
    });
  } catch (e) { /* 接口对不上就安静跳过 */ }
}

function boot() {
  if (settings().enabled !== false) markInstalled();
  registerSlash();
  const tryDrawer = () => { if (!buildDrawer()) setTimeout(tryDrawer, 400); };
  tryDrawer();
  const c = context();
  if (c?.eventSource && c?.eventTypes?.CHAT_CHANGED) c.eventSource.on(c.eventTypes.CHAT_CHANGED, onChatChanged);
  if (wantsMap()) mountEngine();
}

boot();
