// The first pack's variable and roster declarations (its manifest + overlay.v2.json blocks, K-R69) as the profile the tavern modules read.
//   useEden() installs it for the rest of the test file (node --test runs every file in its own process); edenProfile() only builds it.
import { profileFromV1 } from '../../map/core/profile.mjs';
import { setProfile } from '../../map/tavern/pack-profile.mjs';
import { edenInputs } from './eden-inputs.mjs';

export const edenProfile = () => { const i = edenInputs(); return profileFromV1({ manifest: i.manifest, overlay: i.overlay }); };
export const useEden = () => setProfile(edenProfile());
