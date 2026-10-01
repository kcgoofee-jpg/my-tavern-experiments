// S8-4b (K-R80 amendment): a `label` feature whose style has `badge: true` is a chip filled with the feature colour (`--lc`), its ink picked for contrast (`--lc-ink`); a token colour keeps white ink.
import test from 'node:test';
import assert from 'node:assert/strict';

const el = () => ({ dataset: {}, attrs: {}, className: '', textContent: '', style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, classList: { s: new Set(), add(c) { this.s.add(c); } }, setAttribute(k, v) { this.attrs[k] = v; } });
const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { getElementById: () => ({}), createElement: el, createElementNS: el, head: { appendChild() {} } };
const { labelEl, inkFor } = await import('../map/app/block-overlay.mjs');
had ? Object.defineProperty(globalThis, 'document', had) : delete globalThis.document;
globalThis.document = { getElementById: () => ({}), createElement: el };   // labelEl runs after the import

test('inkFor: dark ink on a light colour, white ink on a dark one, white for anything that is not a hex', () => {
  assert.equal(inkFor('#e8b33a'), '#14121a'); assert.equal(inkFor('#59b36b'), '#14121a'); assert.equal(inkFor('#3fa7d6'), '#14121a');
  assert.equal(inkFor('#1d2a55'), '#ffffff'); assert.equal(inkFor('#b07cd8'), '#14121a'); assert.equal(inkFor('#e0736a'), '#14121a'); assert.equal(inkFor('#7a2f2f'), '#ffffff'); assert.equal(inkFor('var(--accent)'), '#ffffff');
});

test('labelEl: badge true sets the class and the two custom properties; without it nothing changes', () => {
  const f = { label: '2' }, b = labelEl(f, { badge: true, color: '#e8b33a', size: 'small', tone: 'chip', opacity: 1 }), plain = labelEl(f, { color: '#e8b33a', size: 'small', tone: 'chip', opacity: 1 });
  assert.ok(b.classList.s.has('badge')); assert.equal(b.style.props['--lc'], '#e8b33a'); assert.equal(b.style.props['--lc-ink'], '#14121a'); assert.equal(b.textContent, '2');
  assert.ok(!plain.classList.s.has('badge')); assert.equal(plain.style.props['--lc'], undefined);
  const tok = labelEl(f, { badge: true, color: '--accent', tone: 'chip', opacity: 1 }); assert.equal(tok.style.props['--lc'], 'var(--accent)'); assert.equal(tok.style.props['--lc-ink'], '#ffffff');
  const bad = labelEl(f, { badge: true, color: 'red', tone: 'chip', opacity: 1 }); assert.equal(bad.style.props['--lc'], 'var(--accent)', 'a colour that fails the re-check falls back to the accent');
});
