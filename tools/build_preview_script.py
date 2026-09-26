#!/usr/bin/env python3
"""生成「地图预览」酒馆助手脚本：指向某个 git ref 的 map/tavern/eden-map.js，导入酒馆助手即可试用未发版的地图。

用法：
  python3 tools/build_preview_script.py <git ref>        # 例如提交号 aa16346、标签 map-v0.9.1
  python3 tools/build_preview_script.py <git ref> --out 目录
输出：~/Downloads/酒馆/脚本/【地图】预览-<ref>.json（单个脚本 JSON，酒馆助手「导入脚本」可直接导入）。
脚本内容与卡内相同（tools/add_script_to_card.py 的多线路写法）：依次尝试国内镜像 jsdmirror → 官方 jsDelivr，加载成功就停。
注意：jsDelivr 对分支名会缓存（最长约 12 小时），带「/」的分支名也可能解析不了；预览最好用提交号或标签。只用标准库。
"""
import argparse, json, os, re, sys, uuid

REPO = 'kcgoofee-jpg/my-tavern-experiments'
HOSTS = ['cdn.jsdmirror.com', 'cdn.jsdelivr.net']   # 与卡内顺序一致：先国内镜像，再官方 CDN


def build(ref):
    urls = [f'https://{h}/gh/{REPO}@{ref}/map/tavern/eden-map.js' for h in HOSTS]
    content = ("// 地图脚本：依次尝试各线路，加载成功就停\n(async () => {\n  for (const u of " + json.dumps(urls) +
               ") {\n    try { await import(u); return; } catch (e) { console.warn('[地图] 线路不可用，换下一个', u); }\n  }\n})();\n")
    return {
        'type': 'script', 'enabled': True, 'name': f'【地图】世界地图（预览 {ref}）',
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'eden-map-preview:{ref}')),   # 同一个 ref 重复生成时 id 不变，重新导入会覆盖而不是多一份
        'content': content,
        'info': f'地图预览版：加载 {REPO}@{ref} 的 map/tavern/eden-map.js（jsdmirror → jsDelivr）。'
                '试用完请删除或停用，避免和卡内的「【地图】世界地图」同时运行（两个悬浮按钮会互相替换）。',
        'button': {'enabled': False, 'buttons': []}, 'data': {}, 'export_with': {'button': True, 'data': True},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ref', help='git 提交号 / 标签 / 分支名')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/酒馆/脚本'), help='输出目录（默认 ~/Downloads/酒馆/脚本）')
    a = ap.parse_args()
    ref = a.ref.strip()
    if not ref or not re.fullmatch(r'[\w.\-/]+', ref):
        sys.exit(f'ref 只能包含字母、数字、. _ - /：{a.ref!r}')
    if '/' in ref:
        print(f'提醒：{ref} 带「/」，jsDelivr 可能解析不了；建议改用提交号（git rev-parse --short {ref}）', file=sys.stderr)
    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, f"【地图】预览-{ref.replace('/', '-')}.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(build(ref), f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'写入 {path}')


if __name__ == '__main__':
    main()
