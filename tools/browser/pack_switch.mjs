// node tools/browser/pack_switch.mjs <输出目录> —— S9-2 通用脚本：一个脚本、按卡解析包，换卡时重启（docs/zero-config.md §2.7，Z-19）
// 桩宿主（host_stub.mjs charLive）：卡 A（名字命中索引里的示例包）→ 卡 B（没人认识）→ 卡 A → 第一个包的卡；每次切换后：注入的包 id、
// 聊天变量根键、包声明的变量路径、面板里查看器的包都只属于当前这张卡；宿主页上始终只有一套悬浮按钮。
import { BASE, closeAll, ensureServer, newPage, shot, wait } from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { knownFor, probeName, loadKnown } from './known.mjs';
const out = process.argv[2] || '/tmp/pack_switch';
await ensureServer();
const res = []; let fail = 0;
const KNOWN = loadKnown(), PROBE = probeName();
const ok = (name, cond, extra = {}) => { const k = cond ? null : knownFor(PROBE, name, KNOWN); res.push({ name, ok: !!cond, ...(k ? { known: k } : {}), ...extra }); if (!cond && !k) fail++; };
const CARD = (name, avatar) => ({ data: { name, creator: '' }, avatar });
try {
  const P = await newPage('desktop'), pg = P.page;
  await P.ctx.addInitScript(() => { try { localStorage.setItem('edenMapLine', 'vpn'); localStorage.setItem('edenMapHint', '1'); } catch (e) {} });
  const H = await openHost(P, { charData: CARD('Brindle', 'a.png'), charLive: true, here: '', msgs: [] });
  const frame = async () => (await pg.$('#card')).contentFrame();
  const state = async () => { const f = await frame(); return f.evaluate(async base => {
    const R = await import(base + 'tavern/mvu-readers.mjs'), PR = await import(base + 'tavern/pack-profile.mjs');
    return { pack: window.__tcPack ? { id: window.__tcPack.id, source: window.__tcPack.source, trust: window.__tcPack.trust, schema: window.__tcPack.schema } : null, root: R.VAR_ROOT, loc: PR.getProfile().paths.location,
      roots: parent.document.querySelectorAll('#eden-map-root').length, fabs: parent.document.querySelectorAll('#eden-map-root .em-fab').length }; }, BASE); };
  const viewerPack = async () => { await H.open(); const v = await H.viewer(); return v ? v.evaluate(() => ({ pack: document.documentElement.dataset.pack || 'eden', title: document.title })) : null; };
  // 另一张卡 = 另一个聊天：聊天变量是空的（一张卡用过的包写在它自己聊天的变量里，K-R92 的 100 分）
  const switchTo = async (card, books) => { await pg.evaluate(([c, b]) => { window.__stub.charData = c; window.__stub.charBooks = b; window.__vars = {}; window.__fire('c'); }, [card, books || null]); await wait(4500); };

  let s = await state(); await wait(800); s = await state();
  ok('卡 A（名字命中索引）：注入的是示例包，来源 index，聊天变量根 tc_minimal，变量路径是包声明的', s.pack?.id === 'minimal' && s.pack.source === 'index' && s.pack.trust === 'shipped' && s.root === 'tc_minimal' && s.loc === 'world.location', s);
  let v = await viewerPack(); ok('卡 A：面板里的查看器是示例包', v?.pack === 'minimal', v || {}); await shot(pg, out, 'a1');

  await switchTo(CARD('Unknown Card', 'b.png'));
  s = await state();
  ok('卡 B（没人认识）：自动包（c_ 开头，来源 auto，外来），根键换成它自己的，变量路径是自动包从这张卡发现的（K-R95，zero-config §4），不留 A 的', s.pack?.source === 'auto' && /^c_/.test(s.pack.id) && s.pack.trust === 'foreign' && s.root === 'tc_' + s.pack.id && s.loc === '世界.当前地点', s);   // 自动包把发现的路径写进 vars（a8127c7e，S9-3）；桩宿主的 MVU 里就是 世界.当前地点，所以不再是空串，但绝不是 A 的 world.location
  ok('卡 B：宿主页上只有一套悬浮按钮（旧实例已清）', s.roots === 1 && s.fabs === 1, s);
  const idB = s.pack?.id; v = await viewerPack(); ok('卡 B：面板里的查看器是 B 的包，没有脚本错误', v?.pack === idB && !P.errors.length, { ...(v || {}), errors: P.errors }); await shot(pg, out, 'b');

  await switchTo(CARD('Brindle', 'a.png'));
  s = await state();
  ok('回到卡 A：示例包、tc_minimal、变量路径都回来，B 的什么都没留下', s.pack?.id === 'minimal' && s.root === 'tc_minimal' && s.loc === 'world.location' && s.roots === 1, s);
  v = await viewerPack(); ok('回到卡 A：查看器是示例包', v?.pack === 'minimal', v || {});

  await switchTo(CARD('Some Yehehua Edition', 'e.png'), { names: { primary: 'P', additional: [] }, books: { P: [{ name: '世界观', content: 'x', enabled: true, strategy: { keys: ['k'] } }] } });   // I-26: the author word needs a worldbook title next to it
  s = await state();
  ok('第一个包的卡（名字里有作者名）：不注入包对象，根键 eden_map，包声明的变量路径是第一个包的', s.pack === null && s.root === 'eden_map' && s.loc === '世界.当前地点' && s.roots === 1, s);
  v = await viewerPack(); ok('第一个包的卡：查看器是默认包', v?.pack === 'eden', v || {});

  await switchTo(CARD('Unknown Card', 'b.png'));
  s = await state(); ok('再回到卡 B：自动包 id 与第一次相同（同一张卡同一个 id）', s.pack?.id === idB && s.root === 'tc_' + idB && s.loc === '世界.当前地点', s);
  ok('整个过程没有脚本错误', !P.errors.length, { errors: P.errors });
} catch (e) { ok('probe 自己没有抛错：' + e.message, false); }
finally { await closeAll(); }
for (const r of res) console.log(r.ok ? '✓' : r.known ? '~' : '✗', r.name, r.ok ? '' : JSON.stringify(r).slice(0, 400));
console.log(fail ? `FAIL ${fail}` : 'PASS'); process.exit(fail ? 1 : 0);
