#!/usr/bin/env python3
"""地标一键流水线：new → draft → board → gapcheck → final → ship（说明见 docs/landmark-pipeline.md）。

用法（仓库根目录）：
  python3 tools/landmark.py new <id> --layer tc_mid --name <卡原名> [--marker <标记 id>]
  python3 tools/landmark.py draft <id> [--res 2000 --spp 16 --cam c1]
  python3 tools/landmark.py board <id> [--res 1600 --spp 16 --cams c1,c2]
  python3 tools/landmark.py gapcheck <id> [--json]
  python3 tools/landmark.py final <id> [--cloud] [--res 2400 --spp 64]
  python3 tools/landmark.py ship <id> [--score "r1 7 / 7.5"] [--wb-text 世界书一句话] [--patch-basemap 整图 局部块 [--dzi 前缀]]
  python3 tools/landmark.py status [id]
全局：--dry-run 只打印要做的事（不起 Blender、不写文件、不改状态）；--force 已完成的子步骤也重做。

幂等 / 可续跑：每个子步骤做完记到 logs/landmarks/<id>.json；再跑时已完成且产物还在、build.py 没改过的子步骤跳过。
清单 docs/landmarks/<id>.checklist.md 的流程行做完即按报告格式 ~~划掉~~ ✅，首行写状态。
内容中立：本工具不做任何内容过滤 / 关键词审查，只搬运文件与跑命令。
环境变量：LM_ROOT（仓库根，测试用）、LM_WORK（中间文件目录，默认 /private/tmp/lm_work）、LM_QUEUE=0（有渲染队列也直接跑）。
"""
import argparse, datetime, glob, json, os, re, shlex, subprocess, sys

ROOT = os.path.abspath(os.environ.get('LM_ROOT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
WORK = os.environ.get('LM_WORK', '/private/tmp/lm_work')
STEPS = ['new', 'draft', 'board', 'gapcheck', 'final', 'ship']
STEP_DESC = {
    'new': '脚手架（build.py / 设定 / 清单 / manifest）',
    'draft': '草图（16 spp，本机或渲染队列）',
    'board': '审查看板（主视角 + 侧 / 底视，带编号标注）',
    'gapcheck': '设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）',
    'final': '定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点',
    'ship': '地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试',
}
GLB_MB = {'std': 0.6, 'low': 0.3}          # 体积上限（MB）；超了报失败并提示在 manifest.budgets 里压组预算
DRY = False
FORCE = False


# ------------------------------------------------------------------ 小工具
def P(*a):
    return os.path.join(ROOT, *a)


def paths(i):
    return dict(build=P('blender', 'landmarks', i, 'build.py'), setting=P('docs', 'landmarks', i + '.md'),
                checklist=P('docs', 'landmarks', i + '.checklist.md'), manifest=P('map', 'props', i, 'manifest.json'),
                state=P('logs', 'landmarks', i + '.json'), work=os.path.join(WORK, i),
                board=P('docs', 'reviews', 'landmark_' + i, 'board.jpg'))


def say(msg):
    print(msg, flush=True)


def die(msg, hint=''):
    say('✗ ' + msg)
    if hint:
        say('  提示：' + hint)
    sys.exit(1)


def rel(p):
    return os.path.relpath(p, ROOT)


def write(path, text):
    if DRY:
        say(f'  [演练] 会写 {rel(path)}（{len(text)} 字）')
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    say(f'  写 {rel(path)}')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def run(cmd, hint, check=True):
    say('  ▶ ' + ' '.join(shlex.quote(c) for c in cmd))
    if DRY:
        return 0
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode and check:
        die(f'命令失败（退出码 {r.returncode}）', hint)
    return r.returncode


def now():
    return datetime.datetime.now().isoformat(timespec='seconds')


def valid_id(i):
    if not re.fullmatch(r'[a-z][a-z0-9_]*', i or ''):
        die(f'id「{i}」不合法', 'id 只用小写字母、数字、下划线，字母开头（如 starabyss_univ）。')


# ------------------------------------------------------------------ 状态
def load_state(i):
    p = paths(i)['state']
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    return {'id': i, 'steps': {}, 'sub': {}}


def save_state(st):
    st.setdefault('steps', {}); st.setdefault('sub', {})
    if DRY:
        return
    p = paths(st['id'])['state']
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(st, f, ensure_ascii=False, indent=1)


def sub_done(st, key, outputs=()):
    """子步骤已完成且产物都在、build.py 没在完成之后改过 → True（跳过）。"""
    if FORCE:
        return False
    rec = st.get('sub', {}).get(key)
    if not rec:
        return False
    if any(not os.path.exists(o) for o in outputs):
        return False
    b = paths(st['id'])['build']
    if os.path.exists(b) and os.path.getmtime(b) > rec.get('t', 0):
        return False
    say(f'  · 跳过 {key}（{rec.get("at", "")} 已完成；--force 可重做）')
    return True


def mark_sub(st, key, **extra):
    st.setdefault('sub', {})[key] = dict(at=now(), t=datetime.datetime.now().timestamp(), **extra)
    save_state(st)


def finish(st, step, note=''):
    st.setdefault('steps', {})[step] = {'done': True, 'at': now(), 'note': note}
    save_state(st)
    strike_checklist(st['id'], step)
    say(f'✓ {step} 完成' + (f'：{note}' if note else ''))


# ------------------------------------------------------------------ 清单（报告格式：做完的 ~~划掉~~ ✅，首行状态）
def checklist_text(i, name, layer, items=None):
    lines = [f'状态：新建（{datetime.date.today()}）——tools/landmark.py 自动维护本行与「流程」勾选', '',
             f'# {name}（`{i}`，{layer}）检查清单', '', '## 流程', '']
    lines += [f'- {s}：{STEP_DESC[s]}' for s in STEPS]
    lines += ['', '## 看板条目', '',
              '<!-- 每行一条：- 组名｜说明｜卡原文 或 仓库推断。组名 = build.py 里的 Batch 名（props_* / site_*），',
              '     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->',
              *(items or [f'- props_main｜{name}主体建筑｜仓库推断', '- site_ground｜场地铺装｜仓库推断']), '']
    return '\n'.join(lines)


def strike_checklist(i, step):
    p = paths(i)['checklist']
    if not os.path.exists(p):
        return
    s = read(p)
    s2 = re.sub(rf'^- ({re.escape(step)}：.*)$', r'- ~~\1~~ ✅', s, count=1, flags=re.M)
    done = [x for x in STEPS if re.search(rf'^- ~~{x}：', s2, re.M)]
    todo = [x for x in STEPS if x not in done]
    status = f'状态：{"全部完成" if not todo else "进行中"}（{datetime.date.today()}）——已完成 {", ".join(done) or "无"}' \
             + (f'；下一步 {todo[0]}' if todo else '') + '。tools/landmark.py 自动维护本行与「流程」勾选'
    s2 = re.sub(r'^状态：.*$', status, s2, count=1, flags=re.M)
    if s2 != s:
        write(p, s2)


def board_items(i):
    """清单「看板条目」→ [{key, text, source, checked}]。"""
    p = paths(i)['checklist']
    if not os.path.exists(p):
        return []
    sec = read(p).split('## 看板条目', 1)
    if len(sec) < 2:
        return []
    out = []
    for ln in sec[1].splitlines():
        m = re.match(r'^-\s+(~~)?\s*([A-Za-z0-9_]+)\s*｜\s*(.*?)\s*｜\s*(卡原文|仓库推断)\s*(~~)?\s*(✅)?\s*$', ln)
        if m:
            out.append(dict(key=m.group(2), text=m.group(3), source=m.group(4), checked=bool(m.group(1))))
    return out


# ------------------------------------------------------------------ 模板
BUILD_TMPL = '''"""{name}（{layer}）——只做外观。由 tools/landmark.py new 生成的骨架，把占位体块换成真实建模。
设定见 docs/landmarks/{id}.md（卡原文 / 仓库推断），检查清单见 docs/landmarks/{id}.checklist.md。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/{id}/manifest.json 的 budgets 里给三角形预算）：
  props_main   主体建筑
  site_ground  场地铺装
bg_*：只为成图挡地平线的周边（不导出）。

用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final {id}）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/{id}/build.py', run_name='__main__')" \\
      -- --cam c1 --res 800 --samples 16 --out /tmp/{id}.jpg [--blend /tmp/{id}.blend] [--log /tmp/{id}.log]
cam: c1 主视角 / c2 侧视 / under 底视（悬空结构看底面；落地建筑当第二侧视）
"""
import os, sys, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/{id}.jpg', blend='', log='', exposure=''))


def main():
    import bpy
    sc = C.setup(A['samples'])
    Batch = C.Batch

    WALL = C.flat('{id}_wall', (0.72, 0.7, 0.66), 0.6, noise=0.2)
    PAVE = C.flat('{id}_pave', (0.5, 0.49, 0.46), 0.8, noise=0.3)
    GROUND = C.flat('{id}_bg', (0.3, 0.3, 0.3), 0.9)

    main_b = Batch('props_main')
    main_b.box(-20, 20, -12, 12, 0, 18, WALL)          # 占位体块：换成真实建模
    site = Batch('site_ground')
    site.box(-40, 40, -30, 30, -0.3, 0, PAVE)
    bg = Batch('bg_ground')
    bg.box(-600, 600, -600, 600, -1.5, -0.5, GROUND)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {{
        'c1': ((-70.0, -90.0, 55.0), (0.0, 0.0, 8.0), 28, 0.0),
        'c2': ((80.0, -10.0, 12.0), (0.0, 0.0, 9.0), 30, 0.0),
        'under': ((-60.0, 70.0, 6.0), (0.0, 0.0, 6.0), 30, 0.0),
    }}
    cv = CAMS[A['cam']]
    C.camera(sc, cv[0], cv[1], cv[2], cv[3])
    C.render(sc, A['out'], A['res'], 1.5, A['blend'])


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if A['log']:
        with open(A['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
'''


def adopt_items(manifest):
    """老地标补清单：看板条目取已有 manifest 的热点（来源先记仓库推断，评审时对照设定稿改）。"""
    if not os.path.exists(manifest):
        return None
    hs = json.load(open(manifest, encoding='utf-8')).get('hotspots') or []
    return [f'- {h["mesh"]}｜{h.get("name", {}).get("zh", h["mesh"])}｜仓库推断' for h in hs if h.get('mesh')] or None


def digest_hits(name):
    p = P('docs', 'card-digest.md')
    if not os.path.exists(p):
        return []
    return [(n, ln.strip()) for n, ln in enumerate(read(p).splitlines(), 1) if name in ln][:8]


def setting_text(i, name, layer):
    hits = digest_hits(name)
    card = [f'- L{n}：「{t[:120]}」——（核对原文后改写成一句事实）' for n, t in hits] or \
           ['- （在 `docs/card-digest.md` 里没搜到卡名；按 full-card-read 流程查卡原文，写「行号：原文 → 事实」）']
    return '\n'.join([f'# {name}（设定稿，{datetime.date.today()}）', '',
                      f'`{i}`，层 {layer}。卡里写到的放「卡原文」（带 `docs/card-digest.md` 行号），其余一律放「仓库推断」并逐条标注。', '',
                      '## 卡原文', '', *card, '',
                      '## 仓库推断', '',
                      '- **定位与气质**：……——仓库推断',
                      '- **主体建筑**：……——仓库推断',
                      '- **中立性**：无人物、无文字 / 标志（`docs/rejected.md`）。', '',
                      '## 规模与镜头', '', '- 占地约 … m × … m。', '- 镜头：c1 主视角 / c2 侧视 / under 底视。', ''])


def manifest_obj(i, name):
    return {
        '_note': f'viewer3d.html?model={i} 的清单（标准档 + 低档 glb）。坐标 = glTF（Y 朝上，米）。设定见 docs/landmarks/{i}.md。',
        'id': i, 'title': {'zh': name, 'en': ''}, 'glb': f'{i}.glb', 'glb_low': f'{i}_low.glb',
        'credit': {'zh': '自建模型；贴图 Poly Haven / ambientCG（CC0）', 'en': 'Own model; textures Poly Haven / ambientCG (CC0)'},
        'groups': {'roof': [], 'walls': ['props_main'], 'interior': [], 'floors': [], 'site': ['site_ground'],
                   'building': {'min': [-50.0, -0.3, -50.0], 'max': [50.0, 30.0, 50.0]}},
        'section': {'min': 0.5, 'max': 30, 'default': 30},
        'camera': {'frame': ['props_main'], 'dir': [0.4, 0.42, -0.8], 'min': 6, 'max': 350, 'maxPolar': 1.48},
        'budgets': {'props_main': [40000, 2048], 'site_ground': [8000, 2048]},
        'hotspots': [],
    }


# ------------------------------------------------------------------ Blender 调度
def queue_tool():
    if os.environ.get('LM_QUEUE') == '0':
        return None
    for f in sorted(glob.glob(P('tools', 'render_queue.*'))):
        if f.endswith('.py'):
            return ['python3', f]
        if f.endswith('.sh'):
            return ['bash', f]
    return None


def blender_script(script, extra):
    return ['-b', '--factory-startup', '--python-expr',
            f"import runpy; runpy.run_path('{script}', run_name='__main__')", '--'] + extra


def render(i, kind, res, spp, bl_args, log, runner='auto'):
    """runner: auto（有队列走队列，否则本机）/ local / cloud。返回 'done' 或 'queued'。"""
    wrap = ['--log', log, '--asset', 'lm_' + i, '--kind', kind, '--res', str(res), '--spp', str(spp), '--']
    q = queue_tool() if runner == 'auto' else None
    if runner == 'cloud':
        c = P('tools', 'cloud', 'render.sh')
        if not os.path.exists(c):
            die('没有 tools/cloud/render.sh', '先配好云端（docs/cloud-render*.md），或去掉 --cloud 在本机渲。')
        run(['bash', c] + wrap + bl_args, '云端渲染失败：先跑 bash tools/cloud/doctor.sh 体检；看日志 ' + log)
        return 'done'
    if q:
        run(q + ['submit', 'final' if kind == 'final' else 'draft', '--'] + wrap + bl_args, '渲染队列提交失败：看 tools/render_queue.* 的用法，或用 LM_QUEUE=0 直接本机渲。')
        return 'queued'
    run(['bash', P('tools', 'blender_run.sh')] + wrap + bl_args,
        f'Blender 失败：看日志 {log}（build.py 的 Python 报错在最后几行）；显卡被占时 blender_run.sh 会排队等锁。')
    return 'done'


def need(i, *keys):
    p = paths(i)
    for k in keys:
        if not os.path.exists(p[k]):
            die(f'缺 {rel(p[k])}', f'先跑 python3 tools/landmark.py new {i} --layer <层> --name <卡原名>')
    return p


# ------------------------------------------------------------------ 子命令
def cmd_new(a):
    i = a.id; valid_id(i)
    if not a.name:
        die('缺 --name', '写卡里的原名，照抄（docs/card-canon-names）。')
    p = paths(i); st = load_state(i)
    st.update(layer=a.layer, name=a.name, marker=a.marker or st.get('marker') or i)
    say(f'[new] {i}（{a.layer}，{a.name}）')
    for key, make in (('build', lambda: BUILD_TMPL.format(id=i, name=a.name, layer=a.layer)),
                      ('setting', lambda: setting_text(i, a.name, a.layer)),
                      ('checklist', lambda: checklist_text(i, a.name, a.layer, adopt_items(p['manifest']))),
                      ('manifest', lambda: json.dumps(manifest_obj(i, a.name), ensure_ascii=False, indent=1) + '\n')):
        if os.path.exists(p[key]) and not FORCE:
            say(f'  · 已有 {rel(p[key])}，不覆盖')
        else:
            write(p[key], make())
    finish(st, 'new')


def cmd_draft(a):
    i = a.id; p = need(i, 'build'); st = load_state(i)
    out = P('docs', 'drafts', f'landmark_{i}_draft_{a.cam}.jpg')
    say(f'[draft] {i}：{a.cam} {a.res}px {a.spp}spp → {rel(out)}')
    if sub_done(st, f'draft_{a.cam}_{a.res}_{a.spp}', [out]):
        return finish(st, 'draft')
    r = render(i, 'draft', a.res, a.spp, blender_script(rel(p['build']), ['--cam', a.cam, '--res', str(a.res),
               '--samples', str(a.spp), '--out', out, '--log', os.path.join(p['work'], 'draft_err.log')]),
               os.path.join(p['work'], 'draft.log'))
    if r == 'queued':
        return say('… 已进渲染队列；渲完再跑一次 draft 记完成（或直接 board）。')
    if not DRY and not os.path.exists(out):
        die(f'没产出 {rel(out)}', '看 ' + os.path.join(p['work'], 'draft.log'))
    mark_sub(st, f'draft_{a.cam}_{a.res}_{a.spp}')
    finish(st, 'draft', rel(out))


def cmd_board(a):
    i = a.id; p = need(i, 'build', 'checklist'); st = load_state(i)
    items = board_items(i)
    if not items:
        die('清单里没有看板条目', f'在 {rel(p["checklist"])} 的「## 看板条目」下按「- 组名｜说明｜卡原文/仓库推断」写。')
    os.makedirs(p['work'], exist_ok=True) if not DRY else None
    cams = [c for c in a.cams.split(',') if c]
    pairs = []
    for c in cams:
        img = os.path.join(p['work'], f'board_{c}.jpg'); anc = img + '.anchors.json'
        pairs.append((img, anc))
        say(f'[board] 渲 {c} {a.res}px {a.spp}spp（带锚点）')
        if sub_done(st, f'board_{c}_{a.res}_{a.spp}', [img, anc]):
            continue
        r = render(i, 'draft', a.res, a.spp, blender_script('blender/landmarks/lm_anchors.py',
                   ['--build', rel(p['build']), '--anchors', anc, '--cam', c, '--res', str(a.res), '--samples', str(a.spp),
                    '--out', img]), os.path.join(p['work'], f'board_{c}.log'), runner='local')
        if not DRY and not os.path.exists(anc):
            die(f'{c} 没写出锚点', f'build.py 里有没有「{c}」这个镜头？看 {p["work"]}/board_{c}.log')
        mark_sub(st, f'board_{c}_{a.res}_{a.spp}')
    items_json = os.path.join(p['work'], 'board_items.json')
    write(items_json, json.dumps({'title': f'{st.get("name", i)}（{i}）看板', 'items': [
        {'key': t['key'], 'text': t['text'], 'source': t['source'], 'status': '✓'} for t in items]}, ensure_ascii=False, indent=1))
    cmd = ['python3', P('tools', 'annotate_board.py'), '--items', items_json, '--out', p['board']]
    for img, anc in pairs:
        cmd += ['--render', img, '--anchors', anc]
    if not DRY:
        os.makedirs(os.path.dirname(p['board']), exist_ok=True)
    run(cmd, 'annotate_board.py 失败：常见原因是缺 Pillow（pip3 install pillow）或锚点 JSON 为空（镜头没拍到任何组）。')
    finish(st, 'board', rel(p['board']))


def setting_sections(txt):
    secs, cur = {}, None
    for ln in txt.splitlines():
        m = re.match(r'^##\s+(.*)', ln)
        if m:
            cur = m.group(1).strip(); secs[cur] = []
        elif cur and ln.strip():
            secs[cur].append(ln.rstrip())
    return secs


def cmd_gapcheck(a):
    i = a.id; p = need(i, 'setting', 'checklist'); st = load_state(i)
    secs = setting_sections(read(p['setting']))
    items = board_items(i)
    seen = set()
    for anc in glob.glob(os.path.join(p['work'], 'board_*.anchors.json')):
        seen |= set(json.load(open(anc)).get('points', {}))
    card = next((v for k, v in secs.items() if '卡' in k and ('原文' in k or '事实' in k)), [])
    inferred = next((v for k, v in secs.items() if '仓库推断' in k), [])
    rows = [dict(t, on_board=(t['key'] in seen) if seen else None) for t in items]
    if a.json:
        print(json.dumps({'id': i, 'board': rel(p['board']) if os.path.exists(p['board']) else None,
                          'card': card, 'inferred': inferred, 'items': rows}, ensure_ascii=False, indent=1))
    else:
        say(f'=== gapcheck {i}（{st.get("name", "")}）===')
        say(f'看板图：{rel(p["board"]) if os.path.exists(p["board"]) else "（还没有，先跑 board）"}')
        say('\n--- 设定稿·卡原文（每条都应被至少一个看板条目覆盖）---')
        for n, ln in enumerate(card, 1):
            say(f'  C{n}  {ln}')
        say('\n--- 设定稿·仓库推断 ---')
        for n, ln in enumerate(inferred, 1):
            say(f'  R{n}  {ln}')
        say('\n--- 看板条目（组名｜说明｜来源｜看板上有锚点）---')
        for t in rows:
            flag = {True: '有', False: '缺（镜头没拍到或组名不对）', None: '未知（还没跑 board）'}[t['on_board']]
            say(f'  {"✅" if t["checked"] else "·"} {t["key"]}｜{t["text"]}｜{t["source"]}｜{flag}')
        say('\n评审代理请逐条回答：C* 各由哪个条目覆盖（没有 = 缺口）；标「卡原文」的条目能否在 C* 里找到出处；'
            '看板图上每个编号是否真是所写之物。结论写进 docs/reviews/landmark_<id>/r<N>.md。')
    if not a.no_mark:
        finish(st, 'gapcheck', '已输出对照（结论见评审文件）')


def cams_of(build):
    return re.findall(r"^\s*'(\w+)':\s*\(\(", read(build), re.M)


def cmd_final(a):
    i = a.id; p = need(i, 'build', 'manifest'); st = load_state(i)
    runner = 'cloud' if a.cloud else 'auto'
    cams = [c for c in cams_of(p['build']) if re.fullmatch(r'c\d+', c)] or ['c1']
    say(f'[final] {i}：定稿镜头 {", ".join(cams)}，{a.res}px {a.spp}spp，{"云端" if a.cloud else "队列 / 本机"}')
    queued = False
    for c in cams:
        out = P('docs', 'drafts', f'landmark_{i}_final_{c}.jpg')
        if sub_done(st, f'final_{c}', [out]):
            continue
        r = render(i, 'final', a.res, a.spp, blender_script(rel(p['build']), ['--cam', c, '--res', str(a.res),
                   '--samples', str(a.spp), '--out', out]), os.path.join(p['work'], f'final_{c}.log'), runner)
        if r == 'queued':
            queued = True; continue
        mark_sub(st, f'final_{c}')
    if queued:
        return say('… 定稿已进渲染队列；渲完再跑一次 final 会跳过已完成的镜头，接着导 glb。')
    # glb：存 .blend → 标准档（scale 1）→ 低档（scale 0.5 + webp）；组预算来自 manifest.budgets
    man = json.load(open(p['manifest'], encoding='utf-8'))
    wk = p['work']; blend = os.path.join(wk, f'{i}.blend'); bud = os.path.join(wk, 'budgets.json')
    write(bud, json.dumps(man.get('budgets', {}), ensure_ascii=False))
    std = P('map', 'props', i, f'{i}.glb'); low = P('map', 'props', i, f'{i}_low.glb')
    if not sub_done(st, 'blend', [blend]):
        render(i, 'patch', 64, 1, blender_script(rel(p['build']), ['--res', '64', '--samples', '1',
               '--out', os.path.join(wk, 'blend.png'), '--blend', blend]), os.path.join(wk, 'blend.log'), runner='local')
        mark_sub(st, 'blend')
    G = ['npx', '-y', '@gltf-transform/cli']
    for tier, scale, out in (('std', '1', std), ('low', '0.5', low)):
        if sub_done(st, 'glb_' + tier, [out]):
            continue
        raw = os.path.join(wk, f'{i}_{tier}_raw.glb')
        render(i, 'patch', 0, 32, ['-b', '--factory-startup', blend, '--python-expr',
               "import runpy; runpy.run_path('blender/landmarks/export_glb.py', run_name='__main__')", '--',
               '--out', raw, '--samples', '32', '--scale', scale, '--budget_json', bud], os.path.join(wk, f'export_{tier}.log'), runner='local')
        src = raw
        if tier == 'low':
            src = os.path.join(wk, f'{i}_low_webp.glb')
            run(G + ['webp', raw, src, '--quality', '75'], 'gltf-transform webp 失败：确认 node / npx 可用、能联网装 @gltf-transform/cli。')
        run(G + ['meshopt', src, out, '--level', 'medium'], 'gltf-transform meshopt 失败：同上。')
        if not DRY:
            mb = os.path.getsize(out) / 1e6
            if mb > GLB_MB[tier]:
                die(f'{rel(out)} {mb:.2f} MB 超上限 {GLB_MB[tier]} MB',
                    f'在 {rel(p["manifest"])} 的 budgets 里调小大组的三角形 / 贴图边长，再跑 final --force。')
            say(f'  {tier} glb {mb:.2f} MB')
        mark_sub(st, 'glb_' + tier)
    # 热点：清单条目里的 props_* 组，manifest 没写热点时自动补（中立描述由人 / 代理再润色）
    if not man.get('hotspots'):
        man['hotspots'] = [{'id': t['key'].replace('props_', ''), 'mesh': t['key'], 'name': {'zh': t['text'], 'en': ''},
                            'desc': {'zh': t['text'], 'en': ''}, 'view': [0.4, 0.42, -0.8]}
                           for t in board_items(i) if t['key'].startswith('props_')][:6]
        write(p['manifest'], json.dumps(man, ensure_ascii=False, indent=1) + '\n')
        say(f'  补了 {len(man["hotspots"])} 个热点（en 留空待补）')
    finish(st, 'final', f'glb {rel(std)} + {rel(low)}')


# ---- ship：只做文本插入，保留 maps.json 手排版
def maps_add_link(txt, layer, marker, lm):
    data = json.loads(txt)
    if marker not in (data['maps'].get(layer, {}).get('markers') or {}):
        return None, f'maps.json 的 {layer}.markers 里没有「{marker}」'
    dec = json.JSONDecoder()
    lay = txt.find(f'"{layer}"')
    k = txt.find(f'"{marker}":', lay)
    start = txt.find('{', k)
    obj, end = dec.raw_decode(txt, start)
    if obj.get('link', {}).get('map') == lm:
        return txt, '已接'
    if 'link' in obj:
        return None, f'{layer}.{marker} 已有别的 link（{obj["link"]}），请人工决定'
    link = f', "link": {{"map": "{lm}", "label": "查看三维模型", "label_en": "View 3D model"}}'
    close = txt.rfind('}', start, end)
    new = txt[:close].rstrip() + link + txt[close:]
    json.loads(new)
    return new, '接好'


def maps_add_lm(txt, i, st, blurb):
    data = json.loads(txt)
    lm = 'lm_' + i
    if lm in data['maps']:
        return txt, '已有'
    name = st.get('name', i)
    entry = {'title': f'{name}（三维）', 'title_en': '', 'parent': st['layer'], 'kind': 'estate', 'viewer3d': i,
             'src': 'props/viewer3d.html', 'alias': [f'{name}（三维）'],
             'src_note': f'{name}三维（标准版：标准档 + 低档 glb；{blurb}）；从 {st["layer"]}.{st.get("marker", i)} 标记的「查看三维模型」进。源：blender/landmarks/{i}/',
             'credit': '自建模型；贴图 Poly Haven / ambientCG（CC0）', 'credit_en': 'Own model; textures Poly Haven / ambientCG (CC0)'}
    line = f'    "{lm}": ' + json.dumps(entry, ensure_ascii=False) + ','
    lines = txt.split('\n')
    idx = min(n for n, ln in enumerate(lines) if re.match(r'^    "lm_\w+": \{', ln))   # 插在第一条 lm_ 之前：整行完整，不会切进多行条目
    lines.insert(idx, line)
    new = '\n'.join(lines)
    json.loads(new)
    return new, '新增'


def cards_row(txt, layer, marker, name, i, score):
    out, hit = [], False
    for ln in txt.split('\n'):
        cols = ln.split('|')
        if len(cols) >= 10 and cols[2].strip() == layer and cols[3].strip() == f'`{marker}`':
            cols[7] = f' {name} `map/props/{i}/` '
            if score or cols[8].strip() in ('—', ''):
                cols[8] = f' 标准（{score or "r1 ? / ?"}） '
            ln = '|'.join(cols); hit = True
        out.append(ln)
    return '\n'.join(out), hit


def cmd_ship(a):
    i = a.id; p = need(i, 'manifest'); st = load_state(i)
    if not st.get('layer'):   # 老地标没有状态文件：从 maps.json 找标记所在层
        mk_id = st.get('marker', i)
        for lay, m in json.load(open(P('map', 'data', 'maps.json'), encoding='utf-8'))['maps'].items():
            if mk_id in (m.get('markers') or {}):
                st['layer'] = lay; st.setdefault('name', m['markers'][mk_id].get('name', i)); break
    if not st.get('layer'):
        die('状态里没有层', f'先跑 python3 tools/landmark.py new {i} --layer <层> --name <卡原名>（已有文件不会被覆盖）')
    for tier in (f'{i}.glb', f'{i}_low.glb'):
        if not DRY and not os.path.exists(P('map', 'props', i, tier)):
            die(f'缺 map/props/{i}/{tier}', f'先跑 python3 tools/landmark.py final {i}')
    layer, marker, lm = st['layer'], st.get('marker', i), 'lm_' + i
    say(f'[ship] {i} → {layer}.{marker}「查看三维模型」→ {lm}')
    mp = P('map', 'data', 'maps.json'); txt = read(mp)
    txt, msg = maps_add_link(txt, layer, marker, lm)
    if txt is None:
        die(msg, '先在该层 markers 里落点（名字照抄卡），或用 new --marker <已有标记 id> 指到正确的标记。')
    say(f'  标记：{msg}')
    txt, msg2 = maps_add_lm(txt, i, st, a.blurb or '位置与形制为仓库推断')
    say(f'  {lm}：{msg2}')
    if msg != '已接' or msg2 != '已有':
        write(mp, txt)
    # 世界书同步：仓库推断的标记必须在 addon_places.json 有条目（check_maps 也会查）
    mk = json.loads(txt)['maps'][layer]['markers'][marker]
    ap = P('map', 'data', 'addon_places.json')
    apd = json.load(open(ap, encoding='utf-8')) if os.path.exists(ap) else None
    ref = f'{layer}.{marker}'
    if apd is not None and mk.get('layer_src') == 'repo-inferred':
        places = apd['places'] if isinstance(apd, dict) else apd
        if not any(ref in (e.get('refs') or []) for e in places):
            if not a.wb_text:
                die(f'{ref} 是仓库推断的地点，世界书附加条目里还没有它',
                    '加 --wb-text "<一两句中立说明，写清哪些是仓库推断>" 重跑 ship（worldbook-sync 规则）。')
            e = {'id': marker, 'name': mk['name'], 'src': f'repo {datetime.date.today()}（位置）', 'refs': [ref],
                 'alias': mk.get('alias') or [mk['name']], 'text': a.wb_text}
            s = read(ap)
            k = s.rfind('}', 0, s.rfind(']'))
            s = s[:k + 1] + ',\n    ' + json.dumps(e, ensure_ascii=False) + s[k + 1:]
            json.loads(s)
            write(ap, s)
            say('  世界书补充条目：新增')
        else:
            say('  世界书补充条目：已有')
    run(['python3', P('tools', 'build_worldbook_addon.py'), '--ship'], '世界书附加条目重建失败：看上面的报错（多半是 addon_places.json 字段缺失）。')
    cb = P('docs', 'card-buildings.md')
    if os.path.exists(cb):
        s, hit = cards_row(read(cb), layer, marker, st.get('name', i), i, a.score or st.get('score'))
        if hit:
            write(cb, s) if s != read(cb) else say('  card-buildings：已是最新')
        else:
            say(f'  ⚠ docs/card-buildings.md 没找到 {layer} / `{marker}` 这一行，请手动补一行')
    if a.patch_basemap:
        full, part = a.patch_basemap
        run(['python3', P('tools', 'region_patch.py'), full, part] + (['--dzi', a.dzi] if a.dzi else []),
            'region_patch.py 失败：局部块旁要有 .region.json（style_frame.py --region 写的）；尺寸要与整图等比例。')
    run(['python3', P('tools', 'check_maps.py')], 'check_maps 报错：按它列出的字段 / 引用逐条修 maps.json 或 addon_places.json。')
    run(['bash', P('tools', 'smoke.sh')], 'smoke 失败（含 node --test tests/*.test.mjs）：看失败项的输出。')
    finish(st, 'ship', f'{ref} → {lm}')


def cmd_status(a):
    ids = [a.id] if a.id else sorted({os.path.basename(x)[:-5] for x in glob.glob(P('logs', 'landmarks', '*.json'))} |
                                     {os.path.basename(os.path.dirname(x)) for x in glob.glob(P('blender', 'landmarks', '*', 'build.py'))})
    say('id'.ljust(24) + ''.join(s.ljust(10) for s in STEPS))
    for i in ids:
        st = load_state(i); pp = paths(i)
        cells = []
        for s in STEPS:
            done = st.get('steps', {}).get(s, {}).get('done')
            if not done:   # 没状态文件的老地标：按产物推断（标 *）
                guess = {'new': os.path.exists(pp['build']) and os.path.exists(pp['manifest']),
                         'draft': bool(glob.glob(P('docs', 'drafts', f'landmark_{i}_*'))),
                         'board': os.path.exists(pp['board']),
                         'gapcheck': bool(glob.glob(P('docs', 'reviews', f'landmark_{i}', 'r*.md'))),
                         'final': os.path.exists(P('map', 'props', i, f'{i}_low.glb')),
                         'ship': f'"lm_{i}"' in read(P('map', 'data', 'maps.json')) if os.path.exists(P('map', 'data', 'maps.json')) else False}[s]
                cells.append('✓*' if guess else '·')
            else:
                cells.append('✓')
        say(i.ljust(24) + ''.join(c.ljust(10) for c in cells))
    say('✓ = 流水线记录完成；✓* = 没有流水线记录、按已有产物推断；· = 未做')


def main(argv=None):
    global DRY, FORCE
    ap = argparse.ArgumentParser(description='地标一键流水线（docs/landmark-pipeline.md）')
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--force', action='store_true')
    sp = ap.add_subparsers(dest='cmd', required=True)
    s = sp.add_parser('new'); s.add_argument('id'); s.add_argument('--layer', required=True); s.add_argument('--name'); s.add_argument('--marker')
    s = sp.add_parser('draft'); s.add_argument('id'); s.add_argument('--cam', default='c1'); s.add_argument('--res', type=int, default=2000); s.add_argument('--spp', type=int, default=16)
    s = sp.add_parser('board'); s.add_argument('id'); s.add_argument('--cams', default='c1,c2'); s.add_argument('--res', type=int, default=1600); s.add_argument('--spp', type=int, default=16)
    s = sp.add_parser('gapcheck'); s.add_argument('id'); s.add_argument('--json', action='store_true'); s.add_argument('--no-mark', action='store_true')
    s = sp.add_parser('final'); s.add_argument('id'); s.add_argument('--cloud', action='store_true'); s.add_argument('--res', type=int, default=2400); s.add_argument('--spp', type=int, default=64)
    s = sp.add_parser('ship'); s.add_argument('id'); s.add_argument('--score'); s.add_argument('--wb-text'); s.add_argument('--blurb')
    s.add_argument('--patch-basemap', nargs=2, metavar=('整图', '局部块')); s.add_argument('--dzi')
    s = sp.add_parser('status'); s.add_argument('id', nargs='?')
    for x in sp.choices.values():   # 全局开关放子命令后面也认
        x.add_argument('--dry-run', action='store_true', dest='dry_run2'); x.add_argument('--force', action='store_true', dest='force2')
    a = ap.parse_args(argv)
    DRY = a.dry_run or a.dry_run2; FORCE = a.force or a.force2
    if DRY:
        say('（演练模式：只打印，不起 Blender、不写文件、不改状态）')
    if getattr(a, 'id', None):
        valid_id(a.id)
    {'new': cmd_new, 'draft': cmd_draft, 'board': cmd_board, 'gapcheck': cmd_gapcheck, 'final': cmd_final,
     'ship': cmd_ship, 'status': cmd_status}[a.cmd](a)


if __name__ == '__main__':
    main()
