# Architect review: Eden Manor v0 (neoclassical / Palladian)

**Score: 5/10.** The facade grammar is competent: a rusticated base, alternating pediments, quoins, dentil cornice and balustrades. The orders and the massing are wrong, though, and from the front the house reads as a Georgian terrace with a temple front pasted on, not a Palladian villa.

## Proportion errors visible in ext / F5 shots
- **Portico columns are too slender and the wrong order.** They are D 1.32 and run 1.2→16.2 (15 m), which is 11.4D. The capitals are Ionic, but the setting calls for Corinthian at 10D.
- **The entablature is about half what it should be.** `ENTAB` is 1.4 m. At H/4.7 it should be about 2.9–3.2 m, so the columns look spindly under a thin band.
- **The pediment is too steep.** It is 4.9 high on 26.6 wide, a slope of 1:2.7 (20°). The setting says 1:4.5. Its lead roof prism also runs back into the attic wall and hides the attic windows behind it.
- **The attic reads as a fourth storey.** It is a full 4.0 m floor with a row of 1.4×1.6 windows, so the main cornice sits at about 75% of the facade height. Above an order you want no more than about H/4 (≈3.4 m), and per §3.1 the F4 windows should be hidden.
- **The main block is a slab.** It is 76×26 (2.9:1) with 19 identical bays. The setting has a near-square 40×44 centre block plus 34×32 wings, and the five-part plan spans 164 m against the 204 m specified.
- **Structure.** The walls of the dome pavilion (x=±10, z=1) land on nothing: the F4 walls are at x=±14 and z=−3. The interior bearing walls are 0.3 m; the setting says 0.6 m.

## Change list (by impact)
1. **Order and levels** (`plan.js` FLOORS/ENTAB, `building.js` PCOLS/PR):
   - Set FLOORS to F1 1.2/h4.5, F2 5.7, F3 10.2 and F4 14.7/h4.0, with F5 at 18.7.
   - Set `ENTAB=[14.7,17.6]` (2.9 m), `PR=0.675` and columns 1.2→14.7 (13.5 m = 10D).
   - Split the entablature as 0.9 architrave, 0.9 frieze, 1.1 cornice, and pass a `scale` that produces those three bands in `cornice()`.
   - Light F4 through frieze windows 1.0×0.8 set in the frieze band (`houseOpenings` fi=3).
   - Above the cornice, put a solid 1.1 m blocking course. Set the roof-terrace balustrade back ≥1.5 m so the attic disappears.
2. **Corinthian capital** (`column()` opts.cap):
   - Replace the volutes with a bell 1.16D (1.57 m) tall: two flared acanthus rings at r×1.05 and r×1.15, plus a concave-sided abacus 1.5D square by 0.2 m.
   - Base: an Attic base 0.5D high on a plinth 1.4D square by 0.3 m (currently 1.25D×0.28).
3. **Intercolumniation** (`PCOLS`):
   - Set it to [−13,−8,−3,3,8,13] (5 m spacing, 6 m centre bay per §3.1). In `pb`, set x0/x1 = ±14.4.
   - Set the pediment to `pw=29.6`, `ph=pw/2/4.5≈3.3`, and shorten the roof prism depth so it stops at the facade plane (z 13.45).
   - Move the S openings to x = 0, ±5.5, ±10.5 so the doors and windows sit centred in the intercolumniations. The pilasters behind the portico go to x=±13.
4. **Massing, phase 2** (`plan.js` HOUSE and `buildWings`):
   - Centre block x±20, z−22…22, 9 bays of 4.2 m, with the portico across the central 5 bays.
   - Wings ±20…54: 3 storeys, 7 bays, flat roofs with balustrades. Replace the hipped lead roofs.
   - Links ±54…78: an Ionic single colonnade 5.5 m high (D≈0.6).
   - West end: the library pavilion, 24×24 and 10 m high, with an octagonal tower to 28 m. East end: the music hall, 24×32, a single 11 m volume with a barrel roof and a north apse.
   - Move the servant block and hangar to the NW service zone (`site.js`).
5. **Arched F1 windows** (`windowDeco` 'rustic'): give them half-round heads (r = w/2 = 0.9) on the existing keystone, with 5 voussoir blocks. The window heads also need V-jointed rustication.
6. **Pilasters** (`buildHouse` fi 1–2):
   - Width 0.9 m, which is H/10 for the 9 m F2–F3 order, with a 0.9 m capital block and a 0.45 m base.
   - Put them at the corners and at each wing junction, paired at the ends. The current every-8 m rhythm matches nothing in the bays.
7. **Structure** (`IW`, lantern pavilion):
   - Either move the pavilion to walls that exist (x±14, z−13…−3, drum r 4.7), or add 0.6 m bearing walls in IW[1..3] under x=±10 / z=1.
   - Thicken the x=−3 and z=±14 walls to 0.6 m.
   - With the drum on the new F5 level the dome top comes to about 32–34 m, which is close to the setting's 31 m.
8. **Hall** (optional): a double height of 8.7 m per §3.1, with a gallery on F2. Keep it a neutral circulation space.

## Keep
- The rusticated F1 on a 1.2 m podium with its ring moulding, the corner quoins, and alternating tri/seg pediments on the F2 balconied windows.
- The dentil cornice routine, the instanced balustrades with urns, and the cartouche in the pediment.
- The central door on axis, the 7-step podium stair and the flanking lamp piers.
- The entasis carried across the per-floor column segments, so a floor section still reads correctly.
- The link colonnades, which have the right idea and the right height class.
- The ribbed lead dome with its lantern and gold finial.
- The section system (1.2 m cut, dark caps), the §6 palette and the neutral treatment of the private rooms.
