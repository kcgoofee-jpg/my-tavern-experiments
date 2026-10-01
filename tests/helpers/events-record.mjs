// The events module with its inputs recorded: tests/events_geo_shadow.test.mjs runs tests/events-parse.test.mjs against this to learn every message and location text it feeds in.
import * as E from '../../map/tavern/events-parse.mjs';
export * from '../../map/tavern/events-parse.mjs';
const tap = k => (globalThis.__eventTap ??= { raws: [], heres: [] })[k];
export const parseMarks = raw => (tap('raws').push(raw), E.parseMarks(raw));
export const collect = (msgs, now) => (msgs.forEach(m => tap('raws').push(m.text)), E.collect(msgs, now));
export const layerOf = here => (tap('heres').push(here), E.layerOf(here));
