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
    ap.add_argument('--name', required=True); ap.add_argument('--import', dest='urls', action='append', required=True,
                                                     help='可重复：按顺序尝试，前一个加载失败再换下一个（例如官方 CDN → 国内镜像）')
    ap.add_argument('--info', default='')
    ap.add_argument('--version', default='', help='写入 character_version：原版本号 + "+map<版本>"')
    a = ap.parse_args()
    if a.src == a.dst:
        sys.exit('输出不能覆盖源文件')
    chunks = read_chunks(open(a.src, 'rb').read())
    if len(a.urls) == 1: content = f"import '{a.urls[0]}';\n"
    else:   # 依次尝试：前一个线路连不上（例如没梯子时的官方 CDN）就换下一个
        content = ("// 地图脚本：依次尝试各线路，加载成功就停\n(async () => {\n  for (const u of " + json.dumps(a.urls) +
                   ") {\n    try { await import(u); return; } catch (e) { console.warn('[地图] 线路不可用，换下一个', u); }\n  }\n"
                   "  // 全部线路都失败：给一个提示，而不是悄悄没有悬浮按钮\n"
                   "  try { (window.toastr || window.parent.toastr).warning('地图加载失败（网络连不上 CDN），稍后刷新重试', '世界地图'); } catch (e) {}\n})();\n")
    entry = {
        'type': 'script', 'enabled': True, 'name': a.name, 'id': str(uuid.uuid4()),
        'content': content, 'info': a.info,
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
                if a.version:
                    base = str(data.get('character_version', '')).split('+map')[0]
                    data['character_version'] = f"{base}+map{a.version}" if base else f"map{a.version}"
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
    print(f'写入 {a.dst}：更新了 {touched} 个元数据块，脚本「{a.name}」→ {" → ".join(a.urls)}')


if __name__ == '__main__':
    main()
