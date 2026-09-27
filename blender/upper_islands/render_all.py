"""blender -b --python-expr "import runpy;runpy.run_path('blender/upper_islands/render_all.py')" -- <outdir> [ids...]"""
import sys, os, runpy, traceback
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, D)
import common
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; ids = a[1:] or ['isle30', 'isle29', 'isle25', 'isle9', 'isle10', 'isle6', 'isle2']
for i in ids:
    try:
        g = runpy.run_path(os.path.join(D, i + '.py'))
        common.run(g['build'], os.path.join(out, 'upper_isle_%s_draft.jpg' % i))
    except Exception:
        open(os.path.join(out, 'upper_isle_err.txt'), 'a').write(i + '\n' + traceback.format_exc())
