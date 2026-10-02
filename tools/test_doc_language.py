#!/usr/bin/env python3
"""Self-test for tools/check_doc_language.py.

A gate that cannot fail is worse than no gate, so this pins the verdict logic:
English passes, Chinese fails, the documented escapes actually escape.

Run: python3 tools/test_doc_language.py
"""

import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent


def load():
    spec = importlib.util.spec_from_file_location("cdl", HERE / "check_doc_language.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    m = load()
    fails = []

    def check(name, cond):
        if cond:
            print(f"  OK   {name}")
        else:
            print(f"  FAIL {name}")
            fails.append(name)

    # --- ratios ---
    check("纯英文 → 0", m.cjk_ratio("The upper layer renders the cloud sheets.") == 0.0)
    check("纯中文 → 高", m.cjk_ratio("上层渲染云层，视差按纵深通道取系数。") > 0.9)
    check("空串不炸", m.cjk_ratio("") == 0.0 and m.cjk_ratio("   \n\t ") == 0.0)

    # 真实场景：长英文文档里引用几个卡原名（中文专有名词）应当仍然通过
    doc = ("The sanctum is called 原域 in the original card, and the five seats are "
           "referred to by their card names verbatim. Everything else in this document "
           "is written in English, including headings, lists and the rationale.")
    r = m.cjk_ratio(doc)
    check(f"英文文档夹带中文专名仍通过（CJK {r:.1%} < {m.THRESHOLD:.0%}）", r < m.THRESHOLD)

    # 中文文档不会被放过
    bad = "本文档用中文书写，说明上层纵深的实现方式，以及视差、漂浮、标签不透明度的取法。"
    check(f"中文新文档会被拦（CJK {m.cjk_ratio(bad):.1%} ≥ {m.THRESHOLD:.0%}）",
          m.cjk_ratio(bad) >= m.THRESHOLD)

    # --- escapes ---
    check("*.zh.md 豁免", m.exempt("docs/language-policy.zh.md"))
    check("docs/archive/** 豁免", m.exempt("docs/archive/2026-09/overnight-questions.md"))
    check("docs/history/** 豁免", m.exempt("docs/history/GOAL_v0.9.1.md"))
    check("普通新文档不豁免", not m.exempt("docs/brand-new-spec.md"))
    check("tools 下的 md 不豁免", not m.exempt("tools/README.md"))
    check("ALLOW 里的路径豁免", all(m.exempt(p) for p in m.ALLOW))

    # --- D18: Chinese canonical until the S10 split ---
    check("中文正本（无 .zh.md 同伴）放行", m.chinese_canonical("docs/new-plan.md", {"docs/new-plan.md"}))
    check("有 .zh.md 同伴的 .md 是英文版，仍受门控", not m.chinese_canonical("docs/x.md", {"docs/x.md", "docs/x.zh.md"}))
    check(".zh.md 自己不算正本判定对象", not m.chinese_canonical("docs/x.zh.md", {"docs/x.zh.md"}))

    print(f"自测：{'全部通过' if not fails else str(len(fails)) + ' 项失败'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
