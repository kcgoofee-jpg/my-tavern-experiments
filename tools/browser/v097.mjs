// v0.9.6 功能验收（375 Chromium 触屏 + 桌面，嵌在酒馆宿主页桩里）：
//   compose  地图 → 聊天：地点卡 / 事件卡 / 人物卡的「去这里」「追问这件事」只填进 #send_textarea、不发送；设置里改模板
//   more     人物卡「更多资料」（代号 / 社会身份 / 身高体重 / 外界知情 / 饰物）+ 战力小签 + 桌面两栏人物卡
//   tod      时段色调（晨 / 日 / 暮 / 夜）
//   sec      安保叠加层（结界 / 监控 / 门禁）
//   sources  EdenMap.sources()
// 数据全是中性占位。用法：node tools/browser/v097.mjs <输出目录> [--only compose,more]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/v097.mjs <输出目录> [--only a,b]'); process.exit(2); }
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? process.argv[oi + 1].split(',') : null;
const on = k => !ONLY || ONLY.includes(k);
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const errs = P => P.errors.filter(e => !/http 404/.test(e));
const HERE = '天城·下层·7 号井黑市';
const STAT = { 世界: { 当前地点: HERE, 当前时刻: '06:30', 当日时段: '晨起' }, 主角: { 声望: 50 },
  名册: { 甲一: { 社会身份: '大学讲师', 代号: '青鸟', 身高: 168, 体重: 52, 外界知情: false, 饰物: '银色细链', 战力: '超凡三阶' }, 甲二: { 社会身份: '园丁' } },
  在场人物: { 乙一: { 身份: '向导' } } };

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: HERE, stat: STAT, chat: 'v97-' + name }); const p = P.page;
    await H.open(); const vf = await H.viewer(); await B.wait(1500);
    if (on('compose')) {
      await vf.evaluate(() => go('tc_low')); await B.wait(2500);
      await vf.evaluate(() => document.querySelector('.mk[data-name="7 号井黑市"]')._open()); await B.wait(300);
      const btns = await vf.evaluate(() => [...document.querySelectorAll('#card .cmp [data-cmp]')].map(b => b.textContent));
      rep.check(`${name} 地点卡有「去这里」「追问这件事」`, btns.join('|') === '去这里|追问这件事', JSON.stringify(btns));
      await B.shot(p, OUT, `cmp_${name}_card`);
      await vf.locator('#card .cmp [data-cmp="go"]').click(); await B.wait(600);
      const v1 = await p.evaluate(() => document.getElementById('send_textarea').value);
      rep.check(`${name} 去这里：填进输入框「前往7 号井黑市。」`, v1 === '前往7 号井黑市。', v1);
      await vf.locator('#card .cmp [data-cmp="ask"]').click(); await B.wait(600);
      const v2 = await p.evaluate(() => document.getElementById('send_textarea').value);
      rep.check(`${name} 追问：接在草稿后面，不清掉`, v2 === '前往7 号井黑市。 关于7 号井黑市，', v2);
      const toast = await vf.evaluate(() => document.getElementById('cuToast')?.textContent || '');
      rep.check(`${name} 提示「已填入聊天输入框（未发送）」`, /未发送/.test(toast), toast);
      // 设置里改模板
      await p.evaluate(() => { document.getElementById('send_textarea').value = ''; });
      await vf.evaluate(() => { showSet(true); const b = document.getElementById('cmpBox'); b.open = true; const i = b.querySelector('input[data-cmpk="go"]'); i.value = '我们去{name}看看。'; i.dispatchEvent(new Event('change', { bubbles: true })); showSet(false); });
      await vf.evaluate(() => document.querySelector('.mk[data-name="7 号井黑市"]')._open()); await B.wait(200);
      await vf.locator('#card .cmp [data-cmp="go"]').click(); await B.wait(600);
      const v3 = await p.evaluate(() => document.getElementById('send_textarea').value);
      rep.check(`${name} 设置里改的模板生效`, v3 === '我们去7 号井黑市看看。', v3);
      await vf.evaluate(() => localStorage.removeItem('edenMapCompose'));
      // 人物卡
      await p.evaluate(() => { document.getElementById('send_textarea').value = ''; });
      await vf.evaluate(() => TCChars.fly('乙一')); await B.wait(1500);
      const pc = await vf.evaluate(() => ({ t: document.querySelector('#card h2').textContent, b: [...document.querySelectorAll('#card .cmp [data-cmp]')].map(b => b.dataset.name) }));
      rep.check(`${name} 人物卡：去这里 = 其位置，追问 = 人物名`, pc.b.length === 2 && pc.b[1] === '乙一', JSON.stringify(pc));
      await vf.locator('#card .cmp [data-cmp="ask"]').click(); await B.wait(600);
      rep.check(`${name} 人物卡追问`, (await p.evaluate(() => document.getElementById('send_textarea').value)) === '关于乙一，');
      const sent = await p.evaluate(() => !!window.__sent);
      rep.check(`${name} 从不发送`, !sent);
    }
    if (on('more')) {
      await vf.evaluate(() => { closeCard(); TCChars.cardOf('甲一'); }); await B.wait(400);
      const m = await vf.evaluate(() => { const d = document.querySelector('#card details.chmore'); if (!d) return null; d.open = true;
        return { t: document.querySelector('#card h2').textContent, rows: [...d.querySelectorAll('dt')].map((x, i) => x.textContent + '=' + d.querySelectorAll('dd')[i].textContent) }; });
      rep.check(`${name} 名册成员（不在图上）也能开人物卡，「更多资料」列出代号 / 身高体重 / 外界知情 / 饰物`, m && m.t === '甲一' && ['代号=青鸟', '身高 / 体重=168 cm · 52 kg', '外界知情=不知情', '饰物=银色细链'].every(r => m.rows.includes(r)), JSON.stringify(m));
      await B.wait(200); await B.shot(p, OUT, `more_${name}_card`);
      await vf.evaluate(() => { const c = document.getElementById('optCharMore'); c.checked = false; c.onchange(); closeCard(); TCChars.cardOf('甲一'); }); await B.wait(300);
      rep.check(`${name} 设置关掉「更多资料」后不显示`, await vf.evaluate(() => !document.querySelector('#card details.chmore')));
      await vf.evaluate(() => { const c = document.getElementById('optCharMore'); c.checked = true; c.onchange(); });
    }
    rep.check(`${name} 无页面错误`, !errs(P).length, errs(P).join(' | ').slice(0, 300));
  } catch (e) { rep.check(`${name} 运行`, false, String(e).slice(0, 300)); }
  finally { await P.ctx.close(); }
}

try { await run('desk', 'desktop'); await run('phone', 'phone'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
