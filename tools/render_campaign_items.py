#!/usr/bin/env python3
"""The render campaign item list (docs/plans/render-campaign.items.json), generated once by
`tools/render_campaign.py init`. Targets, hints and notes are looked up from the repo (maps.json, tc_islands.json,
docs/card-buildings.md, logs/render_times.csv, the DZI files, the generator scripts); a failed lookup keeps the item
and puts "TODO: <what is missing>" in its notes. Order = priority. Text is ASCII only (ids, never card names).
"""
import json
import os
import re

STD_RES, STD_SPP = 2400, 64
OUT_DIR = 'logs/campaign/full'
PERIODS = ['dawn', 'day', 'dusk', 'night']
REVIEW_PROPS = ['arms_rnd', 'clearing_depot', 'contest_corridor', 'ether_dome', 'free_knight_camp', 'glory_crown',
                'linguang_post', 'rust_outskirts', 'league_club', 'rothschild_estate', 'elite_academy', 'holy_mountain']
LM_STANDARD = ['blood_mill', 'freight_yard', 'lower_bar', 'slums', 'rebirth_workshop', 'schneider_clinic', 'elite_club',
               'hunting_camp']
LM_HERO = ['round_table_hall', 'sun_arena', 'union_tower']
BASE_STANDARD = ['tc_mid', 'tc_low', 'site_kavalierki', 'yuanyu_sanctum', 'yuanyu_city', 'site_highland'] + \
    ['site_fief%d' % n for n in range(1, 6)]
ISLES = ['silver_crown', 'isle4', 'isle5', 'isle6', 'isle9', 'isle10', 'isle25', 'isle30']
FIEF_MARKERS = ['castle', 'fields', 'order', 'village']


class Lookup:
    def __init__(self, root):
        self.root = root
        self.maps = self.json('map/data/maps.json').get('maps', {})
        self.world_places = {x['id']: x for x in self.json('map/data/world_markers.json').get('places', []) if 'id' in x}
        self.islands = {i['id']: i for i in self.json('blender/data/tc_islands.json').get('islands', [])}
        self.card = self.read('docs/card-buildings.md')
        self.times = [r.split(',') for r in self.read('logs/render_times.csv').splitlines()[1:]]

    def path(self, rel):
        return os.path.join(self.root, rel)

    def exists(self, rel):
        return os.path.exists(self.path(rel))

    def read(self, rel):
        try:
            with open(self.path(rel), encoding='utf-8') as f:
                return f.read()
        except OSError:
            return ''

    def json(self, rel):
        return json.loads(self.read(rel) or '{}')

    def marker(self, mid):
        """'<map>:<marker>' of the first real map (or the world places list) that carries the marker, else None."""
        for mp, m in self.maps.items():
            if not mp.startswith('lm_') and mid in (m.get('markers') or {}):
                return '%s:%s' % (mp, mid)
        return 'world:' + mid if mid in self.world_places else None

    def marker_info(self, target):
        mp, mid = target.split(':')
        return self.world_places[mid] if mp == 'world' else self.maps[mp]['markers'][mid]

    def markers_linking(self, prop):
        """Markers whose 3D link opens a viewer3d model named `prop`."""
        lms = {k for k, v in self.maps.items() if k.startswith('lm_') and v.get('viewer3d') == prop}
        return [mp + ':' + mid for mp, m in self.maps.items() if not mp.startswith('lm_')
                for mid, v in (m.get('markers') or {}).items() if (v.get('link') or {}).get('map') in lms]

    def dzi_width(self, map_id):
        base = self.maps.get(map_id, {}).get('base') or ''
        m = re.search(r'Width="(\d+)"', self.read('map/' + base))
        return int(m.group(1)) if m else None

    def renders(self, asset):
        out = []
        for r in self.times:
            if len(r) > 4 and r[1] == asset and r[2] in ('draft', 'final', 'patch'):
                out.append({'date': r[0][:10], 'kind': r[2], 'res': r[3], 'spp': r[4], 'ok': len(r) < 7 or r[6] == '0'})
        return out

    def last_final(self, asset):
        ok = [r for r in self.renders(asset) if r['kind'] == 'final' and r['ok']]
        return ok[-1] if ok else None

    def card_row(self, needle):
        return next((ln for ln in self.card.splitlines() if ln.startswith('|') and needle in ln), '')

    def quality(self, prop):
        cells = self.card_row('map/props/%s/' % prop).split('|')
        q = cells[7].strip() if len(cells) > 7 else ''
        m = re.search(r'r(\d+) ([\d.]+) / ([\d.]+)', q)
        base = 'self-check r%s %s / %s' % m.groups() if m else 'glb exported'
        return base + (', unreviewed' if '未开评审' in q else '')

    def script_has(self, script, text):
        return text in self.read(script)


def item(id, lane, type, title, targets, canon, spec, hints=None, notes=None, depends=None, todo=None):
    notes = [n for n in (notes or []) if n]
    notes += ['TODO: ' + t for t in (todo or [])]
    return {'id': id, 'lane': lane, 'type': type, 'title': title, 'targets': targets, 'canon': canon,
            'depends': depends or [], 'spec': spec, 'hints': hints or {}, 'notes': '; '.join(notes)}


def words(s):
    return s.replace('_', ' ')


def full_out(stem):
    return '%s/%s_full.png' % (OUT_DIR, stem)


def build(root):
    L = Lookup(root)
    std, hero = [], []

    # ---- standard 1-2: estate
    crashes = len([r for r in L.renders('estate_final') if not r['ok']])
    lastok = [r for r in L.renders('estate_final') if r['ok']]
    std.append(item('estate:final', 'standard', 'estate', 'Re-render the estate exterior views (failed job)', ['eden_estate:*'],
                    'card', {'res': 2000, 'spp': 32},
                    {'script': 'blender/eden_manor.py', 'args': '--view ext,all,island --no-assets --out map/art/estate_{view}.png'},
                    ['logs/render_times.csv: estate_final has %d crash row(s)%s; check map/art/estate_*.png before re-running'
                     % (crashes, ' and a later ok row (%s)' % lastok[-1]['date'] if lastok else '')]))
    rescue = '~/eden-map-review/rescue/2026-09-30/'
    std.append(item('estate:opt', 'standard', 'estate', 'Evaluate the rescued house_opt LOD glbs for the estate model manifest',
                    ['eden_estate:*'], 'card', {'res': 0, 'spp': 0}, {'script': 'blender/estate2/export_house_opt.py'},
                    ['no render: stage final = evaluate (glb size vs manifest budget, draco variants), verify = visual parity vs '
                     'the current house.glb, ship = adopt in map/estate/model/manifest.json (bump v)',
                     'inputs in %s: house_opt_lod0.glb, house_opt_lod1.glb, their .draco.glb, house_opt.assets.json' % rescue],
                    depends=['estate:final'],
                    todo=[] if L.exists('blender/estate2/export_house_opt.py') else ['blender/estate2/export_house_opt.py is missing']))

    # ---- standard 3: reviews
    for prop in REVIEW_PROPS:
        targets = L.markers_linking(prop)
        todo, hints = [], {}
        if L.exists('blender/landmarks/%s/build.py' % prop):
            hints['landmark'] = prop
        elif L.exists('blender/world/yuanyu_holy_mount.py') and prop == 'holy_mountain':
            hints['script'] = 'blender/world/yuanyu_holy_mount.py'
            todo.append('holy_mountain has no blender/landmarks/holy_mountain/build.py; landmark.py stages may not apply')
        else:
            todo.append('no build script found for %s' % prop)
        if not targets:
            todo.append('no marker links to the 3D model %s in maps.json' % prop)
        extra = ('fix the white block behind the cathedral and the statues overhanging the ring platform'
                 if prop == 'holy_mountain' else '')
        std.append(item('review:' + prop, 'standard', 'review', 'Review and fix model %s' % words(prop), targets, 'card',
                        {'res': STD_RES, 'spp': STD_SPP}, hints,
                        ['current: %s (docs/card-buildings.md)' % L.quality(prop), extra], todo=todo))

    # ---- standard 4: card places without a model
    for mid in LM_STANDARD:
        t = L.marker(mid)
        std.append(item('lm:' + mid, 'standard', 'landmark', 'New model: %s' % words(mid), [t] if t else [], 'card',
                        {'res': STD_RES, 'spp': STD_SPP}, {'landmark': mid},
                        ['no model yet (docs/card-buildings.md)'],
                        todo=[] if t else ['marker %s not found in maps.json' % mid]))

    # ---- standard 5-6: scenes
    hl = [L.marker('cliff_edge'), L.marker('trail_down')]
    std.append(item('scene:highland-ext', 'standard', 'scene', 'Extend the highland scene: cliff edge and trail down',
                    [t for t in hl if t], 'inferred', {'res': STD_RES, 'spp': STD_SPP}, {'landmark': 'highland'},
                    ['extends the existing scene map/props/highland (only highland_plateau links to it today); add one hotspot per marker'],
                    todo=[] if all(hl) else ['cliff_edge / trail_down marker not found']))
    for n in range(1, 6):
        ms = ['fief%d_%s' % (n, k) for k in FIEF_MARKERS] + (['fief5_lists'] if n == 5 else [])
        ts = [L.marker(m) for m in ms]
        std.append(item('scene:fief%d' % n, 'standard', 'scene', 'Fief %d scene: castle, fields, order, village%s' % (n, ', lists' if n == 5 else ''),
                        [t for t in ts if t], 'inferred', {'res': STD_RES, 'spp': STD_SPP}, {'landmark': 'fief%d' % n},
                        ['one model covering all markers; one hotspot per marker'],
                        todo=[] if all(ts) else ['some fief%d markers not found in maps.json' % n]))
    cm = ['city_gate', 'dome_quarter', 'pilgrim_plaza', 'spire_quarter']
    ts = [L.marker(m) for m in cm]
    std.append(item('scene:yuanyu-city', 'standard', 'scene', 'Yuanyu city scene: gate, dome, plaza, spire quarters',
                    [t for t in ts if t], 'inferred', {'res': STD_RES, 'spp': STD_SPP}, {'landmark': 'yuanyu_city'},
                    ['one model covering all markers; one hotspot per marker'],
                    todo=[] if all(ts) else ['some yuanyu_city markers not found in maps.json']))

    # ---- standard 7: base maps
    for mp in BASE_STANDARD:
        site = mp.startswith(('site_', 'yuanyu_'))
        res = 4000 if site else 8000
        std.append(base_item(L, mp, 'standard', res, 128))

    # ---- standard 8: period variants
    for mp in ('tc_mid', 'tc_low'):
        for p in (['dawn', 'dusk', 'day', 'night'] if mp == 'tc_mid' else PERIODS):
            std.append(period_item(L, mp, p))

    # ---- hero 1: islands
    isle_ids = []
    for iid in ISLES:
        mk = L.islands.get(iid, {}).get('marker')
        t = L.marker(mk) if mk else None
        row = L.card_row('`%s`' % mk) if mk else ''
        canon = 'inferred' if '通用英式填充' in row else 'card'
        script = 'blender/islands/%s.py' % iid
        hero.append(item('isle:' + iid, 'hero', 'island', 'Rebuild island %s%s' % (iid, ' (%s)' % mk if mk and mk != iid else ''),
                         [t] if t else [], canon, {'res': STD_RES, 'spp': STD_SPP}, {'script': script},
                         ['rebuild on the current main line; archive/upper-v18 is reference only',
                          'spec assumed equal to landmark finals'],
                         todo=([] if L.exists(script) else [script + ' is missing']) + ([] if t else ['island marker not found'])))
        isle_ids.append('isle:' + iid)

    # ---- hero 2-3: upper base map and variants
    hero.append(upper_item(L, 'base:tc_upper', 'basemap', 'Upper base map final', 8000, 128, 'tc_upper', '', isle_ids,
                           ['spp assumed 128 like the other tc_ bases; the spec only says 8000 px']))
    base_dep = ['base:tc_upper']
    hero.append(upper_item(L, 'var:tc_upper:16k', 'variant', 'Upper map 16k final', 16000, 512, 'tc_upper_16k', '', base_dep,
                           [], ['decide how the 16k DZI is registered in maps.json (replace base or alt)']))
    for p in PERIODS:
        hero.append(upper_item(L, 'var:tc_upper:' + p, 'variant', 'Upper map %s period' % p, 8000, 128,
                               'tc_upper_' + p, '--tod ' + p, base_dep,
                               ['spec assumed 8000/128 like the other period variants; register = periods.%s in maps.json' % p]))

    # ---- hero 4: estate basement
    hero.append(item('estate:b1b2', 'hero', 'estate', 'Estate basement B1 / B2 interior refinement', ['eden_estate:*'], 'card',
                     {'res': 2000, 'spp': 32}, {'script': 'blender/eden_manor.py'},
                     ['house model sources: blender/estate2/house_web.py, blender/estate2/medical_b2.py; spec inherited from estate:final'],
                     todo=[] if L.script_has('blender/eden_manor.py', 'B2') else
                     ['eden_manor.py --view lists B1 but not B2; decide the B2 view / script before final']))

    # ---- hero 5: kavalierki landmarks
    for mid in LM_HERO:
        t = L.marker(mid)
        hero.append(item('lm:' + mid, 'hero', 'landmark', 'New model: %s' % words(mid), [t] if t else [], 'card',
                         {'res': STD_RES, 'spp': STD_SPP}, {'landmark': mid}, ['no model yet (docs/card-buildings.md)'],
                         todo=[] if t else ['marker %s not found in maps.json' % mid]))

    # ---- hero 6: world map
    last = L.last_final('world')
    spec = {'res': int(last['res']), 'spp': int(last['spp'])} if last else {'res': 8000, 'spp': 128}
    it = base_item(L, 'world', 'hero', spec['res'], spec['spp'])
    it['notes'] = '; '.join(filter(None, [it['notes'].replace('no final render logged in logs/render_times.csv; ', ''), 'spec from the last world final in logs/render_times.csv' if last else
                                          'no world final in logs/render_times.csv (only world_yuanyu drafts): default 8000/128']))
    hero.append(it)
    return std + hero


def render_args(out, extra=''):
    return ' '.join(x for x in (extra, '--out ' + out) if x)


def base_item(L, mp, lane, res, spp):
    info = L.maps.get(mp, {})
    stem = re.sub(r'\.dzi$', '', os.path.basename(info.get('base') or mp + '.dzi'))
    scripts = {'tc_mid': 'blender/tiancheng_mid.py', 'tc_low': 'blender/tiancheng_low.py', 'world': 'blender/world_render.py'}
    todo, extra = [], ''
    if mp in scripts:
        script = scripts[mp]
    else:
        script, sid = 'blender/opening_sites.py', mp[5:] if mp.startswith('site_') else mp
        extra = '--site ' + sid
        if not L.script_has(script, "'%s':" % sid):
            todo.append('site %s is not in SITES in blender/opening_sites.py' % sid)
    if not info:
        todo.append('map %s not found in maps.json' % mp)
    width, last = L.dzi_width(mp), L.last_final(mp)
    notes = ['audit first: current DZI %s px wide' % (width or 'unknown'),
             'last logged final %sx%s spp (%s)' % (last['res'], last['spp'], last['date']) if last else
             'no final render logged in logs/render_times.csv',
             'render / tiles may be skipped when the audit shows the tiles already meet the spec']
    return item('base:' + mp, lane, 'basemap', 'Final-spec audit / re-render of base map %s' % mp, [mp + ':*'], 'card',
                {'res': res, 'spp': spp}, {'script': script, 'args': render_args(full_out(stem), extra)}, notes, todo=todo)


def period_item(L, mp, p):
    script = 'blender/tiancheng_%s.py' % mp[3:]
    todo, extra = [], ''
    if p == 'day':
        extra = '--day'
        if not L.script_has(script, '--day'):
            todo.append('%s has no --day flag' % script)
    elif p in ('dawn', 'dusk'):
        if not L.script_has(script, p):
            todo.append('%s has no %s lighting (only --day; night is the default); add it before rendering' % (script, p))
    stem = '%s_%s' % (mp, p)
    last = L.last_final(stem)
    notes = []
    if last:
        reg = p in (L.maps.get(mp, {}).get('periods') or {})
        notes.append('exists: %sx%s spp rendered %s, %s in maps.json periods; after the audit the worker may skip render / tiles'
                     % (last['res'], last['spp'], last['date'], 'registered' if reg else 'not registered'))
    notes.append('register = periods.%s in maps.json' % p)
    return item('var:%s:%s' % (mp, p), 'standard', 'variant', 'Period variant %s / %s' % (mp, p), [mp + ':*'], 'card',
                {'res': 8000, 'spp': 128}, {'script': script, 'args': render_args(full_out(stem), extra)}, notes, todo=todo)


def upper_item(L, id, type, title, res, spp, stem, extra, depends, notes, todo=None):
    script = 'blender/tiancheng_upper.py'
    todo = list(todo or [])
    if extra.startswith('--tod') and not L.script_has(script, '--tod'):
        todo.append('%s has no --tod flag' % script)
    return item(id, 'hero', type, title, ['tc_upper:*'], 'card', {'res': res, 'spp': spp},
                {'script': script, 'args': render_args(full_out(stem), ' '.join(x for x in ('--below clouds', extra) if x))},
                notes, depends=depends, todo=todo)
