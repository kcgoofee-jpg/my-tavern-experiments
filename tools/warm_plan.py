#!/usr/bin/env python3
"""Which files to warm on the CDN for a given ref (the "warm plan").

Two modes:
  * full (default, and what `tools/ship.sh --release` asks for): every runtime file in the
    ref's tree under map/ — ~2000 files, minutes.
  * diff (`--diff [BASE]`): only the runtime files this ref changed relative to BASE
    (default: the ref's parent), plus the always-refreshed head pointers. A one-line code
    change warms ~3 URLs instead of 2000, so a push no longer blocks for minutes.

Escalation: a diff that touches heavy static assets (map/art/, map/props/, *.dzi, *.glb)
falls back to the full sweep — a changed tile atlas usually means the whole render
changed, and the viewer pulls tiles lazily, so the full set has to be warm anyway.
`--no-escalate` opts out (for tests and for "one tile only" fixes).

The plan is printed to stdout (one map/-relative path per line); the human-readable
reason (which mode, which base, why it escalated) goes to stderr so that `--list` and
`--count` stay pipeable. Only stdlib + git; no network.

Usage: python3 tools/warm_plan.py [--repo DIR] [--ref REF] [--diff [BASE]] [--full]
                                  [--no-escalate] [--count] [--only PREFIX]
Exit 0 with the list; exit 2 when the ref has no runtime files at all (bad ref — fetch first).
"""
import argparse
import re
import subprocess
import sys

# C-11: never warm non-runtime files — docs (.md/.py/.txt), schema samples, screenshots,
# prototypes, review drafts, and the dead prototype pages the product never loads.
EXCL = re.compile(
    r"\.(md|py|txt)$"
    r"|^map/data/schema/"
    r"|^map/(shots|_proto)/"
    r"|/reviews/"
    r"|^map/(world|world_draft[0-9]*|tiancheng)\.html$"
    r"|^map/section\.js$"
)
# Heavy static assets: changing any of these escalates a diff run to a full sweep.
HEAVY = re.compile(r"^map/(art|props)/|\.(dzi|glb)$")
# Refreshed on every push even when the diff is empty: the follow-branch pointer and the
# loader entry every imported script boots from.
PINNED = ("map/data/head.json", "map/tavern/eden-map.js")


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)


def resolve(repo, ref):
    r = git(repo, "rev-parse", "-q", "--verify", f"{ref}^{{commit}}")
    return r.stdout.strip() if r.returncode == 0 else ""


def runtime_files(repo, ref):
    """Runtime files under map/ at ref (sorted, deduped)."""
    r = git(repo, "ls-tree", "-r", "--name-only", ref, "--", "map")
    if r.returncode:
        raise SystemExit(f"git ls-tree 失败（本地没有 {ref}？先 git fetch）：{r.stderr.strip()}")
    return sorted({f for f in r.stdout.splitlines() if f and not EXCL.search(f)})


def changed_files(repo, base, ref):
    r = git(repo, "diff", "--name-only", base, ref, "--", "map")
    if r.returncode:
        return []
    return [f for f in r.stdout.splitlines() if f and not EXCL.search(f)]


def dedup(paths):
    out, seen = [], set()
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def plan(repo=".", ref="HEAD", base=None, diff=False, full=False, no_escalate=False):
    """Return (files, reason). Falls back to the full plan whenever the diff is unusable."""
    all_files = runtime_files(repo, ref)
    if not all_files:
        raise SystemExit(f"{ref} 下 map/ 里没有运行时文件（ref 不对？先 git fetch）")
    full_set = sorted(set(all_files))
    if full or not diff:
        return full_set, "全量"

    base_ref = base or ""
    if not base_ref:
        r = git(repo, "rev-parse", "-q", "--verify", f"{ref}^")
        base_ref = r.stdout.strip() if r.returncode == 0 else ""
    if not base_ref:
        return full_set, f"拿不到基线（{ref} 没有父提交 / --base 不可解析）→ 全量"
    if not resolve(repo, base_ref):
        return full_set, f"基线 {base_ref} 本地不存在 → 全量"

    alive = set(full_set)
    changed = [f for f in changed_files(repo, base_ref, ref) if f in alive]
    heavy = [f for f in changed if HEAVY.search(f)]
    if heavy and not no_escalate:
        return full_set, f"重度资产变动 {len(heavy)} 个（如 {heavy[0]}）→ 全量"
    pins = [p for p in PINNED if p in alive]
    short = lambda r: (resolve(repo, r) or r)[:12]
    note = f"增量 {short(base_ref)}..{short(ref)}：变动 {len(changed)} 个 + 头指针 {len(pins)} 个"
    if no_escalate and heavy:
        note += f"（--no-escalate：重度 {len(heavy)} 个未展开）"
    return dedup(pins + changed), note


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=".", help="仓库目录（默认当前目录）")
    ap.add_argument("--ref", default="HEAD", help="要预热的版本 / 提交 / 分支（默认 HEAD）")
    ap.add_argument("--diff", nargs="?", const="", metavar="BASE",
                    help="只预热本次改动的文件 + 头指针；BASE 默认取 ref 的父提交")
    ap.add_argument("--full", action="store_true", help="强制全量（发版用）")
    ap.add_argument("--no-escalate", action="store_true", help="重度资产变动也不展开成全量")
    ap.add_argument("--count", action="store_true", help="只打印文件个数")
    ap.add_argument("--only", metavar="PREFIX", help="只留以此开头的路径（N14 a：map/art/ 按 @<art_sha> 单独预热）")
    a = ap.parse_args()
    files, note = plan(a.repo, a.ref, base=a.diff or None, diff=a.diff is not None,
                       full=a.full, no_escalate=a.no_escalate)
    if a.only:
        files = [f for f in files if f.startswith(a.only)]
        note += f"；只留 {a.only}（{len(files)} 个）"
    print(len(files) if a.count else "\n".join(files))
    print(note, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
