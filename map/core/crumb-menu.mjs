// What the breadcrumb's last crumb offers as a switcher (HEADER-1 / NAV-1, D36): the sibling levels of the open map and, below them,
// the child places of the open map that have a 3D page. Pure: the node-tree readers come in as functions, nothing is read from the DOM.
//   crumbMenu({ current, strip, parent, children, isScene, planned, hereMap, countOn }) -> { levels, scenes, any }
//     levels  [{ id, on, planned, here, n }]  the flat levels the user can jump between (3D pages of the strip are listed under `scenes`): the open map's own strip; while a 3D page is open, the
//             strip of the nearest ancestor that has one (so the user can step back to a tier). Empty below two levels.
//     scenes  [{ id }]                        child maps of the open map that are 3D pages and built
//     any     true when there is something to open a menu for
export function crumbMenu({ current, strip, parent, children, isScene, planned, hereMap = null, countOn = () => 0 }) {
  let lv = [], host = current;
  for (let i = 0; host && i < 8; i++) {
    const s = strip(host) || [];
    if (s.length > 1) { lv = s; break; }
    if (!isScene(current)) break;   // a flat map offers its own levels only; a 3D page also looks upward
    host = parent(host);
  }
  const levels = lv.filter(id => !isScene(id)).map(id => ({ id, on: id === current, planned: !!planned(id), here: id === hereMap, n: Math.max(0, +countOn(id) || 0) }));
  const scenes = (children(current) || []).filter(id => isScene(id) && !planned(id)).map(id => ({ id }));
  return { levels, scenes, any: levels.length > 1 || scenes.length > 0 };
}
/** the next index of a menu of `n` items for an arrow / home / end key (wraps); null for other keys */
export function menuStep(key, i, n) {
  if (!n) return null;
  if (key === 'ArrowDown') return i < 0 ? 0 : (i + 1) % n;
  if (key === 'ArrowUp') return i < 0 ? n - 1 : (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}
/** a 3D page's title without its own trailing 3D marker, so the menu can say 「<title> · 3D」 once */
export const plainTitle = t => String(t ?? '').replace(/\s*[（(]\s*(三维|3D)\s*[）)]\s*$/i, '');
