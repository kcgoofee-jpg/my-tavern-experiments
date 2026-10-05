// F3 TT 专项：在 Playwright WebKit（WKWebView，与 Mac TauriTavern 同一内核）里对拍 transfer.mjs 的复制 / 存文件 /
// 外链路径和原生适配层的聊天界面取层（泄露防御网经 ui.displayedMessage）。Chromium 同跑一遍——脚本形态不许退化。
// WKWebView 无用户手势时的 execCommand('copy') 会被静默拒绝（本机实测）——真实 TT 里复制都发生在按钮点击里，
// 所以这套检查装进一个按钮的 click 处理器，用 p.click 以可信手势触发。
// 用法：node tools/browser/f3_tt_webkit.mjs <输出目录>
import * as B from './lib.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/f3_tt_webkit.mjs <输出目录>'); process.exit(2); }
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);

const FIXTURE = `<!doctype html><meta charset=utf-8><body>
<button id="f3btn">run</button>
<div id="chat">
  <div class="mes" mesid="2"><div><statusplaceholderimpl></statusplaceholderimpl><div class="statusbar-container">leaked statusbar</div><p>keep me</p></div></div>
  <div class="mes" mesid="3"></div>
</div></body>`;

try {
  for (const preset of ['desktopWk', 'desktop']) {
    const P = await B.newPage(preset);
    const p = P.page;
    await p.route(B.BASE + '__f3host.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: FIXTURE }));
    await p.goto(B.BASE + '__f3host.html');
    await p.evaluate(async base => {   // 模块先取好（网络等待留在手势之前），检查体在 click 处理器里同步起跑
      const [T, N, F] = await Promise.all([import(base + 'app/transfer.mjs'), import(base + 'tavern/host-native.mjs'), import(base + 'tavern/tavernhelper-api.mjs')]);
      const na = N.createNativeAdapter({});
      window.__f3 = { done: false, out: null };
      document.getElementById('f3btn').addEventListener('click', async () => {
        const out = {};
        out.exec1 = T.execCopy('hello webkit', document);

        const t0 = Date.now();
        out.hang = await T.copyText('x', { win: { navigator: { clipboard: { writeText: () => new Promise(() => {}) } } }, doc: document, invoke: null });
        out.hangMs = Date.now() - t0;

        const calls = [];
        window.__TAURI__ = { core: { invoke: (c, a) => { calls.push([c, a]); return Promise.resolve('ok'); } } };
        out.bridge = await T.copyText('via bridge', { win: window, doc: document });
        out.bridgeCalls = calls;
        let opened = [];
        out.opened = await T.openExternal('https://example.com/x', { win: window, invoke: (c, a) => { opened.push([c, a.url]); return Promise.resolve(); } });
        out.openCalls = opened;
        delete window.__TAURI__;

        let clicked = null;
        document.addEventListener('click', e => { const a = e.target.closest ? e.target.closest('a') : null; if (a && a.hasAttribute('download')) clicked = a.getAttribute('download'); }, true);
        out.saved = await T.saveTextFile('f3-test.json', '{"a":1}', { win: {}, doc: document });
        out.clicked = clicked;

        const box = T.revealManual('f3-test.txt', 'MANUAL CONTENT', { doc: document });
        const rect = box.getBoundingClientRect();
        const ta = box.querySelector('textarea');
        out.panel = { vis: rect.width > 100 && rect.height > 20, val: ta.value, sel: (ta.selectionEnd || 0) >= ta.value.length };
        box.remove();

        out.msg2 = na.ui.displayedMessage(2)?.getAttribute('mesid') ?? null;
        out.msgBad = na.ui.displayedMessage('abc') ?? null;
        const fence = F.createLeakFence({ retrieve: id => na.ui.displayedMessage(id) ?? null, log: s => { out.fenceLog = s; } });
        out.swept = fence.sweep(2);
        const mes = document.querySelector('#chat .mes[mesid="2"]');
        out.leakLeft = mes.querySelectorAll('statusplaceholderimpl, .statusbar-container').length;
        out.kept = mes.textContent.includes('keep me');
        out.sweepBad = fence.sweep(-1);

        window.__f3 = { done: true, out };
      });
    }, B.BASE);
    await p.click('#f3btn');   // 可信用户手势：与 TT 里点复制按钮同环境
    await p.waitForFunction(() => window.__f3?.done === true, null, { timeout: 20000 });
    const R = await p.evaluate(() => window.__f3.out);

    rep.check(`${preset} execCommand 兜底可用`, R.exec1 === true);
    rep.check(`${preset} 剪贴板挂住 → 超时走兜底，不永挂`, R.hang === true && R.hangMs >= 700 && R.hangMs < 5000, `${R.hangMs} ms`);
    rep.check(`${preset} TT 桥优先：复制走 clipboard-manager`, R.bridge === true && R.bridgeCalls.length === 1 && R.bridgeCalls[0][0] === 'plugin:clipboard-manager|write_text' && R.bridgeCalls[0][1].text === 'via bridge', JSON.stringify(R.bridgeCalls));
    rep.check(`${preset} TT 外链走 opener 桥`, R.opened === true && R.openCalls[0]?.[0] === 'plugin:opener|open_url' && R.openCalls[0]?.[1] === 'https://example.com/x');
    rep.check(`${preset} 普通浏览器存文件 = <a download> 点击`, R.saved === 'downloaded' && R.clicked === 'f3-test.json');
    rep.check(`${preset} 手动复制面板可见、全选、含全文`, R.panel.vis && R.panel.val === 'MANUAL CONTENT' && R.panel.sel, JSON.stringify(R.panel));
    rep.check(`${preset} displayedMessage 取到聊天楼层、非法 id 为空`, R.msg2 === '2' && R.msgBad === null, `${R.msg2} / ${R.msgBad}`);
    rep.check(`${preset} 泄露防御网经适配层清楼层`, R.swept === 2 && R.leakLeft === 0 && R.kept && R.sweepBad === 0, `swept ${R.swept}, left ${R.leakLeft}`);
    await P.close();
  }
} catch (e) {
  rep.check('f3_tt_webkit 探针跑完', false, String(e?.stack || e).slice(0, 400));
}
srv.stop();
process.exit(rep.save() ? 0 : 1);
