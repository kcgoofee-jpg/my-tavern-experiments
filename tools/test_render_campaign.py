#!/usr/bin/env python3
"""Tests for tools/render_campaign.py (temp dirs only; the real items / events files are never touched)."""
import csv
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, 'render_campaign.py')
REAL_ITEMS = os.path.join(HERE, '..', 'docs', 'plans', 'render-campaign.items.json')
T0 = '2026-10-01T00:00:00Z'
T0_PLUS_7H = '2026-10-01T07:00:00Z'


def read(path, mode='r'):
    with open(path, mode) as f:
        return f.read()


def write(path, text):
    with open(path, 'w') as f:
        f.write(text)


def item(id, lane, type, depends=None):
    return {'id': id, 'lane': lane, 'type': type, 'title': id, 'targets': ['m:' + id], 'canon': 'card',
            'depends': depends or [], 'spec': {'res': 100, 'spp': 8}, 'hints': {'script': 'blender/x.py', 'args': '--out o_full.png'},
            'notes': ''}


class Base(unittest.TestCase):
    ITEMS = [item('L1', 'standard', 'landmark'), item('R1', 'standard', 'review'), item('B1', 'standard', 'basemap', ['L1']),
             item('H1', 'hero', 'island'), item('H2', 'hero', 'variant', ['H1'])]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, 'docs', 'plans'))
        self.items_path = os.path.join(self.root, 'docs', 'plans', 'render-campaign.items.json')
        self.events = os.path.join(self.root, 'docs', 'plans', 'render-campaign-events.csv')
        self.set_items(self.ITEMS)

    def tearDown(self):
        self.tmp.cleanup()

    def set_items(self, items):
        write(self.items_path, json.dumps({'version': 1, 'items': items}))

    def rc(self, *args, now=T0, root=None):
        env = dict(os.environ, RC_ROOT=root or self.root, RC_NOW=now)
        return subprocess.run([sys.executable, TOOL] + list(args), capture_output=True, text=True, env=env)

    def next(self, lane, agent, *extra, now=T0):
        return self.rc('next', '--lane', lane, '--agent', agent, *extra, now=now)

    def picked(self, r):
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r.stdout.split('\n')[0].split()[1], next(l for l in r.stdout.split('\n') if l.startswith('stage:')).split()[1]

    def rec(self, cmd, id, stage, agent='a', *extra, now=T0):
        return self.rc(cmd, id, stage, '--agent', agent, *extra, now=now)

    def status(self):
        return {r['id']: r for r in json.loads(self.rc('status', '--json').stdout)['items']}

    def event_lines(self):
        return read(self.events).splitlines()

    def walk(self, id, stages, agent='a', gates=None):
        for s in stages:
            r = self.rec('done', id, s, agent, *(['--gate', gates[s]] if gates and s in gates else []))
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class Replay(Base):
    def test_stage_replay_walks_the_landmark_stages_in_order(self):
        seen = []
        for _ in range(10):
            id, stage = self.picked(self.next('standard', 'a'))
            self.assertEqual(id, 'L1')
            seen.append(stage)
            self.walk('L1', [stage], gates={'review-r1': 'fail', 'review-r2': 'pass'})
        self.assertEqual(seen, ['new', 'setting', 'draft', 'board', 'gapcheck', 'review-r1', 'fix', 'review-r2', 'final', 'ship'])
        self.assertEqual(self.status()['L1']['status'], 'done')
        self.assertEqual(self.picked(self.next('standard', 'a'))[0], 'R1', 'the next item is offered once L1 is done')

    def test_done_must_name_the_current_stage_and_a_valid_stage(self):
        self.next('standard', 'a')
        self.assertEqual(self.rec('done', 'L1', 'final').returncode, 2)       # not current
        self.assertEqual(self.rec('done', 'L1', 'nonsense').returncode, 2)    # not a landmark stage
        self.assertEqual(self.rec('done', 'NOPE', 'new').returncode, 2)

    def test_review_stages_need_a_gate(self):
        self.walk('R1', [])
        self.assertEqual(self.rec('done', 'R1', 'review-r1').returncode, 2)

    def test_review_r1_pass_skips_fix_and_review_r2_without_events(self):
        self.assertEqual(self.rec('done', 'R1', 'review-r1', 'a', '--gate', 'pass').returncode, 0)
        self.assertEqual(self.status()['R1']['stage'], 'ship')
        self.assertEqual(len(self.event_lines()), 2, 'header + one event: the skips are computed, not written')

    def test_review_r1_fail_goes_through_fix_and_review_r2(self):
        self.walk('R1', ['review-r1'], gates={'review-r1': 'fail'})
        self.assertEqual(self.status()['R1']['stage'], 'fix')
        self.walk('R1', ['fix'])
        self.assertEqual(self.status()['R1']['stage'], 'review-r2')

    def test_review_r2_fail_does_not_block_and_flags_below_gate(self):
        self.walk('R1', ['review-r1', 'fix', 'review-r2'], gates={'review-r1': 'fail', 'review-r2': 'fail'})
        s = self.status()['R1']
        self.assertEqual((s['stage'], s['status']), ('ship', 'open'))
        self.assertIn('below-gate', s['flags'])
        self.walk('R1', ['ship'])
        s = self.status()['R1']
        self.assertEqual(s['status'], 'done')
        self.assertIn('below-gate', s['flags'])
        self.assertIn('R1', json.loads(self.rc('status', '--json').stdout)['below_gate'])
        self.assertIn('R1', self.rc('status').stdout.split('Below-gate')[1])

    def test_skip_counts_as_done(self):
        self.walk('B1', [])
        self.next('standard', 'a')       # claims L1, irrelevant; B1 has no claim
        self.assertEqual(self.rec('skip', 'B1', 'audit').returncode, 0)
        self.assertEqual(self.status()['B1']['stage'], 'render')

    def test_status_md_has_banner_and_counts(self):
        r = self.rc('status', '--md')
        self.assertEqual(r.returncode, 0)
        md = read(os.path.join(self.root, 'docs', 'plans', 'render-campaign.md'))
        self.assertTrue(md.startswith('> Generated file: do not edit'))
        self.assertIn('tools/render_campaign.py status --md', md.split('\n')[0])
        self.assertIn('| standard | 0 | 0 | 2 | 0 | 1 | 0 | 3 |', md)


class Claims(Base):
    def test_foreign_live_claim_is_never_handed_out_and_ttl_expires_it(self):
        self.assertEqual(self.picked(self.next('hero', 'a'))[0], 'H1')
        r = self.next('hero', 'b')                         # H1 is claimed, H2 depends on it
        self.assertEqual(r.returncode, 4, r.stdout)
        self.assertEqual(self.picked(self.next('hero', 'b', now=T0_PLUS_7H))[0], 'H1', 'claim older than 6 h is free')
        self.assertEqual(self.status()['H1']['agent'], 'b')

    def test_other_agent_cannot_record_on_a_live_claim(self):
        self.next('standard', 'a')
        r = self.rec('done', 'L1', 'new', 'b')
        self.assertEqual(r.returncode, 2)
        self.assertIn('claimed by a', r.stderr)
        r = self.rc('release', 'L1', '--agent', 'b')
        self.assertEqual(r.returncode, 2)

    def test_owner_activity_extends_the_claim(self):
        self.next('hero', 'a')
        self.rec('done', 'H1', 'setting', 'a', now='2026-10-01T05:00:00Z')
        self.assertEqual(self.next('hero', 'b', now=T0_PLUS_7H).returncode, 4, 'claim renewed at 05:00 still live at 07:00')

    def test_same_agent_gets_its_own_claim_back_after_a_restart(self):
        self.assertEqual(self.picked(self.next('standard', 'a'))[0], 'L1')
        self.assertEqual(self.picked(self.next('standard', 'b'))[0], 'R1')
        self.assertEqual(self.picked(self.next('standard', 'a'))[0], 'L1', 'a resumes L1, not a new item')

    def test_release_frees_the_item(self):
        self.next('hero', 'a')
        self.assertEqual(self.rc('release', 'H1', '--agent', 'a').returncode, 0)
        self.assertEqual(self.picked(self.next('hero', 'b'))[0], 'H1')

    def test_peek_records_nothing(self):
        self.next('hero', 'a', '--peek')
        self.assertFalse(os.path.exists(self.events))

    def test_overlapping_claims_first_wins(self):
        write(self.events, 'ts,id,stage,event,agent,gate,note\n%s,H1,setting,claim,a,,\n%s,H1,setting,claim,b,,\n' % (T0, T0))
        s = self.status()['H1']
        self.assertEqual((s['status'], s['agent']), ('claimed', 'a'))

    def test_finishing_an_item_clears_its_claim(self):
        self.next('hero', 'a')
        self.walk('H1', ['setting', 'draft', 'board', 'review-r1'], gates={'review-r1': 'pass'})
        self.walk('H1', ['final', 'integrate', 'ship'])
        self.assertEqual(self.status()['H1']['agent'], '')


class Stuck(Base):
    def test_three_fails_on_one_stage_make_the_item_stuck(self):
        for n in range(3):
            self.assertEqual(self.next('hero', 'a').returncode, 0)
            self.assertEqual(self.rec('fail', 'H1', 'setting', 'a', '--note', 'boom %d' % n).returncode, 0)
            self.assertEqual(self.status()['H1']['status'], 'stuck' if n == 2 else 'open')
        r = self.next('hero', 'b')
        self.assertEqual(r.returncode, 4, r.stdout)
        self.assertIn('H1', self.rc('status').stdout)

    def test_fail_releases_the_claim_so_another_agent_can_retry(self):
        self.next('hero', 'a')
        self.rec('fail', 'H1', 'setting', 'a')
        self.assertEqual(self.picked(self.next('hero', 'b'))[0], 'H1')

    def test_fails_on_different_stages_do_not_add_up(self):
        self.rec('fail', 'H1', 'setting', 'a')
        self.rec('fail', 'H1', 'setting', 'a')
        self.walk('H1', ['setting'])
        self.rec('fail', 'H1', 'draft', 'a')
        self.assertEqual(self.status()['H1']['status'], 'open')

    def test_a_human_can_skip_a_stuck_stage(self):
        for _ in range(3):
            self.rec('fail', 'H1', 'setting', 'a')
        self.assertEqual(self.rec('skip', 'H1', 'setting', 'human').returncode, 0)
        self.assertEqual(self.status()['H1']['status'], 'open')


class Selection(Base):
    def test_dependencies_are_respected(self):
        self.assertEqual(self.picked(self.next('standard', 'a', '--peek'))[0], 'L1')
        self.assertEqual(self.status()['B1']['status'], 'blocked')
        self.next('standard', 'a')
        self.walk('L1', ['new', 'setting', 'draft', 'board', 'gapcheck', 'review-r1'], gates={'review-r1': 'pass'})
        self.assertEqual(self.status()['B1']['status'], 'blocked')
        self.walk('L1', ['final', 'ship'])
        self.assertEqual(self.status()['B1']['status'], 'open')

    def test_lane_filtering(self):
        self.assertEqual(self.picked(self.next('hero', 'a', '--peek'))[0], 'H1')
        self.assertEqual(self.picked(self.next('standard', 'a', '--peek'))[0], 'L1')

    def test_exit_3_when_the_lane_is_finished_and_4_when_only_blocked_remain(self):
        self.set_items([item('H1', 'hero', 'variant')])
        self.assertEqual(self.next('standard', 'a').returncode, 3, 'lane with no items')
        self.walk('H1', ['render', 'tiles', 'register', 'ship'])
        self.assertEqual(self.next('hero', 'a').returncode, 3, 'lane with every item done')
        self.set_items([item('H1', 'hero', 'variant'), item('H2', 'hero', 'variant', ['H1'])])
        self.next('hero', 'a')
        self.assertEqual(self.next('hero', 'b').returncode, 4)

    def test_unknown_dependency_is_rejected(self):
        self.set_items([item('H1', 'hero', 'variant', ['GHOST'])])
        self.assertEqual(self.next('hero', 'a').returncode, 2)

    def test_next_prints_a_ready_to_run_command_hint(self):
        self.next('standard', 'a')
        self.walk('L1', ['new', 'setting'])
        r = self.next('standard', 'a')
        self.assertIn('python3 tools/landmark.py draft L1', r.stdout)
        self.set_items([item('B1', 'standard', 'basemap')])
        self.walk('B1', ['audit'])
        r = self.next('standard', 'a')
        self.assertIn('tools/render_queue.sh submit final -- --log logs/campaign/B1.log', r.stdout)
        self.assertIn('--res 100 --samples 8 --out o_full.png', r.stdout)
        self.walk('B1', ['render'])
        self.assertIn('python3 tools/make_dzi.py o_full.png map/art/o', self.next('standard', 'a').stdout)


class Freeze(Base):
    def git(self, cwd, *args):
        r = subprocess.run(['git', '-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'init.defaultBranch=preview']
                           + list(args), cwd=cwd, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def setUp(self):
        super().setUp()
        self.origin = os.path.join(self.root, 'origin.git')
        self.work = os.path.join(self.root, 'work')
        self.git(self.root, 'init', '-q', '--bare', self.origin)
        self.git(self.root, 'clone', '-q', self.origin, self.work)
        self.git(self.work, 'checkout', '-q', '-B', 'preview')
        write(os.path.join(self.work, 'README'), 'x')
        self.git(self.work, 'add', 'README')
        self.git(self.work, 'commit', '-q', '-m', 'init')
        self.git(self.work, 'push', '-q', 'origin', 'preview')
        os.makedirs(os.path.join(self.work, 'docs', 'plans'))
        write(os.path.join(self.work, 'docs', 'plans', 'render-campaign.items.json'), json.dumps({'version': 1, 'items': [item('V1', 'hero', 'variant')]}))
        self.events = os.path.join(self.work, 'docs', 'plans', 'render-campaign-events.csv')

    def freeze(self, on):
        f = os.path.join(self.work, 'docs', 'plans', 'FREEZE_MAPS')
        if on:
            write(f, 'freeze')
            self.git(self.work, 'add', f)
            self.git(self.work, 'commit', '-q', '-m', 'freeze')
        else:
            self.git(self.work, 'rm', '-q', f)
            self.git(self.work, 'commit', '-q', '-m', 'thaw')
        self.git(self.work, 'push', '-q', 'origin', 'preview')

    def rcw(self, *args):
        return self.rc(*args, root=self.work)

    def test_ship_check_follows_origin_preview(self):
        self.assertEqual(self.rcw('ship-check').returncode, 0)
        self.freeze(True)
        r = self.rcw('ship-check')
        self.assertEqual(r.returncode, 3)
        self.assertIn('FREEZE', r.stdout)
        self.freeze(False)
        self.assertEqual(self.rcw('ship-check').returncode, 0)

    def test_ship_check_sees_a_freeze_pushed_by_someone_else(self):
        other = os.path.join(self.root, 'other')
        self.git(self.root, 'clone', '-q', '-b', 'preview', self.origin, other)
        os.makedirs(os.path.join(other, 'docs', 'plans'), exist_ok=True)
        write(os.path.join(other, 'docs', 'plans', 'FREEZE_MAPS'), 'x')
        self.git(other, 'add', '-A')
        self.git(other, 'commit', '-q', '-m', 'freeze')
        self.git(other, 'push', '-q', 'origin', 'preview')
        self.assertEqual(self.rcw('ship-check').returncode, 3, 'ship-check fetches first')

    def test_wait_on_register_is_reoffered_only_when_ship_check_passes(self):
        self.assertEqual(self.rcw('next', '--lane', 'hero', '--agent', 'a').returncode, 0)
        for s in ('render', 'tiles'):
            self.assertEqual(self.rcw('done', 'V1', s, '--agent', 'a').returncode, 0)
        self.freeze(True)
        self.assertEqual(self.rcw('wait', 'V1', 'register', '--agent', 'a', '--note', 'freeze').returncode, 0)
        st = json.loads(self.rcw('status', '--json').stdout)['items'][0]
        self.assertEqual((st['status'], st['flags']), ('waiting', ['waiting-on-freeze']))
        self.assertEqual(self.rcw('next', '--lane', 'hero', '--agent', 'b').returncode, 4, 'parked while FREEZE is on')
        self.freeze(False)
        r = self.rcw('next', '--lane', 'hero', '--agent', 'b')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('stage:   register', r.stdout)

    def test_wait_on_a_render_stage_only_refreshes_the_claim(self):
        self.rcw('next', '--lane', 'hero', '--agent', 'a')
        self.assertEqual(self.rcw('wait', 'V1', 'render', '--agent', 'a').returncode, 0)
        st = json.loads(self.rcw('status', '--json').stdout)['items'][0]
        self.assertEqual((st['status'], st['agent']), ('claimed', 'a'))


class AppendOnly(Base):
    def test_commands_only_append_to_the_events_file(self):
        self.next('standard', 'a')
        before = read(self.events, 'rb')
        self.rc('status'); self.rc('status', '--md'); self.next('standard', 'a', '--peek'); self.rc('status', '--json')
        self.assertEqual(read(self.events, 'rb'), before, 'read-only commands leave the file byte-identical')
        self.rec('done', 'L1', 'new')
        self.rec('fail', 'L1', 'setting')
        self.rc('release', 'L1', '--agent', 'a')
        after = read(self.events, 'rb')
        self.assertTrue(after.startswith(before) and len(after) > len(before))
        self.assertEqual(after.count(b'ts,id,stage,event,agent,gate,note'), 1)

    def test_header_and_columns(self):
        self.next('standard', 'a')
        rows = list(csv.reader(read(self.events).splitlines()))
        self.assertEqual(rows[0], ['ts', 'id', 'stage', 'event', 'agent', 'gate', 'note'])
        self.assertEqual(rows[1][1:5], ['L1', 'new', 'claim', 'a'])
        self.assertRegex(rows[1][0], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$')

    def test_notes_with_commas_quotes_and_newlines_stay_one_line(self):
        self.next('standard', 'a')
        self.rec('done', 'L1', 'new', 'a', '--note', 'a, "b"\nc')
        rows = list(csv.reader(read(self.events).splitlines()))
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[2][6], 'a, "b" c')

    def test_two_agents_appending_concurrently_only_add_whole_lines(self):
        code = ('import sys; sys.path.insert(0, %r); import render_campaign as rc\n'
                'for i in range(30): rc.append_event("X", "s", "wait", sys.argv[1], "", "n%%d" %% i)\n' % HERE)
        env = dict(os.environ, RC_ROOT=self.root, RC_NOW=T0)
        self.next('standard', 'seed')
        base = read(self.events, 'rb')
        procs = [subprocess.Popen([sys.executable, '-c', code, a], env=env) for a in ('p1', 'p2', 'p3')]
        for p in procs:
            self.assertEqual(p.wait(), 0)
        data = read(self.events, 'rb')
        self.assertTrue(data.startswith(base))
        lines = data.decode().splitlines()
        self.assertEqual(len(lines), len(base.decode().splitlines()) + 90)
        self.assertEqual(lines.count('ts,id,stage,event,agent,gate,note'), 1)
        for row in csv.reader(lines[1:]):
            self.assertEqual(len(row), 7)
        self.assertEqual(self.rc('status', '--json').returncode, 0)

    def test_union_merge_of_two_branches_replays_consistently(self):
        """git's union driver keeps both appended blocks; replay orders by timestamp, so the result does not depend on it."""
        self.next('standard', 'a')
        common = read(self.events).splitlines()
        side_a = common + ['2026-10-01T01:00:00Z,L1,new,done,a,,', '2026-10-01T03:00:00Z,L1,setting,done,a,,']
        side_b = common + ['2026-10-01T02:00:00Z,R1,review-r1,done,b,pass,']
        for merged in (side_a + side_b[len(common):], side_b + side_a[len(common):]):
            write(self.events, '\n'.join(merged) + '\n')
            s = self.status()
            self.assertEqual((s['L1']['stage'], s['R1']['stage']), ('draft', 'ship'))


class Init(Base):
    def test_init_refuses_to_overwrite_without_force(self):
        r = self.rc('init')
        self.assertEqual(r.returncode, 2)
        self.assertIn('--force', r.stderr)

    def test_init_in_an_empty_tree_keeps_every_item_and_marks_the_gaps(self):
        os.remove(self.items_path)
        self.assertEqual(self.rc('init').returncode, 0)
        items = json.loads(read(self.items_path))['items']
        self.assertEqual(len(items), 67)
        self.assertIn('TODO: marker blood_mill not found in maps.json', next(i for i in items if i['id'] == 'lm:blood_mill')['notes'])
        self.assertTrue(os.path.exists(self.events), 'init creates the events file with its header')


class RealItemList(unittest.TestCase):
    """The committed list: exact groups in order, valid dependencies, stage names landmark.py really has."""

    def setUp(self):
        self.items = json.loads(read(REAL_ITEMS))['items']
        self.ids = [i['id'] for i in self.items]

    def lane(self, lane):
        return [i['id'] for i in self.items if i['lane'] == lane]

    def test_standard_groups_in_order(self):
        ids = self.lane('standard')
        self.assertEqual(ids[:2], ['estate:final', 'estate:opt'])
        groups = [i.split(':')[0] for i in ids]
        order = []
        for g in groups:
            if not order or order[-1] != g:
                order.append(g)
        self.assertEqual(order, ['estate', 'review', 'lm', 'scene', 'base', 'var'])
        self.assertEqual([groups.count(g) for g in order], [2, 12, 8, 7, 11, 8])
        self.assertEqual(ids[14:22], ['lm:blood_mill', 'lm:freight_yard', 'lm:lower_bar', 'lm:slums', 'lm:rebirth_workshop',
                                     'lm:schneider_clinic', 'lm:elite_club', 'lm:hunting_camp'])

    def test_hero_groups_in_order(self):
        ids = self.lane('hero')
        self.assertEqual(ids[:8], ['isle:' + x for x in ('silver_crown', 'isle4', 'isle5', 'isle6', 'isle9', 'isle10', 'isle25', 'isle30')])
        self.assertEqual(ids[8:], ['base:tc_upper', 'var:tc_upper:16k', 'var:tc_upper:dawn', 'var:tc_upper:day', 'var:tc_upper:dusk',
                                  'var:tc_upper:night', 'estate:b1b2', 'lm:round_table_hall', 'lm:sun_arena', 'lm:union_tower', 'base:world'])

    def test_dependencies_and_specs(self):
        by = {i['id']: i for i in self.items}
        self.assertEqual(by['estate:opt']['depends'], ['estate:final'])
        self.assertEqual(by['base:tc_upper']['depends'], ['isle:' + x for x in ('silver_crown', 'isle4', 'isle5', 'isle6', 'isle9', 'isle10', 'isle25', 'isle30')])
        self.assertEqual(by['var:tc_upper:16k']['spec'], {'res': 16000, 'spp': 512})
        self.assertIn('tc_upper:victor_estate', by['isle:isle4']['targets'])
        self.assertIn('tc_upper:y_estate', by['isle:isle5']['targets'])
        self.assertEqual(by['base:tc_mid']['spec'], {'res': 8000, 'spp': 128})
        self.assertEqual(by['base:site_fief3']['spec'], {'res': 4000, 'spp': 128})
        self.assertEqual(by['estate:final']['spec'], {'res': 2000, 'spp': 32})
        self.assertFalse([i for i in self.items if 'rain' in i['id']], 'no weather variants')

    def test_item_shape_and_ascii(self):
        for i in self.items:
            self.assertEqual(set(i), {'id', 'lane', 'type', 'title', 'targets', 'canon', 'depends', 'spec', 'hints', 'notes'})
            self.assertIn(i['canon'], ('card', 'inferred'))
            self.assertTrue(json.dumps(i, ensure_ascii=False).isascii(), i['id'])
        self.assertEqual(len(self.ids), len(set(self.ids)))


if __name__ == '__main__':
    unittest.main(verbosity=1)
