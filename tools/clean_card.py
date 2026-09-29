#!/usr/bin/env python3
"""通用角色卡清洗工具（SillyTavern 角色卡 V3，chara_card_v3）

把不同作者、来源各异的角色卡统一清洗成规整的 V3 结构，给读卡 / 建图流水线一个稳定的输入。

容错解析：
  - 编码：utf-8 / utf-8-sig / utf-16（带 BOM）/ gb18030 逐个试；PNG 的 ccv3 / chara 块先按惯例
    base64 解，解不动当原始 JSON 处理；
  - JSON：BOM、JSON 前后夹的杂字符、字符串里的裸控制字符、尾逗号、重复键，逐项修复并在报告留痕；
  - 修不动（引号缺失这类歧义损伤）就报错退出，绝不带着半张卡继续。

结构归一（只动元数据与容器形状）：
  - spec / spec_version 固定 chara_card_v3 / 3.0；
  - V2 顶层字段提升进 data（data 里已有的键优先，不覆盖；两边都有且值不同会告警，按 data）；
  - name / creator / character_version 收口成字符串并归一换行；tags 收口成字符串列表；
    alternate_greetings 收口成列表（元素内容不动）；
  - character_book.entries 的字典形式（世界书导出）按 uid 排序转成 V3 列表，条目对象原样。

正文载荷不透明（Opaque Payload，一个字符都不动）：
  description / personality / scenario / first_mes / mes_example / alternate_greetings 各条 /
  creator_notes / system_prompt / post_history_instructions / extensions（MVU 变量块、正则脚本都在
  这里）/ character_book / 其余未知键（前向兼容）。verify_preserved() 逐字段对账清洗前后的载荷，
  写入前必查，对不上会列出每一处。

用法（CLI，exit 0 = 干净；1 = 解析失败或载荷对不上）：
  python3 tools/clean_card.py 卡片.png                     # 只检查：解析 + 清洗 + 对账，打印报告
  python3 tools/clean_card.py 卡片.png -o 卡片.clean.png   # 清洗后写回 PNG（ccv3 + chara 双块，图像与其余块原样）
  python3 tools/clean_card.py 卡片.json -o 卡片.clean.json # 清洗后写回 JSON
  python3 tools/clean_card.py 卡片.png --report            # 报告以 JSON 打到 stdout

用法（模块导入；tools/ 不在 sys.path 时用 importlib 挂进来）：
  card, rep = read_card('卡片.png')     # rep.png 是原始 PNG 字节；rep.repairs / norms / warns 留痕
  out = clean_card(card, report=rep)    # → 清洗后的 V3 卡（入参不动）
  assert not verify_preserved(card, out)
  write_card(out, '卡片.clean.png', template_png=rep.png)

只依赖标准库。规范：SillyTavern chara_card_v3（spec_version 3.0）。
"""
import argparse, base64, copy, json, re, struct, sys, zlib

SPEC = 'chara_card_v3'
SPEC_VERSION = '3.0'
PNG_SIG = b'\x89PNG\r\n\x1a\n'
CARD_KEYS = (b'ccv3', b'chara')

# V2 卡的顶层字段 → 提升进 data（data 已有的键优先）
V2_LIFT = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes',
           'system_prompt', 'post_history_instructions', 'tags', 'creator', 'character_version',
           'alternate_greetings', 'extensions', 'character_book']
# data 里的载荷字段（清洗绝不改内容）
PAYLOAD = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes',
           'system_prompt', 'post_history_instructions', 'extensions', 'character_book']
META_STR = ['name', 'creator', 'character_version']   # 元数据：类型 / 换行归一


class CardError(Exception):
    """解析 / 清洗失败：调用方不应该继续用这张卡。"""


class CardReport:
    """清洗留痕：解析修复 / 结构归一 / 警告。png = 输入 PNG 的原始字节（写回时当模板）。"""

    def __init__(self):
        self.source = ''; self.container = ''; self.encoding = ''; self.spec_in = ''
        self.png = None; self.repairs = []; self.norms = []; self.warns = []

    def repair(self, s): self.repairs.append(s)

    def norm(self, s): self.norms.append(s)

    def warn(self, s): self.warns.append(s)

    def as_dict(self, violations=None):
        return {'source': self.source, 'container': self.container, 'encoding': self.encoding,
                'spec_in': self.spec_in, 'spec_out': SPEC, 'repairs': self.repairs,
                'normalized': self.norms, 'warnings': self.warns, 'violations': violations or []}

    def __str__(self):
        lines = [f'{self.source}：{self.container} · {self.encoding} · spec {self.spec_in} → {SPEC}']
        for tag, items in (('修复', self.repairs), ('归一', self.norms), ('警告', self.warns)):
            for x in items[:12]: lines.append(f'  [{tag}] {x}')
            if len(items) > 12: lines.append(f'  [{tag}] …共 {len(items)} 条')
        return '\n'.join(lines)


# ---------------- 文本与 JSON 容错 ----------------

def decode_text(b):
    """字节 → (文本, 编码名)。utf-8 → 带 BOM 的 utf-16 → gb18030，都不行用 utf-8 替换模式（会留痕）。"""
    if b[:3] == b'\xef\xbb\xbf':
        return b[3:].decode('utf-8'), 'utf-8-sig'
    try:
        return b.decode('utf-8'), 'utf-8'
    except UnicodeDecodeError:
        pass
    if b[:2] in (b'\xff\xfe', b'\xfe\xff'):
        return b.decode('utf-16'), 'utf-16'
    try:
        return b.decode('gb18030'), 'gb18030'
    except UnicodeDecodeError:
        return b.decode('utf-8', 'replace'), 'utf-8(replace)'


def _first_json_pos(s):
    cands = [i for i in (s.find('{'), s.find('[')) if i >= 0]
    return min(cands) if cands else None


def _dup_hook(found):
    """重复键 → 记一条（取最后一个值，与 json.loads 语义一致，不额外丢数据）。"""
    def hook(pairs):
        seen, out = set(), {}
        for k, v in pairs:
            if k in seen: found.append(f'重复键 {k}：取最后一个值（JSON 语义）')
            seen.add(k); out[k] = v
        return out
    return hook


def _fix_at(s, e, repairs):
    """按 JSONDecodeError 的位置修一处（返回修好的文本，修不动返回 None）：裸控制字符 / 尾逗号。"""
    pos = e.pos if isinstance(e.pos, int) and 0 <= e.pos < len(s) else 0
    msg, ch = e.msg or '', (s[pos] if pos < len(s) else '')
    if msg.startswith('Invalid control character') and ch:
        esc = {'\n': '\\n', '\r': '\\r', '\t': '\\t'}.get(ch) or '\\u%04x' % ord(ch)
        repairs.append(f'位置 {pos}：控制字符 U+{ord(ch):04X} 转义')
        return s[:pos] + esc + s[pos + 1:]
    if msg.startswith('Illegal trailing comma') and ch == ',':   # 新版（3.13+）报错：pos 直接指向逗号
        repairs.append(f'位置 {pos}：删除尾逗号')
        return s[:pos] + s[pos + 1:]
    if msg == 'Expecting value' and ch in '}]':   # 旧版报错：pos 指向收尾括号
        p = s.rfind(',', 0, pos)
        if p >= 0 and not s[p + 1:pos].strip():
            repairs.append(f'位置 {p}：删除尾逗号')
            return s[:p] + s[pos:]
    return None


def loads_tolerant(s):
    """容错 JSON 解析 → (对象, 修复清单)。只修无歧义的损伤；有歧义（如引号缺失）直接报错。"""
    repairs = []
    if s[:1] == '\ufeff':
        s = s[1:]; repairs.append('去掉 BOM')
    if s[:1] not in '{[':
        i = _first_json_pos(s)
        if i is None: raise CardError('文本里找不到 JSON 起点')
        repairs.append(f'忽略 JSON 起点前的 {i} 个字符'); s = s[i:]

    def once(txt):
        dups = []
        obj, end = json.JSONDecoder(object_pairs_hook=_dup_hook(dups)).raw_decode(txt)
        return obj, end, dups

    obj = end = dups = None
    for attempt in range(401):
        try:
            obj, end, dups = once(s); break
        except json.JSONDecodeError as e:
            if attempt == 400: raise CardError('JSON 修复超过上限（畸形过深）') from e
            s2 = _fix_at(s, e, repairs)
            if s2 is None: raise CardError(f'JSON 修复不动：{e.msg or e}（位置 {e.pos}）——损伤有歧义，不猜') from e
            s = s2
    if obj is None: raise CardError('JSON 解析失败')
    tail = s[end:].strip()
    if tail: repairs.append(f'忽略 JSON 结尾后的 {len(tail)} 个字符')
    repairs.extend(dups)
    return obj, repairs


# ---------------- PNG：只动 ccv3 / chara 文本块 ----------------

def _iter_chunks(data):
    """PNG 块迭代器：yield (type, 块起始偏移, body 长度)。读时不校验 CRC（写时算）。"""
    if data[:8] != PNG_SIG: raise CardError('不是 PNG 文件（签名不符）')
    off = 8
    while off + 8 <= len(data):
        (ln,) = struct.unpack('>I', data[off:off + 4]); typ = data[off + 4:off + 8]
        if off + 12 + ln > len(data): raise CardError('PNG 数据块不完整（文件截断）')
        yield typ, off, ln
        if typ == b'IEND': return
        off += 12 + ln
    raise CardError('PNG 没有正常结束（缺 IEND）')


def _text_chunks(data):
    """取出角色卡文本块（tEXt / zTXt / iTXt 都认）→ {keyword: bytes}。"""
    out = {}
    for typ, off, ln in _iter_chunks(data):
        body = data[off + 8:off + 8 + ln]
        kw = body.split(b'\x00', 1)[0]
        try:
            if typ == b'tEXt' and kw in CARD_KEYS:
                out.setdefault(kw.decode('latin1'), body.split(b'\x00', 1)[1])
            elif typ == b'zTXt' and kw in CARD_KEYS:
                rest = body.split(b'\x00', 1)[1]
                if rest[:1] == b'\x00': out.setdefault(kw.decode('latin1'), zlib.decompress(rest[1:]))
            elif typ == b'iTXt' and kw in CARD_KEYS:
                head, rest = body.split(b'\x00', 1)
                if len(rest) >= 2:
                    flag = rest[0]; rest = rest[2:]
                    _, rest = rest.split(b'\x00', 1); _, txt = rest.split(b'\x00', 1)
                    if flag == 1: txt = zlib.decompress(txt)
                    out.setdefault(head.decode('latin1'), txt)
        except (zlib.error, ValueError):
            continue
    return out


def _chunk(typ, body):
    return struct.pack('>I', len(body)) + typ + body + struct.pack('>I', zlib.crc32(typ + body) & 0xffffffff)


def _minimal_png():
    return (PNG_SIG + _chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 0, 0, 0, 0))
            + _chunk(b'IDAT', zlib.compress(b'\x00\x00')) + _chunk(b'IEND', b''))


def _build_png(base, payload_b64):
    """以 base 为底重写角色卡块：其余块（图像、别的文本块）按字节原样复制，ccv3 / chara 插在 IEND 前。"""
    parts, inserted = [PNG_SIG], False
    for typ, off, ln in _iter_chunks(base):
        if typ == b'IEND' and not inserted:
            parts.append(_chunk(b'tEXt', b'ccv3\x00' + payload_b64))
            parts.append(_chunk(b'tEXt', b'chara\x00' + payload_b64))
            inserted = True
        if typ in (b'tEXt', b'zTXt', b'iTXt') and base[off + 8:off + 8 + ln].split(b'\x00', 1)[0] in CARD_KEYS:
            continue
        parts.append(base[off:off + 12 + ln])
    if not inserted:
        parts.append(_chunk(b'tEXt', b'ccv3\x00' + payload_b64))
        parts.append(_chunk(b'tEXt', b'chara\x00' + payload_b64))
    return b''.join(parts)


# ---------------- 读 → 清洗 → 对账 → 写 ----------------

def _decode_blob(b, rep, b64_first):
    tried = []
    for use_b64 in ((True, False) if b64_first else (False, True)):
        data = b
        if use_b64:
            try:
                data = base64.b64decode(b, validate=False)
            except Exception as e:
                tried.append(f'base64：{e}'); continue
        try:
            s, enc = decode_text(data); rep.encoding = enc
            obj, repairs = loads_tolerant(s)
        except CardError as e:
            tried.append(str(e)); continue
        if not isinstance(obj, dict): raise CardError('卡片 JSON 顶层不是对象')
        for r in repairs: rep.repair(r)
        return obj
    raise CardError('解析不出卡片 JSON：' + '；'.join(tried[:2]))


def read_card(path):
    """读卡片（.png / .json）→ (原始卡 dict, CardReport)。绝不改输入。"""
    rep = CardReport(); rep.source = str(path)
    raw = open(path, 'rb').read()
    if raw[:8] == PNG_SIG:
        rep.png = raw
        texts = _text_chunks(raw)
        if 'ccv3' in texts: blob, rep.container = texts['ccv3'], 'png-ccv3'
        elif 'chara' in texts: blob, rep.container = texts['chara'], 'png-chara'
        else: raise CardError('PNG 里没有 ccv3 / chara 文本块（不是角色卡？）')
        card = _decode_blob(blob, rep, b64_first=True)
    else:
        rep.png = None; rep.container = 'json'
        card = _decode_blob(raw, rep, b64_first=False)
    rep.spec_in = str(card.get('spec') or '(缺)')
    return card, rep


def clean_card(card, report=None):
    """清洗成规整 V3：只动元数据与容器形状，载荷原样。返回新卡（入参不动）。"""
    rep = report if report is not None else CardReport()
    if not isinstance(card, dict): raise CardError('卡片 JSON 顶层不是对象')
    src = copy.deepcopy(card)
    out = {'spec': SPEC, 'spec_version': SPEC_VERSION}
    if card.get('spec') != SPEC: rep.norm(f"spec：{card.get('spec')!r} → {SPEC!r}")
    if card.get('spec_version') != SPEC_VERSION: rep.norm(f"spec_version：{card.get('spec_version')!r} → {SPEC_VERSION!r}")

    data_in = src.get('data')
    if not isinstance(data_in, dict):
        if data_in is not None: rep.warn(f'data 不是对象（{type(data_in).__name__}），按空重建')
        data_in = {}
        rep.norm('V2 卡：顶层字段提升进 data')
    data = data_in
    for k in V2_LIFT:
        if k not in data and k in src:
            data[k] = src[k]; rep.norm(f'V2 顶层字段 {k} 提升进 data')
        elif k in data and k in src and src[k] != data[k]:
            rep.warn(f'{k}：顶层与 data 值不一致，按 data（V3 以 data 为准）')

    for k in META_STR:
        v = data.get(k)
        if v is None and k in data:
            data[k] = ''; rep.norm(f'{k}：null → 空串'); continue
        if isinstance(v, str):
            nv = v.replace('\r\n', '\n').replace('\r', '\n').strip()
            if nv != v: data[k] = nv; rep.norm(f'{k}：换行 / 首尾空白归一')
        elif v is not None:
            data[k] = str(v); rep.norm(f'{k}：{type(v).__name__} → 字符串')
    if not (isinstance(data.get('name'), str) and data.get('name')):
        if 'name' not in data: data['name'] = ''
        rep.warn('name 缺失或为空（V3 必填）')

    if 'tags' in data:
        t = data['tags']
        if t is None: data['tags'] = []; rep.norm('tags：null → []')
        elif isinstance(t, str):
            data['tags'] = [x.strip() for x in re.split(r'[,，、;；]', t) if x.strip()]; rep.norm('tags：字符串 → 列表')
        elif isinstance(t, list):
            nt = [str(x) for x in t]
            if nt != t: data['tags'] = nt; rep.norm('tags：非字符串元素 → 字符串')
        else:
            rep.warn(f'tags 类型异常（{type(t).__name__}），保留原样')

    if 'alternate_greetings' in data:
        g = data['alternate_greetings']
        if g is None: data['alternate_greetings'] = []; rep.norm('alternate_greetings：null → []')
        elif isinstance(g, str): data['alternate_greetings'] = [g]; rep.norm('alternate_greetings：字符串 → [字符串]（内容不动）')
        elif isinstance(g, list) and any(not isinstance(x, str) for x in g):
            rep.warn('alternate_greetings 里有非字符串元素，原样保留')

    book = data.get('character_book')
    if isinstance(book, dict) and isinstance(book.get('entries'), dict):
        ents = book['entries']

        def _uid(k):
            try:
                return (0, int(k), '')
            except (TypeError, ValueError):
                return (1, 0, str(k))

        book['entries'] = [ents[k] for k in sorted(ents, key=_uid)]
        rep.norm(f'character_book.entries：字典 → 列表（{len(book["entries"])} 条按 uid 排序，条目原样）')

    out['data'] = data
    for k, v in src.items():   # 顶层未知键透传（前向兼容）
        if k not in out and k not in V2_LIFT and k != 'data': out[k] = v
    return out


def _book_entries(book):
    if not isinstance(book, dict): return None
    ents = book.get('entries')
    if isinstance(ents, dict):
        def _uid(k):
            try:
                return (0, int(k), '')
            except (TypeError, ValueError):
                return (1, 0, str(k))
        return [ents[k] for k in sorted(ents, key=_uid)]
    return ents if isinstance(ents, list) else None


def _book_equal(x, y):
    if x == y: return True
    ex, ey = _book_entries(x), _book_entries(y)
    if ex is None or ey is None or len(ex) != len(ey): return False
    if any(p != q for p, q in zip(ex, ey)): return False
    ox = {k: v for k, v in (x or {}).items() if k != 'entries'}
    oy = {k: v for k, v in (y or {}).items() if k != 'entries'}
    return ox == oy


def verify_preserved(src, dst):
    """载荷对账（零丢失证明）：正文 / extensions / character_book / alternate_greetings / 未知键逐项比对。
    返回不一致清单（空列表 = 零丢失）。容器形状归一（entries 字典→列表、greetings 字符串→列表）不算丢失。"""
    bad = []

    def fields(card):
        d = card.get('data') if isinstance(card.get('data'), dict) else {}
        merged = {k: v for k, v in card.items() if k not in ('data', 'spec', 'spec_version')}
        merged.update(d)   # data 优先
        return merged

    a, b = fields(src), fields(dst)
    for k in PAYLOAD:
        if a.get(k) != b.get(k) and not (k == 'character_book' and _book_equal(a.get(k), b.get(k))):
            bad.append(f'{k}：载荷不一致')
    ga, gb = a.get('alternate_greetings'), b.get('alternate_greetings')
    if isinstance(ga, str): ga = [ga]
    if isinstance(gb, str): gb = [gb]
    if ga != gb: bad.append('alternate_greetings：载荷不一致')
    for k in set(a) | set(b):
        if k in PAYLOAD or k in META_STR or k in ('tags', 'alternate_greetings'): continue
        if a.get(k) != b.get(k): bad.append(f'{k}：不一致或丢失')
    return bad


def write_card(card, out_path, template_png=None):
    """写出清洗后的卡：.json 直写；.png 以 template_png 为底只换 ccv3 / chara 块（没有模板就落一张 1×1 的底）。"""
    payload = json.dumps(card, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if out_path.lower().endswith('.png'):
        base = template_png if template_png else _minimal_png()
        open(out_path, 'wb').write(_build_png(base, base64.b64encode(payload)))
    else:
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')


def main(argv=None):
    ap = argparse.ArgumentParser(description='通用角色卡清洗（chara_card_v3）', epilog=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('input', help='角色卡（.png / .json）')
    ap.add_argument('-o', '--out', help='清洗后写出（.png / .json）；不给 = 只检查')
    ap.add_argument('--report', action='store_true', help='报告以 JSON 打到 stdout')
    a = ap.parse_args(argv)
    try:
        card, rep = read_card(a.input)
        cleaned = clean_card(card, report=rep)
        bad = verify_preserved(card, cleaned)
    except CardError as e:
        print(f'✗ {e}', file=sys.stderr); return 1
    if a.report:
        print(json.dumps(rep.as_dict(bad), ensure_ascii=False, indent=2))
    else:
        print(rep)
        print('  载荷对账：' + ('零丢失 ✓' if not bad else '不一致 ✗（' + '；'.join(bad) + '）'))
        print('  ' + ('✓ 检查通过' if not bad else '✗ 有问题'))
    if bad: return 1
    if a.out:
        write_card(cleaned, a.out, template_png=rep.png)
        print(f'  已写出 {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
