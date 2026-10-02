#!/usr/bin/env python3
"""tools/wb_prompt_order.py 自测：条目到消息号的对拍；两种条目表形状；关着的条目不探测；输出不含聊天正文。

用法：python3 tools/test_wb_prompt_order.py（smoke.sh 会跑）
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import unittest as UT  # noqa: E402
import wb_prompt_order as W  # noqa: E402

FILL = '规则正文，足够长的一条，用来做探针' * 3
KW = '<地点·大厅>' + chr(10) + '大厅：一层。' + chr(10) + '</地点·大厅>'
PRE = '角色定义与常驻条目。'


def st_book():
    """ST 形状：entries 以 uid 为键，position 是序号"""
    return {'entries': {
        '7': {'uid': 7, 'comment': '规范', 'content': FILL, 'constant': True,
              'position': 4, 'depth': 0, 'role': 1, 'order': 900},
        '8': {'uid': 8, 'comment': '地点-大厅', 'content': KW,
              'position': 4, 'depth': 1, 'role': 0, 'order': 1000, 'key': ['大厅']},
        '9': {'uid': 9, 'comment': '关着的', 'content': '这条永远不进提示词，用来确认探测跳过它', 'disable': True,
              'position': 0, 'role': 0, 'order': 10},
    }}


def th_book():
    """TH 形状：entries 是数组，position 是 {type, role, depth, order}"""
    return {'entries': [
        {'name': '说明', 'enabled': False, 'position': {'type': 'before_character_definition', 'order': 1},
         'content': '说明正文'},
        {'name': '类型表', 'position': {'type': 'after_character_definition', 'role': 'system', 'depth': 4, 'order': 901},
         'content': '类型表正文，足够长的一条，用来做探针' * 3},
    ]}


def request():
    return {'model': 'x', 'messages': [
        {'role': 'system', 'content': PRE},
        {'role': 'user', 'content': [{'type': 'text', 'text': KW}]},
        {'role': 'user', 'content': FILL + chr(10) + KW},
    ]}


class Order(UT.TestCase):
    def test_entries_of_both_shapes(self):
        a = W.entries_of(st_book())
        self.assertEqual([e['name'] for e in a], ['规范', '地点-大厅', '关着的'])
        self.assertEqual((a[0]['kind'], a[0]['depth'], a[0]['role'], a[0]['order']), ('at_depth', 0, 'user', 900))
        self.assertEqual((a[1]['kind'], a[1]['depth'], a[1]['role'], a[1]['order']), ('at_depth', 1, 'system', 1000))
        self.assertTrue(a[2]['disabled'])
        b = W.entries_of(th_book())
        self.assertTrue(b[0]['disabled'])
        self.assertEqual((b[1]['kind'], b[1]['order']), ('after_character_definition', 901))

    def test_place_finds_the_message_and_not_the_disabled(self):
        msgs = W.messages_of(request())
        rows = W.place(W.entries_of(st_book()), msgs)
        self.assertEqual(W.summary(rows), {'probed': 2, 'landed': 2, 'missing': 0})
        self.assertEqual(rows[0]['msgs'], [2])
        self.assertEqual(rows[1]['msgs'], [1, 2])
        self.assertEqual(rows[0]['at'], 0)      # 规则在最后一条消息的开头就写着
        self.assertEqual(rows[1]['at'], 0)      # 关键词条目在倒数第二条消息的开头

    def test_norm_collapses_crlf_and_full_width_space(self):
        self.assertEqual(W.norm('甲' + chr(13) + chr(10) + '　乙'), '甲 乙')

    def test_render_never_prints_message_text(self):
        rows = W.place(W.entries_of(st_book()), W.messages_of(request()))
        out = W.render(rows, W.messages_of(request()))
        self.assertIn('msg 2', out)
        self.assertIn('探测 2', out)
        self.assertNotIn(PRE, out)
        self.assertNotIn('大厅：一层', out)


if __name__ == '__main__':
    UT.main()
