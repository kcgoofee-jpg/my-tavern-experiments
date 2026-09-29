# Branching and release lines

Decided 2026-09-29, asked as "should `main` and the follow/preview line be merged?"

## Answer

**They are already the same thing, and they should stay that way while the project is
pre-release.** There is nothing to merge: `main` and `preview` point at the same
commit. Syncing them is a **fast-forward**, and from now on a forced update is never
needed again — after the 2026-09 history rewrite, `main` is an ancestor of the follow
branch. `tools/sync_main.sh` performs the sync and **refuses** to do anything but fast
forward.

## Roles

| Branch | Role | Pointer clients read |
|---|---|---|
| `preview` | Integration + follow/preview line. Everything lands here. | `map/data/head.json` (`{build, sha, at}`, written by `tools/bump_head.py`) |
| `cloud/tc-mid-low` | **Deprecated compatibility mirror** of `preview`. Kept only because already-imported follow scripts carry it in their URL. Never target it for new work. | — |
| `main` | Release line. Tags (`map-vX.Y.Z`) live on this line. | `map/data/build.json` (`{version, code}`) + the tag list |
| feature branches | Short-lived, merged into the follow branch | — |

## Renaming the work branch (done 2026-09-29)

`cloud/tc-mid-low` was a coded name nobody could read; the work branch is now **`preview`**.

The awkward part is not the rename, it is that **the follow loader takes its branch name from its own
script URL** (`SCRIPT.ref` in `map/tavern/eden-map.js` → `follow.mjs resolveFollow(repo, branch, …)`).
Scripts already imported by users therefore keep requesting `cloud/tc-mid-low` from the CDN, and that
path only keeps working while the ref keeps moving. So the old name lives on as a **mirror**:

```sh
bash tools/push_preview.sh          # push preview + mirror to the same commit
bash tools/push_preview.sh --head   # …and bump the follow head pointer afterwards
```

Never push only one of them: a lagging mirror silently freezes those users on an older build. The
mirror can be deleted once no imported script references the old name any more (then drop `LEGACY`
from `tools/push_preview.sh` and this section).

`docs/archive/**`, `docs/history/**` and `docs/reviews/**` keep the historical name on purpose —
they are records of what was done under that name.


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

## The import link in the README

`README.md` opens with the two one-line `import` addresses users copy into Tavern Helper:
the follow line (`@preview`, always current — a branch ref needs no maintenance) and the
release line (pinned to a tag). Both are checked offline by `tools/check_readme.py` from
`tools/smoke.sh`: repo slug against `origin`, preview ref against `preview`, release ref
against the newest `map-v*` tag, the version claims against `VERSION`, and every repo path
mentioned in the file against the filesystem. `tools/test_readme.py` proves the gate can
actually fail, so it cannot pass by matching nothing.

`bash tools/ship.sh --release` refreshes the pinned tag before it runs smoke (same step that
points `map/data/latest.json` at the tag), commits it, and then continues, so the published
address cannot lag behind the release.

## History note

The 2026-09 filter-repo rewrite made `main` and `feat/worldbook-auto` unrelated to the
cloud history (about 500 commits apart), which is why `main` was force-pushed to catch up.
That is finished: `main` now shares the follow branch's history, so the fast-forward path
is available from here on. Do not resurrect the force-push workflow.
