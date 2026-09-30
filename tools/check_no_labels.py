#!/usr/bin/env python3
"""No-provenance-labels gate (agent-brief §7): nothing in the product, data, tools or current docs may label content as
"from the card" versus "invented". The whole project is a derivative work, so those words do not exist here.

Scope: map/**, tools/**, blender/**, skills/**, tests/** and the current documents (the list in docs/README.md under
"Current documents", their *.zh.md editions, docs/card-buildings.md, docs/landmarks/**). History stays as it is
(docs/archive, docs/history, docs/reviews, docs/drafts, CHANGELOG.md, logs/).

Allowed exceptions (kept explicit, each with its reason below):
  * exact lines listed in ALLOW (the rule lines that forbid the words, and one append-only log line);
  * this file (it has to name the words) and the S0-F inventory (it quotes the words it counted).

Usage: python3 tools/check_no_labels.py [--self-test]
"""
import hashlib
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The words. Built from pieces so this source does not carry the literal text.
_MAP, _REPO, _SELF = "地图", "仓库", "自设"
WORDS = [_MAP + _SELF, _REPO + "推断", _REPO + _SELF, _SELF, "卡未写", "卡没写", "repo-" + "inferred"]
PATTERN = re.compile("|".join(re.escape(w) for w in WORDS))

SCOPE_DIRS = ("map/", "tools/", "blender/", "skills/", "tests/", "docs/landmarks/")
EXTRA_DOCS = ("docs/card-buildings.md",)
SKIP_DIRS = ("map/vendor/", "map/estate/vendor/", "map/art/", "map/shots/")
# whole files that may name the words, with the reason
EXEMPT_FILES = {
    "tools/check_no_labels.py": "this checker has to name the words (self-test cases)",
    "docs/plans/s0f-inventory.md": "the S0-F inventory quotes the words it counted",
}
# exact lines (sha256 of the line without its newline) that may name the words
ALLOW = {
    "docs/agent-brief.md": {
        "2f003120c9b021ef54c867f26287a8385f528a63656239aea8f5b83f07b27e41": "the rule: no provenance labels (line 1 of 2)",
        "22f2bd32db5dd7061f05825e4d9ab7a98f53e14a5a920e23714b6b71b5030978": "the rule: no provenance labels (line 2 of 2)",
    },
    "docs/agent-brief.zh.md": {
        "2f402131bf94e390f6daed4c7027f6f530e3acc7d73c2760ab3a3a01ff5214ab": "the same rule, Chinese edition",
    },
    "docs/plans/spatial-os-log.md": {
        "0379646f8aa1cda9d6d8f8343abfc64f8c4453ed8569b52da610ce31fec1cf4c": "append-only log: an old RESULT line that quotes the words (history is never rewritten)",
    },
}


def digest(line):
    return hashlib.sha256(line.encode("utf-8")).hexdigest()


def tracked_files(root):
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True).stdout
        return [p for p in out.decode("utf-8").split("\0") if p]
    except Exception:
        found = []
        for dp, dn, fn in os.walk(root):
            dn[:] = [d for d in dn if d not in (".git", "node_modules")]
            for f in fn:
                found.append(os.path.relpath(os.path.join(dp, f), root).replace(os.sep, "/"))
        return found


def current_docs(root):
    """Docs listed under "Current documents" in docs/README.md, plus their *.zh.md editions and the extras."""
    docs = set(EXTRA_DOCS)
    readme = Path(root) / "docs" / "README.md"
    if readme.exists():
        text = readme.read_text(encoding="utf-8")
        m = re.search(r"^## Current documents\s*$(.*?)(?=^(?:## |---))", text, re.M | re.S)
        for link in re.findall(r"\]\(([^)#]+)\)", m.group(1) if m else ""):
            if "://" in link or not link.endswith(".md"):
                continue
            p = ("docs/" + link).replace("docs/../", "")
            docs.add(p)
            docs.add(p[:-3] + ".zh.md")
    return docs


def in_scope(path, docs):
    if path in EXEMPT_FILES or path.startswith(SKIP_DIRS):
        return False
    return path.startswith(SCOPE_DIRS) or path in docs


def scan_text(path, text, allow):
    """[(line_number, excerpt)] for every line naming one of the words, minus the allowlisted exact lines."""
    hits = []
    for n, line in enumerate(text.split("\n"), 1):
        if PATTERN.search(line) and digest(line) not in allow.get(path, {}):
            hits.append((n, line.strip()[:160]))
    return hits


def scan(root, files=None, allow=None):
    root = Path(root)
    allow = ALLOW if allow is None else allow
    files = tracked_files(root) if files is None else files
    docs = current_docs(root)
    found = []
    for rel in files:
        if not in_scope(rel, docs):
            continue
        try:
            text = (root / rel).read_bytes().decode("utf-8")
        except (UnicodeDecodeError, OSError):
            continue   # binary or missing: nothing to read
        for n, excerpt in scan_text(rel, text, allow):
            found.append((rel, n, excerpt))
    return found


def self_test():
    bad = 0

    def check(name, cond):
        nonlocal bad
        if not cond:
            print(f"FAIL self-test: {name}")
            bad += 1

    with tempfile.TemporaryDirectory() as d:
        root = Path(d)

        def put(rel, text, data=None):
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data if data is not None else text.encode("utf-8"))
            return rel

        put("docs/README.md", "# docs\n\n## Current documents\n\n- [a.md](a.md) — a\n- [plans/b.md](plans/b.md) — b\n- [site](https://example.org/x.md)\n\n---\n\nold\n")
        # 1 clean files pass in every scoped area
        files = [put("map/ok.mjs", "// fine\n"), put("tools/ok.py", "x = 1\n"), put("tests/ok.test.mjs", "ok\n"),
                 put("docs/a.md", "clean\n"), put("docs/landmarks/x.md", "- clean\n")]
        check("clean files pass", scan(root, files) == [])
        # 2 each word is caught, with its line number
        for i, w in enumerate(WORDS):
            rel = put(f"map/w{i}.mjs", f"// line one\n// has {w} here\n")
            r = scan(root, [rel])
            check(f"word {i} is caught", r == [(rel, 2, f"// has {w} here")])
        # 3 every scoped area is scanned
        w = WORDS[1]
        for rel in ("map/x.json", "tools/x.py", "blender/x.py", "skills/x.md", "tests/x.mjs", "docs/a.md", "docs/a.zh.md", "docs/plans/b.md", "docs/card-buildings.md", "docs/landmarks/y.checklist.md"):
            put(rel, f"{w}\n")
            check(f"{rel} is scanned", len(scan(root, [rel])) == 1)
        # 4 history and other docs are out of scope
        for rel in ("docs/archive/x.md", "docs/history/x.md", "docs/reviews/x.md", "CHANGELOG.md", "logs/x.csv", "docs/other.md", "map/vendor/x.js"):
            put(rel, f"{w}\n")
            check(f"{rel} is ignored", scan(root, [rel]) == [])
        # 5 exempt files
        for rel in EXEMPT_FILES:
            put(rel, f"{w}\n")
            check(f"{rel} is exempt", scan(root, [rel]) == [])
        # 6 allowlist is by exact line
        line = "keep " + WORDS[0] + " out"
        rel = put("docs/a.md", line + "\nnext\n")
        allow = {rel: {digest(line): "test"}}
        check("allowlisted line passes", scan(root, [rel], allow) == [])
        put(rel, line + "!\n")
        check("an edited allowlisted line fails", len(scan(root, [rel], allow)) == 1)
        put(rel, line + "\n" + line + "\n")
        check("the same text twice is fine, a different line is not", scan(root, [rel], allow) == [] and len(scan(root, [rel], {})) == 2)
        # 7 binary / undecodable content is skipped
        rel = put("map/bin.dat", "", data=b"\xff\xfe\x00" + w.encode("utf-16"))
        check("undecodable file is skipped", scan(root, [rel]) == [])
        # 8 README parsing
        docs = current_docs(root)
        check("README links become docs (and zh editions)", {"docs/a.md", "docs/a.zh.md", "docs/plans/b.md", "docs/card-buildings.md"} <= docs and "docs/x.md" not in docs)
    check("the allowlist digests all belong to existing files", all((ROOT / p).exists() for p in ALLOW))
    if not bad:
        print("self-test ok")
    return 1 if bad else 0


def main():
    if "--self-test" in sys.argv:
        return self_test()
    hits = scan(ROOT)
    for rel, n, excerpt in hits:
        print(f"{rel}:{n}: {excerpt}")
    if hits:
        print(f"\n{len(hits)} line(s) label content as card-vs-invented (agent-brief §7). Reword them: say what the thing is, not where it came from.")
        return 1
    print("no provenance labels")
    return 0


if __name__ == "__main__":
    sys.exit(main())
