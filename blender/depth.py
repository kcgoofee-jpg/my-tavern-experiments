"""纵深系统数学（Python 版）。与 map/core/depth.mjs 同一规格、函数一一对应；tests/fixtures/depth_golden.json 对拍（smoke 里跑）。
纯 Python，不依赖 bpy：Blender 渲染（tiancheng_upper.py）、合成（tools/upper_depth_post.py）都 import 它。常数只在 map/data/<layer>_depth.json。

  depth_of(isl, cfg)            d = isl.d（显式）或 clamp((alt_near − alt) / (alt_near − alt_far), 0, 1)
  channel(name, d, cfg, ov={})  线性插值 near → far；overrides 里有同名数值时直接用它
                                scale / haze / parallax / ward → 数；label → 不透明度；tint → {mul: [r,g,b], sat: Δ饱和度, gamma}
  clouds_above(alt, cfg)        比这个海拔高的云片 id（从高到低）——盖在这座岛上的云
设计：docs/design/depth-system.md。
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load(rel='map/data/upper_depth.json'):
    return json.load(open(os.path.join(ROOT, rel), encoding='utf-8'))


def _r(x): return math.floor(float(x) * 1e4 + 0.5) / 1e4   # 与 JS Math.round 同一取整（半数进位）


def _lerp(a, b, t): return a + (b - a) * t


def depth_of(isl, cfg):
    if isl.get('d') is not None: return _r(isl['d'])
    c = cfg['camera']; span = c['alt_near'] - c['alt_far']
    return _r(min(1.0, max(0.0, (c['alt_near'] - isl['alt']) / span)))


def channel(name, d, cfg, ov=None):
    ov = ov or {}
    if isinstance(ov.get(name), (int, float)) and not isinstance(ov.get(name), bool): return _r(ov[name])
    ch = cfg['channels'][name]
    if name == 'label': return _r(_lerp(ch['opacity_near'], ch['opacity_far'], d))
    if name == 'tint':
        return {'mul': [_r(_lerp(a, b, d)) for a, b in zip(ch['near'], ch['far'])],
                'sat': _r(ch.get('sat_far', 0.0) * d), 'gamma': _r(_lerp(1.0, ch.get('gamma_far', 1.0), d))}
    return _r(_lerp(ch['near'], ch['far'], d))


def clouds_above(alt, cfg):
    return [c['id'] for c in sorted(cfg.get('cloud_sheets', []), key=lambda c: -c['alt']) if c['alt'] > alt]


def island(iid, cfg):
    """一座岛的全部通道（渲染 / 合成用的便捷函数；前端用 depth.mjs 同名组合）"""
    isl = cfg['islands'][iid]; d = depth_of(isl, cfg); ov = isl.get('overrides') or {}
    return dict(d=d, **{n: channel(n, d, cfg, ov) for n in cfg['channels']}, clouds=clouds_above(isl['alt'], cfg),
                ward_edge=ov.get('ward_edge'))
