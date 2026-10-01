#!/usr/bin/env python3
"""One-off (S4-4b): rename the render-campaign item field `canon` to `fill` in docs/plans/render-campaign.items.json
(card -> specific, inferred -> generic). tools/render_campaign_items.py emits the same names; this script only brings the
committed file in line without re-running the generator. Idempotent.
"""
import io, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PATH = os.path.join(ROOT, 'docs', 'plans', 'render-campaign.items.json')
PAIRS = [('"canon": "card"', '"fill": "specific"'), ('"canon": "inferred"', '"fill": "generic"')]

s = io.open(PATH, encoding='utf-8').read()
out = s
for a, b in PAIRS:
    out = out.replace(a, b)
if out != s:
    io.open(PATH, 'w', encoding='utf-8', newline='').write(out)
    print('updated', os.path.relpath(PATH, ROOT))
else:
    print('already current')
