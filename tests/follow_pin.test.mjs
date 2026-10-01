// I-14 / I-15：跟随与分支加载只走提交号地址；检查更新的通道判定；当前构建行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refKind, updateChannel, parseScriptBase, contentBase, entryUrl } from '../map/tavern/follow-pin.mjs';
import { buildLine } from '../map/app/about-build.mjs';
import { resolveFollow } from '../map/tavern/branch-follow.mjs';

const SHA = 'a225973101a5b31396c03aa55ed8276eb945bf9a', REPO = 'o/r';

test('refKind：提交号 / 标签 / 分支名', () => {
  for (const [r, k] of [['preview', 'branch'], ['main', 'branch'], ['feature-x', 'branch'], ['a225973', 'sha'], [SHA, 'sha'], ['map-v0.9.7', 'tag'], ['map-v0.9.6.1', 'tag'], ['map-s2-v0.1.0', 'tag'], ['', ''], [null, '']]) assert.equal(refKind(r), k, String(r));
});

test('updateChannel 判定表：分支名 = 跟随；标签 / 提交号 = 正式版链', () => {
  const T = [
    [{ channel: 'follow', ref: 'preview' }, 'follow'], [{ channel: 'ref', ref: 'preview' }, 'follow'], [{ channel: 'ref', ref: 'main' }, 'follow'],
    [{ channel: 'follow', ref: '' }, 'follow'], [{ channel: 'tag', ref: 'map-v0.9.7' }, 'release'], [{ channel: 'latest', ref: 'map-v0.9.7' }, 'release'],
    [{ channel: 'ref', ref: SHA }, 'release'], [{ channel: 'local', ref: '' }, 'release'], [{}, 'release'], [undefined, 'release'],
  ];
  for (const [i, o] of T) assert.equal(updateChannel(i), o, JSON.stringify(i));
});

test('contentBase：follow / 分支用 @<sha>，release 用标签，内容文件从不拼 @preview', () => {
  for (const host of ['cdn.jsdelivr.net', 'cdn.jsdmirror.com', 'http://localhost:9000']) {
    const o = /^http/.test(host) ? host : 'https://' + host;
    assert.equal(contentBase({ channel: 'follow', ref: 'preview', sha: SHA, host, repo: REPO }), `${o}/gh/${REPO}@${SHA}/map/`);
    assert.equal(contentBase({ channel: 'ref', ref: 'main', sha: SHA, host, repo: REPO }), `${o}/gh/${REPO}@${SHA}/map/`);
    assert.equal(contentBase({ channel: 'tag', ref: 'map-v0.9.7', host, repo: REPO }), `${o}/gh/${REPO}@map-v0.9.7/map/`);
    assert.equal(contentBase({ channel: 'latest', ref: 'map-s2-v0.1.0', host, repo: REPO }), `${o}/gh/${REPO}@map-s2-v0.1.0/map/`);
  }
  assert.equal(contentBase({ channel: 'follow', ref: 'preview', sha: '', host: 'cdn.jsdelivr.net', repo: REPO }), null, '没有 sha = 不取内容（调用方保持现状）');
  assert.equal(contentBase({ channel: 'follow', ref: 'preview', sha: 'preview', host: 'cdn.jsdelivr.net', repo: REPO }), null, 'sha 不能是分支名');
  assert.equal(contentBase({ channel: 'tag', ref: 'preview', host: 'cdn.jsdelivr.net', repo: REPO }), null, '正式版必须是标签形状');
  for (const c of ['follow', 'ref', 'tag', 'latest']) for (const r of ['preview', 'main', 'map-v0.9.7']) {
    const u = contentBase({ channel: c, ref: r, sha: SHA, host: 'cdn.jsdelivr.net', repo: REPO, tag: 'map-v0.9.7' });
    assert.ok(!u || !/@(preview|main)\//.test(u), `${c}/${r} → ${u}`);
  }
  assert.equal(entryUrl(`https://h/gh/${REPO}@${SHA}/map/`), `https://h/gh/${REPO}@${SHA}/map/tavern/eden-map.js`);
});

test('parseScriptBase：从自己的加载地址取出 origin / repo / ref', () => {
  assert.deepEqual(parseScriptBase('https://cdn.jsdelivr.net/gh/o/r@preview/map/'), { origin: 'https://cdn.jsdelivr.net', repo: 'o/r', ref: 'preview' });
  assert.deepEqual(parseScriptBase(`http://localhost:8123/gh/o/r@${SHA}/map/tavern/follow-gate.mjs`), { origin: 'http://localhost:8123', repo: 'o/r', ref: SHA });
  assert.equal(parseScriptBase('http://localhost:8000/map/'), null);
});

test('resolveFollow 带回 head.json 的提交时间 at', async () => {
  const get = async u => (u.includes('jsdelivr.net') ? { build: 7, sha: SHA, at: '2026-10-01T06:24:52Z' } : null);
  const h = await resolveFollow(REPO, 'preview', get, null);
  assert.equal(h.build, 7); assert.equal(h.at, '2026-10-01T06:24:52Z');
});

test('buildLine：当前构建 head #N · sha7 · 时间（head 的提交时间，没有就标「加载于」）', () => {
  const tx = (k, d, v) => d.replace(/\{(\w+)\}/g, (_, n) => v?.[n] ?? '');
  const at = new Date(2026, 9, 1, 14, 24).toISOString();
  assert.equal(buildLine({ build: 202, sha: SHA, at }, tx, 0), '当前构建 head #202 · a225973 · 2026-10-01 14:24');
  assert.equal(buildLine({ build: 202, sha: SHA }, tx, new Date(2026, 9, 2, 9, 5).getTime()), '当前构建 head #202 · a225973 · 加载于 2026-10-02 09:05');
  assert.equal(buildLine({ sha: SHA }, tx, 0).startsWith('当前构建 head #? · a225973'), true);
  assert.equal(buildLine({}, tx), ''); assert.equal(buildLine(null, tx), '');
});
