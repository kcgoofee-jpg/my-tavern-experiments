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
| `cloud/tc-mid-low` | **Deprecated compatibility mirror** of `preview`, retirement in progress (2026-09-30): no longer pushed by default — only on demand (`LEGACY=1 bash tools/push_preview.sh`). A session still on this ref can move to `preview` in-app via Settings → Update & version → Version branch. | — |
| `main` | Release line. Tags (`map-vX.Y.Z`) live on this line. | `map/data/build.json` (`{version, code}`) + the tag list |
| feature branches | Short-lived, merged into the follow branch | — |

## Renaming the work branch (done 2026-09-29)

`cloud/tc-mid-low` was a coded name nobody could read; the work branch is now **`preview`**.

The awkward part is not the rename, it is that **the follow loader takes its branch name from its own
script URL** (`SCRIPT.ref` in `map/tavern/eden-map.js` → `follow.mjs resolveFollow(repo, branch, …)`).
Scripts already imported by users therefore keep requesting `cloud/tc-mid-low` from the CDN, and that
path only keeps working while the ref keeps moving. So the old name lives on as a **mirror**:

```sh
bash tools/push_preview.sh            # push preview (the mirror is NOT pushed by default)
bash tools/push_preview.sh --head     # …and bump the follow head pointer afterwards
LEGACY=1 bash tools/push_preview.sh   # grace window only: also move the deprecated mirror
```

Decided 2026-09-30: the mirror is decoupled from the regular push. It now moves only on demand
while old imported scripts are still out there; new imports point at `@preview` or a release tag,
and the in-app branch switch (Settings → Update & version → Version branch) moves a running
session from the mirror ref to `preview` without re-importing. After the 0.9.7 release window the
ref is deleted on origin and `LEGACY` is dropped from `tools/push_preview.sh` and this section.

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

`README.md` (and its Chinese edition `README.zh.md`) carries the one-line `import` address users copy into
Tavern Helper: the follow line (`@preview`, always current — a branch ref needs no maintenance). A release line
pinned to a tag may be added again at release time; if present it must match the newest tag. Both files are checked
offline by `tools/check_readme.py` from `tools/smoke.sh`: repo slug against `origin`, preview ref against
`preview`, an optional release ref against the newest `map-v*` tag, the version claim against `VERSION`, every repo
path and markdown link target against the filesystem, and the six-section structure. `tools/test_readme.py` proves
the gate can actually fail, so it cannot pass by matching nothing.

`bash tools/ship.sh --release` refreshes a pinned tag before it runs smoke (same step that
points `map/data/latest.json` at the tag), commits it, and then continues, so the published
address cannot lag behind the release.

## CDN lines (moved from the old README, 2026-10-01)

The mainland-China route is cautionary: `cdn.jsdmirror.com` serves the same paths and the preview script tries
mirror → jsDelivr, but it is **not proven usable**. On 2026-09-29 a direct connection from the maintainer's Mac
(proxy off) failed, and through a proxy it was 3.7 times slower than jsDelivr. It is a third-party thin proxy
(response header `server: ayao`, `max-age` of only 5 minutes, query strings ignored), not an official jsDelivr node.
A real mainland route has to wait for the npm mirror (`registry.npmmirror.com`, reserved in the loader but off by
default). The old README, with its architecture diagram, tech-stack table and milestones, is kept as
`docs/archive/README-2026-09-30.md`; the diagram now lives in `docs/ARCHITECTURE.md` §11.

## History note

The 2026-09 filter-repo rewrite made `main` and `feat/worldbook-auto` unrelated to the
cloud history (about 500 commits apart), which is why `main` was force-pushed to catch up.
That is finished: `main` now shares the follow branch's history, so the fast-forward path
is available from here on. Do not resurrect the force-push workflow.
