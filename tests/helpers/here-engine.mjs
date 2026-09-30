// The place tests of the first versions (here, card_spec, canon0928, characters, omissions099, transit095, unmapped096) wrote their inputs as
// `buildIndex(registry, world, names, custom, plan)` and `resolveHere(text, index)`. They now run through the node-tree engine (app/here-v2.mjs)
// with the same inputs and the same expectations; the A.9 divergences of docs/kernel-schema.md are the only differences and are pinned in
// tests/here_v2.test.mjs. This file only keeps the call shapes, so a test reads as it always did.
import { makeHere } from '../../map/app/here-v2.mjs';
import { planWords } from '../../map/core/compat-v1-geo.mjs';
import { edenInputs } from './eden-inputs.mjs';

export { planWords };
const MANIFEST = edenInputs().manifest;
/** An engine over the registry (and optionally the world list, the English names, the user's names and the room plan). */
export const buildIndex = (maps, world = null, names = null, custom = null, plan = null) => makeHere({ manifest: MANIFEST, maps, world, names, custom, plan });
/** The current location of a text through an engine: { level, map, marker?, place?, room?, std?, floor?, restricted?, custom?, word, node, via, transit? } | null. */
export const resolveHere = (value, idx) => (idx ? idx.here(value) : null);
/** The journey of a text (both ends placed or one of them): { from, to, fromText, toText, via } | null. */
export const resolveTransit = (value, idx) => idx?.here(value)?.transit ?? null;
/** The name offered as "unmapped" (the first place of the text), null when it is placed, empty or ignored. */
export const unmappedName = (value, idx) => idx.unmapped(value);
