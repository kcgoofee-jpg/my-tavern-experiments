#!/usr/bin/env python3
"""Render campaign ledger: pick the next piece of work, record progress, resume after a restart.

All state lives in the repo:
  docs/plans/render-campaign.items.json   the item list (written once by `init`, afterwards hand-edited; order = priority)
  docs/plans/render-campaign-events.csv   append-only event log (ts,id,stage,event,agent,gate,note), union-merged by git
  docs/plans/render-campaign.md           generated status view (`status --md`), never edited by hand

Usage (repo root):
  python3 tools/render_campaign.py init [--force]
  python3 tools/render_campaign.py next --lane standard|hero --agent NAME [--peek] [--json]
  python3 tools/render_campaign.py done|fail|wait|skip ID STAGE --agent NAME [--gate pass|fail] [--note TEXT]
  python3 tools/render_campaign.py release ID --agent NAME
  python3 tools/render_campaign.py status [--md] [--json]
  python3 tools/render_campaign.py ship-check

Rules (details in docs/cloud-render.md, "Render campaign ledger"):
  * The tool never renders or submits a job; it only prints command hints.
  * A claim belongs to one agent for 6 h (counted from that agent's latest event on the item) unless released or the
    item finishes. `fail` releases the claim. `next` hands an agent its own live claim back first (resume).
  * Three `fail` events on the same stage make the item "stuck": it is never handed out again until a human records
    `skip` / `done` for that stage or edits the events file.
  * `fix` and `review-r2` are skipped automatically when review-r1 was recorded with --gate pass. review-r2 with
    --gate fail does not block: the item goes on and is flagged "below-gate" for a user spot-check.
  * `wait` on a ship / register stage parks the item until `ship-check` passes (no docs/plans/FREEZE_MAPS on
    origin/preview); `wait` on any other stage only refreshes the claim (a render job is in flight).
Exit codes: 0 ok, 2 usage / validation error, 3 nothing left for the lane (ship-check: FREEZE active), 4 only
blocked / waiting items remain.
Env (tests): RC_ROOT (repo root), RC_NOW (fixed UTC clock, ISO seconds).
"""
import argparse
import csv
import datetime
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.environ.get('RC_ROOT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ITEMS = os.path.join(ROOT, 'docs', 'plans', 'render-campaign.items.json')
EVENTS = os.path.join(ROOT, 'docs', 'plans', 'render-campaign-events.csv')
STATUS_MD = os.path.join(ROOT, 'docs', 'plans', 'render-campaign.md')
FREEZE = 'docs/plans/FREEZE_MAPS'
COLS = ['ts', 'id', 'stage', 'event', 'agent', 'gate', 'note']
HEADER = ','.join(COLS) + '\n'
TTL = datetime.timedelta(hours=6)
MAX_FAILS = 3
LANES = ('standard', 'hero')
EVENT_KINDS = ('claim', 'done', 'fail', 'wait', 'skip', 'release')
REVIEW = ['review-r1', 'fix', 'review-r2']
LANDMARK = ['new', 'setting', 'draft', 'clay', 'board', 'gapcheck'] + REVIEW + ['final', 'ship']
STAGES = {
    'estate': ['final', 'verify', 'ship'],
    'review': REVIEW + ['ship'],
    'landmark': LANDMARK,
    'scene': LANDMARK,
    'basemap': ['audit', 'render', 'tiles', 'verify', 'ship'],
    'variant': ['render', 'tiles', 'register', 'ship'],
    'island': ['setting', 'draft', 'board'] + REVIEW + ['final', 'integrate', 'ship'],
    'layout': ['options', 'final', 'ship'],
}
FREEZE_STAGES = ('ship', 'register')
# N2 (2026-10-01): no user review anywhere in the render line. A legacy "user_gate" flag on an item is ignored, and old
# events that mention the retired `user-review` stage stay in the ledger and are skipped on replay (unknown stage).


def stages_of(item):
    return list(STAGES[item['type']])
STATUS_ORDER = ['done', 'claimed', 'open', 'waiting', 'blocked', 'stuck']
BANNER = '> Generated file: do not edit — run tools/render_campaign.py status --md'


def die(msg, code=2):
    sys.stderr.write('error: %s\n' % msg)
    sys.exit(code)


def fmt(t):
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_ts(s):
    try:
        return datetime.datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return None


def now():
    fixed = os.environ.get('RC_NOW')
    return parse_ts(fixed) if fixed else datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)


# ------------------------------------------------------------------ data files
def load_items():
    if not os.path.exists(ITEMS):
        die('no items file (%s); run `init` first' % os.path.relpath(ITEMS, ROOT))
    try:
        with open(ITEMS, encoding='utf-8') as f:
            items = json.load(f)['items']
    except (ValueError, KeyError) as e:
        die('bad items file: %s' % e)
    seen = set()
    for it in items:
        if it['id'] in seen:
            die('duplicate item id %s' % it['id'])
        seen.add(it['id'])
        if it['lane'] not in LANES:
            die('%s: unknown lane %r' % (it['id'], it['lane']))
        if it['type'] not in STAGES:
            die('%s: unknown type %r' % (it['id'], it['type']))
    for it in items:
        for d in it.get('depends', []):
            if d not in seen:
                die('%s depends on unknown item %s' % (it['id'], d))
    return items


def read_events():
    """Events sorted by (ts, file order): stable, and independent of how git interleaved two appended blocks."""
    rows = []
    if os.path.exists(EVENTS):
        with open(EVENTS, newline='', encoding='utf-8') as f:
            for n, r in enumerate(csv.reader(f)):
                if len(r) < 4 or r[0] == 'ts':
                    continue
                r = (r + [''] * len(COLS))[:len(COLS)]
                ev = dict(zip(COLS, r))
                ev['_t'] = parse_ts(ev['ts'])
                if ev['_t'] is None or ev['event'] not in EVENT_KINDS:
                    continue
                rows.append((ev['_t'], n, ev))
    rows.sort(key=lambda x: (x[0], x[1]))
    return [r[2] for r in rows]


def append_event(item_id, stage, event, agent, gate='', note=''):
    """One O_APPEND write per event, so concurrent agents and union merges only ever add whole lines."""
    buf = io.StringIO()
    csv.writer(buf, lineterminator='\n').writerow(
        [fmt(now()), item_id, stage, event, agent, gate, ' '.join(str(note).split())])
    data = buf.getvalue().encode('utf-8')
    os.makedirs(os.path.dirname(EVENTS), exist_ok=True)
    fd = os.open(EVENTS, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        if os.fstat(fd).st_size == 0:
            data = HEADER.encode() + data
        os.write(fd, data)
    finally:
        os.close(fd)


# ------------------------------------------------------------------ replay
class State:
    def __init__(self, item):
        self.item = item
        self.stages = stages_of(item)
        self.done, self.skipped, self.gates, self.fails = set(), set(), {}, {}
        self.claim = None          # (agent, datetime of the owner's latest event)
        self.parked = None         # ship / register stage waiting for the FREEZE to lift
        self.last = None

    def auto_skipped(self):
        if 'clay' in self.stages:      # added after draft (R2): items already past it are not sent back
            i = self.stages.index('clay')
            if any(s in self.done or s in self.skipped for s in self.stages[i + 1:]):
                return {'clay'} | self._review_skips()
        return self._review_skips()

    def _review_skips(self):
        if 'review-r1' in self.done and self.gates.get('review-r1') == 'pass':
            return {'fix', 'review-r2'} & set(self.stages)
        return set()

    def current(self):
        gone = self.done | self.skipped | self.auto_skipped()
        return next((s for s in self.stages if s not in gone), None)

    def finished(self):
        return self.current() is None

    def below_gate(self):
        return 'review-r2' in self.done and self.gates.get('review-r2') == 'fail'

    def live_claim(self, at):
        return self.claim if self.claim and at - self.claim[1] < TTL else None

    def apply(self, ev):
        if self.finished():
            return
        stage, kind, agent, t = ev['stage'], ev['event'], ev['agent'], ev['_t']
        self.last = ev['ts']
        owner = self.claim and self.claim[0] == agent
        if kind == 'claim':
            live = self.live_claim(t)
            if live and live[0] != agent:
                return             # first claim wins; a later overlapping claim is void
            self.claim, self.parked = (agent, t), None
        elif kind in ('done', 'skip'):
            if stage not in self.stages:
                return
            (self.done if kind == 'done' else self.skipped).add(stage)
            if ev['gate']:
                self.gates[stage] = ev['gate']
            if owner:
                self.claim = (agent, t)
            if self.parked == stage:
                self.parked = None
        elif kind == 'fail' and stage not in self.stages:
            return                 # a retired stage (user-review): nothing to replay
        elif kind == 'fail':
            self.fails[stage] = self.fails.get(stage, 0) + 1
            self.claim = None
        elif kind == 'wait':
            if stage in FREEZE_STAGES:
                self.claim, self.parked = None, stage
            elif owner:
                self.claim = (agent, t)
        elif kind == 'release':
            self.claim = None
        if self.finished():
            self.claim = self.parked = None


def replay(items, events):
    states = {it['id']: State(it) for it in items}
    for ev in events:
        if ev['id'] in states:
            states[ev['id']].apply(ev)
    return states


def classify(st, states, at):
    if st.finished():
        return 'done'
    if st.fails.get(st.current(), 0) >= MAX_FAILS:
        return 'stuck'
    if st.live_claim(at):
        return 'claimed'
    if st.parked and st.parked == st.current():
        return 'waiting'
    if any(not states[d].finished() for d in st.item.get('depends', [])):
        return 'blocked'
    return 'open'


# ------------------------------------------------------------------ freeze
def ship_frozen():
    """True when origin/preview carries docs/plans/FREEZE_MAPS (after a quiet fetch; an offline fetch uses the local ref)."""
    def git(*a):
        return subprocess.run(['git', '-C', ROOT] + list(a), capture_output=True, text=True)
    if git('fetch', '-q', 'origin').returncode != 0:
        sys.stderr.write('warning: git fetch failed; using the local origin/preview ref\n')
    r = git('ls-tree', '--name-only', 'origin/preview', '--', FREEZE)
    return r.returncode == 0 and bool(r.stdout.strip())


# ------------------------------------------------------------------ command hints
def arg_value(args, flag):
    m = re.search(re.escape(flag) + r'\s+(\S+)', args or '')
    return m.group(1) if m else None


def render_hint(item):
    h, sp = item.get('hints', {}), item.get('spec', {})
    if not h.get('script'):
        return None
    tag = re.sub(r'[^A-Za-z0-9]+', '_', item['id']).strip('_')
    res, spp = sp.get('res', 0), sp.get('spp', 0)
    run = 'import runpy; runpy.run_path(\'%s\', run_name=\'__main__\')' % h['script']
    return ('tools/render_queue.sh submit final -- --log logs/campaign/%s.log --asset %s --kind final --res %d --spp %d -- '
            '-b --factory-startup --python-expr "%s" -- --res %d --samples %d %s'
            % (tag, tag, res, spp, run, res, spp, h.get('args', ''))).rstrip()


def landmark_id(item):
    h = item.get('hints', {})
    if h.get('landmark'):
        return h['landmark']
    return (item['targets'][0].split(':')[-1] if item.get('targets') else item['id'].split(':')[-1])


def hint(item, stage):
    """(command or None, instruction) for the item's stage."""
    t, lid, sp, h = item['type'], landmark_id(item), item.get('spec', {}), item.get('hints', {})
    if t in ('landmark', 'scene'):
        tmap = item['targets'][0].split(':')[0] if item.get('targets') else '<map>'
        cmd = {'new': 'python3 tools/landmark.py new %s --layer %s --name <card name> --marker %s' % (lid, tmap, lid),
               'draft': 'python3 tools/landmark.py draft %s' % lid,
               'clay': 'python3 tools/landmark.py clay %s' % lid,
               'board': 'python3 tools/landmark.py board %s' % lid,
               'gapcheck': 'python3 tools/landmark.py gapcheck %s' % lid,
               'final': 'python3 tools/landmark.py final %s --res %s --spp %s' % (lid, sp.get('res', 2400), sp.get('spp', 64)),
               'ship': 'python3 tools/landmark.py ship %s --score "<r1 / r2>"' % lid}.get(stage)
        if t == 'scene' and stage == 'ship':
            cmd += '   # one hotspot per target marker'
        return cmd, STAGE_TEXT.get(stage, '').replace('<id>', lid)
    if t == 'review' and stage == 'ship':
        return 'python3 tools/landmark.py ship %s --score "<r1 / r2>"' % lid, STAGE_TEXT['ship']
    if stage in ('render', 'final') and t in ('basemap', 'variant', 'estate'):
        return render_hint(item), STAGE_TEXT.get(stage, '')
    if stage == 'tiles':
        out = arg_value(h.get('args', ''), '--out') or '<full png>'
        prefix = 'map/art/' + os.path.basename(out).replace('_full.png', '')
        return 'python3 tools/make_dzi.py %s %s' % (out, prefix), STAGE_TEXT['tiles']
    if stage == 'verify' and t == 'basemap':
        return 'python3 tools/check_maps.py', STAGE_TEXT['verify']
    if stage == 'register':
        return 'python3 tools/check_maps.py', STAGE_TEXT['register']
    if t == 'layout':
        return ('python3 tools/render_campaign.py ship-check' if stage in ('final', 'ship') else None), LAYOUT_TEXT[stage]
    text = STAGE_TEXT.get(stage, '').replace('<id>', lid)
    if t == 'island' and stage in ('draft', 'board', 'final') and h.get('script'):
        text += ' Island script: %s (silhouette strip: blender/islands/strip.py).' % h['script']
    return None, text


STAGE_TEXT = {
    'new': 'Scaffold build.py / setting doc / checklist / manifest.',
    'setting': 'Write or refresh the setting doc: card quotes (C*) kept apart from repo inference (R*).',
    'draft': 'Draft render (16 spp).',
    'clay': 'Clay render (geometry only, neutral light, 16 spp): check proportions and silhouette before look-dev; fix geometry first. Submitted through the queue, re-run the command once it finishes to collect docs/landmarks/<id>/clay.jpg.',
    'board': 'Review board (main view plus side / under views with numbered anchors).',
    'gapcheck': 'Setting vs board gap check; the reviewer writes docs/reviews/landmark_<id>/r<N>.md.',
    'review-r1': 'Two-persona review (architecture realism >= 7, card fidelity >= 7). Record: done ... --gate pass|fail.',
    'fix': 'Fix the review gaps, then redo draft / board as needed.',
    'review-r2': 'Second review. Record: done ... --gate pass|fail (fail does not block; the item is flagged below-gate).',
    'final': 'Final render through the render queue (Mac only; never call blender_run.sh directly).',
    'audit': 'Check current tiles against the spec (DZI width, logs/render_times.csv); skip render / tiles when they already meet it.',
    'render': 'Render through the render queue (Mac only).',
    'tiles': 'Cut the PNG into DZI tiles.',
    'verify': 'Verify outputs exist, are the right size and look right; check_maps stays green.',
    'register': 'Register the DZI in maps.json `periods` (run ship-check first; on FREEZE: wait).',
    'integrate': 'Integrate the island into the upper base map (tools/isles_into_upper.py).',
    'ship': 'Ship (run ship-check first; exit 3 means FREEZE: record wait). Update worldbook / card-buildings where the stage tool asks.',
}

LAYOUT_TEXT = {
    'options': 'Write the layout options (blender/data/layouts/) and preview them without Blender; previews + options.zh.txt '
               'go to ~/eden-map-review/render/<id>/ (archive only).',
    'final': 'Apply the recommended option (the one options.zh.txt recommends): run ship-check first, write it into the islands '
             'file, move markers / anchors / routes by script, rebuild the worldbook add-on, re-paste cutouts; check_maps.',
    'ship': 'Ship (run ship-check first; exit 3 means FREEZE: record wait): commit + push; dependent base renders use the new layout.',
}


def show(item, st, at, stage):
    cmd, text = hint(item, stage)
    cur = st.stages.index(stage) + 1
    lines = [('id', item['id']), ('lane', '%s   type: %s   fill: %s' % (item['lane'], item['type'], item.get('fill', ''))),
             ('title', item['title']), ('stage', '%s (%d/%d)' % (stage, cur, len(st.stages))),
             ('targets', ', '.join(item.get('targets', []))), ('spec', 'res=%s spp=%s' % (item['spec'].get('res'), item['spec'].get('spp'))),
             ('hints', json.dumps(item.get('hints', {}), ensure_ascii=False)), ('notes', item.get('notes', '')),
             ('do', text), ('command', cmd or '(none)')]
    return '\n'.join('%-8s %s' % (k + ':', v) for k, v in lines if v != '')


# ------------------------------------------------------------------ commands
def cmd_init(a):
    if os.path.exists(ITEMS) and not a.force:
        die('%s exists; pass --force to overwrite' % os.path.relpath(ITEMS, ROOT))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import render_campaign_items
    items = render_campaign_items.build(ROOT)
    os.makedirs(os.path.dirname(ITEMS), exist_ok=True)
    with open(ITEMS, 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'items': items}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    if not os.path.exists(EVENTS):
        with open(EVENTS, 'w', encoding='utf-8') as f:
            f.write(HEADER)
    print('wrote %d items to %s' % (len(items), os.path.relpath(ITEMS, ROOT)))
    return 0


def cmd_next(a):
    items, at = load_items(), now()
    lane_items = [i for i in items if i['lane'] == a.lane]
    states = replay(items, read_events())
    frozen = None
    tried = set()
    while True:
        remaining, pick = 0, None
        own = [i for i in lane_items if states[i['id']].live_claim(at) and states[i['id']].claim[0] == a.agent
               and not states[i['id']].finished()]
        for it in own + lane_items:
            st = states[it['id']]
            if st.finished():
                continue
            if it['id'] in tried:
                remaining += 1
                continue
            status = classify(st, states, at)
            if status == 'waiting':
                frozen = ship_frozen() if frozen is None else frozen
                status = 'open' if not frozen else 'waiting'
            if status == 'claimed' and st.claim[0] == a.agent:
                status = 'open'
            if status == 'open' and pick is None:
                pick = it
            elif status != 'open':
                remaining += 1
        if pick is None:
            print('nothing left for lane %s' % a.lane if not remaining else
                  'only blocked / waiting items remain for lane %s (see `status`)' % a.lane)
            return 4 if remaining else 3
        st = states[pick['id']]
        stage = st.current()
        if a.peek:
            return emit(pick, st, at, stage, a)
        append_event(pick['id'], stage, 'claim', a.agent)
        states = replay(items, read_events())
        mine = states[pick['id']].live_claim(at)
        if mine and mine[0] == a.agent:
            return emit(pick, states[pick['id']], at, stage, a)
        tried.add(pick['id'])       # lost a same-second race: take the next candidate


def emit(item, st, at, stage, a):
    if a.json:
        cmd, text = hint(item, stage)
        print(json.dumps({'item': item, 'stage': stage, 'do': text, 'command': cmd}, indent=1, ensure_ascii=False))
    else:
        print(show(item, st, at, stage))
    return 0


def cmd_record(a):
    items, at = load_items(), now()
    item = next((i for i in items if i['id'] == a.id), None)
    if not item:
        die('unknown item %s' % a.id)
    if a.stage not in stages_of(item):
        die('%s is a %s item; stage %r is not one of: %s' % (a.id, item['type'], a.stage, ', '.join(stages_of(item))))
    st = replay(items, read_events())[a.id]
    if st.finished():
        die('%s is already finished' % a.id)
    if a.stage != st.current():
        die('%s is at stage %r, not %r' % (a.id, st.current(), a.stage))
    live = st.live_claim(at)
    if live and live[0] != a.agent:
        die('%s is claimed by %s until %s' % (a.id, live[0], fmt(live[1] + TTL)))
    if a.gate and a.cmd != 'done':
        die('--gate only applies to `done`')
    if a.cmd == 'done' and a.stage in ('review-r1', 'review-r2') and not a.gate:
        die('%s needs --gate pass|fail' % a.stage)
    append_event(a.id, a.stage, a.cmd, a.agent, a.gate or '', a.note or '')
    after = replay(items, read_events())[a.id]
    print('%s %s %s -> %s' % (a.cmd, a.id, a.stage, 'item complete' if after.finished() else 'now at ' + after.current()))
    if a.cmd == 'done' and a.stage == 'review-r1' and a.gate == 'pass':
        print('fix and review-r2 skipped automatically')
    if after.below_gate():
        print('flagged below-gate (user spot-check)')
    return 0


def cmd_release(a):
    items, at = load_items(), now()
    if a.id not in {i['id'] for i in items}:
        die('unknown item %s' % a.id)
    st = replay(items, read_events())[a.id]
    live = st.live_claim(at)
    if not live:
        print('%s has no live claim' % a.id)
        return 0
    if live[0] != a.agent:
        die('%s is claimed by %s, not %s' % (a.id, live[0], a.agent))
    append_event(a.id, st.current() or '', 'release', a.agent, '', a.note or '')
    print('released %s' % a.id)
    return 0


def rows(items, states, at):
    out = []
    for it in items:
        st = states[it['id']]
        s = classify(st, states, at)
        flags = []
        if st.below_gate():
            flags.append('below-gate')
        if s == 'waiting':
            flags.append('waiting-on-freeze')
        cl = st.live_claim(at)
        gone = st.done | st.skipped | st.auto_skipped()
        out.append({'id': it['id'], 'lane': it['lane'], 'type': it['type'], 'status': s, 'title': it['title'],
                    'stage': st.current() or '-', 'progress': '%d/%d' % (len(gone), len(st.stages)),
                    'agent': cl[0] if cl else '', 'flags': flags, 'last': st.last or ''})
    return out


def cmd_status(a):
    items, at = load_items(), now()
    events = read_events()
    rs = rows(items, replay(items, events), at)
    counts = {l: {s: 0 for s in STATUS_ORDER} for l in LANES}
    for r in rs:
        counts[r['lane']][r['status']] += 1
    flagged = [r['id'] for r in rs if 'below-gate' in r['flags']]
    if a.json:
        print(json.dumps({'counts': counts, 'below_gate': flagged, 'items': rs}, indent=1))
        return 0
    text = render_status(rs, counts, flagged, events[-1]['ts'] if events else '-')
    if a.md:
        with open(STATUS_MD, 'w', encoding='utf-8') as f:
            f.write(BANNER + '\n\n' + text + '\n')
        print('wrote %s' % os.path.relpath(STATUS_MD, ROOT))
    else:
        print(text)
    return 0


def render_status(rs, counts, flagged, last):
    L = ['# Render campaign status', '',
         'Items: `render-campaign.items.json`, events: `render-campaign-events.csv`. Last event: %s.' % last, '',
         '| lane | ' + ' | '.join(STATUS_ORDER) + ' | total |', '|---|' + '---|' * (len(STATUS_ORDER) + 1)]
    for l in LANES:
        L.append('| %s | %s | %d |' % (l, ' | '.join(str(counts[l][s]) for s in STATUS_ORDER), sum(counts[l].values())))
    L += ['', 'Below-gate (user spot-check): %s' % (', '.join(flagged) if flagged else 'none'), '']
    for l in LANES:
        L += ['## %s lane' % l.capitalize(), '', '| # | id | type | status | stage | claim | flags | title |', '|---|---|---|---|---|---|---|---|']
        for n, r in enumerate([x for x in rs if x['lane'] == l], 1):
            L.append('| %d | `%s` | %s | %s | %s | %s | %s | %s |' % (n, r['id'], r['type'], r['status'], r['stage'],
                                                                  r['agent'], ', '.join(r['flags']), r['title'].replace('|', '/')))
        L.append('')
    return '\n'.join(L)


def cmd_ship_check(a):
    if ship_frozen():
        print('FREEZE: %s is present on origin/preview; do not ship maps.json edits (record `wait`)' % FREEZE)
        return 3
    print('ship OK: no %s on origin/preview' % FREEZE)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description='Render campaign ledger (see the module docstring).')
    sp = ap.add_subparsers(dest='cmd', required=True)
    s = sp.add_parser('init'); s.add_argument('--force', action='store_true'); s.set_defaults(fn=cmd_init)
    s = sp.add_parser('next'); s.add_argument('--lane', required=True, choices=LANES); s.add_argument('--agent', required=True)
    s.add_argument('--peek', action='store_true'); s.add_argument('--json', action='store_true'); s.set_defaults(fn=cmd_next)
    for k in ('done', 'fail', 'wait', 'skip'):
        s = sp.add_parser(k); s.add_argument('id'); s.add_argument('stage'); s.add_argument('--agent', required=True)
        s.add_argument('--gate', choices=('pass', 'fail')); s.add_argument('--note'); s.set_defaults(fn=cmd_record)
    s = sp.add_parser('release'); s.add_argument('id'); s.add_argument('--agent', required=True); s.add_argument('--note')
    s.set_defaults(fn=cmd_release)
    s = sp.add_parser('status'); s.add_argument('--md', action='store_true'); s.add_argument('--json', action='store_true')
    s.set_defaults(fn=cmd_status)
    s = sp.add_parser('ship-check'); s.set_defaults(fn=cmd_ship_check)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == '__main__':
    sys.exit(main())
