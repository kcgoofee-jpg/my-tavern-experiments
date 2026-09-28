// node tools/browser/room_gallery_ui.mjs —— 房间图集 UI（map/ui/room-gallery-panel.js）：改名 / 恢复原名 / 简介，
// 上传测试图 → 出现在网格 → 切公开 → 导出（拦截下载）→ 删除 → 刷新后本地存储持久（自定义名/简介一直在；上传的图私有作用域刷新后应还在）。
// 桌面 + 375 两个视口各跑一遍。
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/room_gallery_ui.mjs <输出目录>'); process.exit(2); }
const srv = await B.ensureServer(); const rep = B.reporter(OUT);

// 1×1 红色像素 PNG，测试上传用
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pngPath = path.join(OUT, 'test_upload.png');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(pngPath, Buffer.from(PNG_B64, 'base64'));

async function run(preset, tag) {
  const P = await B.newPage(preset);
  await B.openEstate(P);
  const f = P.page.mainFrame();
  // 用查看器协议 pin 一间普通房间（正式母畜个人寝室，F3，有 poly，非 restricted/sub）
  await f.evaluate(() => window.postMessage({ type: 'estate:room', name: '正式母畜个人寝室', card: { name: '正式母畜个人寝室', floor: 'F3', poly: [[3.8, 3], [7.4, 3], [7.4, 8], [3.8, 8]] } }, '*'));
  await B.wait(800);

  const hasBlock = await f.evaluate(() => !!document.querySelector('#card .rgc'));
  rep.check(`${tag}：房间卡带自定义名/简介/图集入口`, hasBlock, '');

  // 改名 + 简介
  await f.evaluate(() => {
    const nameIn = document.querySelector('#card .rgc-name'); nameIn.value = '测试改名';
    nameIn.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await B.wait(150);
  const afterRename = await f.evaluate(() => ({
    h3: document.querySelector('#card h3')?.textContent, hasRestore: !!document.querySelector('#card .rgc-restore'),
    ls: JSON.parse(localStorage.getItem('edenRoomCustomV1') || '{}')['正式母畜个人寝室']?.name,
  }));
  rep.check(`${tag}：自定义名生效并写入本机存储`, afterRename.h3 === '测试改名' && afterRename.hasRestore && afterRename.ls === '测试改名', JSON.stringify(afterRename));

  await f.evaluate(() => {
    const in2 = document.querySelector('#card .rgc-intro'); in2.value = '测试简介文字';
    in2.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await B.wait(120);
  const introLs = await f.evaluate(() => JSON.parse(localStorage.getItem('edenRoomCustomV1') || '{}')['正式母畜个人寝室']?.intro);
  rep.check(`${tag}：自定义简介写入本机存储`, introLs === '测试简介文字', String(introLs));

  // 恢复原名
  await f.evaluate(() => document.querySelector('#card .rgc-restore').click());
  await B.wait(150);
  const restored = await f.evaluate(() => ({ h3: document.querySelector('#card h3')?.textContent, hasRestore: !!document.querySelector('#card .rgc-restore') }));
  rep.check(`${tag}：恢复原名`, /^正式母畜个人寝室/.test(restored.h3 || '') && !restored.hasRestore, JSON.stringify(restored));

  // 打开图集面板：等面板的第一次 refresh()（公开清单 fetch）跑完，再上传，避免和面板初始化的 refresh 抢着写 DOM
  await f.evaluate(() => document.querySelector('#card .rgc-open').click());
  await f.waitForSelector('.rgp-file', { timeout: 5000 }).catch(() => {});
  await f.waitForFunction(() => document.querySelector('.rgp-grid')?.textContent.includes('还没有图片') || document.querySelector('.rgp-item'), null, { timeout: 5000 }).catch(() => {});
  const panelOpen = await f.evaluate(() => !!document.querySelector('.rgp'));
  rep.check(`${tag}：图集面板打开`, panelOpen, '');

  // 上传测试图
  await P.page.setInputFiles('.rgp-file', pngPath);
  await f.waitForFunction(() => document.querySelectorAll('.rgp-item').length >= 1, null, { timeout: 8000 }).catch(() => {});
  const afterUpload = await f.evaluate(() => document.querySelectorAll('.rgp-item').length);
  rep.check(`${tag}：上传后图出现在网格`, afterUpload >= 1, String(afterUpload));

  // 切公开
  await f.evaluate(() => document.querySelector('.rgp-item [data-act="vis"]').click());
  await f.waitForFunction(() => /公开|Public/.test(document.querySelector('.rgp-item [data-act="vis"]')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const vis = await f.evaluate(() => document.querySelector('.rgp-item [data-act="vis"]')?.textContent || '');
  rep.check(`${tag}：自用/公开切换`, /公开|Public/.test(vis), vis);

  // 导出（拦截下载，不真正落盘校验内容，只确认触发了下载 + 打开了 issue 标签）
  const downloads = [];
  P.page.on('download', (d) => downloads.push(d.suggestedFilename()));
  const popupPromise = P.page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await f.evaluate(() => document.querySelector('.rgp-export').click());
  await B.wait(1200);
  const popup = await popupPromise;
  rep.check(`${tag}：导出触发下载（manifest + 图片）`, downloads.some((n) => /manifest\.json$/.test(n)) && downloads.some((n) => /\.webp$/.test(n)), JSON.stringify(downloads));
  rep.check(`${tag}：导出打开预填 issue 链接`, !!popup && /github\.com\/.+\/issues\/new\?title=/.test(popup.url()), popup?.url() || '');
  await popup?.close().catch(() => {});

  // 删除
  await f.evaluate(() => document.querySelector('.rgp-item [data-act="del"]').click());
  await f.waitForFunction(() => document.querySelectorAll('.rgp-item').length === 0, null, { timeout: 5000 }).catch(() => {});
  const afterDel = await f.evaluate(() => document.querySelectorAll('.rgp-item').length);
  rep.check(`${tag}：删除后网格清空`, afterDel === 0, String(afterDel));

  // 再传一张，不删，用于刷新后持久化检查
  await P.page.setInputFiles('.rgp-file', pngPath);
  await f.waitForFunction(() => document.querySelectorAll('.rgp-item').length >= 1, null, { timeout: 8000 }).catch(() => {});
  const before = await f.evaluate(() => document.querySelectorAll('.rgp-item').length);

  await f.evaluate(() => document.querySelector('.rgp-x').click());
  await P.page.reload({ waitUntil: 'commit' });
  await P.page.waitForFunction(() => window.__ffAt, null, { timeout: 90000 });
  const f2 = P.page.mainFrame();
  await f2.evaluate(() => window.postMessage({ type: 'estate:room', name: '正式母畜个人寝室', card: { name: '正式母畜个人寝室', floor: 'F3', poly: [[3.8, 3], [7.4, 3], [7.4, 8], [3.8, 8]] } }, '*'));
  await B.wait(800);
  await f2.evaluate(() => document.querySelector('#card .rgc-open')?.click());
  await f2.waitForFunction(() => document.querySelectorAll('.rgp-item').length >= 1, null, { timeout: 8000 }).catch(() => {});
  const persisted = await f2.evaluate(() => document.querySelectorAll('.rgp-item').length);
  rep.check(`${tag}：刷新后 IndexedDB 里的图还在（本机持久化）`, persisted === before && persisted >= 1, `${persisted} / ${before}`);

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
