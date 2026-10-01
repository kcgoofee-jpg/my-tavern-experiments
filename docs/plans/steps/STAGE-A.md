# Task STAGE-A: stage A acceptance (card terms, probes, CI browser job, docs)

Model: Sonnet · High · Size M (one prompt). Prompt file (English only). Written by the AC-AUTOPILOT orchestrator on
2026-10-01 at origin/preview head #197.

## 0. Why

Plan `docs/plans/spatial-os.md` §5 "Stage A acceptance" and §8: the ledger of card terms in engine code is zero; the
minimal, town and first packs all run; the stage probes are green; the plan §8 grep is 0. Today the watchdog (which
ignores comments) is at 0, but the §8 grep still finds ~166 lines: ~131 engine **comments** that name the first pack's
places as context, and ~35 lines in pack asset files (`map/props/*/manifest.json`) that the grep's pathspec fails to
exclude. Two probes (`th_adopt`, `custom095`) fail identically on every base since S4-3, and the CI `browser-smoke` job
fails at `npm ci` (no lock file), hidden by `continue-on-error`.

## 1. Read first

- `docs/agent-brief.md`; `docs/plans/spatial-os.md` §5 (Stage A acceptance), §8; RESULT S4-3 … S5-3 in
  `docs/plans/spatial-os-log.md` (probe notes).
- `tools/check_architecture.py` (`scan_terms`, how comments are skipped), `tools/arch_baseline.json`.
- `tools/browser/README.md`, `tools/browser/known-failures.json` (format), `.github/workflows/*.yml` (`browser-smoke`).

## 2. Scope

IN: T1 comment sweep + watchdog covers comments · T2 §8 grep pathspec · T3 the two base-failing probes · T4 CI
browser job · T5 full probe sweep · T6 docs and close.

OUT: behaviour changes beyond T3 fixes; wording of user-visible text; external contracts (S10); pack data wording
(card names in pack data are correct, agent brief §7); render lanes, `logs/queue/`. Do **not** run `tools/sync_main.sh`
(the orchestrator does it after verification).

## 3. Setup

```bash
git fetch
git worktree add -b stage-a-accept <scratchpad>/stage-a origin/preview
```
Baseline: tests + smoke green; count noted.

## 4. Tasks

**T1 — Engine comments neutral; watchdog counts comments.**
- Run the §8 grep (below). For every hit in an engine file (`map/app`, `map/core`, `map/tavern`, `map/ui`, `map/three`,
  `map/*.mjs`, `map/viewer.html`, `map/props/viewer3d.html`, `map/ui/tokens.css`), rewrite the comment neutrally
  ("the first pack's middle tier", "the estate page", "the first city") keeping its technical meaning. If a hit is not a
  comment (identifier, string), report it — it must be S10 material (e.g. `eden_map` chat root, `edenMap` storage
  prefix, `eden-map:` message types) or a bug in the watchdog; list it.
- `tools/check_architecture.py`: add a comment-term count to the ledger (same term list, comments only, per file) at
  the post-sweep value (expected 0 except listed S10 lines), so it may only shrink; `tools/test_architecture_gate.py`
  proves a new card term in a comment fails.

**T2 — §8 grep pathspec.** In `docs/plans/spatial-os.md` §8 (+ `.zh.md`), replace `':!map/props/*/'` with
`':!map/props/*/**'` (and exclude `map/art/**` if pack art metadata matches) so pack asset folders are excluded while
`map/props/viewer3d.html` stays scanned. Run the corrected grep: the result must be **0** lines or each remaining line
listed with its S10 reason. Add the corrected grep to `tools/smoke.sh` as a gate (fails on a line not in an explicit
allow-list file `tools/stage_a_grep_allow.txt`, which holds only the S10 lines with reasons).

**T3 — The two probes failing on every base.**
- `th_adopt` (2 ✗, "desk (a) state injection"), `custom095` (1 ✗, "mig: old data stays off"). For each: reproduce,
  find the cause (probe out of date vs. real bug), at most two fix attempts. A probe out of date → update the probe to
  the current contract (state the contract change and the commit that made it). A real bug → fix it with a node test.
  If neither works in two attempts: add the check to `tools/browser/known-failures.json` with the reason and file an
  `I-` item in `docs/todo.md` §1.

**T4 — CI browser job.** Make `npm ci --prefix tools/browser` work in CI: commit `tools/browser/package-lock.json`
generated with `npm install --package-lock-only --prefix tools/browser` (match the Node version in the workflow).
Push, then read the `browser-smoke` job log (`gh run view <id> --log --job <job id>`): it must reach the probes; its
probe failures must all be in `known-failures.json` (add with reasons, or fix if they are the T3 ones). Keep
`continue-on-error` unless the job is fully green twice in a row — then remove it and say so.

**T5 — Full probe sweep (end of stage, agent brief §4).** Run every `tools/browser/*.mjs` probe that has a main (skip
helpers / libs; a probe that needs a real tavern or the cloud is listed as N/A with the reason). Record one line per
probe: PASS / KNOWN / FAIL (+ first error line) in `docs/plans/stage-a-probes.md` (English, with a `.zh.md` edition per
the language policy). Stage acceptance list must be PASS or KNOWN: `accept`, `pack_town`, `v096`, `webgl_single_ctx`,
`chars092`, `roster095`, `topo_dairy`, `e7_host`, `events_fx`. Also prove the **minimal** pack loads (the probe that
covers it, or `openViewer` with `?pack=minimal` in a short new probe `pack_minimal.mjs`). Any other FAIL: fix if it is
a probe out of date after S4/S5 renames (names only); otherwise KNOWN + `I-` item.

**T6 — Docs and close.**
- `docs/ARCHITECTURE.md` (+ zh, same headings): a "Stage A state" paragraph (engine card-term free, pack-driven theme
  / wording / names / groups, module map after S5); check every path in the module map exists (script it).
- `docs/todo.md` §0: Stage A closed line (struck format), status line; S4 and S5 checkboxes ticked.
- RESULT block.

## 5. Constraints

- Comments only in T1 (no code change); T3 fixes only what is broken; no visible change.
- Watchdog term count stays 0; ledger totals not higher.

## 6. Verify

```bash
node --test tests/*.test.mjs && bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/test_architecture_gate.py
python3 tools/check_maps.py && python3 tools/check_pack.py
git grep -nE '母畜|挤奶|庄园|伊甸|天城|外界知情|网络攻击|tiancheng' -- map ':!map/packs' ':!map/data' ':!map/estate' ':!map/props/*/**' ':!map/section.js' ':!map/*.html'
```

## 7. Commits & push

1. `docs(engine): neutral comments; watchdog counts comment terms` (T1).
2. `chore(gate): plan §8 grep as a smoke gate` (T2).
3. `fix(probes): th_adopt and custom095` (T3; title per outcome).
4. `ci: lock file for the browser probe job` (T4) — push, read the job log.
5. `docs: stage A probe sweep, architecture state, todo` (T5, T6, RESULT) — push
   (`bash tools/push_preview.sh --head --no-escalate`).
Messages via file (`-F`), English, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By
trailer, one git command per Bash call. Wait for CI with a background `gh run watch <id> --exit-status`.

## 8. Stop and report instead of guessing when

- a non-comment card term is found in engine code that is not S10 material;
- a stage-acceptance probe fails and two attempts do not fix it;
- a push is rejected (never force-push) or CI fails twice; the test count drops.

## 9. Report

RESULT block appended to `docs/plans/spatial-os-log.md` in the last commit, with extra lines:
`grep §8: <before> -> <after> (allow-listed: <n>)`, `comment terms: <before> -> <after>`,
`probes: <pass>/<known>/<fail>/<n/a> of <total>; acceptance list: <name>=… `, `ci browser-smoke: <state>`.
Cleanup: own processes stopped, worktree left for the orchestrator.
