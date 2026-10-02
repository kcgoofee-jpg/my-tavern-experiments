// I-14 验收：跟随 / 分支加载只走提交号地址。在本机造一个假 CDN（/gh/o/r@<ref>/map/…）：
//   两个「头」A / B（各有自己的 head.json 与 build.json 标记），分支路径 @preview 的内容文件故意永远是 A 的（模拟被缓存的陈旧分支）。
//   在头 A 上加载宿主页 → 发布头 B → 重载：查看器必须报告 B 的提交号与构建标记，内容请求不得走分支名地址（只有 head.json 可以）。
// 用法：node tools/browser/follow_pin.mjs <输出目录>
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/follow_pin.mjs <输出目录>'); process.exit(2); }
B.quietWait(); await B.ensureServer(); const rep = B.reporter(OUT);
const MAP = path.resolve(B.REPO_ROOT, 'map');
const SHA = { A: 'a'.repeat(39) + '1', B: 'b'.repeat(39) + '2' }, BUILD = { A: 9001, B: 9002 }, MARK = { A: 'HEAD-A-MARK', B: 'HEAD-B-MARK' };
const TYPES = { '.json': 'application/json', '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
let branchHead = 'A'; const reqs = [];

async function setup(P) {
  await P.ctx.route(/\/gh\/o\/r@[^/]+\/map\//, async route => {
    const u = new URL(route.request().url()), m = /\/gh\/o\/r@([^/]+)\/map\/(.*)$/.exec(u.pathname), ref = decodeURIComponent(m[1]), rel = decodeURIComponent(m[2]);
    reqs.push({ ref, rel });
    const which = ref === 'preview' ? 'A' : ref === SHA.A ? 'A' : ref === SHA.B ? 'B' : null;   // 分支路径上的内容永远是陈旧的 A
    if (!which) return route.fulfill({ status: 404, body: 'no such ref' });
    if (rel === 'data/head.json') { const h = ref === 'preview' ? branchHead : which; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ build: BUILD[h], sha: SHA[h], branch: 'preview', at: '2026-10-01T06:24:52Z' }) }); }
    const f = path.resolve(MAP, rel); if (!f.startsWith(MAP + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    if (rel === 'data/build.json') { const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.code = MARK[which]; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(j) }); }
    return route.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
  });
}

async function load(P, name) {
  reqs.length = 0;
  const H = await openHost(P, { here: '', stat: {}, msgs: [{ message_id: 1, message: '到了。' }], chat: 'fp-' + name, scriptBase: `${B.BASE}gh/o/r@preview/map/`.replace(/map\/$/, 'map/') });
  await H.open(); const vf = await H.viewer(); await B.wait(1500);
  const r = await vf.evaluate(async () => { SettingsApi.open('update'); await new Promise(z => setTimeout(z, 400)); const m = await import('./app/settings.mjs'); return { about: m.about, line: document.querySelector('#buildLine')?.textContent || '', build: await fetch('data/build.json').then(x => x.json()).catch(() => null) }; });
  const S = await (await (await P.page.$('#card')).contentFrame()).evaluate(() => window.__edenMapScript || null);   // 脚本跑在卡片 iframe 里
  return { r, S, urls: [...reqs] };
}

try {
  const P = await B.newPage('desktop', { tier: 'save' });
  await setup(P);
  branchHead = 'A';
  const a = await load(P, 'a');
  rep.check('头 A：门卫按提交号重载（SCRIPT.sha = A）', a.S?.sha === SHA.A.slice(0, 12) && a.S?.build === BUILD.A, JSON.stringify(a.S));
  rep.check('头 A：查看器的 build.json 来自 A 的提交号路径', a.r.build?.code === MARK.A, String(a.r.build?.code));
  // 陈旧入口自己的静态模块图（.mjs / .js）会经分支路径取到（它们只是代码、取完什么也不挂）；内容（页面 / 数据 / 包 / 瓦片 / 图）一律不许走分支名
  const bad = x => x.urls.filter(q => q.ref === 'preview' && q.rel !== 'data/head.json' && !/\.m?js$/.test(q.rel)).map(q => q.rel);
  rep.check('头 A：内容请求（非代码）没有走分支名地址', bad(a).length === 0, JSON.stringify(bad(a)));
  rep.check('头 A：关于页「当前构建」一行', /当前构建 head #9001 · aaaaaaa/.test(a.r.line), a.r.line);
  // 发布头 B：分支路径上的内容仍是陈旧的 A，只有 head.json 变了
  branchHead = 'B';
  const b = await load(P, 'b');
  rep.check('头 B：重载后 SCRIPT.sha = B、构建号 = B', b.S?.sha === SHA.B.slice(0, 12) && b.S?.build === BUILD.B, JSON.stringify(b.S));
  rep.check('头 B：查看器报告 B 的构建标记（不是陈旧分支路径的 A）', b.r.build?.code === MARK.B, String(b.r.build?.code));
  rep.check('头 B：关于页「当前构建」跟着变', /当前构建 head #9002 · bbbbbbb/.test(b.r.line), b.r.line);
  rep.check('头 B：没有任何内容请求走分支名地址（只有陈旧入口的代码图与 head.json）', bad(b).length === 0, JSON.stringify(bad(b)));
  rep.check('头 B：数据 / 查看器页 / 包文件都在 B 的提交号下', b.urls.some(q => q.ref === SHA.B && q.rel === 'viewer.html') && b.urls.some(q => q.ref === SHA.B && /^packs\/eden\/manifest\.json$/.test(q.rel)), String(b.urls.filter(q => q.ref === SHA.B).length));
  rep.check('页面无报错', P.errors.filter(e => !/favicon|ERR_|404/.test(e)).length === 0, P.errors.slice(0, 3).join(' | '));
  await P.close();
} catch (e) { rep.check('探针运行', false, String(e.stack || e).slice(0, 300)); }
await B.closeAll(); process.exit(rep.save() ? 0 : 1);
