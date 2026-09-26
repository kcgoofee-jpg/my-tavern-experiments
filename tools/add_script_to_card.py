#!/usr/bin/env python3
"""把一个酒馆助手脚本加进角色卡 PNG（同时改 chara 与 ccv3 两个元数据块），另存为新文件。

用法：
  python3 add_script_to_card.py <源卡.png> <输出.png> --name "【地图】世界地图" --import <脚本 URL>
同名脚本已存在时会被替换（便于更新版本号），不会重复添加。只用标准库。
"""
import argparse, base64, json, struct, sys, uuid, zlib


def read_chunks(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n', '不是 PNG 文件'
    i, out = 8, []
    while i < len(data):
        ln = struct.unpack('>I', data[i:i + 4])[0]
        out.append((data[i + 4:i + 8], data[i + 8:i + 8 + ln]))
        i += 12 + ln
    return out


def chunk(typ, body):
    return struct.pack('>I', len(body)) + typ + body + struct.pack('>I', zlib.crc32(typ + body) & 0xffffffff)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--name', required=True); ap.add_argument('--import', dest='url', required=True)
    ap.add_argument('--info', default='')
    a = ap.parse_args()
    if a.src == a.dst:
        sys.exit('输出不能覆盖源文件')
    chunks = read_chunks(open(a.src, 'rb').read())
    entry = {
        'type': 'script', 'enabled': True, 'name': a.name, 'id': str(uuid.uuid4()),
        'content': f"import '{a.url}';\n", 'info': a.info,
        'button': {'enabled': False, 'buttons': []}, 'data': {}, 'export_with': {'button': True, 'data': True},
    }
    out, touched = [], 0
    for typ, body in chunks:
        if typ == b'tEXt':
            key, _, val = body.partition(b'\0')
            if key in (b'chara', b'ccv3'):
                card = json.loads(base64.b64decode(val))
                data = card.get('data', card)
                th = data.setdefault('extensions', {}).setdefault('tavern_helper', {'scripts': [], 'variables': {}})
                scripts = th.setdefault('scripts', [])
                old = next((s for s in scripts if s.get('name') == a.name), None)
                if old: entry['id'] = old.get('id', entry['id']); scripts[scripts.index(old)] = entry
                else: scripts.append(entry)
                body = key + b'\0' + base64.b64encode(json.dumps(card, ensure_ascii=False).encode('utf-8'))
                touched += 1
        out.append((typ, body))
    if not touched:
        sys.exit('源文件里没有找到角色卡元数据（chara / ccv3）')
    with open(a.dst, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        for typ, body in out: f.write(chunk(typ, body))
    print(f'写入 {a.dst}：更新了 {touched} 个元数据块，脚本「{a.name}」→ {a.url}')


if __name__ == '__main__':
    main()
