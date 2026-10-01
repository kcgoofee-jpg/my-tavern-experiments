// Part 6-2 浏览器探针：node tools/browser/p6_tick.mjs <输出目录>
// 后台静默推演在真实宿主桩下：心跳起来了、面板开着 / 生成中让路、关掉开关就停。
// 探针只验「调度有没有按规矩跑」——推演本身是只读的（不写变量、不注入），副作用只能在宿主侧看记账。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p6tick';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

try {
  const D = await B.newPage('desktop', { tier: 'save' });
  await D.ctx.addInitScript(() => {   // 记录 getChatMessages 的读范围（后台推演是只读的，不该写变量）
    window.__reads = [];
    window.__thInstall = w => { const o = w.getChatMessages; w.getChatMessages = r => { try { window.__reads.push(String(r)); } catch (e) {} return o(r); }; };
  });
  const H = await openHost(D, { here: '铁匠铺', msgs: [{ message_id: 3, message: '【地点】铁匠铺' }] });
  await H.open();

  await step('心跳起来后：面板关着才读，且只读增量楼层', async () => {
    const before = await D.page.evaluate(() => (window.__reads || []).length);
    await B.wait(2000);
    const r = await D.page.evaluate(async () => {
      const mod = await import(new URL('tavern/background-scan-scheduler.mjs', window.__edenBase || document.baseURI).href).catch(() => null);
      return { mod: !!mod, reads: (window.__reads || []).slice(), before: 0 };
    });
    rep.metric('reads', { before, now: r.reads.length, sample: r.reads.slice(-3) });
    rep.check('调度模块可取（tavern/background-scan-scheduler.mjs）', r.mod, JSON.stringify({ mod: r.mod }));
    rep.check('读的是楼层范围而非整本聊天', r.reads.every(s => /^\d+-\d+$/.test(s)), JSON.stringify(r.reads.slice(-3)));
  });

  await step('判定本身：面板活着让路、生成中让路、间隔没到等待', async () => {
    const r = await D.page.evaluate(async () => {
      const m = await import(new URL('tavern/background-scan-scheduler.mjs', document.baseURI).href);
      return {
        alive: m.plan(1e6, { lastAt: 0, intervalMs: 60000, alive: true }),
        gen: m.plan(1e6, { lastAt: 0, intervalMs: 60000, generating: true }),
        wait: m.plan(1000, { lastAt: 0, intervalMs: 60000 }),
        due: m.plan(61000, { lastAt: 0, intervalMs: 60000 }),
        off: m.plan(61000, { lastAt: 0, intervalMs: 0 }),
        iv: m.intervalOf(k => (k === 'edenMapTick' ? localStorage.getItem(k) : null)),
      };
    });
    rep.metric('plan', r);
    rep.check('面板活着 / 生成中 / 关掉 → 不跑', !r.alive.run && !r.gen.run && !r.off.run, JSON.stringify([r.alive, r.gen, r.off]));
    rep.check('间隔没到 → 等；到了 → 跑', !r.wait.run && r.due.run, JSON.stringify([r.wait, r.due]));
    rep.check('默认间隔 60 s（本机没设过也是）', r.iv === 60000, String(r.iv));
  });

  await step('关掉开关（edenMapTick=0）就不跑', async () => {
    const r = await D.page.evaluate(async () => {
      const m = await import(new URL('tavern/background-scan-scheduler.mjs', document.baseURI).href);
      localStorage.setItem('edenMapTick', '0');
      const off = m.intervalOf(k => (k === 'edenMapTick' ? localStorage.getItem(k) : null));
      localStorage.removeItem('edenMapTick');
      return { off, back: m.intervalOf(k => (k === 'edenMapTick' ? localStorage.getItem(k) : null)) };
    });
    rep.metric('switch', r);
    rep.check("'0' 关掉、删掉后回到默认", r.off === 0 && r.back === 60000, JSON.stringify(r));
  });

  await step('设置页有这个开关（中英键齐全）', async () => {
    const vf = await H.viewer();
    const r = await vf.evaluate(() => ({ box: !!document.getElementById('optTick'), label: document.querySelector('#optTick')?.closest('label')?.querySelector('span')?.textContent || '' }));
    rep.metric('ui', r);
    rep.check('高级页有「后台静默推演」开关', r.box && /推演|tick/i.test(r.label), JSON.stringify(r));
  });

  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e);
  const errs = D.errors.filter(e => !noise(e));
  rep.check('除在途模块外无控制台错误 / 404', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'p6_tick：全过' : 'p6_tick：有失败');
  process.exit(ok ? 0 : 1);
}
