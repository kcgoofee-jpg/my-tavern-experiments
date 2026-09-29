// 房间配图面板：让柏宝绘（ST-BaiBai-Image，**可选依赖**）给「这个房间」出一张图，存进本房间图集。
//
// 边界（三条，跟桥的注释一致）：
//   · 没装柏宝绘 → 房间卡上根本不出现入口（room-gallery-panel 的 baibaiInstalled() 决定），
//     装了但没配好后端 → 面板照常打开，只显示它自己给的原因，禁用「生成」；
//   · 出图一律走它的公开接口 `globalThis.STBaiBaiImage.generate`，绝不自己打 NAI：它的并发闸门
//     （429 冷却 / 最小间隔 / 退避重试）包在接口里，绕过去会让**用户的账号**吃限流；
//   · 生成的图它默认不进聊天记录，我们也不塞回聊天——想留下来就收进本机 IndexedDB 图集，
//     并把提示词与种子记进这条记录的 note（下次想复现直接抄 seed）。
//
// 它给的图是 data URL（很大），转成 Blob 落库之后就把 dataUrl 丢掉，不长期留在内存里。
import * as B from '../tavern/baibai.mjs';
import * as DB from '../core/room-gallery-db.mjs';
import { makeImageMeta, scopeKey, MAX_DIM, WEBP_QUALITY } from '../core/room-gallery-logic.mjs';
import { getCustomName, currentScope, galleryChatId } from './room-gallery-panel.js';

const STYLE_KEY = 'edenIllustStyleV1';
const SCENE_KEY = 'edenIllustSceneV1';
const SIZE_KEY = 'edenIllustSizeV1';
const MAX_CHARS = 2;   // 一次最多带两个人：多角色提示只有 NAI 4.5 / V5 支持，人多了容易糊在一起

const STR = {
  zh: {
    title: '房间配图', close: '关闭',
    styleLabel: '画师串（拼在提示词最前，留空即不用）', stylePh: '例：0.7::artist:meme50::, artist:ishikei',
    sceneLabel: '场景 tag（留空也行）', scenePh: '例：cafe, afternoon light, window',
    charsLabel: '带上谁（用柏宝绘档案里的外貌）', charsNone: '柏宝绘里还没有建档的人物——它在剧情里建好档后，这里会出现',
    charsLimited: '当前后端不支持多角色提示，只会用第一个人的 tag', sizeLabel: '画幅', portrait: '竖', landscape: '横',
    gen: '生成', cancel: '取消', again: '再生成', save: '存入本房间图集', saved: '已存入本房间图集（在「图集 ›」里能看到）',
    saveFail: '存入失败：{err}', copy: '复制参数', copied: '已复制', notReady: '柏宝绘还不能出图：{reason}',
    notInstalled: '没装柏宝绘（ST-BaiBai-Image）：装了之后这里会多一个「配图」按钮',
    hint: '图片由柏宝绘生成，并只存进本机图集（不上传、不进聊天记录）；提示词与 seed 会记在这张图的说明里。',
    prog: { queued: '排队中…', generating: '出图中…', 'queued-remote': '在出图服务端排队（前面还有 {ahead} 个）…', retrying: '被限流，退避重试（第 {attempt}/{max} 次）…', saving: '正在落盘…' },
  },
  en: {
    title: 'Room illustration', close: 'Close',
    styleLabel: 'Artist string (goes first in the prompt; leave empty for none)', stylePh: 'e.g. 0.7::artist:meme50::, artist:ishikei',
    sceneLabel: 'Scene tags (optional)', scenePh: 'e.g. cafe, afternoon light, window',
    charsLabel: 'Who is in frame (uses the appearance from BaiBai)', charsNone: 'No characters in BaiBai yet — once it builds them from the story they show up here',
    charsLimited: 'This backend has no multi-character prompts — only the first character tag is used', sizeLabel: 'Frame', portrait: 'Portrait', landscape: 'Landscape',
    gen: 'Generate', cancel: 'Cancel', again: 'Generate again', save: 'Save to this room\'s gallery', saved: 'Saved to this room\'s gallery (open "Gallery ›")',
    saveFail: 'Could not save: {err}', copy: 'Copy parameters', copied: 'Copied', notReady: 'BaiBai cannot generate yet: {reason}',
    notInstalled: 'ST-BaiBai-Image is not installed — once it is, an "Illustrate" button appears here',
    hint: 'The image is made by BaiBai and kept only on this device (nothing is uploaded, nothing enters the chat); the prompt and seed are recorded as its note.',
    prog: { queued: 'Queued…', generating: 'Generating…', 'queued-remote': 'Queued on the backend (about {ahead} ahead)…', retrying: 'Rate limited, backing off (attempt {attempt}/{max})…', saving: 'Saving…' },
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 存不下就算了，纯偏好 */ } };
function readScenes() { try { return JSON.parse(read(SCENE_KEY, '{}')) || {}; } catch (e) { return {}; } }
function setScene(roomId, v) { const o = readScenes(); o[roomId] = v; write(SCENE_KEY, JSON.stringify(o)); }

let panelEl = null;
let offChange = null;
export function closeIllustPanel() {
  if (offChange) { try { offChange(); } catch (e) { } offChange = null; }
  if (panelEl) { panelEl.remove(); panelEl = null; }
}

function ensureCSS() {
  if (document.getElementById('ilp-css')) return;
  const s = document.createElement('style'); s.id = 'ilp-css';
  s.textContent = `
.ilp{position:fixed;inset:0;z-index:61;background:rgba(8,7,5,.92);display:flex;align-items:center;justify-content:center;color:#eee4cc;font:13px/1.5 system-ui,sans-serif}
.ilp-box{width:min(92vw,720px);max-height:88vh;overflow:auto;background:#151310;border:1px solid #3a352c;border-radius:8px;padding:14px 16px 18px}
.ilp-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.ilp-hd h3{margin:0;font-size:15px}
.ilp-x{all:unset;cursor:pointer;padding:4px 8px;border-radius:4px;background:rgba(255,255,255,.08)}
.ilp-x:hover{background:rgba(255,255,255,.18)}
.ilp-note{font-size:11px;color:#a89b82;margin:4px 0 8px}
.ilp-warn{font-size:12px;color:#ffcf7a;background:rgba(255,207,122,.1);border:1px solid rgba(255,207,122,.28);border-radius:4px;padding:6px 8px;margin-bottom:8px}
.ilp-field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.ilp-field>span{font-size:12px;color:#c9bda4}
.ilp input[type=text],.ilp textarea{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:inherit;padding:6px 8px;font:inherit;width:100%;box-sizing:border-box}
.ilp textarea{resize:vertical}
.ilp-chars{display:flex;flex-wrap:wrap;gap:6px}
.ilp-chars label{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid rgba(255,255,255,.15);border-radius:14px;background:rgba(255,255,255,.05);cursor:pointer}
.ilp-chars label.on{background:rgba(120,190,255,.18);border-color:rgba(120,190,255,.5)}
.ilp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.ilp-btn{all:unset;cursor:pointer;padding:6px 12px;border-radius:4px;background:rgba(120,190,255,.2);font-size:13px}
.ilp-btn:hover{background:rgba(120,190,255,.34)}
.ilp-btn[disabled]{opacity:.45;cursor:not-allowed}
.ilp-btn.ghost{background:rgba(255,255,255,.08)}
.ilp-prog{font-size:12px;color:#a89b82;min-height:18px}
.ilp-out{margin-top:8px}
.ilp-out img{max-width:100%;border-radius:6px;display:block}
.ilp-out .meta{font-size:11px;color:#a89b82;margin-top:6px;white-space:pre-wrap;word-break:break-word}`;
  document.head.appendChild(s);
}

// 房间卡上的入口按钮由 room-gallery-panel 拼（它才知道房间 id 与语言），这里只管面板本体。
export async function openIllustPanel(roomId, { lang = 'zh', floor = null } = {}) {
  ensureCSS();
  closeIllustPanel();
  const t = STR[lang] || STR.zh;
  const st = B.status();
  const roomName = getCustomName(roomId) || roomId;

  panelEl = document.createElement('div');
  panelEl.className = 'ilp';
  panelEl.setAttribute('role', 'dialog'); panelEl.setAttribute('aria-modal', 'true');
  panelEl.innerHTML = `<div class="ilp-box">
    <div class="ilp-hd"><h3>${esc(t.title)} · ${esc(roomName)}</h3><button type="button" class="ilp-x">${esc(t.close)}</button></div>
    <div class="ilp-note">${esc(t.hint)}</div>
    <div class="ilp-warn" style="display:none"></div>
    <div class="ilp-body"></div>
  </div>`;
  document.body.appendChild(panelEl);
  panelEl.querySelector('.ilp-x').addEventListener('click', closeIllustPanel);
  panelEl.addEventListener('click', (e) => { if (e.target === panelEl) closeIllustPanel(); });

  const body = panelEl.querySelector('.ilp-body');
  const warn = panelEl.querySelector('.ilp-warn');
  const say = (msg) => { warn.style.display = msg ? '' : 'none'; warn.textContent = msg || ''; };

  if (!st.available) { say(t.notInstalled); return; }

  // 角色多选：柏宝绘的角色库（含它在剧情里建的档）。它变了就重画一次选择区。
  let picked = new Set();
  let list = B.characters(floor).list;
  offChange = B.onChange(() => { list = B.characters(floor).list; paintChars(); });
  const paintChars = () => {
    const box = body.querySelector('.ilp-chars');
    if (!box) return;
    if (!list.length) { box.innerHTML = `<div class="ilp-note">${esc(t.charsNone)}</div>`; return; }
    box.innerHTML = list.map((c) => `<label class="${picked.has(c.name) ? 'on' : ''}" data-name="${esc(c.name)}">
      <input type="checkbox" ${picked.has(c.name) ? 'checked' : ''} ${c.tag ? '' : 'disabled'}> ${esc(c.name)}</label>`).join('');
  };

  body.innerHTML = `
    <label class="ilp-field"><span>${esc(t.styleLabel)}</span>
      <textarea class="ilp-style" rows="2" placeholder="${esc(t.stylePh)}">${esc(read(STYLE_KEY, ''))}</textarea></label>
    <label class="ilp-field"><span>${esc(t.sceneLabel)}</span>
      <input type="text" class="ilp-scene" placeholder="${esc(t.scenePh)}" value="${esc(readScenes()[roomId] || '')}"></label>
    <div class="ilp-field"><span>${esc(t.charsLabel)}</span><div class="ilp-chars"></div></div>
    <div class="ilp-row"><span>${esc(t.sizeLabel)}</span>
      <label><input type="radio" name="ilp-size" value="portrait" ${read(SIZE_KEY, 'portrait') === 'portrait' ? 'checked' : ''}> ${esc(t.portrait)}</label>
      <label><input type="radio" name="ilp-size" value="landscape" ${read(SIZE_KEY, 'portrait') === 'landscape' ? 'checked' : ''}> ${esc(t.landscape)}</label>
      ${st.supportsCharacters ? '' : `<span class="ilp-note">${esc(t.charsLimited)}</span>`}</div>
    <div class="ilp-row"><button type="button" class="ilp-btn ilp-go">${esc(t.gen)}</button>
      <button type="button" class="ilp-btn ghost ilp-stop" style="display:none">${esc(t.cancel)}</button>
      <span class="ilp-prog"></span></div>
    <div class="ilp-out"></div>`;
  paintChars();
  if (!st.callable) say(t.notReady.replace('{reason}', (st.text && (st.text[lang] || st.text.zh)) || st.reason || ''));

  const styleIn = body.querySelector('.ilp-style');
  const sceneIn = body.querySelector('.ilp-scene');
  const prog = body.querySelector('.ilp-prog');
  const out = body.querySelector('.ilp-out');
  const goBtn = body.querySelector('.ilp-go');
  const stopBtn = body.querySelector('.ilp-stop');
  styleIn.addEventListener('change', () => write(STYLE_KEY, styleIn.value));
  sceneIn.addEventListener('change', () => setScene(roomId, sceneIn.value));
  body.querySelectorAll('input[name="ilp-size"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) write(SIZE_KEY, r.value); }));
  body.addEventListener('click', (e) => {
    const lab = e.target.closest('.ilp-chars label'); if (!lab) return;
    const name = lab.dataset.name;
    if (picked.has(name)) picked.delete(name);
    else if (picked.size >= MAX_CHARS) { picked = new Set([...picked].slice(1)); picked.add(name); }
    else picked.add(name);
    paintChars();
  });

  let controller = null;
  let last = null;      // { dataUrl, prompt, seed, blob }

  body.querySelector('.ilp-go').addEventListener('click', run);
  stopBtn.addEventListener('click', () => { try { controller?.abort(); } catch (e) { } });

  async function run() {
    if (!st.callable) return;
    const style = styleIn.value.trim(), scene = sceneIn.value.trim();
    const size = (body.querySelector('input[name="ilp-size"]:checked') || {}).value || 'portrait';
    const split = B.splitCharacters(list, [...picked], st.supportsCharacters);
    const prompt = B.composePrompt({ style, scene, characterTags: split.promptTags });
    if (!prompt) { say(t.sceneLabel + ' / ' + t.styleLabel); return; }
    const ch = split.picked[0];
    say('');
    controller = new AbortController();
    goBtn.disabled = true; stopBtn.style.display = ''; prog.textContent = t.prog.queued;
    const r = await B.generate(
      { prompt, size, characters: split.characters, character: ch ? ch.name : undefined },
      { signal: controller.signal, onProgress: (p) => { prog.textContent = phaseText(p); } },
    );
    controller = null; goBtn.disabled = false; stopBtn.style.display = 'none'; prog.textContent = '';
    if (!r.ok) { say(r.code === 'aborted' ? '' : ((r.text && (r.text[lang] || r.text.zh)) || r.message || r.code)); return; }
    last = { dataUrl: r.dataUrl, prompt, seed: r.seed };
    out.innerHTML = `<img src="${r.dataUrl}" alt="">
      <div class="meta">${esc(B.resultNote(r, prompt, { lang }))}</div>
      <div class="ilp-row"><button type="button" class="ilp-btn ilp-save">${esc(t.save)}</button>
        <button type="button" class="ilp-btn ghost ilp-copy">${esc(t.copy)}</button>
        <button type="button" class="ilp-btn ghost ilp-again">${esc(t.again)}</button></div>`;
    out.querySelector('.ilp-save').addEventListener('click', save);
    out.querySelector('.ilp-again').addEventListener('click', run);
    out.querySelector('.ilp-copy').addEventListener('click', async (e) => {
      const txt = B.resultNote(r, prompt, { lang: 'en' });
      try { await navigator.clipboard.writeText(txt); e.target.textContent = t.copied; } catch (err) { }
    });
  }

  function phaseText(p) {
    const key = p && p.phase;
    const s = (t.prog && t.prog[key]) || (key || '');
    return String(s).replace('{ahead}', p?.ahead ?? '?').replace('{attempt}', p?.attempt ?? '?').replace('{max}', p?.max ?? '?');
  }

  async function save() {
    if (!last) return;
    const btn = out.querySelector('.ilp-save');
    try {
      const raw = B.dataUrlToBlob(last.dataUrl);
      if (!raw) throw new Error('cannot decode data URL');
      const { blob, w, h } = await DB.resizeToWebp(raw, MAX_DIM, WEBP_QUALITY);   // 统一成 webp，跟手传的图同一条路
      last.dataUrl = null;                                                       // 大字符串用完就丢（它文档也这么建议）
      const scope = currentScope();
      const chatId = galleryChatId();
      const scopeK = scopeKey(scope, chatId);
      const existing = await DB.listImages(scopeK, roomId).catch(() => []);
      const check = await DB.scopeUsageAndCheck(scopeK, blob.size).catch(() => ({ ok: true }));
      const id = 'bbi' + Date.now().toString(36);
      const meta = makeImageMeta({
        id, roomId, order: existing.length, visibility: 'private',
        w, h, bytes: blob.size, note: B.resultNote({ ok: true, seed: last.seed, backend: st.backend }, last.prompt, { lang }),
      });
      await DB.putImage(scopeK, meta, blob);
      say(check.ok ? t.saved : t.saved + '（本机存储快满了，建议删几张）');
      if (btn) btn.disabled = true;
    } catch (err) {
      console.warn('[illust] 存入图集失败', err);
      say(t.saveFail.replace('{err}', String((err && err.message) || err)));
    }
  }
}
