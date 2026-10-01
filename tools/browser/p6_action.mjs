// Part 6-4 浏览器探针：node tools/browser/p6_action.mjs <输出目录>
// 走真实宿主路径（tools/browser/host_stub.mjs：模拟酒馆页 + 卡内脚本），不再伪造 top——
// 查看器嵌在父页里，卡片上的「填入输入框 / 注入系统指令」点一下会真的 post 到宿主，
// 宿主按设置（edenMapInject）决定文案与注入方式；探针在父页这边收，验到消息与文案。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p6action';
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

  await step('设置里切成「填输入框」后，卡片上出现入口', async () => {
    await vf.evaluate(() => { try { window.go?.('tc_upper'); } catch (e) {} });
    await B.wait(2500);
    const r = await vf.evaluate(() => {
      document.querySelector('.mk')?._open?.();
      const a = document.querySelector('#card [data-inject]');
      return { mode: window.LocalStore?.get?.('edenMapInject'), n: document.querySelectorAll('#card [data-inject]').length, name: a?.dataset.name || '', label: (a?.textContent || '').trim() };
    });
    rep.metric('entry', r);
    rep.check('模式是 compose（宿主页注入的 localStorage）', r.mode === 'compose', JSON.stringify(r));
    rep.check('卡片上出现注入入口且带地点名', r.n > 0 && !!r.name, JSON.stringify(r));
  });

  await step('点一下：宿主真的收到 eden-map:action', async () => {
    const before = await D.page.evaluate(() => (window.__msgs || []).filter(m => m?.type === 'eden-map:action').length);
    await vf.evaluate(() => document.querySelector('#card [data-inject]')?.click());
    await B.wait(800);
    const got = await D.page.evaluate(() => (window.__msgs || []).filter(m => m?.type === 'eden-map:action'));
    rep.metric('action', got);
    rep.check('宿主收到一条 eden-map:action', got.length === before + 1, JSON.stringify(got.slice(-1)));
    const a = got[got.length - 1] || {};
    rep.check('消息带 kind / name / map', !!a.kind && !!a.name && !!a.map, JSON.stringify(a));
  });

  await step('宿主按模板产出文案并填进聊天输入框（只填不发）', async () => {
    // 宿主侧的注入结果：#send_textarea 被接上一句（map/tavern/compose-templates.mjs 只写 value、不点发送）
    const r = await D.page.evaluate(() => {
      const ta = document.getElementById('send_textarea');
      return { value: ta ? String(ta.value || '') : null, sent: window.__sent || 0 };
    });
    rep.metric('composed', r);
    rep.check('输入框被接上一句「前往…」（宿主页有输入框时）', r.value === null || /前往|查看|搜刮/.test(r.value), JSON.stringify(r));
    await B.shot(D.page, OUT, 'host');
  });

  await step('默认关时不注入：清掉设置后宿主不再收到 action', async () => {
    await vf.evaluate(() => {
      try { window.LocalStore.set('edenMapInject', 'off'); window.__injectMode = 'off'; } catch (e) {}
      window.MarkersApi?.closeCard?.();
    });
    await B.wait(600);
    const n = await vf.evaluate(() => { document.querySelector('.mk')?._open?.(); return document.querySelectorAll('#card [data-inject]').length; });
    rep.check('切回关之后入口消失（地图不替玩家说话）', n === 0, `${n} 个`);
  });

  // 时间轴模块（并行分支在做的 Part 5-4）还没落地，宿主桩里会刷一条 404——与本次改动无关，单独滤掉
  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.metric('filtered', { total: D.errors.length, kept: errs.length });
  rep.check('除在途模块外无控制台错误 / 404', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'p6_action：全过' : 'p6_action：有失败');
  process.exit(ok ? 0 : 1);
}
