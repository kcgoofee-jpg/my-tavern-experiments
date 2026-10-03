"""RENDER-B7 队列任务编排：一个 Blender 进程里跑完一个地标的 建场景 → 标准档导出 → 低档导出。

给 tools/lm_budget.py 经渲染队列调（render_queue.sh submit → blender_run.sh → --python-expr 起本文件）。
低档重新 open_mainfile 回到建好的场景，各自减面 / 展 UV / 烘焙，互不影响。

argv（-- 之后）：--id <地标> --build <build.py 路径> --work <工作目录> --budget-std <json> --budget-low <json>
                --probe <探针 png> --out-std <raw glb> --out-low <raw glb> [--log <traceback 文件>]
"""
import os
import runpy
import sys
import traceback

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(id='', build='', work='', budget_std='', budget_low='', probe='', out_std='', out_low='',
         out='', log='', blend_flag='blend', fit_std_lo='4', fit_std_hi='8', fit_low_lo='0', fit_low_hi='2',
         lock_tex='0')
for k, v in zip(argv[::2], argv[1::2]):
    A[k.lstrip('-').replace('-', '_')] = v
HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(A['work'], A['id'] + '.blend')


def phase(script, pairs):
    """runpy 跑一个阶段脚本，给它摆好 sys.argv（common.args / 上面的解析都从 -- 之后读）。"""
    sys.argv = [script, '--'] + [x for kv in pairs for x in kv]
    runpy.run_path(script, run_name='__main__')


def main():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(HERE)), '..'))
    sys.path.insert(0, os.path.join(HERE, '..'))
    import tc_common
    tc_common.setup_render_device(bpy.context.scene)   # 渲染守卫：本脚本必须自己配 GPU（export_budget 每阶段还会再配一次）
    os.makedirs(A['work'], exist_ok=True)
    common_pairs = [('--log', A['log'])] if A['log'] else []
    blend_pair = ('--save', BLEND) if A['blend_flag'] == 'save' else ('--blend', BLEND)
    # 1) 建场景 + 存 .blend（64px / 1spp 探针只是让 build.py 走完它的渲染收尾）
    phase(A['build'], [('--res', '64'), ('--samples', '1'), ('--out', A['probe']),
                       blend_pair, ('--cam', 'c1')] + common_pairs)
    # 2) 标准档：就在刚建好的场景上导（材质还是原始值，export_budget 自己压平）
    phase(os.path.join(HERE, 'export_budget.py'),
          [('--tier', 'std'), ('--out', A['out_std']), ('--budget-json', A['budget_std']), ('--samples', '32'),
           ('--fit-lo', A['fit_std_lo']), ('--fit-hi', A['fit_std_hi']), ('--lock-tex', A['lock_tex'])])
    # 3) 低档：从盘上的 .blend 重开（几何 / 材质复原），独立减面与烘焙
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    phase(os.path.join(HERE, 'export_budget.py'),
          [('--tier', 'low'), ('--out', A['out_low']), ('--budget-json', A['budget_low']), ('--samples', '32'),
           ('--fit-lo', A['fit_low_lo']), ('--fit-hi', A['fit_low_hi']), ('--lock-tex', A['lock_tex'])])
    print('[budget_job] DONE', A['id'], flush=True)


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if A['log']:
        with open(A['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
