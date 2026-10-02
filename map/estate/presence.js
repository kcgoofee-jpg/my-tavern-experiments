// Presence in the 3D view (docs/ui-refactor.md U-27 / U-28, S7-3 T8): the people the viewer places in rooms of this building (estate:people), drawn as chips, and the people the
// routine schedule moves (dimmed, only those not located). A chip is a <button> with the person's name and room as its accessible name, a 32 px disc in a 44 px hit area; the
// people of one room share one anchor and sit in a row (so they never overlap), more than three fold into a +n chip that opens a list; at most 30 chips. The page stays free of
// the viewer's state: it only draws what it was sent and reports a tap (estate:person). Pure DOM + the CSS2D objects of the page.
import { avatarOk } from '../core/estate-people.mjs';

const HUE = /^(#[0-9a-fA-F]{3,8}|hsla?\(\s*\d{1,3}(\.\d+)?(deg)?[\s,]+\d{1,3}(\.\d+)?%[\s,]+\d{1,3}(\.\d+)?%(\s*[,/]\s*[\d.]+%?)?\s*\))$/;
const NO_FOLD = 3, MAX = 30;
const initial = n => Array.from(String(n || '?'))[0] || '?';
/** the routine people's colour: a hash of the name (the same person, the same colour, no card lookup) */
export const hashColor = s => { let h = 2166136261; for (const c of String(s || '?')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return `hsl(${(h >>> 0) % 360} 30% 42%)`; };

export function createPresence({ THREE, CSS2DObject, scene, roomOf, visibleOn, tx, onPerson, wake, aria }) {
  const group = new THREE.Group(); group.name = 'presence'; scene.add(group);
  const rooms = new Map();   // node id -> { o: CSS2DObject, floor, el }
  let list = [], more = null, openFor = null;
  const moreEl = () => more ||= (() => { const e = document.createElement('div'); e.id = 'more'; e.className = 'g2'; e.hidden = true; e.setAttribute('role', 'menu'); document.body.append(e); return e; })();
  const closeMore = () => { if (more) more.hidden = true; openFor = null; };

  function chip(p, { dim = false, label } = {}) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pc' + (dim ? ' dim' : ''); b.dataset.name = p.name;
    const i = document.createElement('i'); if (HUE.test(p.color || '')) i.style.setProperty('--c', p.color); else i.style.setProperty('--c', hashColor(p.name));
    if (avatarOk(p.avatar)) { const im = document.createElement('img'); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.decoding = 'async'; im.src = p.avatar; im.addEventListener('error', () => { im.remove(); i.textContent = initial(p.name); }); i.append(im); } else i.textContent = initial(p.name);
    const n = document.createElement('b'); n.textContent = p.name + (dim ? ' · ' + tx('schedule') : '');
    b.append(i, n); b.setAttribute('aria-label', label || p.name); if (dim) b.title = tx('schedule');
    b.addEventListener('click', (e) => { e.stopPropagation(); closeMore(); onPerson(p.name, dim); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('dblclick', (e) => e.stopPropagation()); b.addEventListener('pointerup', (e) => e.stopPropagation());
    return b;
  }
  /** a routine person's chip as a CSS2D object (the page moves its group along the walk) */
  function routineChip(name) {
    const el = chip({ name, color: hashColor(name) }, { dim: true, label: name }), o = new CSS2DObject(el); o.position.set(0, 1.9, 0); o.center.set(0.5, 0.5);
    const g = new THREE.Group(); g.add(o); return { g, el, o };
  }
  function foldBtn(node, names, extra) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pc more'; const i = document.createElement('i'); i.textContent = '+' + extra; b.append(i);
    b.setAttribute('aria-label', tx('more', { n: extra })); b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', (e) => { e.stopPropagation(); const m = moreEl(); if (!m.hidden && openFor === node) { closeMore(); return; }
      m.replaceChildren(...names.map((p) => { const x = document.createElement('button'); x.type = 'button'; x.setAttribute('role', 'menuitem'); const d = document.createElement('i'); d.textContent = initial(p.name); if (HUE.test(p.color || '')) d.style.setProperty('--c', p.color);
        x.append(d, p.name); x.addEventListener('click', (ev) => { ev.stopPropagation(); closeMore(); onPerson(p.name, false); }); return x; }));
      const r = b.getBoundingClientRect(); m.style.left = Math.min(innerWidth - 270, Math.max(8, r.left)) + 'px'; m.style.top = Math.min(innerHeight - 20 - 44 * Math.min(6, names.length), r.bottom + 4) + 'px';
      m.hidden = false; openFor = node; m.querySelector('button')?.focus(); });
    ['pointerdown', 'pointerup', 'dblclick'].forEach((t) => b.addEventListener(t, (e) => e.stopPropagation()));
    return b;
  }
  /** the located people: rebuilt only when the list differs from the last one */
  function set(next) {
    if (JSON.stringify(next) === JSON.stringify(list)) return false;
    list = next; closeMore();
    for (const r of rooms.values()) { try { r.o.element.remove(); } catch (e) { } group.remove(r.o); } rooms.clear();
    const by = new Map(); for (const p of list) { if (!by.has(p.room)) by.set(p.room, []); by.get(p.room).push(p); }
    let used = 0;
    for (const [node, ps] of by) {
      const r = roomOf(node); if (!r || used >= MAX) continue;
      const el = document.createElement('div'); el.className = 'pcg';
      const show = ps.slice(0, NO_FOLD), rest = ps.slice(NO_FOLD);
      for (const p of show) { if (used >= MAX) break; el.append(chip(p, { label: tx('person', { name: p.name, room: r.name }) })); used++; }
      if (rest.length && used < MAX) { el.append(foldBtn(node, ps, rest.length)); used++; }
      el.style.setProperty('--n', String(el.children.length));
      const o = new CSS2DObject(el); o.position.set(r.cx, r.y + 3.4, r.cz); o.center.set(0.5, 1.6); group.add(o); rooms.set(node, { o, floor: r.floor });   // U-FIX-5 E5-02: the avatar group sits above the room's name, not on it
    }
    refresh(); aria(); wake(); return true;
  }
  /** chips are shown on the floor that is cut open (section) and on the floors of the x-ray view, never in the exterior view */
  function refresh() { for (const r of rooms.values()) r.o.visible = visibleOn(r.floor); }
  const names = () => new Set(list.map((p) => p.name));
  return { set, refresh, routineChip, group, names, count: () => list.length, chips: () => group.children.length, closeMore, get list() { return list; } };
}
