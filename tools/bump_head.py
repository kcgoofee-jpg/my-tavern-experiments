#!/usr/bin/env python3
"""跟随分支的头指针：map/data/head.json = {build: 递增构建号, sha: 内容提交号, branch, at, art_sha: 最后改动 map/art 的提交, history: 最近 40 个构建 [{build, sha, at}]}，单独提交一次（消息「head #N」）。
为什么单独提交：文件写不进自己所在提交的提交号，所以 head.json 记的是它的父提交（内容提交）；两者只差 head.json 本身，按提交号加载内容完全一致。
跟随分支加载器（build_preview_script.py --follow）从 jsdmirror / jsDelivr / raw.githubusercontent 读分支路径上的这个文件（国内不用梯子），取构建号最大的。

用法（推送前最后一步，在 rebase 之后跑，否则 sha 指向一个不会推上去的提交）：
  python3 tools/bump_head.py            # 只写 + 提交
  python3 tools/bump_head.py --push     # fetch → rebase 到 origin/<分支> → 写 + 提交 → push；被拒就撤掉 head 提交重来（最多 3 次）
HEAD 已经是「head #N」提交时先撤掉它再重写（重复跑不会叠两个）。只用标准库。
"""
import argparse, datetime, json, os, subprocess, sys

PATH = 'map/data/head.json'
git = lambda *a, check=True: subprocess.run(['git', *a], capture_output=True, text=True, check=check)


def drop_old_bump():
    msg = git('log', '-1', '--format=%s').stdout.strip()
    files = git('show', '--name-only', '--format=', 'HEAD').stdout.split()
    if msg.startswith('head #') and files == [PATH]: git('reset', '-q', '--hard', 'HEAD^')


HISTORY = 40


def art_sha(ref='HEAD'):
    """N14 a：最后一次改动 map/art 的提交（完整 40 位）。查看器的 art/ 底图按这个提交号取，美术没变就一直是同一个缓存键（不随每个 head 变冷）。"""
    return git('log', '-1', '--format=%H', ref, '--', 'map/art', check=False).stdout.strip()


def history_of(prev, h):
    """I-23：最近 HISTORY 个构建的 {build, sha(12 位), at}（不含当前这一个，当前的在顶层）。按提交号加载（钉住的脚本）的人据此从提交号找回构建号。"""
    rows = [r for r in (prev.get('history') or []) if isinstance(r, dict) and isinstance(r.get('build'), int) and r.get('sha')]
    if isinstance(prev.get('build'), int) and prev.get('sha'): rows.append({'build': prev['build'], 'sha': prev['sha'][:12], **({'at': prev['at']} if prev.get('at') else {})})
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: -r['build']):
        if r['build'] in seen or r['build'] >= h['build']: continue
        seen.add(r['build']); out.append({'build': r['build'], 'sha': str(r['sha'])[:12], **({'at': r['at']} if r.get('at') else {})})
    return out[:HISTORY]


def bump(branch):
    drop_old_bump()
    try: prev = json.loads(git('show', f'HEAD:{PATH}').stdout)
    except Exception: prev = {}
    n = prev.get('build', 0) if isinstance(prev.get('build'), int) else 0
    try: rn = json.loads(git('show', f'origin/{branch}:{PATH}', check=False).stdout or '{}').get('build', 0)
    except Exception: rn = 0
    h = {'build': max(n, rn) + 1, 'sha': git('rev-parse', 'HEAD').stdout.strip(), 'branch': branch,
         'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    art = art_sha()
    if art: h['art_sha'] = art
    h['history'] = history_of(prev, h)
    with open(PATH, 'w', encoding='utf-8') as f: json.dump(h, f, ensure_ascii=False); f.write('\n')
    git('add', PATH); git('commit', '-q', '-m', f"head #{h['build']}", '--', PATH)
    return h


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--push', action='store_true'); ap.add_argument('--branch')
    a = ap.parse_args()
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    br = a.branch or git('rev-parse', '--abbrev-ref', 'HEAD').stdout.strip()
    if br == 'HEAD' and not a.branch: sys.exit('detached HEAD：用 --branch 指定分支')
    if git('status', '--porcelain', '--untracked-files=no').stdout.strip(): sys.exit('工作区有未提交的改动，先提交')
    for i in range(3 if a.push else 1):
        if a.push:
            drop_old_bump(); git('fetch', '-q', 'origin', br)
            if git('rebase', '-q', f'origin/{br}', check=False).returncode: git('rebase', '--abort', check=False); sys.exit('rebase 冲突，手动处理后再跑')
        h = bump(br); print(f"head #{h['build']} → {h['sha'][:12]}")
        if not a.push: return
        r = git('push', 'origin', f'HEAD:refs/heads/{br}', check=False)
        if r.returncode == 0: print(f'已推送 {br}'); return
        print(r.stderr.strip(), file=sys.stderr)
    sys.exit('推送 3 次都被拒')


if __name__ == '__main__':
    main()
