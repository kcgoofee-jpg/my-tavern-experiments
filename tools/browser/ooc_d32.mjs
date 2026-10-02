// D32 浏览器探针：node tools/browser/ooc_d32.mjs <输出目录>
// 走真实宿主路径（tools/browser/host_stub.mjs：模拟酒馆页 + 卡内脚本），不再伪造 top——
// 查看器嵌在父页里，卡片上的「填入输入框 / 注入系统指令」点一下会真的 post 到宿主，
// 宿主按设置（edenMapInject）决定文案与注入方式；探针在父页这边收，验到消息与文案。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-ooc';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

try {
  const D = await B.newPage('desktop', { tier: 'save' });
  await D.ctx.addInitScript(() => {   // 父页这边收查看器发出来的所有消息
    window.__msgs = [];
    addEventListener('message', e => { try { window.__msgs.push(e.data); } catch (err) {} });
  });
  const H = await openHost(D, { here: '铁匠铺', ls: { edenMapInject: 'compose' } });
  await H.open();
  const vf = await H.viewer();

  await step('AI 联动页有「提醒 AI」：四条模板，点一下只填输入框、不发送', async () => {
    await vf.evaluate(() => { window.SettingsApi?.open('ai'); });
    await B.wait(2500);
    const r = await vf.evaluate(() => { const b = document.getElementById('oocBox'); if (b) b.open = true; return { has: !!b, n: document.querySelectorAll('#oocBox [data-ooc]').length, label: document.querySelector('#oocBox [data-ooc]')?.getAttribute('aria-label') || '' }; });
    rep.metric('box', r);
    rep.check('提醒 AI 区块在，四个按钮，带无障碍标签', r.has && r.n === 4 && !!r.label, JSON.stringify(r));
    await vf.evaluate(() => document.querySelector('#oocBox [data-ooc="chars"]')?.click());
    await B.wait(900);
    const v = await D.page.evaluate(() => { const ta = document.getElementById('send_textarea'); return { value: ta ? String(ta.value || '') : null, sent: window.__sent || 0, msgs: (window.__msgs || []).filter(m => m?.type === 'eden-map:compose-done').length }; });
    rep.metric('filled', v);
    rep.check('输入框被填入 OOC 句子，没有发送', !!v.value && /OOC/.test(v.value) && v.sent === 0, JSON.stringify(v));
    await B.shot(D.page, OUT, 'ooc');
  });

  // 时间轴模块（并行分支在做的 Part 5-4）还没落地，宿主桩里会刷一条 404——与本次改动无关，单独滤掉
  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.metric('filtered', { total: D.errors.length, kept: errs.length });
  rep.check('除在途模块外无控制台错误 / 404', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'ooc_d32：全过' : 'ooc_d32：有失败');
  process.exit(ok ? 0 : 1);
}
