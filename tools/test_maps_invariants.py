#!/usr/bin/env python3
"""maps.json 树不变量（tools/maps_invariants.py）自测：仓库现状干净；孤儿 / 成环 / 多根 / test 字段 / 坏 anchor 都拦得住。
用法：python3 tools/test_maps_invariants.py（smoke.sh 会跑）"""
import copy, json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, HERE)
from maps_invariants import invariants  # noqa: E402

GOOD = {
    'w': {'kind': 'world', 'title': 'w'},
    'a': {'kind': 'points', 'parent': 'w', 'title': 'a'},
    'e': {'kind': 'estate', 'parent': 'a', 'title': 'e'},
    'p': {'kind': 'estate', 'parent': 'e', 'title': 'p', 'anchor': {'zone': 'z1'}},
}
ZONES = {'z1', 'z2'}


def bad(edit):
    m = copy.deepcopy(GOOD)
    edit(m)
    return invariants(m, ZONES)


class Invariants(unittest.TestCase):
    def test_good_registry_is_clean(self):
        self.assertEqual(invariants(GOOD, ZONES), [])

    def test_repo_registry_is_clean(self):
        reg = json.load(open(os.path.join(ROOT, 'map', 'data', 'maps.json'), encoding='utf-8'))['maps']
        zones = {z['id'] for z in json.load(open(os.path.join(ROOT, 'map', 'estate', 'model', 'zones.json'), encoding='utf-8'))['zones']}
        self.assertEqual(invariants(reg, zones), [])
        self.assertEqual(reg['dairy']['parent'], 'eden_estate')
        self.assertEqual(reg['dairy']['anchor'], {'zone': 'dairy'})

    def test_orphan_is_caught(self):
        e = bad(lambda m: m['a'].pop('parent'))   # a becomes a second root; e and p end at it, not at w
        self.assertTrue(any('应恰有一张' in x for x in e), e)
        e = bad(lambda m: m.update(o={'kind': 'points', 'title': 'o', 'parent': 'ghost'}))   # a parent that does not exist is check_maps' own message
        self.assertEqual(e, [])
        e = bad(lambda m: (m.update(o1={'kind': 'points', 'title': 'o1', 'parent': 'o2'}), m.update(o2={'kind': 'points', 'title': 'o2', 'parent': 'o1'})))
        self.assertTrue(any('成环' in x for x in e), e)

    def test_root_must_be_the_world(self):
        e = bad(lambda m: m['w'].update(kind='points'))
        self.assertTrue(any('根图' in x for x in e), e)

    def test_test_field_is_forbidden(self):
        for value in (True, False):
            e = bad(lambda m: m['p'].update(test=value))
            self.assertTrue(any('p.test' in x for x in e), e)

    def test_anchor_zone_must_exist(self):
        for a in ({'zone': 'nope'}, {'zone': 3}, {}, 'z1', ['z1']):
            e = bad(lambda m: m['p'].update(anchor=a))
            self.assertTrue(any('p.anchor.zone' in x for x in e), (a, e))

    def test_check_maps_calls_them(self):
        src = open(os.path.join(HERE, 'check_maps.py'), encoding='utf-8').read()
        self.assertIn('from maps_invariants import invariants', src)
        self.assertIn('err(_e)', src)
        self.assertNotIn("m.get('test')", src)   # the exemption that the test entry needed is gone


if __name__ == '__main__':
    unittest.main(verbosity=1)
