#!/usr/bin/env python3
"""渲染提交前的静态检查（只用标准库，不需要 Blender）。设计见 docs/cloud-render.md「渲染守卫」。

  python3 tools/render_preflight.py check -- <tools/blender_run.sh 的参数...>
      1. 按 blender_run.sh 自己的语法解析：第一个 -- 之前只能是 --log/--asset/--kind/--res/--spp/--cache-blend/--allow-cpu
         （「未知参数 --out」那次事故就是 --out 放错了位置）；
      2. 找到入口脚本（run_path('…') / -P / --python），文件必须存在；
      3. 入口脚本或它 import 的本仓库模块里必须调用 setup_render_device / pick_gpu（tc_common，底层 blender/eden_guard.py）；
      4. 脚本参数（第二个 -- 之后）对照声明的参数表：模块级 EDEN_ARGS = (...)；或 args(dict(...)) 的键（landmarks/world 风格）；
         或 tc.Layer / parse_args 风格（入口及其本仓库 import 里出现的 '--xxx' 字面量）。都没有就跳过这一项并提示。
      通过退出 0；不通过打印中文原因、退出 2（状态码 arg_error / no_device_helper）。
  python3 tools/render_preflight.py lint
      smoke 用：blender/ 下凡是调用 bpy.ops.render.render( 的文件，必须同时调用 setup_render_device( 或 pick_gpu(；
      除 blender/eden_guard.py 外不许直接写 compute_device_type。PENDING 里是正由别的任务迁移的旧脚本，只警告。
"""
import ast, difflib, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
BL = os.path.join(ROOT, 'blender')
HELPERS = ('setup_render_device', 'pick_gpu')
RUN_OPTS_VAL = ('--log', '--asset', '--kind', '--res', '--spp', '--cache-blend')
RUN_OPTS_FLAG = ('--allow-cpu',)
# 2026-09-28：这些文件还在走自己的设备代码 / 没接 helper，由「Route all Blender scripts through pick_gpu」任务迁移；lint 只警告。
# 迁完一个就从这里删一个；新文件不许加进来。提交端（check）对它们照样拒绝。
PENDING = set()   # 2026-09-29：六个旧脚本全部迁完（estate/legacy_manor、estate/views、estate2/export_web、
                  # estate2/style_frame、landmarks/map_cutout、oblique）——都改走 eden_guard / tc_common 的唯一设备入口。
                  # 以后新文件不许加进来；lint 与提交端一致拒绝。


class Fail(Exception):
    def __init__(self, code, msg):
        super().__init__(msg); self.code, self.msg = code, msg


# ---------------------------------------------------------------- blender_run.sh 语法
def parse_run_args(args):
    """返回 dict(log, opts, blender_args)。与 tools/blender_run.sh 的 while/case 一致。"""
    if not args:
        raise Fail('arg_error', '没有参数：用法 tools/blender_run.sh --log <日志> --asset <名> … -- <blender 参数>')
    if args[0] != '--log':                      # 旧式：<日志> <blender 参数...>
        return dict(log=args[0], opts={}, blender_args=list(args[1:]), legacy=True)
    opts, i = {}, 0
    while i < len(args):
        a = args[i]
        if a == '--':
            return dict(log=opts.get('--log'), opts=opts, blender_args=list(args[i + 1:]), legacy=False)
        if a in RUN_OPTS_FLAG:
            opts[a] = True; i += 1; continue
        if a in RUN_OPTS_VAL:
            if i + 1 >= len(args) or args[i + 1] == '--':
                raise Fail('arg_error', f'blender_run.sh 参数 {a} 后面缺值')
            opts[a] = args[i + 1]; i += 2; continue
        hint = difflib.get_close_matches(a, RUN_OPTS_VAL + RUN_OPTS_FLAG, 1)
        where = '（这是脚本参数？要放在第二个 -- 之后：… -- -b … --python-expr "…" -- --res … --out …）' if a.startswith('--') else ''
        raise Fail('arg_error', f'blender_run.sh 未知参数 {a}{where}' + (f'；是不是 {hint[0]}？' if hint else ''))
    raise Fail('arg_error', 'blender_run.sh 参数里没有 --（后面接 blender 参数）')


def split_blender_args(bargs):
    """blender 参数 → (入口脚本相对路径或 None, 脚本 argv)。"""
    script, sargv = None, []
    for j, a in enumerate(bargs):
        if a == '--':
            sargv = bargs[j + 1:]
            break
        if a in ('-P', '--python') and j + 1 < len(bargs) and script is None:
            script = bargs[j + 1]
        if a == '--python-expr' and j + 1 < len(bargs):
            m = re.search(r"run_path\(\s*['\"]([^'\"]+)['\"]", bargs[j + 1])
            if m and script is None:
                script = m.group(1)
    return script, sargv


# ---------------------------------------------------------------- 源码分析
def _parse(path):
    try:
        return ast.parse(open(path, encoding='utf-8').read(), path)
    except (OSError, SyntaxError, ValueError):
        return None


def local_imports(path, tree):
    """入口脚本 import 的本仓库模块（按常见的 sys.path.insert 目录解析）。"""
    here = os.path.dirname(path)
    dirs = [here, os.path.dirname(here), BL, os.path.join(BL, 'landmarks'), os.path.join(BL, 'islands')]
    names = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            names.update(a.name.split('.')[0] for a in n.names)
        elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
            names.add(n.module.split('.')[0])
    out = []
    for name in sorted(names):
        for d in dirs:
            for cand in (os.path.join(d, name + '.py'), os.path.join(d, name, '__init__.py')):
                if os.path.isfile(cand) and cand not in out:
                    out.append(cand); break
            else:
                continue
            break
    return out


def module_family(entry, depth=3):
    seen, todo = [], [(entry, 0)]
    while todo:
        p, d = todo.pop(0)
        if p in seen:
            continue
        seen.append(p)
        t = _parse(p)
        if t is not None and d < depth:
            todo += [(q, d + 1) for q in local_imports(p, t)]
    return seen


def calls_helper(tree):
    for n in ast.walk(tree):
        if isinstance(n, ast.Call):
            f = n.func
            name = f.attr if isinstance(f, ast.Attribute) else getattr(f, 'id', None)
            if name in HELPERS:
                return True
    return False


def declared_args(entry, family):
    """返回 (参数集合 或 None, 来源说明)。"""
    t = _parse(entry)
    if t is None:
        return None, '入口脚本解析失败'
    for n in t.body:                                            # 1. EDEN_ARGS = ('--res', ...)
        if isinstance(n, ast.Assign) and any(getattr(x, 'id', None) == 'EDEN_ARGS' for x in n.targets):
            try:
                return {str(v) for v in ast.literal_eval(n.value)}, 'EDEN_ARGS'
            except ValueError:
                pass
    keys = set()                                                # 2. args(dict(res=..)) / args({'res': ..})
    for n in ast.walk(t):
        if isinstance(n, ast.Call) and (getattr(n.func, 'attr', None) or getattr(n.func, 'id', None)) == 'args' and n.args:
            d = n.args[0]
            if isinstance(d, ast.Call) and getattr(d.func, 'id', None) == 'dict':
                keys.update('--' + k.arg for k in d.keywords if k.arg)
            elif isinstance(d, ast.Dict):
                keys.update('--' + str(k.value).lstrip('-') for k in d.keys if isinstance(k, ast.Constant))
    if keys:
        return keys, 'args(dict(...)) 的键'
    src = open(entry, encoding='utf-8').read()                  # 3. tc.Layer / parse_args：入口 + 本仓库模块里的 '--xxx'
    if re.search(r'\bLayer\(|parse_args\(', src):
        lits = set()
        for p in family:
            try:
                lits.update(re.findall(r"""['"](--[a-z][a-z0-9-]*)['"]""", open(p, encoding='utf-8').read()))
            except OSError:
                pass
        return lits, 'tc.Layer / parse_args 模块里出现的 --参数'
    return None, '没有声明参数表（EDEN_ARGS / args(dict) / tc.Layer），跳过脚本参数检查'


def check_script_args(sargv, allowed):
    for a in sargv:
        if not a.startswith('--') or re.fullmatch(r'--?\d+(\.\d+)?', a):
            continue
        if a not in allowed:
            hint = difflib.get_close_matches(a, sorted(allowed), 1)
            raise Fail('arg_error', f'脚本参数 {a} 不在脚本声明的参数表里' + (f'；是不是 {hint[0]}？' if hint else ''))


def check(args, root=ROOT):
    """返回说明行列表；不通过抛 Fail。"""
    notes = []
    r = parse_run_args(args)
    if r['legacy']:
        notes.append('旧式用法（<日志> <blender 参数>），不记资产信息')
    for k in ('--res', '--spp'):
        v = r['opts'].get(k)
        if v is not None and not re.fullmatch(r'\d+', str(v)):
            raise Fail('arg_error', f'blender_run.sh {k} 要是整数，现在是 {v!r}')
    script, sargv = split_blender_args(r['blender_args'])
    if not script:
        raise Fail('no_device_helper', '找不到入口脚本（要用 -P <脚本> 或 --python-expr "…runpy.run_path(\'<脚本>\'…)"），无法确认它会配 GPU')
    entry = script if os.path.isabs(script) else os.path.join(root, script)
    if not os.path.isfile(entry):
        raise Fail('arg_error', f'入口脚本不存在：{script}')
    fam = module_family(entry)
    if not any(calls_helper(t) for t in map(_parse, fam) if t is not None):
        raise Fail('no_device_helper', f'{script} 及其 import 的本仓库模块都没调用 tc_common.setup_render_device()（或 pick_gpu）：'
                   '渲染脚本必须经它配 GPU，否则云端会退回 CPU 白烧钱')
    allowed, src = declared_args(entry, fam)
    if allowed is None:
        notes.append(src)
    else:
        check_script_args(sargv, allowed)
        notes.append(f'脚本参数对照：{src}（{len(allowed)} 个）')
    # 输出路径两条硬规则（2026-09-29 事故）：队列会把 draft/final 派到云端渲染，所以
    #   1. 不许绝对路径 —— 远端没有 /Users/… 这种路径，远端写不出、回传 rsync link_stat failed，
    #      任务白跑一次还被看门狗记成 ok；
    #   2. 不许落在 docs/ —— tools/cloud/sync.sh 有 `--exclude docs/`，云端根本没有这个目录。
    # 输出要放 map/art/ 这类会同步的目录（仓库相对路径），渲完再拷到最终位置。
    for idx, a in enumerate(sargv):
        if a != '--out' or idx + 1 >= len(sargv):
            continue
        val = sargv[idx + 1]
        if os.path.isabs(val):
            raise Fail('abs_out', f'--out 用了绝对路径：{val}\n'
                       '  队列可能把它派到云端，远端不存在这个路径 → 白跑一次（日志尾部是 rsync link_stat failed）。\n'
                       '  改成仓库相对路径，并放在会同步的目录（map/art/…），渲完再拷到最终位置。')
        if val.startswith('docs/') or '/docs/' in val:
            raise Fail('unsynced_out', f'--out 落在 docs/：{val}\n'
                       '  tools/cloud/sync.sh 有 `--exclude docs/`，云端没有这个目录 → 云端一定写不出。\n'
                       '  输出改到 map/art/ 之类会同步的目录，渲完再拷进 docs/。')
    notes.append(f'入口 {script}：已调用设备 helper')
    return notes


def lint(root=ROOT):
    errs, warns = [], []
    for dp, _, fs in os.walk(os.path.join(root, 'blender')):
        for f in fs:
            if not f.endswith('.py'):
                continue
            p = os.path.join(dp, f); rel = os.path.relpath(p, root).replace(os.sep, '/')
            try:
                src = open(p, encoding='utf-8').read()
            except (OSError, UnicodeDecodeError):
                continue
            bad = []
            if 'bpy.ops.render.render(' in src and not re.search(r'\b(setup_render_device|pick_gpu)\(', src):
                bad.append('调用了 bpy.ops.render.render 却没调用 setup_render_device()/pick_gpu()')
            if rel != 'blender/eden_guard.py' and re.search(r'compute_device_type\s*=(?!=)', src):
                bad.append('直接写 compute_device_type（设备选择只许在 blender/eden_guard.py）')
            for b in bad:
                (warns if rel in PENDING else errs).append(f'{rel}：{b}')
    return errs, warns


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] == ['lint']:
        errs, warns = lint()
        for w in warns:
            print(f'  [待迁移，仅警告] {w}')
        for e in errs:
            print(f'  ✗ {e}')
        print(f'render lint：{len(errs)} 个错误，{len(warns)} 个待迁移警告')
        return 1 if errs else 0
    if argv[:1] == ['check']:
        rest = argv[1:]
        if rest[:1] == ['--']:
            rest = rest[1:]
        try:
            for n in check(rest):
                print(f'preflight：{n}')
        except Fail as e:
            print(f'EDEN_PREFLIGHT={e.code}')
            print(f'渲染提交被拒（{e.code}）：{e.msg}', file=sys.stderr)
            return 2
        print('EDEN_PREFLIGHT=ok')
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
