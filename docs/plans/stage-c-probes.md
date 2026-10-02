# Stage C probe sweep

Run on 2026-10-02 at head #275 (`origin/preview` f4e422c3) in the c-accept worktree: headless Chromium, the local `map/` server, one probe at a time, no arguments except an output directory. Baseline `tools/browser/known-failures.json` is empty and is unchanged (the baseline only shrinks).

## 1. Result

58 PASS (7 of them after the probe itself was repaired, see the notes), 4 FAIL, 62 probes run. Four failures are probe-side staleness after the S7 settings IA / one-shell changes, not product regressions; they are filed as I-32 in `docs/todo.md`.

## 2. Probes run

| Probe | Verdict | Note |
|---|---|---|
| `a11y_tree` | PASS |  |
| `accept` | PASS |  |
| `art_key` | PASS |  |
| `autopack` | PASS |  |
| `autoupd097` | PASS (probe repaired) | check `setting_toggle` read a control on a settings page that is built on first open (S7-1); the probe opens the page |
| `cg_gallery` | PASS |  |
| `chars092` | PASS |  |
| `clouds` | PASS |  |
| `contrast_v2` | PASS |  |
| `custom095` | PASS (probe repaired) | hint wording no longer says 「默认开」; the 「第一项」 part is still asserted |
| `drawer_stash` | PASS |  |
| `e7` | FAIL | 1 check: 「庄园：查看器控制列与抽屉让给三维页，顶栏有「⋯」」 expects the old estate chrome (dock hidden); the estate now lives inside the main shell (S7-3). The two settings-page clicks were repaired in this change |
| `e7_host` | PASS |  |
| `estate3d` | PASS |  |
| `estate_flicker` | PASS |  |
| `estate_generic` | PASS |  |
| `estate_kbd` | PASS |  |
| `estate_presence` | PASS |  |
| `events_fx` | PASS |  |
| `fail095` | PASS |  |
| `fix3` | FAIL | 1 check `estate-build`: the build line is not visible on the 更新与版本 page while the estate view is open |
| `follow_pin` | PASS (probe repaired) | the build line is read from the 更新与版本 page after it is opened |
| `inset_eden` | PASS |  |
| `layers_ext` | PASS (probe repaired) | registered-layer count 20 → 22 and the renamed row 「AI 参谋标注」 |
| `mvu093` | PASS |  |
| `openings` | PASS |  |
| `p1_leak` | PASS |  |
| `p4_fx` | PASS |  |
| `p4_traffic` | PASS |  |
| `p5_sandbox` | PASS |  |
| `p6_action` | PASS |  |
| `p6_quests` | PASS |  |
| `p6_tick` | PASS (probe repaired) | switch moved to a lazily built page, label is now 「预先读取新消息」 |
| `p8_pick_clock_depth` | PASS (probe repaired) | the 3D avatar element is the presence chip `.pc` since S7-3 |
| `p9_daynight_fx` | PASS |  |
| `pack_editor` | PASS |  |
| `pack_layers` | PASS |  |
| `pack_minimal` | PASS |  |
| `pack_routes` | PASS |  |
| `pack_switch` | PASS |  |
| `pack_town` | PASS |  |
| `pan_frame` | PASS |  |
| `period_bounds` | PASS |  |
| `period_maps` | PASS |  |
| `probe095` | PASS |  |
| `raf_pause` | PASS |  |
| `room_gallery_ui` | PASS |  |
| `roster095` | PASS (probe repaired) | switch lives on the lazily built 人物与物品 page |
| `s7_hit` | PASS |  |
| `sites096` | PASS |  |
| `splash095` | PASS |  |
| `th_adopt` | PASS |  |
| `tile_fail` | PASS | takes about 12 min (the sweep timeout was raised for it) |
| `topo_dairy` | PASS |  |
| `trips095` | PASS |  |
| `ui092` | PASS |  |
| `unmapped096` | PASS |  |
| `v096` | PASS |  |
| `v097` | FAIL | desk + phone: `locator.click` timeout (an old selector; the control moved with the S7-1 settings IA) |
| `v2a` | FAIL | `null.checked` on a control of a settings page; probe not yet repaired |
| `varmap095` | PASS |  |
| `webgl_single_ctx` | PASS |  |

## 3. Not run (N/A)

| Files | Reason |
|---|---|
| lib, host_stub, known | helpers imported by the probes; no main |
| perf_a3, perf_v2, leak_v2, viewer3d_perf, v3d_webgl, reload_perf | measurement tools; no pass / fail contract |
| props_u12, uiv2_shots, s43_parity, text_dump, proto_clouds, s7_shots, layer_dump, replay_i17 | screenshot, diff and dump generators (`s7_shots` produced the stage C screenshots) |

## 4. Repairs made in this change (all in `tools/browser/`)

Settings sub-pages are built when first opened (S7-1), so probes that read a control now open its page first; `lib.mjs` gets `buildAllSettingsPages(vf)` for probes that touch several pages. Expectation updates: layer count 22, 「AI 参谋标注」, presence chip `.pc`, settings group ids (`display` → `map` / `home`), build line wording.
