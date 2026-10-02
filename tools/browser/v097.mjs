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
    await H.open(); const vf = await H.viewer(); await B.buildAllSettingsPages(vf); await B.wait(1500);
    if (on('compose')) {
      await vf.evaluate(() => ViewerDebug.go('tc_low')); await B.wait(2500);
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
      const toast = await p.evaluate(() => [...document.querySelectorAll('#eden-map-root .nt-p2 .nt-item')].map(t => t.textContent).join(' '));   // UI v2：嵌入时提示在宿主通知层
      rep.check(`${name} 提示「已填入聊天输入框（未发送）」`, /未发送/.test(toast), toast);
      // 设置里改模板
      await p.evaluate(() => { document.getElementById('send_textarea').value = ''; });
      await vf.evaluate(() => { ViewerDebug.showSet(true); const b = document.getElementById('cmpBox'); b.open = true; const i = b.querySelector('input[data-cmpk="go"]'); i.value = '我们去{name}看看。'; i.dispatchEvent(new Event('change', { bubbles: true })); ViewerDebug.showSet(false); });
      await vf.evaluate(() => document.querySelector('.mk[data-name="7 号井黑市"]')._open()); await B.wait(200);
      await vf.locator('#card .cmp [data-cmp="go"]').click(); await B.wait(600);
      const v3 = await p.evaluate(() => document.getElementById('send_textarea').value);
      rep.check(`${name} 设置里改的模板生效`, v3 === '我们去7 号井黑市看看。', v3);
      await vf.evaluate(() => localStorage.removeItem('edenMapCompose'));
      // 人物卡
      await p.evaluate(() => { document.getElementById('send_textarea').value = ''; });
      await vf.evaluate(() => CharactersView.fly('乙一')); await B.wait(1500);
      const pc = await vf.evaluate(() => ({ t: document.querySelector('#card h2').textContent, b: [...document.querySelectorAll('#card .cmp [data-cmp]')].map(b => b.dataset.name) }));
      rep.check(`${name} 人物卡：开局前无「去这里」（和你在一起待开局推断），追问 = 人物名`, pc.b.length === 1 && pc.b[0] === '乙一', JSON.stringify(pc));   // b993733e：开局前不推断和你在一起 → place='' → 「去这里」钮不渲染，只剩追问
      await vf.locator('#card .cmp [data-cmp="ask"]').click(); await B.wait(600);
      rep.check(`${name} 人物卡追问`, (await p.evaluate(() => document.getElementById('send_textarea').value)) === '关于乙一，');
      const sent = await p.evaluate(() => !!window.__sent);
      rep.check(`${name} 从不发送`, !sent);
    }
    if (on('more')) {
      await vf.evaluate(() => { ViewerDebug.closeCard(); CharactersView.cardOf('甲一'); }); await B.wait(400);
      const m = await vf.evaluate(() => { const d = document.querySelector('#card details.chmore'); if (!d) return null; d.open = true;
        return { t: document.querySelector('#card h2').textContent, rows: [...d.querySelectorAll('dt')].map((x, i) => x.textContent + '=' + d.querySelectorAll('dd')[i].textContent) }; });
      rep.check(`${name} 名册成员（不在图上）也能开人物卡，「更多资料」列出代号 / 身高体重 / 外界知情 / 饰物`, m && m.t === '甲一' && ['代号=青鸟', '身高 / 体重=168 cm · 52 kg', '外界知情=不知情', '饰物=银色细链'].every(r => m.rows.includes(r)), JSON.stringify(m));
      await B.wait(200); await B.shot(p, OUT, `more_${name}_card`);
      const tc = await vf.evaluate(() => ({ card: document.querySelector('#card dd .chtier')?.textContent, two: getComputedStyle(document.querySelector('#card .src')).gridTemplateColumns.split(' ').length, w: document.getElementById('card').getBoundingClientRect().width }));
      rep.check(`${name} 战力小签「超凡 3 阶」（卡里写明才有）`, tc.card === '超凡 3 阶', JSON.stringify(tc));
      rep.check(`${name} 人物卡：桌面两栏，手机一栏`, name === 'desk' ? tc.two === 2 && tc.w > 500 : tc.two !== 2, JSON.stringify(tc));
      await vf.evaluate(() => { ViewerDebug.closeCard(); document.querySelector('#evbar .chtab').click(); }); await B.wait(500);
      const chip = await vf.evaluate(() => [...document.querySelectorAll('#evbar .chpane .chtier')].map(x => x.textContent));
      await B.shot(p, OUT, `more_${name}_roster`); await vf.evaluate(() => document.querySelector('#evbar .chtab').click());
      rep.check(`${name} 人物栏名册行有战力小签`, chip.includes('超凡 3 阶'), JSON.stringify(chip));
      await vf.evaluate(() => { const c = document.getElementById('optCharMore'); c.checked = false; c.onchange(); ViewerDebug.closeCard(); CharactersView.cardOf('甲一'); }); await B.wait(300);
      rep.check(`${name} 设置关掉「更多资料」后不显示`, await vf.evaluate(() => !document.querySelector('#card details.chmore')));
      await vf.evaluate(() => { const c = document.getElementById('optCharMore'); c.checked = true; c.onchange(); });
    }
    if (on('tod')) {
      await vf.evaluate(() => { ViewerDebug.closeCard(); ViewerDebug.go('tc_mid'); }); await B.wait(2500);
      const res = {};
      for (const [per, want] of [['晨起', 'dawn'], ['日间', ''], ['侍寝时段', 'dusk'], ['就寝', 'night']]) {
        await H.setMsgs([], { ...STAT, 世界: { ...STAT.世界, 当日时段: per } }); await B.wait(900);
        res[per] = await vf.evaluate(() => ({ tod: document.body.dataset.tod || '', night: document.body.classList.contains('nighttint'), swapped: !!ViewerDebug.mapRegistry?.maps?.tc_mid?.periods?.[document.body.dataset.tod || 'day'], bg: getComputedStyle(document.getElementById('osd'), '::after').backgroundImage.slice(0, 40) }));
        // 中层已登记夜间底图（maps.json periods.night，9ad6dfc）：夜档由底图 + data-tod 承担，不再叠 nighttint / 色调层；没登记夜图才叠（同 mvu093）
        const tint = want ? !res[per].swapped : false;   // I-24: dawn / dusk have their own tc_mid bases now, so every band with a registered base carries no tint
        rep.check(`${name} 时段「${per}」→ 色调 ${want || '无'}`, res[per].tod === want && res[per].night === (want === 'night' && tint) && (tint ? res[per].bg !== 'none' : true), JSON.stringify(res[per]));
        if (want) await B.shot(p, OUT, `tod_${name}_${want}`);
      }
      await vf.evaluate(() => ViewerDebug.go('tc_low')); await B.wait(2000);
      rep.check(`${name} 下层不加色调`, await vf.evaluate(() => !document.body.dataset.tod));
    }
    if (on('sec')) {
      await vf.evaluate(() => { ViewerDebug.closeCard(); ViewerDebug.go('tc_upper'); }); await B.wait(2500);
      const s0 = await vf.evaluate(() => ({ lab: !document.getElementById('tgSec').hidden, off: !document.getElementById('tgSecBox').checked, badges: document.querySelectorAll('.mk .secb').length }));
      rep.check(`${name} 图层菜单有「安保」开关，默认关、无标签`, s0.lab && s0.off && s0.badges === 0, JSON.stringify(s0));
      await vf.evaluate(() => { const b = document.getElementById('tgSecBox'); b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(600);
      const s1 = await vf.evaluate(() => { const b = document.querySelector('.mk[data-name="伊甸庄园"] .secb'); document.querySelector('.mk[data-name="伊甸庄园"]')._open();
        return { badge: b?.textContent, rows: [...document.querySelectorAll('#card .secbox dt')].map(x => x.textContent) }; });
      rep.check(`${name} 打开后伊甸庄园有「结警监门」标签，地点卡列出结界 / 监控 / 门禁 / 警报`, s1.badge === '结警监门' && ['结界', '监控', '门禁', '警报'].every(k => s1.rows.includes(k)), JSON.stringify(s1));
      await B.wait(300); await B.shot(p, OUT, `sec_${name}_card`);
      await vf.evaluate(() => { ViewerDebug.closeCard(); ViewerDebug.go('tc_low'); }); await B.wait(2000);
      rep.check(`${name} 没有安保数据的图上开关隐藏`, await vf.evaluate(() => document.getElementById('tgSec').hidden));
      await vf.evaluate(() => SecurityView.set(false));
    }
    if (on('sources')) {
      const r = await p.evaluate(() => window.EdenMap.sources());
      rep.check(`${name} EdenMap.sources()：地点来自 MVU、没装数据库插件、人物来源计数`, r.location === 'mvu' && r.mvu.present && r.mvu.mode === 'mvu' && r.db === null && r.tags === true && typeof r.characters === 'object', JSON.stringify(r).slice(0, 300));
      await p.evaluate(() => { window.AutoCardUpdaterAPI = { exportTableAsJson: () => ({ s1: { name: '人物表', content: [[null, '姓名', '位置'], [1, '丙一', '中层']] } }) }; });
      const r2 = await p.evaluate(() => window.EdenMap.sources());
      rep.check(`${name} 装了数据库插件：db = { tables, chars }`, r2.db?.tables === 1 && r2.db?.chars === 1, JSON.stringify(r2.db));
    }
    rep.check(`${name} 无页面错误`, !errs(P).length, errs(P).join(' | ').slice(0, 300));
  } catch (e) { rep.check(`${name} 运行`, false, String(e).slice(0, 300)); }
  finally { await P.ctx.close(); }
}

try { await run('desk', 'desktop'); await run('phone', 'phone'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
