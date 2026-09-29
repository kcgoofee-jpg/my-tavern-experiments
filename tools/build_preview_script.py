#!/usr/bin/env python3
"""生成「地图预览」酒馆助手脚本：指向某个 git ref 的 map/tavern/eden-map.js，导入酒馆助手即可试用未发版的地图。

用法：
  python3 tools/build_preview_script.py <git ref>        # 例如提交号 aa16346、标签 map-v0.9.1
  python3 tools/build_preview_script.py <git ref> --out 目录
  python3 tools/build_preview_script.py --follow cloud/tc-mid-low   # 可复用：每次打开时取该分支最新提交，推送后不用重新导入
  python3 tools/build_preview_script.py --tag map-v0.9.6            # 正式版加载器（0.9.6 起：每次加载最新正式版，离线退回该标签；小修补丁 map-v0.9.6.1；新系列 map-s2-v0.1.0）；：钉在发版标签（不改角色卡时随世界书附加条目一起发给用户）
输出：~/Downloads/eden-map/eden-map-preview-<ref>.json；--tag 输出 eden-map-v<版本>.json（单个脚本 JSON，酒馆助手「导入脚本」可直接导入；文件名 C3 英文化，酒馆里显示的脚本名不变）。
--tag 不创建标签：标签不存在（本地与 origin 都没有）、或与 VERSION 不一致时**退出码 2、不产出文件**（2026-09-27 起；以前只提醒）；发版前先打标签、推送、预热 CDN。
脚本内容与卡内相同（tools/add_script_to_card.py 的多线路写法）：依次尝试国内镜像 jsdmirror → 官方 jsDelivr，加载成功就停。
注意：jsDelivr 对分支名会缓存（最长约 12 小时），带「/」的分支名也可能解析不了；预览最好用提交号或标签。只用标准库。
"""
import argparse, json, os, re, subprocess, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verlib

REPO = 'kcgoofee-jpg/my-tavern-experiments'
HOSTS = ['cdn.jsdmirror.com', 'cdn.jsdelivr.net']   # 与卡内顺序一致：先国内镜像，再官方 CDN


# 原作署名（作者同意二次创作的条件：发布时首帖附原作帖链接，2026-09-27 经 Discord 同意）
CREDIT = '原作角色卡：Yehehua（类脑社区），原作发布帖 https://discord.com/channels/1380075940285124724/1534464824141025321 。本地图是经作者同意的二次创作。'

def about(channel, ref):
    """v0.9.6：烘进脚本的版本信息（VERSION + map/data/build.json），地图设置「关于」与开场自检页脚显示；运行时以线路上的 build.json 为准。"""
    ver = open('VERSION', encoding='utf-8').read().strip() if os.path.exists('VERSION') else ''
    try: code = json.load(open('map/data/build.json', encoding='utf-8')).get('code', '')
    except Exception: code = ''
    return {'version': ver, 'code': code, 'channel': channel, 'ref': ref}


def stamp(info):
    return 'window.__edenMapScript = ' + json.dumps(info, ensure_ascii=False) + ';\n'


def pack_stamp(pid):
    """设定包（通用化）：脚本在导入 eden-map.js 前写 window.__tcPack（清单 + 事件分类 + 聊天变量），宿主同步可用。eden / 不给 = 空串（与以前逐字相同）。"""
    if not pid or pid == 'eden': return ''
    if not re.fullmatch(r'[a-z][a-z0-9_-]{1,31}', pid): sys.exit(f'包 id 不合法：{pid!r}')
    d = os.path.join('map', 'packs', pid)
    if not os.path.exists(os.path.join(d, 'manifest.json')): sys.exit(f'没有这个包：{d}/manifest.json（先 python3 tools/new_pack.py {pid} …）')
    if subprocess.run([sys.executable, 'tools/check_pack.py', pid], capture_output=True).returncode: sys.exit(f'包 {pid} 没通过 tools/check_pack.py，先修好')
    if subprocess.run(['git', 'ls-files', '--error-unmatch', os.path.join(d, 'manifest.json')], capture_output=True).returncode:
        print(f'提醒：{d} 还没提交。脚本从 CDN 按提交号取包，先提交并推送到 cdn.repo 指的仓库，再用那个提交号生成', file=sys.stderr)
    man = json.load(open(os.path.join(d, 'manifest.json'), encoding='utf-8'))
    ev = man['data'].get('events')
    events = json.load(open(os.path.join(d, ev), encoding='utf-8')) if ev and ev != 'builtin' else None
    cv = (man.get('chat') or {}).get('var') or 'tc_' + pid.replace('-', '_')
    info = {'id': pid, 'chatVar': cv, 'manifest': man, 'events': events}
    return 'window.__tcPack = ' + json.dumps(info, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c') + ';\n'


def packed(d, pid):
    """给脚本 JSON 套上包：内容前加 __tcPack、名字与 id 带上包 id（和 eden 的脚本可以并存导入，但同时只该启用一个）。"""
    if not pid or pid == 'eden': return d
    d['content'] = pack_stamp(pid) + d['content']
    d['name'] = d['name'].replace('【地图】', f'【地图·{pid}】', 1)
    d['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, f'tc-pack:{pid}:' + d['id']))
    d['info'] = f'设定包 {pid}。' + d['info'].replace(CREDIT, '')
    return d


def build(ref, channel='ref'):
    urls = [f'https://{h}/gh/{REPO}@{ref}/map/tavern/eden-map.js' for h in HOSTS]
    content = stamp(about(channel, ref)) + ("// 地图脚本：依次尝试各线路，加载成功就停\n(async () => {\n  for (const u of " + json.dumps(urls) +
               ") {\n    try { await import(u); return; } catch (e) { console.warn('[地图] 线路不可用，换下一个', u); }\n  }\n})();\n")
    return {
        'type': 'script', 'enabled': True, 'name': f'【地图】世界地图（预览 {ref}）',
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'eden-map-preview:{ref}')),   # 同一个 ref 重复生成时 id 不变，重新导入会覆盖而不是多一份
        'content': content,
        'info': f'地图预览版：加载 {REPO}@{ref} 的 map/tavern/eden-map.js（jsdmirror → jsDelivr）。'
                '试用完请删除或停用，避免和卡内的「【地图】世界地图」同时运行（两个悬浮按钮会互相替换）。' + CREDIT,
        'button': {'enabled': False, 'buttons': []}, 'data': {}, 'export_with': {'button': True, 'data': True},
    }


LOADER = r"""// 伊甸地图正式版加载器（0.9.6 起）：每次加载取最新正式版标签（map-v* / map-s<n>-v*），加载那个标签的代码；
// 取不到（离线 / 接口挂了）用上次成功的，再不行用生成时烘进来的标签。设置「锁定当前版本」（edenMapLockTag）时固定用锁定的标签。
(async () => {
  const REPO = %(repo)s, BAKED = %(tag)s, PTR = %(ptr)s, HOSTS = %(hosts)s, KEY = 'edenMapLatestTag';
  const imp = window.__edenMapImport || (u => import(u));
  const RE = /^map-(?:s(\d+)-)?v(\d+\.\d+\.\d+(?:\.\d+)?)$/;
  const key = t => { const m = RE.exec(String(t || '')); if (!m) return null; const p = m[2].split('.').map(Number); while (p.length < 4) p.push(0); return [+(m[1] || 1), ...p]; };
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 5; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };
  const get = async u => { const c = new AbortController(), to = setTimeout(() => c.abort(), 4000);
    try { const r = await fetch(u, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: c.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(to); } };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  let tag = key(ls('edenMapLockTag')) ? ls('edenMapLockTag') : null, locked = !!tag;
  if (!tag) {
    const j = await get(`https://data.jsdelivr.com/v1/packages/gh/${REPO}?t=${Date.now()}`);
    tag = ((j && j.versions) || []).map(v => (typeof v === 'string' ? v : v && v.version)).filter(key).sort(cmp).pop() || null;
    for (const h of tag ? [] : HOSTS) { const p = await get(`https://${h}/gh/${REPO}@${PTR}/map/data/latest.json?t=${Date.now()}`); if (p && key(p.tag)) { tag = p.tag; break; } }
    if (!tag && key(ls(KEY))) tag = ls(KEY);
    if (!tag || cmp(tag, BAKED) < 0) tag = BAKED;   // 不会比生成时的版本还旧
    ls(KEY, tag);
  }
  try { const m = RE.exec(tag); Object.assign(window.__edenMapScript, { ref: tag, version: (+(m[1] || 1) > 1 ? 'S' + m[1] + ':' : '') + m[2], locked }); } catch (e) {}
  for (const t of tag === BAKED ? [tag] : [tag, BAKED]) for (const h of HOSTS) {
    const u = `https://${h}/gh/${REPO}@${t}/map/tavern/eden-map.js`;
    try { await imp(u); return; } catch (e) { console.warn('[地图] 线路不可用，换下一个', u); }
  }
})();
"""


def build_release(tag, pointer='main'):
    """正式版（0.9.6 起）：加载器——每次加载解析最新正式版标签再加载，离线退回烘进来的标签；id 固定，导入新版时覆盖旧版而不是多一份。
    pointer：latest.json 所在分支（jsDelivr 标签列表取不到时的第二来源；tools/ship.sh --release 更新并清缓存）。"""
    ver = verlib.ver_of_tag(tag) or tag
    shown = verlib.display(ver) if verlib.parse(ver) else ver   # v0.9.6 / v0.9.6.1 / S2 v0.1.0
    d = build(tag, 'latest')
    d['content'] = stamp(about('latest', tag)) + LOADER % {'repo': json.dumps(REPO), 'tag': json.dumps(tag), 'ptr': json.dumps(pointer), 'hosts': json.dumps(HOSTS)}
    d.update(name='【地图】伊甸地图', id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'eden-map-release')),
             info=f'伊甸地图（外挂脚本，不改角色卡；生成于 {shown}）：每次打开自动加载最新正式版（{REPO} 的 map-v* 标签），刷新酒馆即更新，不用重新导入；'
                  '连不上时用上次的版本。地图设置「关于」里可以「锁定当前版本」。配合世界书「伊甸地图·世界书附加条目」使用。请停用各种预览版地图脚本，避免两个悬浮按钮互相替换。' + CREDIT)
    return d


def follow_src():
    """map/tavern/follow.mjs 的 resolveFollow（去掉 export 与注释行），原样嵌进加载器：加载器和地图里的 followCheck 用同一套解析顺序。"""
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'map', 'tavern', 'follow.mjs'), encoding='utf-8').read()
    return '\n'.join(l for l in src.replace('export async function', 'async function').splitlines() if not l.startswith('//')).strip()


def head_of(ref):
    """生成时的兜底：ref 上的 map/data/head.json（没有 → 构建号 0、提交号 = ref 解析出的提交）。"""
    try: h = json.loads(subprocess.run(['git', 'show', f'{ref}:map/data/head.json'], capture_output=True, text=True, check=True).stdout)
    except Exception: h = {}
    return h


def build_follow(branch, fallback, baked=None):
    """跟随分支（2026-09-28 改）：分支路径上的 map/data/head.json（构建号 + 内容提交号，tools/bump_head.py 推送前写）
    从 jsdmirror / jsDelivr / raw.githubusercontent 并行取、取构建号最大的，都不行问 GitHub 接口；本机记住的只在构建号更大时用。
    再按提交号加载（提交号不可变，绕开 jsDelivr 对分支名的缓存；带「/」的分支名 jsDelivr 解析接口返回 null，不再用它）。"""
    baked = baked if isinstance(baked, dict) and isinstance(baked.get('build'), int) and baked.get('sha') else {'build': 0, 'sha': fallback}
    js = """// 地图预览（跟随分支 %(b)s）：取分支最新构建（head.json），再按提交号依次尝试各线路
(async () => {
  const REPO = %(repo)s, BR = %(b)s, KEY = 'edenMapFollowHead', HOSTS = %(hosts)s, BAKED = %(baked)s;
  const imp = window.__edenMapImport || (u => import(u));
  const getJson = async u => { const c = new AbortController(), to = setTimeout(() => c.abort(), 5000);
    try { const r = await (window.__edenMapFetch || fetch)(u, { cache: 'no-store', credentials: 'omit', signal: c.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(to); } };
  %(resolve)s
  let stored = null; try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!stored || !(stored.build >= BAKED.build)) stored = { ...BAKED, source: 'baked' };
  const h = (await resolveFollow(REPO, BR, getJson, stored)) || stored;
  if (h.source !== 'cache' && h.source !== 'baked') try { localStorage.setItem(KEY, JSON.stringify({ build: h.build, sha: h.sha })); } catch (e) {}
  const sha = String(h.sha).slice(0, 12);
  try { window.__edenMapScript = Object.assign(window.__edenMapScript || {}, { sha, build: h.build, source: h.source === 'cache' && stored.source === 'baked' ? 'baked' : h.source }); } catch (e) {}
  console.info('[地图] 预览构建', '#' + h.build, sha, h.source);
  for (const s of sha === BAKED.sha.slice(0, 12) ? [sha] : [sha, BAKED.sha.slice(0, 12)]) for (const x of HOSTS) {
    const u = `https://${x}/gh/${REPO}@${s}/map/tavern/eden-map.js`;
    try { await imp(u); return; } catch (e) { console.warn('[地图] 线路不可用，换下一个', u); }
  }
})();
""" % {'b': json.dumps(branch), 'repo': json.dumps(REPO), 'hosts': json.dumps(HOSTS), 'baked': json.dumps({'build': baked['build'], 'sha': baked['sha']}),
       'resolve': follow_src().replace('\n', '\n  ')}
    return {
        'type': 'script', 'enabled': True, 'name': f'【地图】世界地图（预览 · 跟随 {branch}）',
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'eden-map-preview-follow:{branch}')),
        'content': stamp(about('follow', branch)) + js,
        'info': f'地图预览版（可复用）：每次打开时加载 {REPO} 分支 {branch} 的最新构建（国内镜像优先，不需要梯子）。推送新版本后刷新酒馆即可，不用重新导入。'
                '试用完请删除或停用，避免和卡内的「【地图】世界地图」同时运行。' + CREDIT,
        'button': {'enabled': False, 'buttons': []}, 'data': {}, 'export_with': {'button': True, 'data': True},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ref', nargs='?', help='git 提交号 / 标签 / 分支名')
    ap.add_argument('--follow', metavar='分支', help='生成跟随分支最新提交的可复用预览脚本')
    ap.add_argument('--tag', metavar='标签', help='生成钉在发版标签的正式脚本（如 map-v0.9.1；不创建标签）')
    ap.add_argument('--pointer', help='--tag：latest.json 所在分支（默认当前分支；要和 tools/ship.sh --release 发版时的分支一致）')
    ap.add_argument('--pack', help='设定包 id（map/packs/<id>；默认 eden = 原来的脚本）')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/eden-map'), help='输出目录（默认 ~/Downloads/eden-map）')
    a = ap.parse_args()
    if a.follow:
        import subprocess
        fb = subprocess.run(['git', 'rev-parse', 'origin/' + a.follow], capture_output=True, text=True).stdout.strip() or a.follow
        os.makedirs(a.out, exist_ok=True)
        path = os.path.join(a.out, f"eden-map-preview-follow-{a.follow.replace('/', '-')}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(packed(build_follow(a.follow, fb, head_of('origin/' + a.follow)), a.pack), f, ensure_ascii=False, indent=2); f.write('\n')
        print(f'写入 {path}（兜底提交 {fb[:12]}，构建 #{head_of("origin/" + a.follow).get("build", 0)}）'); return
    if a.tag:
        import subprocess
        tag = a.tag.strip()
        if not verlib.ver_of_tag(tag): sys.exit(f'发版标签应形如 map-v0.9.1（小修补丁 map-v0.9.1.1；新系列 map-s2-v0.1.0）：{a.tag!r}')
        local = subprocess.run(['git', 'rev-parse', '-q', '--verify', f'refs/tags/{tag}'], capture_output=True, text=True).returncode == 0
        remote = local or bool(subprocess.run(['git', 'ls-remote', '--tags', 'origin', tag], capture_output=True, text=True).stdout.strip())
        # 2026-09-27 接手 review：以前标签不存在只提醒、仍然 exit 0，生成出来的脚本地址 404，用户那边只看到一句 console.warn。
        # 现在标签不存在、或标签和 VERSION 不一致 → 退出码 2，不产出交付物。
        ver = open('VERSION', encoding='utf-8').read().strip() if os.path.exists('VERSION') else ''
        if not remote: print(f'发版脚本中止：标签 {tag} 本地与 origin 都没有；先打标签、推送、预热 CDN（bash tools/smoke.sh --cdn {tag}）', file=sys.stderr); sys.exit(2)
        want = verlib.tag_of(ver) if ver and verlib.parse(ver) else f'map-v{ver}'
        if ver and tag != want: print(f'发版脚本中止：标签 {tag} 与 VERSION（{ver}，应是 {want}）不一致', file=sys.stderr); sys.exit(2)
        os.makedirs(a.out, exist_ok=True)
        path = os.path.join(a.out, f"eden-map-{verlib.display(verlib.ver_of_tag(tag))}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(packed(build_release(tag, a.pointer or (subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'main')), a.pack), f, ensure_ascii=False, indent=2); f.write('\n')
        print(f'写入 {path}'); return
    if not a.ref: ap.error('需要 ref、--follow 或 --tag')
    ref = a.ref.strip()
    if not ref or not re.fullmatch(r'[\w.\-/]+', ref):
        sys.exit(f'ref 只能包含字母、数字、. _ - /：{a.ref!r}')
    if '/' in ref:
        print(f'提醒：{ref} 带「/」，jsDelivr 可能解析不了；建议改用提交号（git rev-parse --short {ref}）', file=sys.stderr)
    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, f"【地图{'·' + a.pack if a.pack and a.pack != 'eden' else ''}】预览-{ref.replace('/', '-')}.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(packed(build(ref), a.pack), f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'写入 {path}')


if __name__ == '__main__':
    main()
