# Branching and release lines

Decided 2026-09-29, asked as "should `main` and the follow/preview line be merged?"

## Answer

**They are already the same thing, and they should stay that way while the project is
pre-release.** There is nothing to merge: `main` and `cloud/tc-mid-low` point at the same
commit. Syncing them is a **fast-forward**, and from now on a forced update is never
needed again — after the 2026-09 history rewrite, `main` is an ancestor of the follow
branch. `tools/sync_main.sh` performs the sync and **refuses** to do anything but fast
forward.

## Roles

| Branch | Role | Pointer clients read |
|---|---|---|
| `cloud/tc-mid-low` | Integration + follow/preview line. Everything lands here. | `map/data/head.json` (`{build, sha, at}`, written by `tools/bump_head.py`) |
| `main` | Release line. Tags (`map-vX.Y.Z`) live on this line. | `map/data/build.json` (`{version, code}`) + the tag list |
| feature branches | Short-lived, merged into the follow branch | — |
| `backup/*` | Local safety pointers from the history rewrite | — |

The **freeze point is the tag, not the branch.** A user who pins a version reads that
tag's `build.json`; a user following the preview line reads `head.json`. Both modes exist
client-side (`map/tavern/follow.mjs`, `map/app/settings.mjs`) and neither requires `main`
to diverge.

## Why one line, for now

* Nothing has shipped publicly. A frozen `main` would only be a second thing to maintain,
  and would buy no user-visible protection.
* Beta users can send feedback, and the built-in report carries the **build code**
  (`map/app/topbar.mjs` reads `data/build.json`, e.g. `S1-0906-R-0592`; feedback includes
  version / self-check / position / logs, not chat content). If `main` and the preview
  line carried different content while reporting the same version family, triage would
  become guesswork: the same report could describe two different builds.
* The lines are already identical, so "merging" costs nothing today. Keeping them apart
  would require deliberate work and would start drifting immediately.

## When to split them

Only when a **shipped** tag needs backports while the follow line moves on. At that point:

1. `main` stays on the shipped line and receives cherry-picked fixes; a patch tag is cut
   from it.
2. The follow branch keeps moving; `main` is no longer force-synced into it.
3. `tools/sync_main.sh` starts failing the ancestor check — that failure is the signal to
   do this split deliberately, not to override it.

Until then: sync, do not fork.

## The commands

```sh
DRY_RUN=1 bash tools/sync_main.sh   # say what would happen
bash tools/sync_main.sh             # fast-forward main to the follow branch + push
```

The script fetches, verifies the ancestor relation in both directions (remote `main` must
be an ancestor of the follow branch, and the local `main` must not hold commits the follow
branch lacks), updates the ref without checking it out, and pushes without `--force`.
Anything else is reported and refused.

## History note

The 2026-09 filter-repo rewrite made `main` and `feat/worldbook-auto` unrelated to the
cloud history (about 500 commits apart), which is why `main` was force-pushed to catch up.
That is finished: `main` now shares the follow branch's history, so the fast-forward path
is available from here on. Do not resurrect the force-push workflow.
