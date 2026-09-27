// 失败路径回归（2026-09-27 接手 review P0/P1）：这些路径以前没有任何测试。
//   node tools/browser/fail095.mjs <输出目录>
// 1) maps.json 拿不到：不能永远停在「加载中…」——要有提示文字和一个真的能点的「重试」
// 2) 单张地图的点位数据失败一次：切走再切回来要重新取（以前失败会永久留在 jsonCache 里）
// 3) 休眠中收到 here：不要偷偷重新拉瓦片、也不要把 sleeping 改成陈旧的那张图
// 4) 唤醒 + 认不出的 fly 目标：仍然要显示休眠前那张图（不能留下空舞台）
// 5) 来自非宿主窗口的 eden-map:* 消息一律忽略（同源的其他 iframe 不能改当前地点 / 切图）
import fs from 'node:fs';
import * as B from './lib.mjs';

const OUT = process.argv[2] || '/tmp/fail095';
const wait = ms => new Promise(r => setTimeout(r, ms));
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + e.message.split('\n')[0]); } };

try {
  // ---------- 1) 启动数据拿不到 ----------
  await step('maps.json 失败：给提示与可点的重试，不是永远「加载中…」', async () => {
    const P = await B.newPage('desktop', { tier: 'save' });
    await P.page.route('**/data/maps.json', r => r.abort());
    await P.page.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' });
    await wait(4000);
    const s = await P.page.evaluate(() => {
      const b = document.querySelector('#tileRetry');
      return { text: document.querySelector('#loading span')?.textContent || '', actsHidden: document.querySelector('#loading .acts')?.hidden,
        retryVisible: !!b && !b.hidden, retryHasHandler: !!b?.onclick, stillLoading: /加载中/.test(document.querySelector('#loading span')?.textContent || '') };
    });
    rep.metric('boot_fail', s);
    rep.check('启动失败给出路（提示 + 重试按钮有 onclick）', !s.stillLoading && s.retryVisible && s.retryHasHandler && s.actsHidden === false, JSON.stringify(s));
    await P.ctx.close();
  });

  // ---------- 2) 单张图的点位数据失败一次 ----------
  await step('地图点位数据失败一次：切走再切回会重新取', async () => {
    const P = await B.newPage('desktop', { tier: 'save' });
    let fail = true;
    await P.page.route('**/data/tc_mid.json', r => { if (fail) { fail = false; return r.fulfill({ status: 500, body: 'x' }); } return r.continue(); });
    await B.openViewer(P, { map: 'tc_upper' });
    await B.goMap(P.page, 'tc_mid');
    const a = await P.page.evaluate(() => document.querySelectorAll('.mk').length);
    await B.goMap(P.page, 'tc_upper'); await B.goMap(P.page, 'tc_mid');
    await wait(800);
    const b = await P.page.evaluate(() => document.querySelectorAll('.mk').length);
    rep.metric('per_map_retry', { firstPass: a, secondPass: b });
    rep.check('点位数据失败后有恢复路径（第二次拿到标记）', b > 0, `第一次 ${a} 个标记、切回后 ${b} 个`);
    await P.ctx.close();
  });

  // ---------- 3)+4) 休眠 / 唤醒 ----------
  await step('休眠中收到 here 不重拉瓦片；唤醒 + 认不出的 fly 仍显示原图', async () => {
    const P = await B.newPage('desktop', { tier: 'save' });
    await B.openViewer(P, { map: 'tc_upper' });
    await P.page.evaluate(() => { window.__tiles = 0; const o = window.Image; window.Image = function (...a) { window.__tiles++; return new o(...a); }; window.Image.prototype = o.prototype; });
    await P.page.evaluate(() => window.postMessage({ type: 'eden-map:sleep' }, '*'));
    await wait(600);
    const afterSleep = await P.page.evaluate(() => ({ tiles: window.__tiles, cur: typeof cur !== 'undefined' ? cur : 'x' }));
    await P.page.evaluate(() => window.postMessage({ type: 'eden-map:here', value: '天城执法局总局' }, '*'));
    await wait(2500);
    const afterHere = await P.page.evaluate(() => ({ tiles: window.__tiles, cur: typeof cur !== 'undefined' ? cur : 'x', sleeping: typeof sleeping !== 'undefined' ? sleeping : 'x' }));
    await P.page.evaluate(() => window.postMessage({ type: 'eden-map:wake', fly: { character: '不存在的人' } }, '*'));
    await wait(2500);
    const afterWake = await P.page.evaluate(() => ({ cur: typeof cur !== 'undefined' ? cur : 'x', mk: document.querySelectorAll('.mk').length, loading: document.querySelector('#loading')?.className || '' }));
    rep.metric('sleep_wake', { afterSleep, afterHere, afterWake });
    rep.check('休眠中不因 here 拉瓦片', afterHere.tiles <= afterSleep.tiles + 2, `休眠后 ${afterSleep.tiles} → here 之后 ${afterHere.tiles}`);
    rep.check('唤醒后仍显示原图（不是空舞台）', !!afterWake.cur, JSON.stringify(afterWake));
    await P.ctx.close();
  });

  // ---------- 5) 非宿主窗口的消息 ----------
  // 宿主页从本机服务上取（同源），否则 setContent 的 about:blank 是不透明源、读不到 iframe 里的状态。
  // 文件名走 .gitignore 里的 map/_test_*.html，跑完删掉。
  const HOST = new URL('../../map/_test_fail095_host.html', import.meta.url);
  await step('同源的其他 iframe 发的 eden-map:* 一律忽略', async () => {
    fs.writeFileSync(HOST, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100vw;height:100vh}</style>
<iframe id="v" src="viewer.html"></iframe>
<iframe id="evil" srcdoc="&lt;script&gt;setInterval(()=&gt;parent.frames[0].postMessage({type:'eden-map:here',value:'天城执法局总局'},'*'),300)&lt;/script&gt;"></iframe>`);
    const P = await B.newPage('desktop', { tier: 'save' });
    await P.page.goto(B.BASE + '_test_fail095_host.html', { waitUntil: 'load' });
    await wait(4000);
    // 宿主（= 查看器的 parent）正经推一次当前地点，之后恶意的兄弟 iframe 一直在每 300 ms 推假地点
    await P.page.evaluate(() => document.getElementById('v').contentWindow.postMessage({ type: 'eden-map:here', value: '上层·伊甸庄园' }, '*'));
    await wait(2500);
    const s = await P.page.evaluate(() => { const w = document.getElementById('v').contentWindow;
      return { here: w.document.querySelector('#here')?.value || '', map: w.cur ?? null }; });
    rep.metric('spoof', s);
    rep.check('宿主推的地点不被兄弟 iframe 顶掉', s.here === '上层·伊甸庄园', JSON.stringify(s));
    await P.ctx.close();
  });
  try { fs.unlinkSync(HOST); } catch (e) {}
} finally {
  B.closeAll();
}
const ok = rep.save();
console.log(`结果：${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`);
process.exit(ok ? 0 : 1);
