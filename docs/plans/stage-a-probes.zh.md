# 阶段 A 探针全扫

2026-10-01 在 stage-a-accept 工作树上跑（无头 Chromium，探针要求时用 WebKit，本地 `map/` 服务），一次一个，在 STAGE-A 的 T1–T4 改动之后。每行是探针自己的结论；「KNOWN」表示每个失败检查都登记在 `tools/browser/known-failures.json`。

## 1. Result

41 个 PASS、1 个 KNOWN、0 个 FAIL，共跑了 42 个探针；`tools/browser/` 里 55 个文件中另有 13 个不是有结论的探针（第 3 节）。验收清单：`accept`、`pack_town`、`v096`、`webgl_single_ctx`、`chars092`、`roster095`、`topo_dairy`、`e7_host`、`events_fx` 全部 PASS。minimal 包：它的内核流水线在真浏览器里跑通（`pack_minimal`），查看器自己的加载器暂不收 schema 2（已知失败，I-12）。

## 2. Probes run

| 探针 | 结论 | 说明 |
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

| 文件 | 原因 |
|---|---|
| lib, host_stub, known | helpers imported by the probes; no main |
| perf_a3, perf_v2, leak_v2, viewer3d_perf, v3d_webgl | measurement tools (timings, heap growth, draw calls); no pass / fail contract, need a quiet machine or a GPU or a model argument |
| props_u12, uiv2_shots, s43_parity, text_dump, proto_clouds | screenshot, diff and dump generators for review images; they need before / after directories or write into `docs/drafts`; the shadow-parity pins run in `node --test` |

## 4. Known failures

登记了一项：`pack_minimal` / “viewer renders the minimal pack”。查看器的包加载器（`core/pack.mjs`）只收 schema 1；在查看器接上内核流水线之前（S9，`docs/todo.md` 的 I-12），schema 2 的包打开是重试卡。
