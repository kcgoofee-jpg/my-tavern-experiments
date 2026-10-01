// The event corpus the shadow tests compare on: every message / location text tests/events-parse.test.mjs feeds into the events module (recorded by running it against
// tests/helpers/events-record.mjs) and the floors of the two session fixtures.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseText } from '../../map/tavern/msgtext.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));

/** -> { raws: [message text], heres: [location text] } */
export async function recordEventsTest() {
  const helper = pathToFileURL(ROOT + 'tests/helpers/events-record.mjs').href;
  const src = fs.readFileSync(ROOT + 'tests/events-parse.test.mjs', 'utf8').replace(/'\.\.\/map\/tavern\/events-parse\.mjs'/, `'${helper}'`).replace(/'\.\.\/map\//g, `'${pathToFileURL(ROOT + 'map/').href}`).replace(/'\.\/helpers\//g, `'${pathToFileURL(ROOT + 'tests/helpers/').href}`);
  const log = console.log; console.log = () => {};
  try { await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src)); } finally { console.log = log; }
  return globalThis.__eventTap;
}
export const fixtureFloors = () => ['session_a.json', 'session_b.json'].map(f => J(`tests/fixtures/sessions/${f}`).messages.map(m => ({ floor: m.floor, text: parseText(m.raw ?? m.text) })));
