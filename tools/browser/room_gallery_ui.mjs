// node tools/browser/room_gallery_ui.mjs —— 房间图集 UI（map/ui/room-gallery-panel.js）：
//   改名 / 恢复原名 / 简介；面板里没有「投稿」「导出」「维护者」之类的东西（S9b 起取消），「加入设定包」只在编辑模式出现（这里没开，所以不可见）；
//   每个作用域（仅本聊天 / 全部聊天共用）各自上传 → 图片正常显示（不是破图标）→ 切换作用域 → 整页刷新后两边的图都还在、都还能正常显示
//   （bug fix 回归用例：以前「仅本聊天」作用域刷新后会显示破图标）；
// 桌面 + 375 两个视口各跑一遍。
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/room_gallery_ui.mjs <输出目录>'); process.exit(2); }
const srv = await B.ensureServer(); const rep = B.reporter(OUT);

// 1×1 红色像素 PNG，测试上传用（生成的测试图，不是任何用户的真实图片）
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pngPath = path.join(OUT, 'test_upload.png');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(pngPath, Buffer.from(PNG_B64, 'base64'));

const ROOM = '正式母畜个人寝室';
const CARD = { name: ROOM, floor: 'F3', poly: [[3.8, 3], [7.4, 3], [7.4, 8], [3.8, 8]] };
const CHAT_ID = 'gallery-test-chat-1';

async function openRoomAndGallery(f) {
  await f.evaluate(([name, card]) => window.postMessage({ type: 'estate:room', name, card }, '*'), [ROOM, CARD]);
  await B.wait(500);
  await f.evaluate(() => document.querySelector('#card .rgc-open')?.click());
  await f.waitForSelector('.rgp-file', { timeout: 5000 }).catch(() => {});
  await f.waitForFunction(() => document.querySelector('.rgp-grid')?.textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
}

async function selectScope(f, scope) {
  await f.evaluate((s) => { const r = document.querySelector(`input[name="rgp-scope"][value="${s}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }, scope);
  await B.wait(250);
}

async function uploadOne(P, f) {
  const before = await f.evaluate(() => document.querySelectorAll('.rgp-item').length);
  await P.page.setInputFiles('.rgp-file', pngPath);
  await f.waitForFunction((n) => document.querySelectorAll('.rgp-item').length > n, before, { timeout: 8000 }).catch(() => {});
  return f.evaluate(() => document.querySelectorAll('.rgp-item').length);
}

// 网格里第一张本地图（有 data-id 的 .rgp-item）的 <img> 是否真的解码成功（不是破图标：naturalWidth/Height > 0）
async function firstLocalImgOk(f) {
  await f.waitForFunction(() => { const img = document.querySelector('.rgp-item[data-id] img'); return img && img.complete; }, null, { timeout: 8000 }).catch(() => {});
  return f.evaluate(() => {
    const img = document.querySelector('.rgp-item[data-id] img');
    if (!img) return { found: false };
    return { found: true, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, src: img.src };
  });
}

async function run(preset, tag) {
  const P = await B.newPage(preset);
  await B.openEstate(P);
  const f = P.page.mainFrame();
  await f.evaluate(([name, card]) => window.postMessage({ type: 'estate:room', name, card }, '*'), [ROOM, CARD]);
  await B.wait(800);

  const hasBlock = await f.evaluate(() => !!document.querySelector('#card .rgc'));
  rep.check(`${tag}：房间卡带自定义名/简介/图集入口`, hasBlock, '');

  // 改名 + 简介
  await f.evaluate(() => { const nameIn = document.querySelector('#card .rgc-name'); nameIn.value = '测试改名'; nameIn.dispatchEvent(new Event('change', { bubbles: true })); });
  await B.wait(150);
  const afterRename = await f.evaluate(() => ({
    h3: document.querySelector('#card h3')?.textContent, hasRestore: !!document.querySelector('#card .rgc-restore'),
    ls: JSON.parse(localStorage.getItem('edenRoomCustomV1') || '{}')[document.querySelector('#card .rgc')?.dataset.room || '']?.name,
  }));
  rep.check(`${tag}：自定义名生效并写入本机存储`, afterRename.h3 === '测试改名' && afterRename.hasRestore && afterRename.ls === '测试改名', JSON.stringify(afterRename));
  await f.evaluate(() => { const in2 = document.querySelector('#card .rgc-intro'); in2.value = '测试简介文字'; in2.dispatchEvent(new Event('change', { bubbles: true })); });
  await B.wait(120);
  await f.evaluate(() => document.querySelector('#card .rgc-restore').click());
  await B.wait(150);
  const restored = await f.evaluate(() => ({ h3: document.querySelector('#card h3')?.textContent, hasRestore: !!document.querySelector('#card .rgc-restore') }));
  rep.check(`${tag}：恢复原名`, new RegExp('^' + ROOM).test(restored.h3 || '') && !restored.hasRestore, JSON.stringify(restored));

  // ---------------- 没有公开 / 投稿 / 导出的概念；编辑模式没开：也没有「加入设定包」 ----------------
  await openRoomAndGallery(f);
  const noPublic = await f.evaluate(() => ({ submit: !!document.querySelector('[data-act="vis-submit"], .rgp-export, .rgp-seg'), addToPack: !!document.querySelector('[data-act="pack"]'), foot: !!document.querySelector('.rgp-foot') }));
  rep.check(`${tag}：面板里没有投稿 / 导出 / 可见性控件，编辑模式没开时也没有「加入设定包」`, !noPublic.submit && !noPublic.addToPack && !noPublic.foot, JSON.stringify(noPublic));
  await f.evaluate(() => document.querySelector('.rgp-x')?.click());

  // ---------------- 发 chatId，测「仅本聊天」作用域 ----------------
  await f.evaluate((id) => window.postMessage({ type: 'estate:chat', id }, '*'), CHAT_ID);
  await B.wait(200);
  await openRoomAndGallery(f);
  await selectScope(f, 'chat');
  const chatCount1 = await uploadOne(P, f);
  rep.check(`${tag}：仅本聊天 作用域上传后图出现在网格`, chatCount1 >= 1, String(chatCount1));
  const chatImg1 = await firstLocalImgOk(f);
  rep.check(`${tag}：仅本聊天 作用域上传后图片正常显示（不是破图标）`, chatImg1.found && chatImg1.naturalWidth > 0 && chatImg1.naturalHeight > 0, JSON.stringify(chatImg1));

  // 切到「全部聊天共用」，上传另一张，也要正常显示
  await selectScope(f, 'global');
  const globalCount1 = await uploadOne(P, f);
  rep.check(`${tag}：全部聊天共用 作用域上传后图出现在网格`, globalCount1 >= 1, String(globalCount1));
  const globalImg1 = await firstLocalImgOk(f);
  rep.check(`${tag}：全部聊天共用 作用域上传后图片正常显示`, globalImg1.found && globalImg1.naturalWidth > 0 && globalImg1.naturalHeight > 0, JSON.stringify(globalImg1));

  // ---------------- 整页刷新：切回「仅本聊天」，chatId 重发，两个作用域的图都应该还在、都正常显示（回归用例） ----------------
  await f.evaluate(() => document.querySelector('.rgp-x')?.click());
  await P.page.reload({ waitUntil: 'commit' });
  await P.page.waitForFunction(() => window.__ffAt, null, { timeout: 90000 });
  const f2 = P.page.mainFrame();
  await f2.evaluate((id) => window.postMessage({ type: 'estate:chat', id }, '*'), CHAT_ID);
  await B.wait(200);
  await openRoomAndGallery(f2);
  await selectScope(f2, 'chat');
  const chatAfterReload = await f2.evaluate(() => document.querySelectorAll('.rgp-item[data-id]').length);
  const chatImgAfterReload = await firstLocalImgOk(f2);
  rep.check(`${tag}：刷新后「仅本聊天」作用域的图还在`, chatAfterReload >= 1, String(chatAfterReload));
  rep.check(`${tag}：刷新后「仅本聊天」作用域的图正常显示（不是破图标——bug 回归用例）`,
    chatImgAfterReload.found && chatImgAfterReload.naturalWidth > 0 && chatImgAfterReload.naturalHeight > 0, JSON.stringify(chatImgAfterReload));

  await selectScope(f2, 'global');
  const globalAfterReload = await f2.evaluate(() => document.querySelectorAll('.rgp-item[data-id]').length);
  const globalImgAfterReload = await firstLocalImgOk(f2);
  rep.check(`${tag}：刷新后「全部聊天共用」作用域的图还在`, globalAfterReload >= 1, String(globalAfterReload));
  rep.check(`${tag}：刷新后「全部聊天共用」作用域的图正常显示`,
    globalImgAfterReload.found && globalImgAfterReload.naturalWidth > 0 && globalImgAfterReload.naturalHeight > 0, JSON.stringify(globalImgAfterReload));

  // 清理：删掉两个作用域各自的图
  await f2.evaluate(() => document.querySelector('.rgp-item[data-id] [data-act="del"]')?.click());
  await B.wait(300);
  await selectScope(f2, 'chat');
  await f2.evaluate(() => document.querySelector('.rgp-item[data-id] [data-act="del"]')?.click());
  await B.wait(300);

  rep.metric('errors_' + tag, P.errors.slice(0, 10));
  rep.check(`${tag}：无脚本错误`, !P.errors.length, P.errors.slice(0, 3).join(' | '));
  await B.shot(P.page, OUT, `room_gallery_${tag}`);
  await P.close();
}

try {
  await run('desktop', 'desktop');
  await run('phone', '375');
} catch (e) { console.log('✗ 运行', e.message.split('\n')[0]); rep.check('运行未抛异常', false, e.message); }
finally { await B.closeAll(); srv?.stop?.(); }
const ok = rep.save();
console.log(ok ? '全部通过' : '有失败', '→', OUT + '/summary.md');
process.exit(ok ? 0 : 1);
