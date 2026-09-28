#!/usr/bin/env python3
"""tools/pipeline_status.py 的宽度/截断小单测（CJK 按 2 算，截断不换行）。"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import pipeline_status as PS  # noqa: E402

cases_strwidth = [
    ("abc", 3),
    ("渲染", 4),
    ("a渲b", 4),
]
ok = True
for s, w in cases_strwidth:
    got = PS.strwidth(s)
    if got != w:
        ok = False
        print(f"strwidth({s!r}) = {got}, want {w}")

# truncate: 结果的显示宽度不能超过给定宽度，且不是原串时要以…结尾
for s, w in [("hello world", 5), ("渲染管线看板", 5), ("short", 20), ("x", 1), ("渲", 1)]:
    got = PS.truncate(s, w)
    if PS.strwidth(got) > w:
        ok = False
        print(f"truncate({s!r},{w}) = {got!r} 宽度 {PS.strwidth(got)} 超过 {w}")
    if got != s and not got.endswith("…"):
        ok = False
        print(f"truncate({s!r},{w}) = {got!r} 被截断但没有以…结尾")
    if got == s and PS.strwidth(s) > w:
        ok = False

print("pipeline_status width/truncate (python):", "ok" if ok else "不一致")
sys.exit(0 if ok else 1)
