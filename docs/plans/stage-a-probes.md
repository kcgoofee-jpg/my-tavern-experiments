# Stage A probe sweep

Run on 2026-10-01 at the stage-a-accept worktree (headless Chromium, WebKit where a probe asks for it, the local `map/` server), one probe at a time, after the T1–T4 changes of STAGE-A. Each line is the probe's own verdict; "KNOWN" means every failing check is registered in `tools/browser/known-failures.json`.

## 1. Result

41 PASS, 1 KNOWN, 0 FAIL, 42 probes run; 13 of 55 files in `tools/browser/` are not probes with a verdict (section 3). Acceptance list: `accept`, `pack_town`, `v096`, `webgl_single_ctx`, `chars092`, `roster095`, `topo_dairy`, `e7_host`, `events_fx` are all PASS. The minimal pack: its kernel pipelines run in a real browser (`pack_minimal`), the viewer's own loader does not accept schema 2 yet (known failure, I-12).

## 2. Probes run

| Probe | Verdict | Note |
|---|---|---|
| `accept` | PASS | acceptance list |
| `autoupd097` | PASS |  |
| `chars092` | PASS | acceptance list |
| `clouds` | PASS |  |
| `contrast_v2` | PASS |  |
| `custom095` | PASS | was FAIL on every base since S4-3 (1 check, "mig: old data stays off"); probe out of date after `86e19b0`, updated in `c0a576b` |
| `e7` | PASS |  |
| `e7_host` | PASS | acceptance list |
| `estate3d` | PASS |  |
| `events_fx` | PASS | acceptance list |
| `fail095` | PASS |  |
| `fix3` | PASS |  |
| `gallery` | PASS |  |
| `inset_eden` | PASS (after name fix) | was FAIL (`S.viewer` undefined after the S5 rename to `osdViewer`); names fixed in this change |
| `mvu093` | PASS |  |
| `openings` | PASS |  |
| `p1_leak` | PASS |  |
| `p4_fx` | PASS |  |
| `p4_traffic` | PASS |  |
| `p5_sandbox` | PASS |  |
| `p6_action` | PASS |  |
| `p6_quests` | PASS |  |
| `p6_tick` | PASS |  |
| `p8_pick_clock_depth` | PASS |  |
| `p9_daynight_fx` | PASS |  |
| `pack_town` | PASS | acceptance list |
| `probe095` | PASS |  |
| `room_gallery_ui` | PASS |  |
| `roster095` | PASS | acceptance list |
| `sites096` | PASS |  |
| `splash095` | PASS |  |
| `th_adopt` | PASS | was FAIL on every base since S4-3 (2 checks, "(a) state injection"); real bug fixed in `c0a576b`: `MVUBridge` never exposed `modes` |
| `topo_dairy` | PASS | acceptance list |
| `trips095` | PASS |  |
| `ui092` | PASS |  |
| `unmapped096` | PASS |  |
| `v096` | PASS | acceptance list |
| `v097` | PASS |  |
| `v2a` | PASS |  |
| `varmap095` | PASS |  |
| `webgl_single_ctx` | PASS | acceptance list |
| `pack_minimal` | KNOWN (1 check) | new; 3 kernel checks and the degrade check PASS, the check "viewer renders the minimal pack" is KNOWN (I-12) |

## 3. Not run (N/A)

| Files | Reason |
|---|---|
| lib, host_stub, known | helpers imported by the probes; no main |
| perf_a3, perf_v2, leak_v2, viewer3d_perf, v3d_webgl | measurement tools (timings, heap growth, draw calls); no pass / fail contract, need a quiet machine or a GPU or a model argument |
| props_u12, uiv2_shots, s43_parity, text_dump, proto_clouds | screenshot, diff and dump generators for review images; they need before / after directories or write into `docs/drafts`; the shadow-parity pins run in `node --test` |

## 4. Known failures

One check is registered: `pack_minimal` / "viewer renders the minimal pack". The viewer's pack loader (`core/pack.mjs`) accepts schema 1 only; a schema-2 pack opens as the retry card until the viewer is wired to the kernel pipelines (S9, item I-12 in `docs/todo.md`).
