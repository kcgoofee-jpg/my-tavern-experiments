// The profile of the pack the tavern script runs (core/profile.mjs): where the variables live and which roster fields are shown. One per page, set once the pack's overlay is loaded
// (profile-load.mjs, MVUBridge.useProfile); until then, and for a pack that names nothing, the kernel's profile: everything is discovered (docs/kernel-schema.md K-R38, K-R42).
import { KERNEL } from '../core/profile.mjs';

let cur = KERNEL;
export const getProfile = () => cur;
export function setProfile(p) { cur = p && typeof p === 'object' ? p : KERNEL; return cur; }
