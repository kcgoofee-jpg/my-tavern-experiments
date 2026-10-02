#!/usr/bin/env python3
"""提示词顺序对拍：一份抓下来的请求 + 几本世界书 → 每条条目落在第几条消息。

抓下来的请求就是客户端真的发出去的那份（SillyTavern 的 llm-api-*.request.json、
CCST 抓包存下来的 request.json 都行）。只打印条目名、位置、深度、角色、order、
字符数与落在第几条消息，不打印任何聊天正文（WB-2 items 1-5，docs/worldbook-layout.md）。

用法：python3 tools/wb_prompt_order.py <request.json> <book.json> [book.json ...] [--probe 60]
自测：python3 tools/test_wb_prompt_order.py（smoke.sh 会跑）
"""
import json
import sys

WS = None
POS = {0: 'before_char', 1: 'after_char', 2: 'before_author_note', 3: 'after_author_note',
       4: 'at_depth', 5: 'before_examples', 6: 'after_examples'}
ROLE = {0: 'system', 1: 'user', 2: 'assistant'}
PROBE = 60


def norm(s):
    """把换行、全角空格压成单空格：抓包里的换行常是 \\r\\n，逐条探针要能对上"""
    import re
    return re.sub(r'[ \t\r\n　]+', ' ', s or '').strip()


def entries_of(book):
    """世界书 JSON → 条目列表（ST 的 entries 是以 uid 为键的表，TH 发布物是数组；两种都吃）"""
    raw = book.get('entries') or []
    it = raw.values() if isinstance(raw, dict) else raw
    out = []
    for e in it:
        if not isinstance(e, dict):
            continue
        pos = e.get('position')
        if isinstance(pos, dict):        # TH 形状：{type, role, depth, order}
            kind, depth, role, order = pos.get('type'), pos.get('depth'), pos.get('role'), pos.get('order')
        else:                             # ST 形状：position 是序号，字段各在顶层
            kind, depth, role = POS.get(pos, 'unknown'), e.get('depth'), e.get('role')
            order = e.get('order', e.get('insertion_order'))
        out.append({'name': e.get('comment') or e.get('name') or '',
                    'kind': kind, 'depth': depth, 'role': ROLE.get(role, role), 'order': order,
                    'const': bool(e.get('constant')), 'disabled': bool(e.get('disable') or e.get('enabled') is False),
                    'body': e.get('content') or e.get('entry_content') or ''})
    return out


def messages_of(request):
    """请求 JSON → [(role, 压平后的正文)]；content 是数组（多模态）时把 text 段拼起来"""
    out = []
    for m in request.get('messages') or []:
        c = m.get('content')
        if isinstance(c, list):
            c = ''.join(x.get('text', '') for x in c if isinstance(x, dict))
        out.append((m.get('role'), norm(c)))
    return out


def place(entries, msgs, probe=PROBE, skip_disabled=True):
    """每条目 → 落在第几条消息（探针 = 正文前 probe 个字符，压平后比对）。skip_disabled=False 时连关着的条目一起探：
    抓包是过去某一刻的，书里现在的开关状态可能已经被按需挂载改过，这时只有这样才映射得出来"""
    rows = []
    for e in entries:
        if e['disabled'] and skip_disabled:
            continue
        body = norm(e['body'])
        if len(body) < 12:
            continue
        head = body[:probe]
        at = -1
        hit = []
        for i, (_, t) in enumerate(msgs):
            j = t.find(head)
            if j >= 0:
                hit.append(i)
                if at < 0 or j < at:
                    at = j
        rows.append(dict(e, chars=len(e['body']), msgs=hit, at=at, probe_len=len(head)))
    return rows


def summary(rows):
    landed = [r for r in rows if r['msgs']]
    return {'probed': len(rows), 'landed': len(landed), 'missing': len(rows) - len(landed)}


def render(rows, msgs):
    """人能读的表（返回字符串，方便自测）：条目 → 消息号。最后一条消息的序号单独标出来（深度 0 应该落在那里）"""
    last = len(msgs) - 1
    out = []
    for r in sorted(landed_of(rows), key=lambda r: (r['msgs'][0], r['at'])):
        where = ','.join(str(i) for i in r['msgs'])
        tail = ' <- 最后一条' if r['msgs'] == [last] else ''
        out.append('  msg %-8s @%-6d %-26s %-11s depth=%-4s role=%-9s order=%-6s chars=%d%s'
                   % (where, r['at'], (r['name'] or '')[:24], r['kind'], r['depth'], r['role'], r['order'], r['chars'], tail))
    s = summary(rows)
    out.append('  条目：探测 %d，落在提示词里 %d，没触发 %d' % (s['probed'], s['landed'], s['missing']))
    return '\n'.join(out)


def landed_of(rows):
    return [r for r in rows if r['msgs']]


def main(argv):
    flags = [a for a in argv[1:] if a.startswith('--')]
    args = [a for a in argv[1:] if not a.startswith('--')]
    probe = PROBE
    if '--probe' in flags:
        tail = argv[argv.index('--probe') + 1]
        probe = int(tail) if not tail.startswith('--') else PROBE
    skip = '--all' not in flags
    if len(args) < 2:
        print(__doc__)
        return 2
    request = json.load(open(args[0], encoding='utf-8'))
    msgs = messages_of(request)
    print('请求 %s：%d 条消息（探针 %d 字符%s）' % (args[0], len(msgs), probe, '' if skip else '，含关着的条目'))
    rows = []
    for path in args[1:]:
        book = json.load(open(path, encoding='utf-8'))
        rows += place(entries_of(book), msgs, probe, skip)
    print(render(rows, msgs))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))