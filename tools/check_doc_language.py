#!/usr/bin/env python3
"""Language gate: new documents must be written in English.

Policy (2026-09-29, see docs/language-policy.md):
  * NEW documents are written in English.
  * NEW prose added to an existing document is English too.  (Not checked here: which
    hunks are "new" is not machine-decidable in a useful way.)
  * Documents that already existed before the policy are NOT translated in bulk.  They
    are grandfathered so the repo does not grow a half-translated zone.

Enforcement: every tracked `*.md` that did not exist at the latest `map-v*` release tag
must keep its CJK character ratio below THRESHOLD (5% of non-space characters).  A new
English doc that mentions a few Chinese proper nouns still passes; a new Chinese doc
never will.

Escape hatches:
  * `*.zh.md`  — the Chinese edition of a new English doc (the English one is canonical).
  * `docs/archive/**`, `docs/history/**` — verbatim archives of older material.
  * ALLOW      — explicit exceptions, each carrying its reason.

Usage: python3 tools/check_doc_language.py [--verbose]
Exit 0 = pass, 1 = at least one new doc is Chinese-heavy.
"""

import argparse
import re
import subprocess
import sys

THRESHOLD = 0.05

ALLOW = {
    # path: reason — keep this list short and justified; prefer `*.zh.md`.
}

ARCHIVE_PREFIXES = ("docs/archive/", "docs/history/")
# Tool-generated scaffolds (`tools/landmark.py new`) stay in the template language: translating them
# by hand would break the tool's own round-trip and gapcheck's side-by-side diff.
# See docs/language-policy.md, "Exception: tool-generated templates".
TEMPLATE_PREFIXES = ("docs/landmarks/",)

# CJK Unified Ideographs (+ A), CJK punctuation, fullwidth forms, CJK compat ideographs.
CJK_RE = re.compile(
    "["
    "\u3000-\u303f"      # CJK punctuation （。、「」《》…）
    "\u3400-\u4dbf"      # CJK Extension A
    "\u4e00-\u9fff"      # CJK Unified Ideographs
    "\uf900-\ufaff"      # CJK Compatibility Ideographs
    "\uff01-\uff60"      # Fullwidth forms
    "]"
)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout


def tracked_markdown():
    return [f for f in git("ls-files", "*.md").splitlines() if f]


def baseline_tag():
    """Latest release tag (map-vX.Y.Z), by version order."""
    tags = [t for t in git("tag", "--list", "map-v*").splitlines() if t]
    if not tags:
        return None
    def key(t):
        m = re.match(r"map-v(\d+)\.(\d+)(?:\.(\d+))?$", t)
        return tuple(int(x) for x in m.groups(default="0")) if m else (0, 0, 0)
    return sorted(tags, key=key)[-1]


def cjk_ratio(text):
    body = "".join(ch for ch in text if not ch.isspace())
    if not body:
        return 0.0
    return len(CJK_RE.findall(body)) / len(body)


def exempt(path):
    if path in ALLOW:
        return True
    if path.endswith(".zh.md"):
        return True
    if path.startswith(ARCHIVE_PREFIXES):
        return True
    return path.startswith(TEMPLATE_PREFIXES)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true", help="list every new doc and its ratio")
    args = ap.parse_args()

    tag = baseline_tag()
    if not tag:
        print("没有 map-v* 标签，跳过后即可（无基线就没有「新文档」的概念）")
        return 0

    old = set(git("ls-tree", "-r", "--name-only", tag).splitlines())
    files = tracked_markdown()
    new_docs = [f for f in files if f not in old and not exempt(f)]

    bad = []
    skipped = []
    for f in new_docs:
        try:
            text = open(f, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        r = cjk_ratio(text)
        if r >= THRESHOLD:
            bad.append((f, r))
        else:
            skipped.append((f, r))

    if args.verbose:
        for f, r in skipped:
            print(f"  OK   {f}（CJK {r:.1%}）")
        for f, reason in ALLOW.items():
            print(f"  ALLOW {f}：{reason}")

    print(f"基线 {tag}：{len(files)} 份 md，其中新文档 {len(new_docs)} 份，阈值 CJK < {THRESHOLD:.0%}")
    if bad:
        print("以下新文档英文门槛未过（政策：新文档用英文；中文版请另存 *.zh.md，见 docs/language-policy.md）：")
        for f, r in bad:
            print(f"  {f}：CJK {r:.1%}")
        return 1
    print(f"通过：{len(new_docs)} 份新文档都是英文（或已豁免）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
