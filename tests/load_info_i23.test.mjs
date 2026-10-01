// I-23: About on a script loaded at a commit: the build number is found from the branch's recent head.json records, the channel says
// "pinned @<sha7>" or the followed branch, and the branch selector never claims the release channel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadInfo, buildOfSha } from '../map/tavern/follow-pin.mjs';
import { createAbout } from '../map/tavern/host-about.mjs';
import * as SRC from '../map/tavern/data-source-registry.mjs';
import { resolveFollow } from '../map/tavern/branch-follow.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const S1 = 'a225973101a5b31396c03aa55ed8276eb945bf9a', S2 = 'b3824240' + 'c'.repeat(32), S3 = 'd'.repeat(40);
const HEAD = { build: 212, sha: S3, at: '2026-10-01T08:24:57Z', history: [{ build: 211, sha: S2.slice(0, 12) }, { build: 202, sha: S1.slice(0, 12), at: '2026-09-30T10:00:00Z' }] };

test('loadInfo label decision table', () => {
  const T = [
    [{ script: { channel: 'ref', ref: S1.slice(0, 7) }, loaded: S1.slice(0, 7), ver: '0.9.7' }, { kind: 'pinned', selector: 'pin' }],   // a baked version must not turn it into the release channel
    [{ script: { channel: 'ref', ref: S1 }, loaded: S1, swappable: true }, { kind: 'pinned', selector: 'pin' }],
    [{ script: { channel: 'follow', ref: 'preview', sha: S2.slice(0, 12), build: 211 }, loaded: S2.slice(0, 12), ver: '0.9.7' }, { kind: 'follow', branch: 'preview', selector: 'preview' }],
    [{ script: { channel: 'ref', ref: 'preview', sha: S2.slice(0, 12) }, loaded: S2.slice(0, 12) }, { kind: 'follow', branch: 'preview', selector: 'preview' }],
    [{ script: {}, loaded: '', ver: '0.9.7' }, { kind: 'tag', selector: 'main' }],
    [{ script: { channel: 'latest', ref: 'map-v0.9.7' }, loaded: 'map-v0.9.7', ver: '0.9.7' }, { kind: 'latest', selector: 'main' }],
    [{ script: {}, loaded: '' }, { kind: 'local', selector: '' }],
  ];
  for (const [i, want] of T) { const got = loadInfo(i); for (const k of Object.keys(want)) assert.equal(got[k], want[k], JSON.stringify(i) + ' ' + k); }
});

test('buildOfSha: the head itself, a recorded earlier build (prefix either way), unknown', () => {
  assert.deepEqual(buildOfSha(HEAD, S3.slice(0, 12)), { build: 212, at: HEAD.at });
  assert.deepEqual(buildOfSha(HEAD, S2), { build: 211 });
  assert.deepEqual(buildOfSha(HEAD, S1.slice(0, 7)), { build: 202, at: '2026-09-30T10:00:00Z' });
  assert.equal(buildOfSha(HEAD, 'e'.repeat(12)), null); assert.equal(buildOfSha(null, S1), null); assert.equal(buildOfSha(HEAD, 'preview'), null);
});

test('resolveFollow carries the recent history of head.json (and drops malformed rows)', async () => {
  const get = async u => (u.includes('jsdelivr.net') ? { ...HEAD, history: [...HEAD.history, { build: 'x', sha: 'zz' }] } : null);
  const h = await resolveFollow('o/r', 'preview', get, null);
  assert.equal(h.history.length, 2); assert.equal(h.history[0].build, 211);
});

function mk(script, scriptBase, VER = '0.9.7') {
  const calls = [], heads = [];
  const d = { cdnFetch: async () => ({ ok: true, json: async () => ({ version: '0.9.7', code: 1 }) }), post: m => calls.push(m), base: () => scriptBase, REPO: 'o/r', scriptBase, VER, tagOf: v => 'map-v' + v,
    LINES: [], swappable: true, SCRIPT: script, lineKey: () => '', lang: () => 'zh', followHead: async b => { heads.push(b); return HEAD; }, followNewer: () => false, loadSelfcheck: async () => null, loadSources: async () => SRC };
  return { ab: createAbout(d), calls, heads };
}

test('About on a pinned commit: build number from head history, pinned label, selector is not the release branch', async () => {
  const { ab, calls, heads } = mk({ channel: 'ref', ref: S1.slice(0, 12) }, `https://cdn.example/gh/o/r@${S1.slice(0, 12)}/map/`);
  await ab.sendAbout(); const m = calls.find(c => c?.type === 'eden-map:about');
  assert.equal(m.build, 202); assert.equal(m.at, '2026-09-30T10:00:00Z'); assert.equal(m.pinned, S1.slice(0, 7)); assert.equal(m.branch, 'pin'); assert.deepEqual(heads, ['preview']);
  assert.equal(m.sha, S1.slice(0, 12));
});

test('About on a bootstrap load: follow channel with the build the bootstrap passed; no lookup, no pin', async () => {
  const { ab, calls, heads } = mk({ channel: 'follow', ref: 'preview', sha: S2.slice(0, 12), build: 211, source: 'jsdelivr' }, `https://cdn.example/gh/o/r@${S2.slice(0, 12)}/map/`);
  await ab.sendAbout(); const m = calls.find(c => c?.type === 'eden-map:about');
  assert.equal(m.channel, 'follow'); assert.equal(m.build, 211); assert.equal(m.pinned, null); assert.equal(m.branch, 'preview'); assert.deepEqual(heads, []);
});

test('About on a release tag keeps the release branch; a pinned commit older than the history has no build (not a wrong one)', async () => {
  const t = mk({}, 'https://cdn.example/gh/o/r@map-v0.9.7/map/'); await t.ab.sendAbout();
  assert.equal(t.calls.find(c => c?.type === 'eden-map:about').branch, 'main');
  const o = mk({ channel: 'ref', ref: 'e'.repeat(12) }, `https://cdn.example/gh/o/r@${'e'.repeat(12)}/map/`); await o.ab.sendAbout();
  const m = o.calls.find(c => c?.type === 'eden-map:about'); assert.equal(m.build, null); assert.equal(m.branch, 'pin');
});

test('tools/bump_head.py history: previous head moves into the list, newest first, capped', () => {
  const py = `import sys, json; sys.path.insert(0, 'tools'); import bump_head as b
prev = {'build': 5, 'sha': '${S1}', 'at': 'T', 'history': [{'build': i, 'sha': '${S2}'} for i in range(1, 5)]}
print(json.dumps(b.history_of(prev, {'build': 6})))
big = {'build': 100, 'sha': '${S1}', 'history': [{'build': i, 'sha': '${S2}'} for i in range(1, 100)]}
print(len(b.history_of(big, {'build': 101})))`;
  const [a, n] = execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  const h = JSON.parse(a); assert.equal(h[0].build, 5); assert.equal(h[0].sha, S1.slice(0, 12)); assert.equal(h[0].at, 'T'); assert.deepEqual(h.map(r => r.build), [5, 4, 3, 2, 1]);
  assert.equal(Number(n), 40);
});
