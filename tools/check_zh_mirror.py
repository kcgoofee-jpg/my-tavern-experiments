#!/usr/bin/env python3
"""en/zh mirror gate: each English document and its `*.zh.md` edition must have the same heading structure
(same number and levels of headings, in the same order; heading text may differ). Fenced code blocks are ignored.

Usage: python3 tools/check_zh_mirror.py [--self-test]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIRS = [
    ("README.md", "README.zh.md"),
    ("docs/agent-brief.md", "docs/agent-brief.zh.md"),
    ("docs/plans/spatial-os.md", "docs/plans/spatial-os.zh.md"),
    ("docs/ARCHITECTURE.md", "docs/ARCHITECTURE.zh.md"),
    ("docs/naming.md", "docs/naming.zh.md"),
    ("docs/kernel-schema.md", "docs/kernel-schema.zh.md"),
]
HEADING = re.compile(r"^(#{1,6})\s")


def headings(text):
    """[(level, line)] for every heading outside fenced code blocks."""
    out, fence = [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
            continue
        m = None if fence else HEADING.match(line)
        if m:
            out.append((len(m.group(1)), line))
    return out


def compare(a, b):
    """None when the level sequences match, else (index, line_a, line_b)."""
    ha, hb = headings(a), headings(b)
    for i in range(max(len(ha), len(hb))):
        la = ha[i] if i < len(ha) else None
        lb = hb[i] if i < len(hb) else None
        if la is None or lb is None or la[0] != lb[0]:
            return (i, la[1] if la else "<missing>", lb[1] if lb else "<missing>")
    return None


def self_test():
    base = "# T\n\n## A\n\n### B\n"
    cases = [
        ("identical structure passes", base, base, True),
        ("extra heading fails", base, base + "## C\n", False),
        ("heading inside a fence is ignored", base, base + "```\n## code\n```\n", True),
        ("different text, same levels passes", base, "# 标题\n\n## 甲\n\n### 乙\n", True),
        ("different level fails", base, "# T\n\n## A\n\n## B\n", False),
    ]
    bad = 0
    for name, a, b, want_ok in cases:
        ok = compare(a, b) is None
        if ok != want_ok:
            print(f"FAIL self-test: {name}")
            bad += 1
    if not bad:
        print(f"self-test ok ({len(cases)} cases)")
    return 1 if bad else 0


def main():
    if "--self-test" in sys.argv:
        return self_test()
    rc = 0
    for en, zh in PAIRS:
        pe, pz = ROOT / en, ROOT / zh
        missing = [p for p in (en, zh) if not (ROOT / p).is_file()]
        if missing:
            print(f"MISSING: {', '.join(missing)} (pair {en} <-> {zh})")
            rc = 1
            continue
        diff = compare(pe.read_text(encoding="utf-8"), pz.read_text(encoding="utf-8"))
        if diff:
            i, la, lb = diff
            print(f"MISMATCH {en} <-> {zh}: first divergence at heading #{i}\n  en: {la}\n  zh: {lb}")
            rc = 1
    if not rc:
        print(f"mirror ok ({len(PAIRS)} pairs)")
    return rc


if __name__ == "__main__":
    sys.exit(main())
