#!/usr/bin/env python3
"""One-off (S4-4b): rename the estate room kind `user` to `medical` in map/data/eden_estate_rooms.json.

blender/estate2/floorplans.py is the generator (needs matplotlib); this script applies the same change to the committed JSON
without regenerating the plan images. Idempotent: a second run changes nothing.
"""
import io, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PATH = os.path.join(ROOT, 'map', 'data', 'eden_estate_rooms.json')
PAIRS = [
    ('"kind": "user"', '"kind": "medical"'),
    ('owner 主人专用 / user 用户设定。', 'owner 主人专用 / medical 医疗中心。'),
]

s = io.open(PATH, encoding='utf-8').read()
out = s
for a, b in PAIRS:
    out = out.replace(a, b)
if out != s:
    io.open(PATH, 'w', encoding='utf-8').write(out)
    print('updated', os.path.relpath(PATH, ROOT))
else:
    print('already current')
