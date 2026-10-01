# Task S6-design: entity protocol, drawer tab registry, unified stash, Items tab — design + step specs

Model: Opus · High · Size M (one prompt, documents only, no code). Prompt file (English only). Written by the
AC-AUTOPILOT orchestrator on 2026-10-01 at origin/preview head #199 (stage A closed).

## 0. Why

Plan `docs/plans/spatial-os.md` §5 Stage C, S6 (about 12 h, 3 implementation prompts, Sonnet · High): tab registry
`app/tabs.mjs`; the characters tab adapts to the level (micro: people at the same node; macro: grouped by the node
tree); unified item store `eden_map.stash` with automatic migration of old data and a "recompute from the chat log"
reconciliation test (kernel §7, K-R45); an Items tab in four groups (carried / here / other places / in-card inventory,
read-only); pickup verbs 获得 / 得到 / 拿取 in strict sentence patterns, per-pack extendable, with false-positive tests;
plus I-08 (English pickup false positive "the", kernel §14.2 O-1) and I-04's npc / event host write paths (§16). This
step designs it and writes the three executable step specs. **No code.** The user is not available: write a review
sheet whose recommendations become the working decisions.

## 1. Read first

- `docs/agent-brief.md` (all; §2.3 one-way data flow, §2.4 chat log is the only truth, §2.5 never write `stat_data`,
  §2.6 new toggles default off and registered, §2.8 never moderate chat content).
- `docs/kernel-schema.md` §1, §3.7, §6 (entities), §7 (items, K-R45), §11 legacy names, §12, §14.2 (O-1 …).
- `docs/naming.md` glossary ("stash" is the one name for the concept; table E chat-variable keys `仓库`, `槽位`, Wave S6;
  Decision (a) legacy names of the first pack live in its manifest).
- `docs/ARCHITECTURE.md` (module map after S5; host flow modules `loot-flow`, `chars-flow`, `root-store`).
- Code, read only what the design needs: `map/core/stash.mjs`, `map/core/pickup.mjs`, `map/core/ledger.mjs`,
  `map/core/roster.mjs`, `map/core/profile.mjs`, `map/tavern/loot-flow.mjs`, `map/tavern/root-store.mjs`,
  `map/tavern/mvu.mjs` (`VAR_ROOT`, `normCustom`, rosters), the drawer (grep `ViewerDrawer`, `drawer-glue`), the
  characters view and the stash view (`stash-view` / place-card inventory), `map/core/protocol.mjs` SCHEMA.
- `docs/todo.md` I-04, I-08, Q-14 (f), Q-18; `docs/plans/llm-campaign.md` (W11 ledger, W12 virtual slots — what the
  `槽位` slots are).

## 2. Deliverables

1. `docs/entity-protocol.md` + `docs/entity-protocol.zh.md` (same headings; `tools/check_zh_mirror.py` passes):
   - the entity protocol (people, items, events as entities on nodes: id, kind, node, source, provenance-free fields);
     how each drawer tab consumes it; message shapes added to `core/protocol.mjs` (register every new field);
   - tab registry `app/tabs.mjs` contract (register / order / applies(level) / badge / lazy mount), how the existing
     drawer tabs move onto it with identical behaviour;
   - characters tab by level (micro / macro rule in terms of node depth or view kind — no first-pack ids);
   - unified stash: storage shape under the pack's chat-variable root (`eden_map.stash` for the first pack, a neutral
     name for others via the manifest's legacy names, naming Decision (a)); migration from `仓库` and `槽位` (one-way,
     idempotent, old keys kept read-only until S10); **reconciliation**: the stash recomputed from the chat floors must
     equal the stored stash item for item (agent brief §2.4) — define the recompute function and what counts as a match;
   - Items tab: four groups, row fields, actions (fly-to node; nothing writes host state except through existing
     intents), card inventory read-only from MVU (never write `stat_data`);
   - pickup vocabulary: strict patterns for 获得 / 得到 / 拿取 (subject + verb + object forms that count; forms that must
     not: abstract objects 获得了勇气, 得到消息, negation 没有拿取, questions, quotes / dialogue rules), per-pack extension
     (`items.pickup.verbs` / patterns in pack data, K-R-number for the contract addition), English counterpart and
     the I-08 fix rule;
   - I-04 npc / event host write paths: what "write path" means here (which domain, which store, which intent), and
     the default-off toggle(s);
   - kernel-schema additions as new K-R ids (K-R71 …) — add them to `docs/kernel-schema.md` (+ zh) in this step only as
     a short "planned in S6" list; the step specs add the full text.
2. A **review sheet** at the top of `docs/entity-protocol.md`: items **P-01 …** (one per real decision: name, options
   A / B (/ C), consequences, **Recommendation**). Every recommendation is the working decision.
3. `docs/todo.md` §3: one line per P-item: `- [x] **P-0n** <one line> → **Decided by default 2026-10-01 (autopilot):
   <option>; user may override.**`
4. Step specs `docs/plans/steps/S6-1.md`, `S6-2.md`, `S6-3.md`, each in the exact section format of
   `docs/plans/steps/S4-3.md` (Why, Read first, Scope IN/OUT, Setup, Tasks T1…, Constraints, Tests, Verify, Commits &
   push, Stop rules, Report) with files, functions, before → after and assertions. Suggested cut: S6-1 entity protocol +
   tab registry + characters by level (existing tabs onto the registry, identical behaviour); S6-2 unified stash +
   migration + reconciliation test + Items tab; S6-3 pickup verbs + I-08 + I-04 write paths + new probe
   `drawer_stash` (plan §8 new probes). Each ≤ ~6 h of work. Include the parity rule (agent brief §3) and the probes to
   run.

## 3. Constraints

- Documents only. English for new docs with a `.zh.md` edition (language policy); step specs English only (like the
  other step files). No provenance wording (agent brief §7), no academic citations.
- Generic: no first-pack ids or words in the protocol or the engine-facing contracts; examples may use the town pack.
- Do not change decisions already recorded (K-01 … K-07, Q-09 … Q-18, naming Decisions); build on them.

## 4. Verify

```bash
bash tools/smoke.sh            # doc-language, zh-mirror, no-labels gates
node --test tests/*.test.mjs   # unchanged count
```

## 5. Commit & push

One commit `docs(design): S6 entity protocol, tab registry, unified stash; review sheet P-01…; S6-1…3 specs`, message via
file (`-F`), English, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By trailer; push
`bash tools/push_preview.sh --head --no-escalate`. Worktree: `git worktree add -b s6-design <scratchpad>/s6-design
origin/preview`.

## 6. Report

RESULT block (agent brief §5) appended to `docs/plans/spatial-os-log.md` in the commit, with extra lines:
`sheet: P-01…P-nn (recommendations: …one per item)`, `specs: S6-1 <summary>, S6-2 <summary>, S6-3 <summary>`,
`new K-R ids: …`.
