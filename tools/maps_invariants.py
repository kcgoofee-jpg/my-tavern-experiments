"""maps.json 的树不变量（tools/check_maps.py 调用；tools/test_maps_invariants.py 自测）。纯函数，不读文件。

  - 没有孤儿：除根之外的每张图，parent 链都走得到根（根 = 唯一一张没有 parent 的图，kind=world）；不许成环
  - 字段 `test` 取消（S2-A 删掉了测试入口机制：地图要么是地点、挂在树上，要么不在注册表里）
  - 每个 anchor.zone 都在 map/estate/model/zones.json 里（三维页在父级三维视图里所在的区域）
"""


def invariants(maps, zone_ids):
    """maps = maps.json 的 maps 表；zone_ids = zones.json 里的区域 id 集合 → 错误信息列表。"""
    errs = []
    roots = [k for k, m in maps.items() if not m.get('parent')]
    root = roots[0] if len(roots) == 1 and maps[roots[0]].get('kind') == 'world' else None
    if root is None:
        errs.append(f'应恰有一张没有 parent 的根图（kind=world），现在是 {roots}')
    for mid, m in maps.items():
        if 'test' in m:
            errs.append(f'{mid}.test：字段已取消（测试入口机制已删除；这张图要么是地点、挂在树上，要么不放进注册表）')
        chain, k = [mid], mid
        while maps.get(k, {}).get('parent') in maps:   # 指向不存在的 parent 由 check_maps 另报
            k = maps[k]['parent']
            if k in chain:
                errs.append(f'{mid}: parent 链成环 {" > ".join(chain + [k])}')
                break
            chain.append(k)
        else:
            if root is not None and k != root and maps.get(k, {}).get('parent') is None:
                errs.append(f'{mid}: 孤儿地图，parent 链 {" > ".join(chain)} 走不到根 {root}')
        a = m.get('anchor')
        if a is not None:
            z = a.get('zone') if isinstance(a, dict) else None
            if not isinstance(z, str) or z not in zone_ids:
                errs.append(f'{mid}.anchor.zone → {z!r} 不在 map/estate/model/zones.json 的区域里')
    return errs
