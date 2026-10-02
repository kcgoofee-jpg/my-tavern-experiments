// FOG-1（D39 / D40）：城外雾与上层合成的数据与接线护栏。纯源码 / 数据断言；行为在 tools/browser/fog_probe.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rd = f => readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');
const maps = JSON.parse(rd('data/maps.json'));
const PERIODS = ['day', 'dawn', 'dusk', 'night'];

test('雾 / 调色 / 云精灵令牌按时段成套登记（tokens.css 与 viewer.html 内联副本一致由 smoke 把关）', () => {
  const tok = rd('ui/tokens.css');
  for (const p of PERIODS) {
    assert.match(tok, new RegExp(`--fog-${p}:\\s*#`));
    assert.match(tok, new RegExp(`--fog-${p}-hi:\\s*#`));
    assert.match(tok, new RegExp(`--puff-${p}:`));
    assert.match(tok, new RegExp(`--grade-${p}:`));
  }
  for (const p of ['dawn', 'dusk', 'night']) assert.match(tok, new RegExp(`--vig-${p}:`));
  assert.ok(rd('viewer.html').includes('--fog-night:'), 'viewer.html 内联令牌已同步');
});

test('D40: tc_upper 的「显示下方城市」带合成计划（under + 掩模资产），各层同一画面框对齐', () => {
  const up = maps.maps.tc_upper, c = up.alt?.composite;
  assert.ok(c, 'tc_upper.alt.composite 存在');
  assert.equal(c.under, 'tc_mid');
  assert.ok(existsSync(new URL('../map/' + c.mask, import.meta.url)), '掩模资产随包发布');
  assert.deepEqual(maps.maps.tc_mid.view.extent_m, up.view.extent_m);   // 同一 3000×1875 m 框 → 合成对齐
  assert.ok(up.alt.base, '旧式 alt.base 留作掩模失败的自愈退路');
});

test('D40: 掩模资产与画面框同纵横比，数据里每座岛都有轮廓（掩模由它生成）', () => {
  const buf = readFileSync(new URL('../map/' + maps.maps.tc_upper.alt.composite.mask, import.meta.url));
  assert.equal(buf.readUInt32BE(12), 0x49484452, 'PNG IHDR');   // PNG 签名 8 字节 + 长度 4 字节之后是 IHDR
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const want = 1875 / 3000;
  assert.ok(Math.abs(h / w - want) < .01, `mask aspect ${h / w} ≈ ${want}`);
  const data = JSON.parse(rd('data/tc_upper.json'));
  assert.ok(data.islands.length >= 9 && data.islands.every(i => Array.isArray(i.outline) && i.outline.length > 8));
});

test('A6: 三个分层的无时段默认底图 = 同一档（白天图）', () => {
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) {
    const m = maps.maps[id];
    assert.equal(m.base, m.periods.day, id);
    for (const p of PERIODS) assert.ok(m.periods[p], `${id} ${p}`);
  }
});

test('item 5: 分层缩放下限是常量 0.5（城区 ≥ 半个视口宽再交接回世界图）', () => {
  const src = rd('app/locate.mjs');
  assert.match(src, /export const TIER_MIN_ZOOM = \.5/);
  assert.match(src, /ring \? TIER_MIN_ZOOM : null/);
  assert.doesNotMatch(src, /1 \/ RING_W/);
});

test('A1: 插图在非白天档不叠（导出 insetAllowed；时钟换档时重查）', () => {
  const src = rd('app/hires-inset-tiles.mjs');
  assert.match(src, /export const insetAllowed/);
  assert.match(src, /insetAllowed\(\)/);
  assert.match(rd('app/host-messages.mjs'), /eden-map:clock.*updateInsets|updateInsets.*clock/s);
});

test('D40: 合成是通用三层（层序 + 掩模 + 位移），引擎不写死任何一层', () => {
  const src = rd('app/tier-fog.mjs');
  assert.match(src, /destination-in/);
  assert.match(src, /destination-over/);
  assert.match(src, /offset/);
  assert.match(src, /alt\.composite/);
  assert.ok(!src.includes('tc_upper') && !src.includes('tc_mid'), '引擎模块零卡词');
});

test('A7: 没有时段底图的图挂 data-gradetod 整体调色（判定在 custom-tint，样式在 tier-fog）', () => {
  assert.match(rd('custom-tint.mjs'), /gradetod/);
  const css = rd('app/tier-fog.mjs');
  assert.match(css, /data-gradetod=night.*grade-night/s);
  assert.match(css, /data-gradetod=night[\s\S]*--vig-night/);
});

test('A3 / item 6: 精灵按时段调色走 --puff-* 令牌；旧的全白扫屏元素已删', () => {
  assert.match(rd('app/clouds.mjs'), /--puff-night/);
  const html = rd('viewer.html');
  assert.ok(!html.includes('clCover'), '白幕元素不存在');
  assert.match(html, /--puff-op/);
});

// 护栏（FOG-1 修出来的真问题）：自装模块（顶层 setInterval 自启动，viewer.html 用模块标签挂）不能被核心模块 import。
// app_modules.test.mjs 特意把定时器打成桩再求值它们；别的 node 测试（layer_values / nav_ops / declared_layers /
// block_canvas）经核心模块的导入图间接求值到自装模块时，顶层 setInterval 会让整个测试进程挂着不退出。
const SELF = ['card-links', 'clouds', 'fog', 'data-mapping-settings', 'scale-handoff', 'tier-fog', 'feature-card', 'ai-cards', 'ai-nav-form', 'profile-live'];
test('自装模块不在核心模块的导入图里（否则 node --test 会挂住不退出）', () => {
  const appDir = new URL('../map/app/', import.meta.url), seen = new Set(), bad = [];
  const walk = f => {
    const key = path.basename(f);
    if (seen.has(key) || SELF.includes(key)) return;
    seen.add(key);
    for (const m of rd('app/' + key).matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) {
      const p = path.basename(m[1]);
      if (p.endsWith('.mjs') && existsSync(new URL('app/' + p, import.meta.url))) { if (SELF.includes(p)) bad.push(`${key} → ${p}`); walk(p); }
    }
  };
  for (const f of readdirSync(appDir).filter(f => f.endsWith('.mjs') && !SELF.includes(f))) walk(f);
  assert.deepEqual(bad, []);
  for (const f of SELF) if (existsSync(new URL('app/' + f + '.mjs', import.meta.url))) {   // 自装模块的定时器都在 init 里清掉
    const src = rd('app/' + f + '.mjs');
    for (const m of src.matchAll(/^const \w+ = setInterval\([^;]*clearInterval/gm)) assert.ok(m[0].includes('clearInterval'), f);
  }
});
