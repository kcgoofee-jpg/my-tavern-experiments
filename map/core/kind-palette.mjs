// The generated colours of room kinds a 3D manifest does not declare (docs/kernel-schema.md K-R131). Eight colours picked so that each reads at >= 3:1
// against both theme surfaces (--surface dark #151b20, light #f8f5ee) and every pair stays >= 20 CIE76 apart for normal vision and under protan, deutan and
// tritan simulation (tests/kind_palette.test.mjs measures all of it). A kind id picks its colour by a stable hash, so the same id has the same colour in
// every session and every viewer. Pure: no DOM, no storage.
export const KIND_PALETTE = Object.freeze(['#985e52', '#288beb', '#e1631e', '#716a92', '#b75c35', '#a3808b', '#b425b9', '#6350eb']);

const fnv = s => { let h = 2166136261; for (const c of String(s ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** The generated colour of a kind id (stable: FNV-1a of the id modulo the palette). */
export const kindColor = kind => KIND_PALETTE[fnv(kind) % KIND_PALETTE.length];
