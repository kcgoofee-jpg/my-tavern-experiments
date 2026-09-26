# Architect re-review: Eden Manor v2

**Score: 9/10** (v1 was 8). All five round-1 items are in and read correctly in `estate_v2_desk_ext` / `F5`.

## Fixed
- **Pediment.**
  - The tympanum now sits in the frieze plane (`zt = zf`).
  - The raking cornice is at `zf + 0.6` with depth 1.2, in line with the horizontal cornice.
  - A 0.3 m stone back-gable at z 22.3 closes the lead roof.
- **Link columns.** Ionic r 0.25: D 0.5 over 4.6 m is 9.2D, which is correct.
- **Drum and dome.** The drum is 4.5 m (18.7 → 23.2) and the dome rises 5.0 on r 7.2. The finial is at about 32 m, and the profile now reads as drum plus dome, not a saucer.
- **Wings.** A three-bay breakfront, 0.6 m proud, runs x ±29.71 to ±44.29. It has four pilasters and a podium, and the cornice breaks forward over it.
- **End bays.** The windows at ±17.75 are now 2.0 m wide, with an F2 balcony.

## Remaining (ordered, all refinements)
1. **No chimneys on the centre block** (`building.js`, F5 roof builder). There are 17 fireplaces in plan.js, several of them in block A (105, the hall, 2F/3F rooms), but no stacks on the main roof. That is not structurally credible.
   - Add 4 stacks at x = ±12, z = −4 and z = 12 (the 0.6 m bearing-wall lines).
   - Size each 1.2 × 2.6 × 2.4 m on the terrace, using the wing chimney recipe.
2. **Garden (N) front has no centre feature** (`shell()`, block A N side).
   - Add 4 pilasters, 0.9 m wide, at x = ±2.1 and ±6.3, running 5.7 → 14.7 to frame the 3-bay garden-hall doors.
   - Optionally add a balcony band on F2, spanning x ±6.3.
3. **Raking cornice is bare** (`portico()`). Repeat the dentils (0.2 × 0.16 at 0.42 m) and modillions (1.26 m) along both slopes so they match the horizontal cornice.
4. **Stale comment** (`portico()`): "面在 z 29.3" should now say z = zf ≈ 28.95.

## Keep
Keep everything from the v1 list plus the fixes above. The order, levels, massing, structure and neutral room treatment are all sound.
