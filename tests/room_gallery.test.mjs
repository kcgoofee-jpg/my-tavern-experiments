import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as LOGIC from '../map/core/room-gallery-logic.mjs';
import {
  fitSize, scopeKey, imageRecordKey, checkQuota, makeImageMeta, reorder, MAX_DIM,
  isValidGalleryFile, safeGalleryImagePath,
} from '../map/core/room-gallery-logic.mjs';
import { createEditor } from '../map/app/pack-edit.mjs';
import { exportPack } from '../map/core/pack-export.mjs';
import { overlayText } from '../map/core/pack-draft.mjs';
import { PNG, PNG2, base } from './helpers/pack_pics.mjs';

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

test('makeImageMeta 校验 visibility 并默认私人', () => {
  const m = makeImageMeta({ id: 'i1', roomId: 'bedroom', order: 0, w: 800, h: 600, bytes: 1000 });
  assert.equal(m.visibility, 'private');
  assert.throws(() => makeImageMeta({ id: 'i1', roomId: 'bedroom', visibility: 'weird' }));
  assert.equal(makeImageMeta({ id: 'i1', roomId: 'bedroom', visibility: 'public' }).visibility, 'private', 'a stored "public" reads as private (K-R102)');
  assert.equal(makeImageMeta({ id: 'i1', roomId: 'bedroom', visibility: 'pack' }).visibility, 'pack');
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

test('the maintainer workflow is gone: no issue link, no export manifest, no maintainer switch (E-08)', () => {
  for (const k of ['buildIssueUrl', 'buildExportManifest', 'MAINTAINER_MODE_KEY', 'readMaintainerMode']) assert.equal(k in LOGIC, false, k);
  for (const f of ['map/ui/room-gallery-panel.js', 'map/app/settings.mjs', 'map/core/room-gallery-logic.mjs']) {
    const src = readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
    assert.doesNotMatch(src, /Maintainer|maintainer|issues\/new|buildIssueUrl|gallery_maintainer|github\.com/, f);
  }
  const html = readFileSync(fileURLToPath(new URL('../map/viewer.html', import.meta.url)), 'utf8');
  assert.doesNotMatch(html, /optGalleryMaintainer|gallery_maintainer|gallery_group/);
});

test('K-R102: a private record is never in the output of exportPack or of the overlay export, whatever is passed along', () => {
  const secret = { ...makeImageMeta({ id: 'iSECRET', roomId: 'n:alpha', order: 0, w: 1, h: 1, bytes: 9, note: 'my private note' }), scope: 'global', key: 'global::n:alpha::iSECRET', blob: 'SECRET-BYTES-0123456789' };
  const e = createEditor({ pack: base() }), m = e.addPicture({ src: PNG, w: 1, h: 1 }); e.attach('alpha', m.id); e.addPicture({ src: PNG2 });
  const opts = { draft: e.draft, card: { name: 'Tide' }, privateRecords: [secret], private: [secret], images: [secret], gallery: [secret], records: [secret] };
  const a = exportPack(base(), opts), o = overlayText(e.draft, base());
  assert.deepEqual(a.problems, []);
  for (const text of [a.text, a.compact, o]) for (const needle of ['iSECRET', 'SECRET-BYTES', 'my private note', 'n:alpha', 'global::']) assert.ok(!text.includes(needle), needle);
  assert.ok(a.text.includes(PNG.slice(30, 60)), 'a picture the author put into the pack on purpose is there');
  for (const f of ['map/core/pack-export.mjs', 'map/core/pack-draft.mjs', 'map/core/pack-media.mjs']) assert.doesNotMatch(readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8'), /room-gallery/, f + ' does not touch the private picture store');
  // "add to pack" copies the picture (a new pack item); the private record itself is untouched and still private
  const copy = e.addPicture({ src: PNG2, w: 1, h: 1 }); assert.ok(copy.ok); assert.equal(secret.visibility, 'private');
});

test('an image outside the allowed sources is refused: the guard of the shared gallery folder and the pack picture rules agree', () => {
  assert.equal(safeGalleryImagePath('bedroom', 'https://evil.example/a.png'), null); assert.equal(isValidGalleryFile('a.svg'), false);
  const e = createEditor({ pack: base() });
  for (const src of ['https://evil.example/a.png', 'http://evil.example/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', '../a.png', 'a.png']) assert.equal(e.addPicture({ src }).ok, false, src);
  assert.deepEqual(e.draft.media, {});
});
