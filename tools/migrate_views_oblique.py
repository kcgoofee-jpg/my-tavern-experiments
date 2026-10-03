#!/usr/bin/env python3
"""一次性迁移（OBLIQUE-CODE 附录 A）：把三层天城地图的顶层 base / periods / insets 挪进 views.top，
并登记斜视主视图（views.oblique：批 1–4 的 DZI 与相机文件）；世界图补夜图档（批 5）。
没有 views 的地图行为不变；迁移后本脚本不再需要（重跑会拒绝）。改完跑 python3 tools/check_maps.py。
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'map', 'data', 'maps.json')
reg = json.load(open(P, encoding='utf-8'))

TIER_CAMS = {'tc_upper': 'data/cam/tc_upper_obl.json', 'tc_mid': 'data/cam/tc_mid_obl.json', 'tc_low': 'data/cam/tc_low_obl.json'}
OBL_PERIODS = {
    'tc_upper': {'dawn': 'art/tc_upper_obl_dawn.dzi', 'day': 'art/tc_upper_obl_day.dzi', 'dusk': 'art/tc_upper_obl_dusk.dzi', 'night': 'art/tc_upper_obl_night.dzi'},
    'tc_mid': {'dawn': 'art/tc_mid_obl_dusk.dzi', 'day': 'art/tc_mid_obl_day.dzi', 'dusk': 'art/tc_mid_obl_dusk.dzi', 'night': 'art/tc_mid_obl_night.dzi'},
    'tc_low': {'dawn': 'art/tc_low_obl_dayshift.dzi', 'day': 'art/tc_low_obl_dayshift.dzi', 'dusk': 'art/tc_low_obl_nightshift.dzi', 'night': 'art/tc_low_obl_nightshift.dzi'},
}
Z_REF = {'tc_mid': 50, 'tc_low': 0}
OUT = {
    'tc_mid': {'periods': {'day': 'art/tc_mid_out_day.dzi', 'dusk': 'art/tc_mid_out_dusk.dzi', 'night': 'art/tc_mid_out_night.dzi'}, 'cam': 'data/cam/tc_mid_out.json'},
    'tc_low': {'periods': {'day': 'art/tc_low_out_dayshift.dzi', 'night': 'art/tc_low_out_nightshift.dzi'}, 'cam': 'data/cam/tc_low_out.json'},
    'tc_upper': {'periods': {'day': 'art/tc_mid_out_day.dzi', 'dusk': 'art/tc_mid_out_dusk.dzi', 'night': 'art/tc_mid_out_night.dzi'}, 'cam': 'data/cam/tc_mid_out.json'},   # 上层不另渲外圈：画框外是中层外圈 + 霾（设定 §0.5）
}
TOP_LOW_PERIODS = {k: 'art/tc_low_night.dzi' for k in ('dawn', 'day', 'dusk', 'night')}   # 下层俯视退役昼夜四图（D41）：四个档都指向夜图

maps = reg['maps']
changed = []
for mid in TIER_CAMS:
    m = maps[mid]
    if 'views' in m: continue
    top = {'base': m['base'], 'periods': dict(m['periods'])}
    if mid == 'tc_low': top['base'] = 'art/tc_low_night.dzi'; top['periods'] = dict(TOP_LOW_PERIODS)   # 台账 RETIRED（D41）：下层俯视每档都指夜图
    if m.get('insets'): top['insets'] = m['insets']
    oblique = {'periods': OBL_PERIODS[mid], 'cam': TIER_CAMS[mid], 'outskirts': OUT[mid]}
    if mid in Z_REF: oblique['z_ref_m'] = Z_REF[mid]
    if mid == 'tc_upper':
        oblique['insets'] = [{'id': 'eden_hi_obl', 'marker': 'eden', 'periods': {
            'dawn': 'art/tc_upper_eden_obl_dawn.dzi', 'day': 'art/tc_upper_eden_obl_day.dzi',
            'dusk': 'art/tc_upper_eden_obl_dusk.dzi', 'night': 'art/tc_upper_eden_obl_night.dzi'},
            'cam': 'data/cam/tc_upper_eden.json'}]
        oblique['composite'] = {'below': 'tc_mid', 'haze': 'period'}
    # 保持键序：views 放在 view 之后
    out = {}
    for k, v in m.items():
        out[k] = v
        if k == 'view': out['views'] = {'default': 'oblique', 'top': top, 'oblique': oblique}
    for k in ('base', 'periods', 'insets'):
        out.pop(k, None)
    maps[mid] = out
    changed.append(mid)
if 'night' not in (maps.get('world').get('periods') or {}):
    maps['world']['periods'] = {'night': 'art/world_night.dzi'}
    changed.append('world')
if not changed:
    sys.exit('没有可迁移的地图（views 已在）；拒绝重跑')
with open(P, 'w', encoding='utf-8') as f:
    json.dump(reg, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('迁移完成：', ', '.join(changed))
