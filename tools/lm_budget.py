#!/usr/bin/env python3
"""RENDER-B7（glb:budget:*）地标预算重导出驱动：一个命令跑完一个地标的 计划 → 队列任务 → KTX2/meshopt → 落盘。

预算口径（D41 B3）：桌面档 <id>.glb 4–8 MB（主力地标取上限）、贴图 1–2K（基色 ETC1S，法线 UASTC，ORM），
网格 meshopt；手机档 <id>_low.glb ≤ 2 MB、贴图 512–1K（沿用旧文件名，viewer3d 按 TIER 选档）。
旧预算来自 map/props/<id>/manifest.json 的 budgets，缺了回退 blender/landmarks/export_glb.py 的 BUDGET 表。

用法（仓库根目录；等待队列走后台，不要前台轮询）：
  python3 tools/lm_budget.py list [upper|mid|low|sites]
  python3 tools/lm_budget.py auto <id>        # 计划 + 提交 + 等待 + 压缩 + 体积自查（超带自动调档重跑，最多 2 次）+ 落盘
环境：B7_WORK（工作目录，默认 logs/campaign/b7）、KTX_BIN（toktx 所在目录）、B7_FORCE=1 重跑已完成的。
"""
import ast
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
# 队列的书账（pending/running/done）永远在主工作树：worktree 里提交的任务也在主工作树的 logs/queue/ 排队
QROOT = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                       capture_output=True, text=True).stdout.strip()
QROOT = os.path.dirname(QROOT) if os.path.basename(QROOT) == '.git' else QROOT
QUEUE_DIR = os.path.join(QROOT, 'logs', 'queue')
WORK = os.path.abspath(os.environ.get('B7_WORK') or os.path.join(ROOT, 'logs', 'campaign', 'b7'))
KTX_BIN = os.path.abspath(os.environ.get('KTX_BIN') or os.path.expanduser('~/eden-render/ktx/bin'))
G = 'npx', '--yes', '@gltf-transform/cli'
PARENTS = {
    'upper': ('tc_upper',),
    'mid': ('tc_mid',),
    'low': ('tc_low',),
    'sites': ('world', 'site_kavalierki', 'site_fief1', 'site_fief2', 'site_fief3', 'site_fief4', 'site_fief5',
              'site_highland', 'yuanyu_city', 'yuanyu_sanctum', 'eden_estate'),
}
SPECIAL = {'dairy': ('blender/props/dairy_parlour/build.py', 'blend'),
           'holy_mountain': ('blender/world/yuanyu_holy_mount.py', 'save')}
STEPS = (2048, 1024, 512, 256)
STD_MB, LOW_MB = (4.0, 8.0), (0.9, 2.0)
# 体积估算常数收口在 export_budget.py（真实源三角数在那里才知道）


def maps_ids():
    m = json.load(open(os.path.join(ROOT, 'map', 'data', 'maps.json')))['maps']
    out = {}
    for lane, parents in PARENTS.items():
        for mid, v in m.items():
            if v.get('parent') in parents and v.get('viewer3d'):
                out.setdefault(v['viewer3d'], lane)
    return out


def groups_of(lid):
    """该模型真实存在的组名：先取 manifest.json 的 groups（walls/site 等角色下的组名清单），缺了再从 build.py 的 Batch() 调用里抓。"""
    man = os.path.join(ROOT, 'map', 'props', lid, 'manifest.json')
    names = []
    if os.path.exists(man):
        g = json.load(open(man)).get('groups') or {}
        for v in g.values():
            if isinstance(v, list):
                names += [x for x in v if isinstance(x, str)]
    if not names:
        pat = re.compile(r"Batch\('([A-Za-z0-9_]+)'\)")
        build = os.path.join(ROOT, 'blender', 'landmarks', lid, 'build.py')
        files = [build] if os.path.exists(build) else []
        if os.path.exists(build):
            for m in re.finditer(r'^import (\w+) as \w+|^from (\w+) import', open(build).read(), re.M):
                sib = os.path.join(ROOT, 'blender', 'landmarks', (m.group(1) or m.group(2)) + '.py')
                if os.path.exists(sib):
                    files.append(sib)
        for f in files:
            names += pat.findall(open(f).read())
    else:   # 清单之外还有组（老清单常漏）：并上 build.py 里的 Batch 名
        build = os.path.join(ROOT, 'blender', 'landmarks', lid, 'build.py')
        if os.path.exists(build):
            pat = re.compile(r"Batch\('([A-Za-z0-9_]+)'\)")
            names += pat.findall(open(build).read())
            for m in re.finditer(r'^import (\w+) as \w+|^from (\w+) import', open(build).read(), re.M):
                sib = os.path.join(ROOT, 'blender', 'landmarks', (m.group(1) or m.group(2)) + '.py')
                if os.path.exists(sib):
                    names += pat.findall(open(sib).read())
    return [n for n in dict.fromkeys(names) if not n.startswith('bg_')]


def old_budgets(lid):
    man = os.path.join(ROOT, 'map', 'props', lid, 'manifest.json')
    if os.path.exists(man):
        b = json.load(open(man)).get('budgets')
        if isinstance(b, dict) and b:
            return {k: list(v) for k, v in b.items() if isinstance(v, (list, tuple)) and len(v) >= 2}
    src = open(os.path.join(ROOT, 'blender', 'landmarks', 'export_glb.py'), encoding='utf-8').read()
    tree = ast.parse(src[src.index('BUDGET = {'):src.index('\n\n', src.index('BUDGET = {'))])
    tab = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            for k, v in zip(node.keys, node.values):
                if isinstance(k, ast.Constant) and isinstance(v, (ast.Tuple, ast.List)):
                    tab[k.value] = [ast.literal_eval(e) for e in v.elts]
            break
    names = groups_of(lid)
    have = {k: list(v) for k, v in tab.items() if k in set(names)}
    for n in names:   # 组名不在旧表里的给缺省（同 export_glb.py 的口径）
        have.setdefault(n, [20000, 1024])
    return have or tab


def hero_of(lid):
    p = os.path.join(ROOT, 'map', 'props', lid, lid + '.glb')
    return os.path.exists(p) and os.path.getsize(p) >= 2.5 * 1048576


def plan(lid, lane):
    """贴图下限档（驱动只给下限；真实档位由 export_budget.py 按源三角数和体积带自定）。"""
    old = old_budgets(lid)
    w = os.path.join(WORK, lid)
    os.makedirs(w, exist_ok=True)
    floors_std = {k: [0, min(2048, int(v[1]))] for k, v in old.items()}
    floors_low = {k: [0, 1024 if int(v[1]) >= 2048 else 512] for k, v in old.items()}
    json.dump(floors_std, open(os.path.join(w, 'budget_std.json'), 'w'))
    json.dump(floors_low, open(os.path.join(w, 'budget_low.json'), 'w'))
    json.dump({'hero': hero_of(lid), 'lane': lane}, open(os.path.join(w, 'plan.json'), 'w'))
    return floors_std, floors_low


def submit(lid, std_band, low_band):
    build, blend_flag = SPECIAL.get(lid, ('blender/landmarks/%s/build.py' % lid, 'blend'))
    w = os.path.join(WORK, lid)
    rel = lambda p: os.path.relpath(p, ROOT)   # 队列 / 云端只认仓库相对路径（render_preflight abs_out）
    expr = ("import runpy; runpy.run_path('blender/landmarks/budget_job.py', run_name='__main__')")
    bl = ['-b', '--factory-startup', '--python-expr', expr, '--',
          '--id', lid, '--build', build, '--work', rel(w), '--blend-flag', blend_flag,
          '--budget-std', rel(os.path.join(w, 'budget_std.json')), '--budget-low', rel(os.path.join(w, 'budget_low.json')),
          '--fit-std-lo', str(std_band[0]), '--fit-std-hi', str(std_band[1]),
          '--fit-low-lo', str(low_band[0]), '--fit-low-hi', str(low_band[1]),
          '--probe', rel(os.path.join(w, 'probe.png')),
          '--out-std', rel(os.path.join(w, lid + '_std_raw.glb')), '--out-low', rel(os.path.join(w, lid + '_low_raw.glb')),
          '--out', rel(os.path.join(w, lid + '_std_raw.glb')), '--out', rel(os.path.join(w, lid + '_low_raw.glb')),
          '--log', rel(os.path.join(w, 'job_err.log'))]
    log = rel(os.path.join(WORK, lid + '.log'))
    r = subprocess.run(['bash', os.path.join(ROOT, 'tools', 'render_queue.sh'), 'submit', 'draft', '--',
                        '--log', log, '--asset', 'lm_budget_' + lid, '--kind', 'patch', '--res', '64', '--spp', '1', '--'] + bl,
                       check=True, cwd=ROOT, capture_output=True, text=True)
    m = re.search(r'提交：(\S+?\.job)', r.stdout + r.stderr)
    if not m:
        sys.stderr.write((r.stdout + r.stderr)[-2000:])
        raise RuntimeError('queue submit failed for %s' % lid)
    return os.path.basename(m.group(1))[:-4]


def wait_done(job, timeout=5400):
    t0 = time.time()
    while time.time() - t0 < timeout:
        rc = os.path.join(QUEUE_DIR, 'done', job + '.rc')
        if os.path.exists(rc):
            return int(open(rc).read().strip() or 0)
        time.sleep(20)
    raise TimeoutError('queue job %s not done in %ss' % (job, timeout))


def compress(raw, out, tier):
    env = dict(os.environ, PATH=KTX_BIN + os.pathsep + os.environ['PATH'])
    if tier == 'std':
        steps = [[*G, 'etc1s', raw, out + '.t1.glb', '--slots', 'baseColorTexture', '--quality', '128'],
                 [*G, 'etc1s', out + '.t1.glb', out + '.t2.glb', '--slots', 'metallicRoughnessTexture', '--quality', '128'],
                 [*G, 'uastc', out + '.t2.glb', out + '.t3.glb', '--slots', 'normalTexture', '--level', '2', '--zstd', '12'],
                 [*G, 'meshopt', out + '.t3.glb', out, '--level', 'medium']]
    else:
        steps = [[*G, 'etc1s', raw, out + '.t1.glb', '--slots', 'baseColorTexture', '--quality', '96'],
                 [*G, 'meshopt', out + '.t1.glb', out, '--level', 'medium']]
    for cmd in steps:
        r = subprocess.run(cmd, env=env, cwd=ROOT, capture_output=True, text=True)
        if r.returncode:
            sys.stderr.write(r.stdout[-2000:] + r.stderr[-2000:])
            raise RuntimeError('gltf-transform failed: %s' % cmd[3])
    for f in (out + '.t1.glb', out + '.t2.glb', out + '.t3.glb'):
        if os.path.exists(f):
            os.remove(f)
    return os.path.getsize(out)


def install(lid, std_raw, low_raw, std_mb, low_mb):
    prop = os.path.join(ROOT, 'map', 'props', lid)
    with open(os.path.join(prop, lid + '.glb'), 'wb') as a, open(std_raw, 'rb') as b:
        a.write(b.read())
    with open(os.path.join(prop, lid + '_low.glb'), 'wb') as a, open(low_raw, 'rb') as b:
        a.write(b.read())
    info = json.load(open(os.path.join(WORK, lid, lid + '_std_raw.json')))
    bake = {'groups': info['groups'], 'tris': info['tris'],
            'std_mb': round(std_mb, 2), 'low_mb': round(low_mb, 2), 'pass': 'render-b7'}
    json.dump(bake, open(os.path.join(prop, 'bake.json'), 'w'), indent=1)
    man = json.load(open(os.path.join(prop, 'manifest.json')))
    man['budgets'] = {k: [v['tris'], v['tex']] for k, v in info['groups'].items()}
    json.dump(man, open(os.path.join(prop, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
    open(os.path.join(WORK, lid + '.done'), 'w').write(json.dumps(bake))


def cmd_auto(lid):
    lane = maps_ids().get(lid)
    if not lane:
        raise SystemExit('unknown landmark id: %s' % lid)
    if os.path.exists(os.path.join(WORK, lid + '.done')) and not os.environ.get('B7_FORCE'):
        print('SKIP %s (done: %s)' % (lid, open(os.path.join(WORK, lid + '.done')).read()[:120]))
        return 0
    hero = hero_of(lid)
    std_band = (6.0, 8.0) if hero else (4.0, 6.5)
    low_band = LOW_MB
    plan(lid, lane)
    for attempt in (1, 2, 3):
        print('plan %s: hero=%s std band %.1f-%.1f MB (attempt %d)' % (lid, hero, *std_band, attempt), flush=True)
        job = submit(lid, std_band, low_band)
        rc = wait_done(job)
        if rc:
            print('QUEUE JOB FAILED rc=%s — see %s/%s.log' % (rc, WORK, lid))
            return 1
        w = os.path.join(WORK, lid)
        s_mb = compress(os.path.join(w, lid + '_std_raw.glb'), os.path.join(w, lid + '.glb'), 'std') / 1048576.0
        l_mb = compress(os.path.join(w, lid + '_low_raw.glb'), os.path.join(w, lid + '_low.glb'), 'low') / 1048576.0
        print('measured: std %.2f MB, low %.2f MB' % (s_mb, l_mb), flush=True)
        raw = json.load(open(os.path.join(w, lid + '_std_raw.json')))
        capped = all(v['tex'] >= 2048 for v in raw['groups'].values())
        ok_s = std_band[0] <= s_mb <= std_band[1] or (s_mb < std_band[0] and capped)   # 贴图到顶仍缺带：如实收货
        ok_l = l_mb <= low_band[1]
        if ok_s and ok_l:
            install(lid, os.path.join(w, lid + '.glb'), os.path.join(w, lid + '_low.glb'), s_mb, l_mb)
            print('OK %s lane=%s std=%.2f MB low=%.2f MB%s' % (lid, lane, s_mb, l_mb, ' (under band, textures capped)' if s_mb < std_band[0] else ''))
            return 0
        if attempt == 3:
            break
        # 带外重试：估算常数偏差按实测/估算比例收放体积带；贴图到顶的缺带模型不重跑
        if s_mb < std_band[0] and not capped:
            std_band = (min(8.0, std_band[0] * std_band[0] / s_mb), std_band[1])
            print('retrying with raised std floor...', flush=True)
        elif s_mb > std_band[1]:
            std_band = (std_band[0], max(4.5, std_band[1] * std_band[1] / s_mb))
            print('retrying with tightened std ceiling...', flush=True)
        if l_mb > low_band[1]:
            low_band = (0.0, max(1.0, low_band[1] * low_band[1] / l_mb))
            print('retrying with tightened low ceiling...', flush=True)
    print('FAIL %s: size band not met after 3 attempts' % lid)
    return 1


def cmd_list(lane=None):
    ids = maps_ids()
    for lid, ln in sorted(ids.items()):
        if lane and ln != lane:
            continue
        p = os.path.join(ROOT, 'map', 'props', lid)
        s = os.path.getsize(os.path.join(p, lid + '.glb')) / 1048576.0 if os.path.exists(os.path.join(p, lid + '.glb')) else 0
        l = os.path.getsize(os.path.join(p, lid + '_low.glb')) / 1048576.0 if os.path.exists(os.path.join(p, lid + '_low.glb')) else 0
        print('%-6s %-22s std %6.2f MB  low %6.2f MB  %s' % (ln, lid, s, l, 'DONE' if os.path.exists(os.path.join(WORK, lid + '.done')) else ''))


def main():
    a = sys.argv[1:]
    if a and a[0] == 'list':
        cmd_list(a[1] if len(a) > 1 else None)
    elif a and a[0] == 'auto':
        sys.exit(cmd_auto(a[1]))
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == '__main__':
    main()
