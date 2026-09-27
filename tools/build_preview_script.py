#!/usr/bin/env python3
"""生成「地图预览」酒馆助手脚本：指向某个 git ref 的 map/tavern/eden-map.js，导入酒馆助手即可试用未发版的地图。

用法：
  python3 tools/build_preview_script.py <git ref>        # 例如提交号 aa16346、标签 map-v0.9.1
  python3 tools/build_preview_script.py <git ref> --out 目录
  python3 tools/build_preview_script.py --follow cloud/tc-mid-low   # 可复用：每次打开时取该分支最新提交，推送后不用重新导入
  python3 tools/build_preview_script.py --tag map-v0.9.1            # 正式发版脚本：钉在发版标签（不改角色卡时随世界书附加条目一起发给用户）
输出：~/Downloads/酒馆/脚本/【地图】预览-<ref>.json；--tag 输出 【地图】伊甸地图 v<版本>.json（单个脚本 JSON，酒馆助手「导入脚本」可直接导入）。
--tag 不创建标签：标签不存在（本地与 origin 都没有）时只提醒；发版前先打标签、推送、预热 CDN。
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


def build_release(tag):
    """正式版：与 build() 同样的多线路加载，钉在发版标签；id 固定，下个版本导入时覆盖旧版而不是多一份。"""
    ver = tag[len('map-v'):] if tag.startswith('map-v') else tag
    d = build(tag)
    d.update(name=f'【地图】伊甸地图 v{ver}', id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'eden-map-release')),
             info=f'伊甸地图 v{ver}（外挂脚本，不改角色卡）：加载 {REPO}@{tag} 的 map/tavern/eden-map.js（jsdmirror → jsDelivr）。'
                  '配合世界书「伊甸地图·世界书附加条目」使用。升级时导入新版同名脚本会覆盖本条；请停用各种预览版地图脚本，避免两个悬浮按钮互相替换。')
    return d


def build_follow(branch, fallback):
    """跟随分支：启动时解析分支最新提交号（GitHub API → jsDelivr 解析接口 → 上次成功的 → 生成时的提交），再按提交号加载。
    按提交号加载可以绕开 jsDelivr 对分支名的缓存。"""
    js = """// 地图预览（跟随分支 %(b)s）：取最新提交号，再依次尝试各线路
(async () => {
  const REPO = %(repo)s, BR = %(b)s, KEY = 'edenMapPreviewSha', HOSTS = %(hosts)s;
  const tryJson = async (u, pick) => { try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) return pick(await r.json()); } catch (e) {} return null; };
  let sha = await tryJson(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(BR)}`, j => j.sha)
         || await tryJson(`https://data.jsdelivr.com/v1/packages/gh/${REPO}/resolved?specifier=${encodeURIComponent(BR)}`, j => j.version);
  try { if (sha) localStorage.setItem(KEY, sha); else sha = localStorage.getItem(KEY); } catch (e) {}
  sha = (sha || %(fb)s).slice(0, 12);
  console.info('[地图] 预览提交', sha);
  for (const h of HOSTS) {
    const u = `https://${h}/gh/${REPO}@${sha}/map/tavern/eden-map.js`;
    try { await import(u); return; } catch (e) { console.warn('[地图] 线路不可用，换下一个', u); }
  }
})();
""" % {'b': json.dumps(branch), 'repo': json.dumps(REPO), 'hosts': json.dumps(HOSTS), 'fb': json.dumps(fallback)}
    return {
        'type': 'script', 'enabled': True, 'name': f'【地图】世界地图（预览 · 跟随 {branch}）',
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'eden-map-preview-follow:{branch}')),
        'content': js,
        'info': f'地图预览版（可复用）：每次打开时加载 {REPO} 分支 {branch} 的最新提交。推送新版本后刷新酒馆即可，不用重新导入。'
                '试用完请删除或停用，避免和卡内的「【地图】世界地图」同时运行。',
        'button': {'enabled': False, 'buttons': []}, 'data': {}, 'export_with': {'button': True, 'data': True},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ref', nargs='?', help='git 提交号 / 标签 / 分支名')
    ap.add_argument('--follow', metavar='分支', help='生成跟随分支最新提交的可复用预览脚本')
    ap.add_argument('--tag', metavar='标签', help='生成钉在发版标签的正式脚本（如 map-v0.9.1；不创建标签）')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/酒馆/脚本'), help='输出目录（默认 ~/Downloads/酒馆/脚本）')
    a = ap.parse_args()
    if a.follow:
        import subprocess
        fb = subprocess.run(['git', 'rev-parse', 'origin/' + a.follow], capture_output=True, text=True).stdout.strip() or a.follow
        os.makedirs(a.out, exist_ok=True)
        path = os.path.join(a.out, f"【地图】预览-跟随-{a.follow.replace('/', '-')}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(build_follow(a.follow, fb), f, ensure_ascii=False, indent=2); f.write('\n')
        print(f'写入 {path}（兜底提交 {fb[:12]}）'); return
    if a.tag:
        import subprocess
        tag = a.tag.strip()
        if not re.fullmatch(r'map-v\d+\.\d+\.\d+', tag): sys.exit(f'发版标签应形如 map-v0.9.1：{a.tag!r}')
        local = subprocess.run(['git', 'rev-parse', '-q', '--verify', f'refs/tags/{tag}'], capture_output=True, text=True).returncode == 0
        remote = local or bool(subprocess.run(['git', 'ls-remote', '--tags', 'origin', tag], capture_output=True, text=True).stdout.strip())
        if not remote: print(f'提醒：标签 {tag} 还不存在（本地与 origin 都没有），脚本导入后会加载失败；先打标签、推送并预热 CDN', file=sys.stderr)
        os.makedirs(a.out, exist_ok=True)
        path = os.path.join(a.out, f"【地图】伊甸地图 v{tag[len('map-v'):]}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(build_release(tag), f, ensure_ascii=False, indent=2); f.write('\n')
        print(f'写入 {path}'); return
    if not a.ref: ap.error('需要 ref、--follow 或 --tag')
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
