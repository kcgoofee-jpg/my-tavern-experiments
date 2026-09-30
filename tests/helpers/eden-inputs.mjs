// The first pack's shipped v1 files plus its v2 overlay, as the inputs of compat-v1 `fromV1` (and of app/nodes-runtime.mjs, app/here-v2.mjs).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
export const edenInputs = (extra = {}) => ({ manifest: J('map/packs/eden/manifest.json'), maps: J('map/data/maps.json'), world: J('map/data/world_markers.json'), names: J('map/i18n/en.json').names,
  plan: J('map/data/eden_estate_rooms.json'), overlay: J('map/packs/eden/overlay.v2.json'), ...extra });
export const townInputs = () => ({ manifest: J('map/packs/town/manifest.json'), maps: J('map/packs/town/maps.json'), events: J('map/packs/town/events.json') });
