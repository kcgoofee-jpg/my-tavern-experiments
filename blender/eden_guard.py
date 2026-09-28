"""渲染自报与设备守卫（只依赖 bpy）：唯一的设备选择实现 + bpy.app.handlers 阶段标记。

- setup_render_device(sc, hybrid=False, allow_cpu=None)：OPTIX → CUDA → METAL → HIP → ONEAPI 依次探测
  （EDEN_CYCLES_DEVICE 可把某一种提到最前；EDEN_CYCLES_DEVICE=CPU = 测试用的强制 CPU），打印
  `EDEN_DEVICE=<OPTIX|CUDA|METAL|CPU> gpus=<名字,...> allow_cpu=0|1`。没有 GPU 且没允许 CPU → 立即中止（exit 86）。
  tc_common.pick_gpu / tc_common.setup_render_device 都是它；新渲染脚本调用这两个之一（smoke 与提交端会查）。
- install()：注册 render_init/pre/post/write/complete/cancel/stats 处理器（@persistent，按函数名去重，
  read_factory_settings 后仍在），打印 EDEN_PHASE=render|post|write|done|cancel 与节流过的 EDEN_PROGRESS 行；
  render_pre 时按场景真实状态再报一次 EDEN_DEVICE，若是 CPU 且没允许 → 立即中止。
  tools/blender_run.sh 会在任何脚本之前注入 install()，所以没调用 helper 的旧脚本也有阶段标记和 CPU 守卫。
- 允许 CPU 只认环境变量 EDEN_ALLOW_CPU=1（blender_run.sh --allow-cpu 会设置）；不读脚本 argv，免得撞各脚本自己的参数解析。
- EDEN_GUARD_NO_INPROC=1：仅供测试外部看门狗，进程内不中止。
"""
import os, re, sys, time
import bpy
from bpy.app.handlers import persistent

ORDER = ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI')
ABORT_CODE = 86
_st = {'last': 0.0, 'stage': None, 'key': None}


def _say(s):
    print(s, flush=True)


def allow_cpu_env():
    return os.environ.get('EDEN_ALLOW_CPU') == '1'


def abort(reason, msg):
    _say(f'EDEN_ABORT={reason} {msg}')
    sys.stdout.flush(); sys.stderr.flush()
    if os.environ.get('EDEN_GUARD_NO_INPROC') == '1':
        _say('EDEN_GUARD_NO_INPROC=1（测试模式）：不在进程内中止，交给看门狗')
        return
    os._exit(ABORT_CODE)


def device_state(sc=None):
    """按场景真实状态返回 (设备, [GPU 名])：非 Cycles 引擎返回引擎名。"""
    sc = sc or bpy.context.scene
    if sc.render.engine != 'CYCLES':
        return sc.render.engine, []
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        kind = prefs.compute_device_type
        devs = [d.name for d in prefs.devices if d.use and d.type != 'CPU']
    except Exception:
        kind, devs = 'NONE', []
    if sc.cycles.device == 'GPU' and kind not in ('', 'NONE') and devs:
        return kind, devs
    return 'CPU', []


def _report(dev, names, src):
    g = ','.join(dict.fromkeys(n.replace(' ', '_') for n in names))      # OPTIX 与 CUDA 条目会列同一张卡两次
    _say(f'EDEN_DEVICE={dev} gpus={g} allow_cpu={int(allow_cpu_env())} src={src}')


def setup_render_device(sc=None, hybrid=False, allow_cpu=None):
    """选 Cycles 设备并设 sc.cycles.device；返回是否用上 GPU。hybrid=True 时 CPU 也参与（仍要求有 GPU）。"""
    install()
    sc = sc or bpy.context.scene
    allow = allow_cpu_env() if allow_cpu is None else bool(allow_cpu)
    want = os.environ.get('EDEN_CYCLES_DEVICE', '').strip().upper()
    if want == 'CPU':                                   # 测试：强制 CPU；渲染开始时 render_pre 会按规则中止
        sc.cycles.device = 'CPU'
        _say('cycles compute CPU (EDEN_CYCLES_DEVICE=CPU 强制)')
        _report('CPU', [], 'setup_forced')
        return False
    order = ((want,) if want in ORDER else ()) + tuple(k for k in ORDER if k != want)
    gpu, kind_used, names = False, None, []
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in order:
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type != 'CPU' for d in prefs.devices):
                for d in prefs.devices:
                    d.use = hybrid or d.type != 'CPU'
                gpu, kind_used = True, kind
                names = [d.name for d in prefs.devices if d.use and d.type != 'CPU']
                break
    except Exception as e:
        _say(f'GPU probe failed {e}')
    sc.cycles.device = 'GPU' if gpu else 'CPU'
    _say(f'cycles compute {kind_used or "CPU"}')
    _report(kind_used or 'CPU', names, 'setup')
    if not gpu and not allow:
        abort('cpu_fallback', '没有可用的 GPU（OPTIX/CUDA/METAL/HIP/ONEAPI 都探测不到）且没给 --allow-cpu：不按 CPU 渲')
    return gpu


# ---------------------------------------------------------------- 阶段处理器
def _stage(text):
    if re.search(r'Sample \d+/\d+', text): return 'sample'
    if 'kernels' in text: return 'kernels'
    if 'Denois' in text: return 'denoise'
    if 'Finished' in text: return 'finished'
    return 'sync'


@persistent
def eden_on_render_init(*_):
    _say('EDEN_PHASE=render')


@persistent
def eden_on_render_pre(*_):
    _say('EDEN_PHASE=render')
    try:
        dev, names = device_state()
    except Exception as e:
        _say(f'EDEN_GUARD device check failed {e}')
        return
    _report(dev, names, 'render_pre')
    if dev == 'CPU' and not allow_cpu_env():
        abort('cpu_fallback', '渲染开始时 Cycles 设备是 CPU（脚本没配上 GPU）且没给 --allow-cpu')
    _st.update(last=0.0, stage=None, key=None)


@persistent
def eden_on_render_post(*_):
    _say('EDEN_PHASE=post')


@persistent
def eden_on_render_write(*_):
    _say('EDEN_PHASE=write')


@persistent
def eden_on_render_complete(*_):
    _say('EDEN_PHASE=done')


@persistent
def eden_on_render_cancel(*_):
    _say('EDEN_PHASE=cancel')


@persistent
def eden_on_render_stats(text=None, *_):
    text = str(text or '')
    stage = _stage(text)
    sm = re.search(r'Sample (\d+/\d+)', text)
    tm = re.search(r'Tile (\d+/\d+)', text)
    note = '' if stage in ('sample', 'finished') else re.sub(r'[^\w./-]+', '_', text.split('|')[-1].strip())[:40]
    key = (stage, sm and sm.group(1), tm and tm.group(1), note)
    now = time.time()
    if key == _st['key']:
        return
    if stage == _st['stage'] and now - _st['last'] < 5.0:
        return
    _st.update(last=now, stage=stage, key=key)
    _say(f'EDEN_PROGRESS stage={stage} sample={key[1] or "-"} tile={key[2] or "-"} note={note or "-"}')


_HANDLERS = {
    'render_init': eden_on_render_init, 'render_pre': eden_on_render_pre, 'render_post': eden_on_render_post,
    'render_write': eden_on_render_write, 'render_complete': eden_on_render_complete,
    'render_cancel': eden_on_render_cancel, 'render_stats': eden_on_render_stats,
}


def install():
    """幂等：按函数名去重（runpy / 重新 import 会生成新的函数对象）。第一次安装时打印 EDEN_PHASE=build。"""
    if not any(getattr(h, '__name__', '') == 'eden_on_render_pre' for h in bpy.app.handlers.render_pre):
        _say('EDEN_PHASE=build')
    for slot, fn in _HANDLERS.items():
        lst = getattr(bpy.app.handlers, slot, None)
        if lst is None:
            continue
        for h in list(lst):
            if getattr(h, '__name__', '') == fn.__name__:
                lst.remove(h)
        lst.append(fn)
