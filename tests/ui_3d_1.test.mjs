// UI-3D-1: compact stacks are icon-only (the zoom stack, the 3D view button), the 3D floor strip shows codes only,
// the map has its own 「提醒 AI」 entry, and the pickup scan version moved with the OOC strip (old scans are redone once).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../map/core/pickup.mjs';
const R = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('the zoom stack has no visible text: every button holds an svg and carries aria-label + title', () => {
  const html = R('../map/viewer.html'), m = /<div id="zoom"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(m, 'zoom stack present');
  const buttons = [...m[1].matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
  assert.ok(buttons.length >= 5);
  for (const b of buttons) {
    assert.match(b[0], /aria-label="[^"]+"/); assert.match(b[0], /title="[^"]+"/); assert.match(b[1], /^<svg[\s\S]*<\/svg>$/, 'the button holds only an icon');
    assert.ok(!/data-i18n="/.test(b[0].split('>')[0]), 'no text key on the button (a text key would paint words over the icon)');
  }
  assert.ok(buttons.some(b => /id="zAll"/.test(b[0]) && /aria-label="看全区"/.test(b[0])));
});

test('the 3D level strip draws the floor code only; the full name is aria-label and title', () => {
  const src = R('../map/app/estate-shell.mjs');
  const fn = src.slice(src.indexOf('export function stripFloors'), src.indexOf('export function onKey'));
  assert.ok(!/createElement\('small'\)/.test(fn), 'no subtitle element in the strip');
  assert.match(fn, /setAttribute\('aria-label'/); assert.match(fn, /b\.title = f\.label/);
  assert.match(src, /btn\.innerHTML = iconSvg\('cube'\)/, 'the phone view button is an icon, the view name is in aria-label');
});

test('the map has an icon entry for 「提醒 AI」 that reuses the same templates and never sends', () => {
  const src = R('../map/ooc-view.mjs');
  assert.match(src, /id = 'oocBtn'/); assert.match(src, /setAttribute\('aria-label', name\)/); assert.match(src, /UIIcon\.svg\('nudge'\)/);
  assert.ok((src.match(/type: 'eden-map:compose', text, ooc: true/g) || []).length >= 2, 'both entries fill the input through the compose path');
  assert.ok(/nudge:/.test(R('../map/ui/icons.js')));
});

test('SCAN_VER moved past the OOC strip, so scans made before it are redone once', () => {
  assert.ok(P.SCAN_VER >= 4);
  assert.match(R('../map/tavern/stash-recompute.mjs'), /hashText\(text\) \+ '\.' \+ P\.SCAN_VER/, 'the stored mark carries the scan version');
});

test('the label planner never caches a guessed width', () => {
  const src = R('../map/estate/main.js');
  assert.ok(!/offsetWidth \|\| 60/.test(src));
  assert.match(src, /if \(!it\.lw && el\.firstChild\.offsetWidth > 0\)/);
});
