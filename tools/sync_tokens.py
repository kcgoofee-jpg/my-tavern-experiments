#!/usr/bin/env python3
"""把 map/ui/tokens.css 逐字同步进 map/viewer.html 的 <style id="tokens">（E5：内联省一个阻塞首帧的请求）。
用法：python3 tools/sync_tokens.py [--check]   --check 只比对，不一致时退出码 1（tools/smoke.sh 调用）。"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tok = (root / 'map/ui/tokens.css').read_text(encoding='utf-8')
vp = root / 'map/viewer.html'; html = vp.read_text(encoding='utf-8')
m = re.search(r'(<style id="tokens">\n)([\s\S]*?)(</style>)', html)
if not m: print('viewer.html 里没有 <style id="tokens">'); sys.exit(1)
if m.group(2) == tok: print('令牌一致'); sys.exit(0)
if '--check' in sys.argv: print('viewer.html 内联令牌与 map/ui/tokens.css 不一致：python3 tools/sync_tokens.py'); sys.exit(1)
vp.write_text(html[:m.start(2)] + tok + html[m.end(2):], encoding='utf-8'); print('已同步')
