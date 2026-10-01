// The places a recorded session fixture (tests/fixtures/sessions/*.json) talks about: the location variable of every floor, the places of the
// characters, events and trips the pipeline reads out of it. Shared by the shadow tests of the place resolvers.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ContextPipeline, perFloorStatOf } from '../../map/tavern/context.mjs';
import * as EVM from '../../map/tavern/events-parse.mjs';
import * as CHM from '../../map/tavern/characters-parse.mjs';
import * as tripsParseModule from '../../map/tavern/trips-parse.mjs';
import { rosters as mvuRosters } from '../../map/tavern/mvu-readers.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
/** sessionPlaces(file) -> { here: [location text of each floor], chars: [place], events: ["layer·place" | place], trips: [end] } */
export function sessionPlaces(file) {
  const snap = J('tests/fixtures/sessions/' + file), out = { here: new Set(), chars: new Set(), events: new Set(), trips: new Set() };
  const stat = perFloorStatOf(snap), floors = snap.messages.map(m => m.floor);
  for (const f of floors) { const v = stat(f)?.世界?.当前地点; if (v) out.here.add(v); }
  if (snap.mvu.stat?.世界?.当前地点) out.here.add(snap.mvu.stat.世界.当前地点);
  const { pipeline, msgs } = ContextPipeline.fromSnapshot(snap);
  const d = { tripsParseModule, CHM, perFloorStat: stat, mvuGet: (s) => s?.世界?.当前地点, varMap: { location: '世界.当前地点', time: '世界.当前时刻' }, keywords: tripsParseModule.DEFAULT_KEYWORDS, fantasy: false, parseTransit: () => null };
  const r = pipeline.round({ floorNow: snap.meta.floorNow, msgs, stSig: '{}', dbSig: '', varSig: 'v', custVer: 0, customChat: 'c', chatId: snap.meta.chatId, seen: -1, wbState: '', hasReg: false, hasCHM: true, hasMV: true, hasTRm: true, hasHereMod: false, hereNow: '',
    collect: EVM.collect, charsDeps: { mvuChars: [], known: [], dbCharacters: [], collectChars: CHM.collectChars, rosters: mvuRosters(snap.mvu.stat), reputation: null, presentKey: '' } });
  for (const c of r.chars || []) if (c.place) out.chars.add(c.place);
  for (const ev of r.events || []) { if (ev.place) out.events.add(ev.layer ? `${ev.layer}·${ev.place}` : ev.place); }
  for (const tr of pipeline.computeTrips(msgs, d).trips || []) for (const p of [tr.from, tr.to]) if (p) out.trips.add(p);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}
