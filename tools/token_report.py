#!/usr/bin/env python3
"""Token-accounting report for this project's Claude Code sessions.

Streams JSONL transcripts (main sessions + subagent sidechains + cloud task
outputs) and aggregates message.usage token counts by rough category. Never
loads full transcripts into memory beyond one line at a time, and never
prints message content — only aggregate numbers.

Usage: python3 tools/token_report.py [--json out.json]
"""
import json
import os
import re
import sys
import glob
from collections import defaultdict

HOME = os.path.expanduser("~")
PROJ_DIR = os.path.join(HOME, ".claude", "projects",
                         "-Users-davidzhao-dev1-cctest1----threejs")
TMP_DIR = "/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs"

# cache_read weight 0.1x, cache_creation 1.25x, output 5x relative to input(1x)
W_INPUT, W_CACHE_READ, W_CACHE_CREATE, W_OUTPUT = 1.0, 0.1, 1.25, 5.0

CATS = [
    ("建模/渲染-上层岛", re.compile(r"upper.?(isl|city)|上层岛|上层城|cloud.?sea|云海", re.I)),
    ("建模/渲染-中层建筑", re.compile(r"mid.?tier|中层|风暴殿|天城大学|法院|landmark|地标", re.I)),
    ("建模/渲染-庄园", re.compile(r"estate|庄园|manor|eden", re.I)),
    ("建模/渲染-其他", re.compile(r"blender|render|渲染|建模|glb|dzi|贴图|texture|island|岛", re.I)),
    ("代码-UI/前端", re.compile(r"\bui\b|viewer|前端|floating.?button|悬浮|css|html(?!.*report)", re.I)),
    ("代码-酒馆集成", re.compile(r"tavern|mvu|worldbook|酒馆|TavernHelper", re.I)),
    ("代码-测试/CI", re.compile(r"\btest|smoke|\bci\b|node --test", re.I)),
    ("代码-其他", re.compile(r"代码|script\.js|refactor|重构|bugfix|fix:", re.I)),
    ("文档/设定-review", re.compile(r"review|评审|校对|reviewer", re.I)),
    ("文档/设定-翻译", re.compile(r"translat|翻译", re.I)),
    ("文档/设定-设定卡", re.compile(r"设定|worldbuild|card.{0,4}read|卡", re.I)),
    ("文档/设定-报告", re.compile(r"report|报告|retro|总结", re.I)),
    ("流程/工具-cloud渲染", re.compile(r"cloud|autodl|云渲染|云端", re.I)),
    ("流程/工具-pipeline脚本", re.compile(r"pipeline|tools/|脚本|region_patch|bump_head", re.I)),
    ("流程/工具-清理", re.compile(r"cleanup|清理|tidy|folder rename|git.?slim", re.I)),
]

REWORK_RE = re.compile(r"\bv(\d{1,2})\b", re.I)


def classify(text):
    text = text or ""
    for name, rx in CATS:
        if rx.search(text):
            return name
    return "未分类"


def usage_tokens(usage):
    if not usage:
        return None
    inp = usage.get("input_tokens", 0) or 0
    out = usage.get("output_tokens", 0) or 0
    cc = usage.get("cache_creation_input_tokens", 0) or 0
    cr = usage.get("cache_read_input_tokens", 0) or 0
    return inp, out, cc, cr


class Agg:
    __slots__ = ("input", "output", "cache_create", "cache_read", "msgs", "agents")

    def __init__(self):
        self.input = self.output = self.cache_create = self.cache_read = 0
        self.msgs = 0
        self.agents = set()

    def add(self, inp, out, cc, cr, agent_id):
        self.input += inp
        self.output += out
        self.cache_create += cc
        self.cache_read += cr
        self.msgs += 1
        if agent_id:
            self.agents.add(agent_id)

    def fresh(self):
        return self.input + self.cache_create + self.output

    def cost_weight(self):
        return (self.input * 1.0 + self.cache_read * W_CACHE_READ +
                self.cache_create * W_CACHE_CREATE + self.output * W_OUTPUT)


def first_prompt_text(path):
    """Best-effort: first user/system text line + cwd, used for classification."""
    try:
        with open(path, "r", errors="ignore") as fh:
            for i, line in enumerate(fh):
                if i > 5:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                cwd = d.get("cwd", "") or ""
                msg = d.get("message", {})
                content = msg.get("content", "")
                if isinstance(content, list):
                    parts = []
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "text":
                            parts.append(c.get("text", ""))
                    content = " ".join(parts)
                if isinstance(content, str) and content.strip():
                    return (cwd + " " + content)[:500]
    except Exception:
        pass
    return ""


def walk_jsonl_files():
    files = []
    for p in glob.glob(os.path.join(PROJ_DIR, "*.jsonl")):
        files.append(("main", p))
    for p in glob.glob(os.path.join(PROJ_DIR, "**", "*.jsonl"), recursive=True):
        if p not in [f for _, f in files]:
            files.append(("sub", p))
    for p in glob.glob(os.path.join(TMP_DIR, "*", "tasks", "*.output")):
        files.append(("task", p))
    return files


def main():
    files = walk_jsonl_files()
    cat_agg = defaultdict(Agg)
    top_agg = defaultdict(Agg)  # top-level bucket (before -subsplit)
    agent_totals = defaultdict(Agg)  # per agent/session file
    rework_counts = defaultdict(int)
    n_files = 0

    for kind, path in files:
        n_files += 1
        label = first_prompt_text(path)
        cat = classify(label) if kind != "main" else "主对话/协调"
        top = cat.split("-")[0]
        agent_key = os.path.basename(path)

        m = REWORK_RE.search(label)
        if m and kind != "main":
            rework_counts[cat] += 1

        try:
            with open(path, "r", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    if d.get("type") != "assistant":
                        continue
                    usage = (d.get("message") or {}).get("usage")
                    tok = usage_tokens(usage)
                    if not tok:
                        continue
                    inp, out, cc, cr = tok
                    agent_id = d.get("agentId") or ("main" if kind == "main" else agent_key)
                    cat_agg[cat].add(inp, out, cc, cr, agent_id)
                    top_agg[top].add(inp, out, cc, cr, agent_id)
                    agent_totals[agent_key].add(inp, out, cc, cr, agent_id)
        except Exception as e:
            print(f"# warn: failed reading {path}: {e}", file=sys.stderr)

    # ---- print aggregate report (no transcript content) ----
    print(f"# Files scanned: {n_files}")
    print()
    print("## By top-level category")
    grand = Agg()
    for cat, a in sorted(top_agg.items(), key=lambda kv: -kv[1].fresh()):
        grand.input += a.input; grand.output += a.output
        grand.cache_create += a.cache_create; grand.cache_read += a.cache_read
        print(f"{cat}\tfresh={a.fresh()}\tcache_read={a.cache_read}\t"
              f"cost_w={a.cost_weight():.0f}\tagents={len(a.agents)}\tmsgs={a.msgs}")
    print(f"TOTAL\tfresh={grand.fresh()}\tcache_read={grand.cache_read}\t"
          f"cost_w={grand.cost_weight():.0f}")
    print()
    print("## By sub-category")
    for cat, a in sorted(cat_agg.items(), key=lambda kv: -kv[1].fresh()):
        avg = a.fresh() / max(1, len(a.agents))
        print(f"{cat}\tfresh={a.fresh()}\tcache_read={a.cache_read}\t"
              f"cost_w={a.cost_weight():.0f}\tagents={len(a.agents)}\tavg/agent={avg:.0f}\t"
              f"rework_hits={rework_counts.get(cat,0)}")
    print()
    print(f"## Agents total: {len(agent_totals)}")
    avg_all = sum(a.fresh() for a in agent_totals.values()) / max(1, len(agent_totals))
    print(f"Average fresh tokens/agent: {avg_all:.0f}")

    if "--json" in sys.argv:
        out_path = sys.argv[sys.argv.index("--json") + 1]
        data = {
            "files_scanned": n_files,
            "top": {k: {"fresh": v.fresh(), "cache_read": v.cache_read,
                        "cost_weight": v.cost_weight(), "agents": len(v.agents),
                        "msgs": v.msgs} for k, v in top_agg.items()},
            "sub": {k: {"fresh": v.fresh(), "cache_read": v.cache_read,
                        "cost_weight": v.cost_weight(), "agents": len(v.agents),
                        "msgs": v.msgs, "rework_hits": rework_counts.get(k, 0)}
                    for k, v in cat_agg.items()},
            "agents_total": len(agent_totals),
            "avg_fresh_per_agent": avg_all,
        }
        with open(out_path, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
