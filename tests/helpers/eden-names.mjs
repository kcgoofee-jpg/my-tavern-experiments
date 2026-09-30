// The first pack's English place-name table (manifest data.names.en -> map/packs/eden/names.en.json), read the way the viewer reads it: through the manifest.
// Tests that used to read `map/i18n/en.json`.names read this instead (the dictionary no longer carries the table).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
export const edenNames = () => J('map/' + J('map/packs/eden/manifest.json').data.names.en);
