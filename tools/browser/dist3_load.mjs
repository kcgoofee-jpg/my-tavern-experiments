// DIST-3（item 5）：每条候选 CDN 线路上「新鲜导入 → 第一帧」的真实加载测试（Playwright Chromium + WebKit）。
// 与 perf_first_frame 的区别：那份量的是本地服务器（数字不可搬）；这里每条线路用真实 CDN 地址作为 scriptBase
// （stub 卡片 iframe 里的 <script type=module src> 直接 import 远端的 map/tavern/eden-map.js），
// 底图、模块、数据全部从该线路取——量出来的就是用户实际会得到的加载时间。
// 线路即 IN-1 测过的候选：jsdmirror / jsDelivr / fastly（@提交号）；raw.githubusercontent 会因 text/plain 的
// MIME 拒绝模块导入、statically.io 大文件挂起——也各测一次，用数字说明为什么被排除。
// 用法：node tools/browser/dist3_load.mjs <输出目录> [--sha=<40 位提交号，默认 HEAD>]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] || '/tmp/dist3_load';
const argSha = (process.argv.find(a => a.startsWith('--sha=')) || '').split('=')[1];
const ROOT = B.REPO_ROOT;
const SHA = argSha || execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const REPO = 'kcgoofee-jpg/my-tavern-experiments';
const LINES = [
  ['jsdmirror', `https://cdn.jsdmirror.com/gh/${REPO}@${SHA}/map/`],
  ['jsdelivr', `https://cdn.jsdelivr.net/gh/${REPO}@${SHA}/map/`],
  ['fastly', `https://fastly.jsdelivr.net/gh/${REPO}@${SHA}/map/`],
  ['raw', `https://raw.githubusercontent.com/${REPO}/${SHA}/map/`],
  ['statically', `https://cdn.statically.io/gh/${REPO}/${SHA}/map/`],
];
const HERE = { here: '天城中层·霓虹街', msgs: [{ message_id: 3, message: '⌖火灾｜中层·霓虹街｜2｜仓库起火' }] };
const FIRST_FRAME = () => {
  const f = document.querySelector('#eden-map-root .em-frame');
  try { return !!f?.contentDocument?.getElementById('loading')?.classList.contains('done'); } catch (e) { return false; }
};
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const LIMIT = 120000;   // 每条线路上限 2 分钟：真挂起的线路（statically）在这里判负，别拖死整个探针

try {
  for (const preset of ['desktop', 'desktopWk']) {
    for (const [name, base] of LINES) {
      const P = await B.newPage(preset, { tier: 'save', init: [() => { try { if (!sessionStorage.getItem('__d3')) { sessionStorage.setItem('__d3', '1'); localStorage.clear(); localStorage.setItem('edenMapSplashSeen', 'dev'); localStorage.setItem('edenMapHint', '1'); } } catch (e) {} }] });
      const p = P.page;
      const t0 = Date.now();
      // openHost 内部等悬浮按钮 15 s，raw / statically 上起不来会抛——这正是要记录的结果，接住即可
      let H = null;
      try { H = await openHost(P, { ...HERE, scriptBase: base }); } catch (e) { P.errors.push('openHost: ' + String(e).slice(0, 120)); }
      const mounted = !!H;
      const mountMs = Date.now() - t0;
      let frameMs = -1;
      if (mounted) {
        await p.locator('#eden-map-root .em-fab').click();
        const ok = await p.waitForFunction(`(${FIRST_FRAME})()`, null, { timeout: LIMIT }).then(() => true).catch(() => false);
        frameMs = ok ? Date.now() - t0 : -1;
      }
      const cdnErrs = P.errors.filter(e => !e.includes('localhost'));
      // gh 三条线路必须能出首帧；raw（text/plain 的 MIME，模块导入被拒）与 statically（大文件挂起）必须出不了——用数字钉住排除理由
      const want = ['jsdmirror', 'jsdelivr', 'fastly'].includes(name);
      rep.check(`${preset} ${name}: ${want ? '首帧' : '按预期起不来'}（${frameMs >= 0 ? frameMs + ' ms，挂载 ' + mountMs + ' ms' : '未起来，' + mountMs + ' ms 处放弃'}）`,
        want ? frameMs >= 0 : frameMs < 0, cdnErrs.length ? cdnErrs.slice(0, 3).join(' | ') : base);
      await P.close();
    }
  }
} catch (e) {
  rep.check('dist3_load 探针跑完', false, String(e).slice(0, 200));
}
srv.stop();
process.exit(rep.save() ? 0 : 1);
