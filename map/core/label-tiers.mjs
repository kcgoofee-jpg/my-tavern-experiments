// Map label tiers (docs/ui-refactor.md 2.6, U-21 A'). Pure; used by app/sharpness-tiers.mjs declutter().
// Labels are placed in priority order (the player's place, the open card, majors, then the rest); the n-th label that finds room is L1 for n <= cap1 (it stays visible on far islands at the default zoom),
// L2 up to cap1 + cap2, and every further label is hidden. Caps: 12 / 30 on desktop, 6 / 15 on a phone.
export const labelCaps = (narrow = false) => ({ cap1: narrow ? 6 : 12, cap2: narrow ? 15 : 30 });
/** tierOf(n, caps) -> 'l1' | 'l2' | null for the n-th (1-based) label that found room */
export const tierOf = (n, caps) => (n <= caps.cap1 ? 'l1' : n <= caps.cap1 + caps.cap2 ? 'l2' : null);
