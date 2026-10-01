#!/usr/bin/env python3
"""Syncs map/ui/tokens.css into map/viewer.html's <style id="tokens"> as a MINIFIED copy (E5: inlined to save one first-paint request;
S7-2: minified, comments stripped and one top-level rule per line, so the token file may grow without growing viewer.html).
Usage: python3 tools/sync_tokens.py [--check]   --check only compares and exits 1 when they differ (tools/smoke.sh)."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent


def minify(css):
    css = re.sub(r'/\*[\s\S]*?\*/', '', css)
    css = re.sub(r'\s+', ' ', css).strip()
    out, depth, cur = [], 0, ''
    for ch in css:
        cur += ch
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: out.append(cur.strip()); cur = ''
    if cur.strip(): out.append(cur.strip())
    return '\n'.join(out) + '\n'


tok = minify((root / 'map/ui/tokens.css').read_text(encoding='utf-8'))
vp = root / 'map/viewer.html'; html = vp.read_text(encoding='utf-8')
m = re.search(r'(<style id="tokens">\n)([\s\S]*?)(</style>)', html)
if not m: print('viewer.html has no <style id="tokens">'); sys.exit(1)
if m.group(2) == tok: print('tokens in sync'); sys.exit(0)
if '--check' in sys.argv: print('viewer.html inline tokens differ from map/ui/tokens.css (minified): python3 tools/sync_tokens.py'); sys.exit(1)
vp.write_text(html[:m.start(2)] + tok + html[m.end(2):], encoding='utf-8'); print('synced')
