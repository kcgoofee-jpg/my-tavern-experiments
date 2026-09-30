// The first pack's event geography for tests: the shipped v1 files plus map/packs/eden/overlay.v2.json, through core/event-geo.mjs.
//   edenGeo()  townGeo()  -> geo
import { geoFromV1 } from '../../map/core/event-geo.mjs';
import { edenInputs, townInputs } from './eden-inputs.mjs';

export { edenInputs };
let eden = null, town = null;
export const edenGeo = () => (eden ??= geoFromV1(edenInputs()));
export const townGeo = () => (town ??= geoFromV1(townInputs()));
