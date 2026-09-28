#!/usr/bin/env python3
"""读卡第 1 步：把角色卡（PNG 或 JSON，只读）拆成可逐行读的文本，并记下每个文件的总行数（覆盖核对的分母）。

用法：
  python3 skills/card-map/export_card.py <卡.png|卡.json> --out <scratchpad>/card [--world 外部世界书.json ...]
产出（全部在 --out，禁止指向仓库内）：
  ccv3.json / chara.json   PNG tEXt 里的 ccv3 / chara（base64 解码）；JSON 输入写成 chara.json
  book.txt                 卡内世界书全部条目（含禁用），每条带 uid / 标题 / 触发词 / 启用 / 深度 头
  greet.txt                first_mes + 全部 alternate_greetings
  ext.txt                  extensions（regex_scripts、tavern_helper 脚本、depth_prompt…）原样 JSON 展开
  desc.txt                 description / personality / scenario / system_prompt / post_history_instructions / mes_example
  world_<名>.txt           --world 给的外部世界书
  lines.json               {文件: 总行数}
原卡文件只读打开一次；工具从不写酒馆（SillyTavern / 酒馆助手）的数据目录。只用标准库。
"""
import argparse, base64, json, os, struct, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def png_text(path):
    out = {}
    with open(path, 'rb') as f:
        data = f.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        sys.exit('不是 PNG')
    i = 8
    while i < len(data):
        n, = struct.unpack('>I', data[i:i + 4]); typ = data[i + 4:i + 8]; body = data[i + 8:i + 8 + n]
        if typ == b'tEXt':
            k, _, v = body.partition(b'\0'); out[k.decode('latin-1')] = v
        elif typ == b'zTXt':
            k, _, v = body.partition(b'\0'); out[k.decode('latin-1')] = zlib.decompress(v[1:])
        elif typ == b'iTXt':
            k, _, rest = body.partition(b'\0'); comp = rest[0]; rest = rest[2:]
            _, _, rest = rest.partition(b'\0'); _, _, v = rest.partition(b'\0')
            out[k.decode('latin-1')] = zlib.decompress(v) if comp else v
        i += 12 + n
    return {k: json.loads(base64.b64decode(v).decode('utf-8')) for k, v in out.items() if k.lower() in ('ccv3', 'chara')}


def book_entries(d):
    es = ((d.get('character_book') or {}).get('entries')) if isinstance(d, dict) else None
    if es is None and isinstance(d, dict):
        es = d.get('entries', [])
    return list(es.values()) if isinstance(es, dict) else list(es or [])


def fmt_book(es):
    lines = []
    for n, e in enumerate(es):
        if not isinstance(e, dict):
            continue
        keys = e.get('keys') or e.get('key') or []
        on = not (e.get('disable') or e.get('enabled') is False)
        lines.append(f"===== #{n} uid={e.get('uid', e.get('id', ''))} 标题={e.get('comment') or e.get('name') or ''} "
                     f"触发词={'、'.join(map(str, keys))} 启用={'是' if on else '否'} 常驻={'是' if e.get('constant') else '否'} "
                     f"位置={e.get('position', '')} 深度={e.get('depth', (e.get('extensions') or {}).get('depth', ''))}")
        lines += str(e.get('content', '')).splitlines() or ['']
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('--out', required=True); ap.add_argument('--world', nargs='*', default=[])
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    if os.path.commonpath([out, ROOT]) == ROOT:
        sys.exit(f'导出不写进仓库（卡内容不进公开仓库）：{out}')
    os.makedirs(out, exist_ok=True)
    files = {}

    def put(name, text):
        p = os.path.join(out, name)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(text)
        files[name] = text.count('\n') + (0 if text.endswith('\n') or not text else 1)

    if a.src.lower().endswith('.png'):
        blobs = png_text(a.src)
        if not blobs:
            sys.exit('PNG 里没有 ccv3 / chara')
        for k, v in blobs.items():
            put(f'{k.lower()}.json', json.dumps(v, ensure_ascii=False, indent=1) + '\n')
        doc = blobs.get('ccv3') or blobs.get('chara')
    else:
        doc = json.load(open(a.src, encoding='utf-8'))
        put('chara.json', json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    d = doc.get('data', doc) if isinstance(doc, dict) else {}
    put('book.txt', fmt_book(book_entries(d)))
    g = [d.get('first_mes', '')] + list(d.get('alternate_greetings') or [])
    put('greet.txt', ''.join(f'===== 开场白 #{i}\n{t}\n' for i, t in enumerate(g)))
    put('ext.txt', json.dumps(d.get('extensions') or {}, ensure_ascii=False, indent=1) + '\n')
    put('desc.txt', ''.join(f'===== {k}\n{d.get(k) or ""}\n' for k in
                            ('name', 'description', 'personality', 'scenario', 'system_prompt', 'post_history_instructions', 'mes_example', 'creator_notes')))
    for w in a.world:
        wd = json.load(open(w, encoding='utf-8'))
        put('world_' + os.path.splitext(os.path.basename(w))[0] + '.txt', fmt_book(book_entries(wd)))
    json.dump(files, open(os.path.join(out, 'lines.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    world = (d.get('extensions') or {}).get('world')
    print('导出到', out); [print(f'  {k}: {v} 行') for k, v in files.items()]
    if world and not a.world:
        print(f'  注意：卡指向外部世界书「{world}」，请让用户导出一份副本后用 --world 再跑')


if __name__ == '__main__':
    main()
