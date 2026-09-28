import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitSize, scopeKey, imageRecordKey, checkQuota, makeImageMeta, reorder, buildExportManifest, buildIssueUrl, MAX_DIM,
  isValidGalleryFile, safeGalleryImagePath, readMaintainerMode, MAINTAINER_MODE_KEY,
} from '../map/core/room-gallery-logic.mjs';

test('fitSize 不放大小图，长边封顶 1600', () => {
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 });
  const r = fitSize(3200, 1600);
  assert.equal(Math.max(r.w, r.h), MAX_DIM);
  assert.equal(r.w, 1600); assert.equal(r.h, 800);
});

test('scopeKey 按聊天隔离或全局共享', () => {
  assert.equal(scopeKey('global'), 'global');
  assert.equal(scopeKey('chat', 'abc123'), 'chat:abc123');
  assert.throws(() => scopeKey('chat'));
});

test('imageRecordKey 用房间 id（不是自定义显示名）', () => {
  assert.equal(imageRecordKey('bedroom', 'img1'), 'bedroom::img1');
});

test('checkQuota 超限返回 over > 0', () => {
  const ok = checkQuota(10, 5, 100); assert.equal(ok.ok, true); assert.equal(ok.over, 0);
  const bad = checkQuota(95, 10, 100); assert.equal(bad.ok, false); assert.equal(bad.over, 5);
});

test('makeImageMeta 校验 visibility 并默认自用', () => {
  const m = makeImageMeta({ id: 'i1', roomId: 'bedroom', order: 0, w: 800, h: 600, bytes: 1000 });
  assert.equal(m.visibility, 'private');
  assert.throws(() => makeImageMeta({ id: 'i1', roomId: 'bedroom', visibility: 'weird' }));
  assert.throws(() => makeImageMeta({ id: '', roomId: 'bedroom' }));
});

test('reorder 移动到新位置并重编号，无空洞', () => {
  const list = [
    makeImageMeta({ id: 'a', roomId: 'r', order: 0 }),
    makeImageMeta({ id: 'b', roomId: 'r', order: 1 }),
    makeImageMeta({ id: 'c', roomId: 'r', order: 2 }),
  ];
  const moved = reorder(list, 'c', 0);
  assert.deepEqual(moved.map(x => x.id), ['c', 'a', 'b']);
  assert.deepEqual(moved.map(x => x.order), [0, 1, 2]);
});

test('buildExportManifest 只导出公开图，文件名带序号', () => {
  const images = [
    makeImageMeta({ id: 'p1', roomId: 'bedroom', order: 0, visibility: 'public', w: 1600, h: 900 }),
    makeImageMeta({ id: 's1', roomId: 'bedroom', order: 1, visibility: 'private', w: 1600, h: 900 }),
    makeImageMeta({ id: 'p2', roomId: 'bedroom', order: 2, visibility: 'public', w: 1200, h: 1600 }),
  ];
  const { manifest, files, count } = buildExportManifest({ roomId: 'bedroom', images, author: 'kc' });
  assert.equal(count, 2);
  assert.equal(files.length, 2);
  assert.equal(files[0].file, 'bedroom_01.webp');
  assert.equal(files[1].file, 'bedroom_02.webp');
  assert.equal(manifest.room, 'bedroom');
  assert.equal(manifest.images.length, 2);
});

test('buildExportManifest 无公开图时 count 为 0', () => {
  const images = [makeImageMeta({ id: 's1', roomId: 'bedroom', order: 0, visibility: 'private' })];
  const { count, files } = buildExportManifest({ roomId: 'bedroom', images });
  assert.equal(count, 0); assert.deepEqual(files, []);
});

test('buildIssueUrl 生成预填 GitHub issue 链接', () => {
  const url = buildIssueUrl({ repo: 'someone/eden-map', roomId: 'bedroom', count: 3 });
  assert.match(url, /^https:\/\/github\.com\/someone\/eden-map\/issues\/new\?title=/);
  assert.match(url, /bedroom/);
});

test('isValidGalleryFile 只认扁平文件名 + 白名单类型', () => {
  assert.equal(isValidGalleryFile('bedroom_01.webp'), true);
  assert.equal(isValidGalleryFile('a.jpg'), true);
  assert.equal(isValidGalleryFile('a.JPG'), true);
  assert.equal(isValidGalleryFile('../x.png'), false);
  assert.equal(isValidGalleryFile('a/b.png'), false);
  assert.equal(isValidGalleryFile('.hidden.png'), false);
  assert.equal(isValidGalleryFile('a.svg'), false);
  assert.equal(isValidGalleryFile(''), false);
  assert.equal(isValidGalleryFile(null), false);
});

test('safeGalleryImagePath 只拼 map/art/gallery/<roomId>/<file>，非法输入返回 null', () => {
  assert.equal(safeGalleryImagePath('bedroom', 'a.webp'), 'art/gallery/bedroom/a.webp');
  assert.equal(safeGalleryImagePath('bedroom', '../../etc/passwd'), null);
  assert.equal(safeGalleryImagePath('', 'a.webp'), null);
  assert.equal(safeGalleryImagePath('bedroom', 'https://evil.example/a.png'), null);
});

test('readMaintainerMode 默认关闭，只在本机 localStorage 显式打开时为 true', () => {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null) };
  assert.equal(readMaintainerMode(ls), false);
  store.set(MAINTAINER_MODE_KEY, '1');
  assert.equal(readMaintainerMode(ls), true);
  assert.equal(readMaintainerMode(null), false);
  assert.equal(readMaintainerMode(undefined), false);
});
