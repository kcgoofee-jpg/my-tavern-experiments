# Architect re-review: Eden Manor v1

**Score: 8/10** (v0 was 5/10). The house now reads as a Palladian five-part villa. What is left is refinement, not correction.

## Fixed since v0 (verified in code and screenshots)
- **Order and levels.**
  - Corinthian D 1.35. Plinth 0.3 plus Attic base, shaft 2.18 to 12.93, capital to 14.7: 13.5 m in all, exactly 10D.
  - Entasis starts one third of the way up the shaft.
  - Entablature 14.7 to 17.6 (2.9 m), split 0.9 / 0.9 / 1.1, with dentils and modillions.
- **Pediment.** Slope 1:4.5 (29.6 × 3.29), a crest in the tympanum and three acroteria.
- **Column spacing.** [−13, −8, −3, 3, 8, 13], a 6 m centre bay. The openings on the portico front sit centred between the columns.
- **Attic hidden.** F4 is lit by frieze windows on the N, E and W sides only, behind a 1.1 m parapet. The terrace balustrade is set back 1.5 m.
- **Massing.**
  - Centre block 40 × 44, wings 34 × 32 set back 6 m.
  - Ionic links run ±54 to 78, the library tower to 28 m and the barrel-roofed music hall with its apse, 204 m overall.
  - The wings have flat roofs with balustrades.
- **Rustication.** F1 has half-round arched windows with voussoirs. F2 has alternating pediments, F3 is plain.
- **Structure.**
  - The drum (Ø14) stands on a 0.6 m frame at x = ±8, z −6 to 10.
  - Below it are the portrait-gallery columns on F3 and the hall columns (x = ±8) in the 8.7 m double-height hall.
  - Bearing walls are 0.6 m.

## Remaining (ordered by impact)
1. **Pediment planes and back gable** (`building.js` `portico()`):
   - The tympanum face at `zt = 29.3` stands 0.35 m in front of the frieze (`zf ≈ 28.95`). Set `zt = zf`.
   - Move the raking-cornice boxes to `zf + 0.6` with a depth of 1.2, so they line up with the horizontal cornice at `zf + 1.2`.
   - The rear end of the lead roof prism at z 22.45 shows a bare triangle from 17.95 to 21.4 above the parapet. Close it with a 0.3 m stone back-gable, or hip the roof back to z 20.5.
2. **Link columns too stubby** (`links()`): `ionic(..., 0.3)` over 1.2 to 5.8 is 7.7D, where Ionic wants about 9D.
   - Pass r = 0.25 (D 0.5, 9.2D).
   - Scale the plinth to r × 2.9, which it does already.
3. **Dome reads squat** (`drumAndDome`, `DRUM`): a 6 m drum carries a saucer with a 3.5 m rise on r 7.2 (rise/span 0.24).
   - Set `y1` to 23.2 (a 4.5 m drum) and `dh` to 5.0.
   - The finial stays at about 32 m, close to the setting's 31 m, and the profile becomes a proper Palladian drum and dome.
4. **Long wing fronts are unarticulated** (`shell()`, wing pilaster list): seven identical bays sit between paired corner pilasters.
   - Add a three-bay breakfront, 0.6 m proud, at x = ±29.71 to ±44.29.
   - Put 0.7 m pilasters at ±29.71, ±34.57, ±39.43 and ±44.29 through F2 and F3, stopping at 13.8.
   - The wing cornice breaks forward over it.
5. **Main-block side bays** (`rawFacade` 'A' S): x = ±17.75 is a single window in a 7 m pier field between pilasters at ±13 and ±20.
   - Either widen that window to 2.0 with a balcony on F2 (it already has one), or add a blind niche at ±16 on F1.
   - This is a minor point.

## Keep
Keep everything listed as fixed. Also keep:
- the per-floor segmented columns with cut stubs;
- the frieze-window trick for F4;
- the coffered portico ceiling;
- the double-height hall with its gallery;
- the setback terrace balustrade;
- the palette and the neutral treatment of 403 and the private rooms.
