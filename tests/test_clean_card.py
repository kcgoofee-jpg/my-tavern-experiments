#!/usr/bin/env python3
"""tools/clean_card.py 的单元测试（全部用中性占位符，不含任何真实卡片内容）。

跑法：python3 tests/test_clean_card.py（tools/smoke.sh 已接入同一命令）。
"""
import base64, importlib.util, json, os, struct, subprocess, sys, tempfile, unittest, zlib

sys.dont_write_bytecode = True   # 不在 tools/ 下留 __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOD_PATH = os.path.join(ROOT, 'tools', 'clean_card.py')

_spec = importlib.util.spec_from_file_location('clean_card', MOD_PATH)
cc = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(cc)


def chunk(typ, body):
    return struct.pack('>I', len(body)) + typ + body + struct.pack('>I', zlib.crc32(typ + body) & 0xffffffff)


def png(card=None, extra=None, keyword=b'ccv3', raw=None):
    """拼一张最小 PNG：IHDR + IDAT +（可选角色卡文本块）+ 额外块 + IEND。"""
    out = [b'\x89PNG\r\n\x1a\n',
           chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 0, 0, 0, 0)),
           chunk(b'IDAT', zlib.compress(b'\x00\x00'))]
    if raw is not None:
        out.append(chunk(b'tEXt', keyword + b'\x00' + raw))
    elif card is not None:
        blob = base64.b64encode(json.dumps(card, ensure_ascii=False).encode('utf-8'))
        out.append(chunk(b'tEXt', keyword + b'\x00' + blob))
    if extra:
        out.extend(extra)
    out.append(chunk(b'IEND', b''))
    return b''.join(out)


def sample_v3():
    """中性样例卡：载荷里塞满坑（CRLF / 引号 / 制表符 / UpdateVariable / 扩展树 / 世界书）。"""
    return {
        'spec': 'chara_card_v3', 'spec_version': '3.0',
        'data': {
            'name': 'PLACEHOLDER_ROLE_A',
            'description': 'PAYLOAD_D_LINE1\r\nPAYLOAD_D_LINE2 "quoted" <b>熵</b>\r',
            'personality': 'PAYLOAD_P\n\tTAB',
            'scenario': 'PAYLOAD_S',
            'first_mes': 'PAYLOAD_F\n<UpdateVariable>{"世界": {"当前地点": "PLACEHOLDER_ROOM_X"}}</UpdateVariable>',
            'mes_example': '<START>\n{{user}}: hi\n{{char}}: PAYLOAD_M',
            'creator_notes': 'PAYLOAD_N',
            'system_prompt': 'PAYLOAD_SYS',
            'post_history_instructions': 'PAYLOAD_PHI',
            'tags': ['tagA', 'tagB'],
            'creator': 'PLACEHOLDER_AUTHOR',
            'character_version': '1.0',
            'alternate_greetings': ['PAYLOAD_G1\r\nCRLF', 'PAYLOAD_G2'],
            'extensions': {
                'MVU': {'variables': {'世界': {'当前地点': 'PLACEHOLDER_ROOM_X'}}},
                'regex_scripts': [{'scriptName': 'PLACEHOLDER_SCRIPT', 'replaceString': 'PAYLOAD_R'}],
                'depth_prompt': {'prompt': 'PAYLOAD_DEPTH', 'depth': 4},
            },
            'character_book': {
                'name': 'PLACEHOLDER_BOOK', 'scan_depth': 3,
                'entries': [
                    {'keys': ['PLACEHOLDER_KEY'], 'content': 'PAYLOAD_BOOK_ENTRY_1\r\n带换行', 'enabled': True},
                    {'keys': ['k2'], 'content': 'PAYLOAD_BOOK_ENTRY_2', 'extensions': {'x': {'y': [1, 2]}}},
                ],
            },
        },
    }


class TestV3Roundtrip(unittest.TestCase):
    def test_png_roundtrip_zero_loss(self):
        card = sample_v3()
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'card.png'); open(p, 'wb').write(png(card=card))
            got, rep = cc.read_card(p)
            self.assertEqual(rep.container, 'png-ccv3')
            cleaned = cc.clean_card(got, report=rep)
            self.assertEqual(cc.verify_preserved(got, cleaned), [])
            out = os.path.join(d, 'clean.png')
            cc.write_card(cleaned, out, template_png=rep.png)
            got2, rep2 = cc.read_card(out)
            self.assertEqual(rep2.container, 'png-ccv3')
            self.assertEqual(cc.verify_preserved(got, got2), [])   # 写回再读：载荷仍原样
            for k in cc.PAYLOAD:
                self.assertEqual(got['data'][k], got2['data'][k], k)
            self.assertEqual(got2['data']['extensions']['MVU']['variables']['世界']['当前地点'], 'PLACEHOLDER_ROOM_X')

    def test_v2_lift_to_v3(self):
        v2 = {'spec': 'chara_card_v2', 'spec_version': '2.0',
              'name': 'PLACEHOLDER_ROLE_B', 'description': 'PAYLOAD_D2', 'personality': 'PAYLOAD_P2',
              'scenario': 'PAYLOAD_S2', 'first_mes': 'PAYLOAD_F2', 'mes_example': 'PAYLOAD_M2',
              'creator_notes': None, 'tags': 'tagA, tagB、tagC', 'alternate_greetings': 'PAYLOAD_G_SINGLE',
              'extensions': {'MVU': {'a': 1}}}
        rep = cc.CardReport()
        cleaned = cc.clean_card(v2, report=rep)
        self.assertEqual(cleaned['spec'], 'chara_card_v3')
        self.assertEqual(cleaned['spec_version'], '3.0')
        d = cleaned['data']
        self.assertEqual(d['description'], 'PAYLOAD_D2')          # 提升，内容不动
        self.assertEqual(d['alternate_greetings'], ['PAYLOAD_G_SINGLE'])
        self.assertEqual(d['tags'], ['tagA', 'tagB', 'tagC'])
        self.assertIsNone(d['creator_notes'])                     # 载荷字段保持原样（含 null）
        self.assertEqual(d['extensions'], {'MVU': {'a': 1}})
        self.assertEqual(cc.verify_preserved(v2, cleaned), [])
        self.assertTrue(any('V2' in n for n in rep.norms))

    def test_heterogeneous_fields(self):
        card = sample_v3()
        card['data']['character_book']['entries'] = {
            '1': card['data']['character_book']['entries'][1],
            '0': card['data']['character_book']['entries'][0],
            'x': {'keys': ['kx'], 'content': 'PAYLOAD_BOOK_X'},
        }
        card['data']['tags'] = 'tagA，tagB；tagC'
        card['data']['alternate_greetings'] = 'PAYLOAD_G_WRAP'
        cleaned = cc.clean_card(card)
        d = cleaned['data']
        self.assertEqual([e['content'] for e in d['character_book']['entries']],
                         ['PAYLOAD_BOOK_ENTRY_1\r\n带换行', 'PAYLOAD_BOOK_ENTRY_2', 'PAYLOAD_BOOK_X'])
        self.assertEqual(d['tags'], ['tagA', 'tagB', 'tagC'])
        self.assertEqual(d['alternate_greetings'], ['PAYLOAD_G_WRAP'])
        self.assertEqual(cc.verify_preserved(card, cleaned), [])


class TestRepair(unittest.TestCase):
    def test_bom_trailing_comma_control_char_tail(self):
        card = sample_v3()
        body = json.dumps(card, ensure_ascii=False)
        broken = ('\ufeff' + body).replace('"tagB"]', '"tagB",]') \
                                  .replace('PAYLOAD_S', 'PAYLOAD_S\x01CTRL') + ' 垃圾尾巴'
        obj, repairs = cc.loads_tolerant(broken)
        self.assertEqual(obj['data']['tags'], ['tagA', 'tagB'])
        self.assertEqual(obj['data']['scenario'], 'PAYLOAD_S\x01CTRL')   # 控制字符转义恢复，内容不丢
        self.assertTrue(any('BOM' in r for r in repairs))
        self.assertTrue(any('尾逗号' in r for r in repairs))
        self.assertTrue(any('控制字符' in r for r in repairs))
        self.assertTrue(any('结尾' in r for r in repairs))

    def test_duplicate_keys(self):
        obj, repairs = cc.loads_tolerant('{"spec": "a", "spec": "chara_card_v3", "data": {"name": "X", "name": "Y"}}')
        self.assertEqual(obj['spec'], 'chara_card_v3')
        self.assertEqual(obj['data']['name'], 'Y')
        self.assertTrue(any('重复键' in r for r in repairs))

    def test_unfixable_gives_up(self):
        with self.assertRaises(cc.CardError):
            cc.loads_tolerant('{"a": "未闭合的字符串}')

    def test_decode_text_encodings(self):
        s, enc = cc.decode_text('中文\n'.encode('gb18030'))
        self.assertEqual(s, '中文\n'); self.assertEqual(enc, 'gb18030')
        s2, enc2 = cc.decode_text(b'\xef\xbb\xbf{"a":1}')
        self.assertEqual(s2, '{"a":1}'); self.assertEqual(enc2, 'utf-8-sig')


class TestVerify(unittest.TestCase):
    def test_detects_mutation(self):
        card = sample_v3()
        bad = cc.clean_card(card); bad['data']['description'] = 'TAMPERED'
        self.assertEqual(cc.verify_preserved(card, bad), ['description：载荷不一致'])
        bad2 = cc.clean_card(card); del bad2['data']['extensions']['MVU']
        self.assertEqual(cc.verify_preserved(card, bad2), ['extensions：载荷不一致'])
        bad3 = cc.clean_card(card); bad3['data']['character_book']['entries'][0]['content'] = 'TAMPERED'
        self.assertEqual(cc.verify_preserved(card, bad3), ['character_book：载荷不一致'])
        bad4 = cc.clean_card(card); del bad4['data']['first_mes']
        self.assertEqual(cc.verify_preserved(card, bad4), ['first_mes：载荷不一致'])

    def test_clean_never_violates(self):
        for card in (sample_v3(),
                     {'spec': 'chara_card_v2', 'name': 'PLACEHOLDER_ROLE_C', 'description': 'PAYLOAD'},
                     {'spec': 'chara_card_v3', 'data': {'name': 'PLACEHOLDER_ROLE_D'}},
                     {'unknown_top': {'deep': [1, 2]}, 'data': {'name': 'X', 'weird_key': {'k': 'v'}}}):
            cleaned = cc.clean_card(card)
            self.assertEqual(cc.verify_preserved(card, cleaned), [], str(card.get('spec')))


class TestPng(unittest.TestCase):
    def test_other_chunks_untouched(self):
        card = sample_v3()
        comment = chunk(b'tEXt', b'Comment\x00keep me')
        data = png(card=card, extra=[comment])
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'c.png'); open(p, 'wb').write(data)
            got, rep = cc.read_card(p)
            out = os.path.join(d, 'o.png'); cc.write_card(cc.clean_card(got), out, template_png=rep.png)
            raw = open(out, 'rb').read()
            self.assertIn(b'Comment\x00keep me', raw)               # 别的文本块原样
            self.assertEqual(raw.count(b'ccv3\x00'), 1)             # 角色卡块只留新写的两份
            self.assertEqual(raw.count(b'chara\x00'), 1)
            self.assertIn(chunk(b'IDAT', zlib.compress(b'\x00\x00')), raw)   # 图像数据原样
            got2, _ = cc.read_card(out)
            self.assertEqual(cc.verify_preserved(got, got2), [])

    def test_chara_keyword_and_v2_png(self):
        card = {'spec': 'chara_card_v2', 'name': 'PLACEHOLDER_ROLE_C', 'description': 'PAYLOAD'}
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'c.png'); open(p, 'wb').write(png(card=card, keyword=b'chara'))
            got, rep = cc.read_card(p)
            self.assertEqual(rep.container, 'png-chara')
            self.assertEqual(cc.verify_preserved(got, cc.clean_card(got)), [])

    def test_not_a_card_png(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'x.png'); open(p, 'wb').write(png())
            with self.assertRaises(cc.CardError): cc.read_card(p)


class TestCli(unittest.TestCase):
    def test_check_write_and_report(self):
        card = sample_v3()
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'card.png'); open(p, 'wb').write(png(card=card))
            r = subprocess.run([sys.executable, MOD_PATH, p, '--report'], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            rep = json.loads(r.stdout)
            self.assertEqual(rep['violations'], [])
            self.assertEqual(rep['container'], 'png-ccv3')
            out = os.path.join(d, 'clean.png')
            r2 = subprocess.run([sys.executable, MOD_PATH, p, '-o', out], capture_output=True, text=True)
            self.assertEqual(r2.returncode, 0, r2.stderr)
            got, _ = cc.read_card(out)
            self.assertEqual(cc.verify_preserved(card, got), [])

    def test_bad_input_fails_clean(self):
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, 'bad.png'); open(bad, 'wb').write(png())
            r = subprocess.run([sys.executable, MOD_PATH, bad], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            self.assertIn('ccv3', r.stderr)
            j = os.path.join(d, 'card.json'); open(j, 'w', encoding='utf-8').write('{"spec":"chara_card_v3"}')
            r2 = subprocess.run([sys.executable, MOD_PATH, j], capture_output=True, text=True)
            self.assertEqual(r2.returncode, 0, r2.stderr)   # 缺 name 只是警告，载荷对账通过

    def test_module_api(self):
        for name in ('read_card', 'clean_card', 'write_card', 'verify_preserved', 'loads_tolerant',
                     'decode_text', 'CardReport', 'CardError'):
            self.assertTrue(hasattr(cc, name), name)


if __name__ == '__main__':
    unittest.main(verbosity=1)
