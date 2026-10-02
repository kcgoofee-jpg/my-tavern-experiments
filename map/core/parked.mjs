// Parked features (INV-2, D31): off by default and hidden from Settings and the layer menu. The code stays; an explicit stored '1'
// under `edenMapOn:<id>` switches one back on. Unset or anything else = parked. Nothing is deleted.
import * as storage from './storage.mjs';

export const PARK_PREFIX = 'edenMapOn:';
/** every parked feature id (the pause rows of docs/feature-inventory.md; F-53 sound is not here: a sound layer exists only when a pack declares it, and it is already off until ticked) */
export const PARKED = Object.freeze(['scrap', 'stash3d', 'xtal', 'tabledb', 'imagegen']);
/** parkedOn(id, S?) -> true only when the user (or a tool) stored '1' for it */
export const parkedOn = (id, S) => storage.get(PARK_PREFIX + id, undefined, S) === '1';
