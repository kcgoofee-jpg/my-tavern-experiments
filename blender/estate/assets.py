# 伊甸庄园 · CC0 素材加载（Poly Haven / ambientCG）。规则见 CLOUD_TASK7.md §3a 与 CONTRACT.md §8。
# 所有权：INTERIOR 建造者。
# 缓存：map/estate/assets/<source>/<id>/…（进仓库，CC0）；每个下载的文件都要在 map/estate/assets/CREDITS.md 记一行（credit()）。
# 接口（桩已可用，只做了 Poly Haven 贴图与模型的下载，失败时返回 None，调用方退回程序材质 / 程序几何）：
#   texture_set(asset_id, res='1k', maps=('diff', 'nor_gl', 'rough', 'ao'), source='polyhaven') → {map: 路径} | None
#   model(asset_id, res='1k', source='polyhaven') → .gltf / .blend 路径 | None
#   append_model(asset_id, collection, loc, rot=0, scale=1) → 物体 | None
#   credit(source, asset_id, files, author, license='CC0')
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.abspath(os.path.join(HERE, '..', '..', 'map', 'estate', 'assets'))
CREDITS = os.path.join(CACHE, 'CREDITS.md')
BUDGET_MB = 60              # 仓库里 map/estate/assets/ 的总上限（渲染用源图）；3D 模式另压 KTX2 / meshopt，另算
UA = {'User-Agent': 'eden-estate-builder/1.0 (CC0 asset fetch)'}
OFFLINE = os.environ.get('EDEN_OFFLINE') == '1'


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()


def _save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f: f.write(data)
    return path


def texture_set(asset_id, res='1k', maps=('diff', 'nor_gl', 'rough', 'ao'), source='polyhaven', ext='jpg'):
    """下载（或读缓存）一套 PBR 贴图，返回 {map: 本地路径}；拿不到返回 None。"""
    d = os.path.join(CACHE, source, asset_id)
    out = {}
    for m in maps:
        p = os.path.join(d, f'{asset_id}_{m}_{res}.{ext}')
        if not os.path.exists(p):
            if OFFLINE: return None
            try:
                if source == 'polyhaven':
                    files = json.loads(_get(f'https://api.polyhaven.com/files/{asset_id}'))
                    key = {'diff': 'Diffuse', 'nor_gl': 'nor_gl', 'rough': 'Rough', 'ao': 'AO', 'disp': 'Displacement', 'arm': 'arm'}.get(m, m)
                    url = files[key][res][ext]['url']
                    _save(p, _get(url))
                    credit(source, asset_id, [os.path.relpath(p, CACHE)], _author(asset_id))
                else:
                    return None      # ambientCG：zip 包（https://ambientcg.com/get?file=<id>_1K-JPG.zip），由正式实现解包
            except Exception as e:
                print(f'[assets] {source}/{asset_id} {m}: {type(e).__name__} {e}'); return None
        out[m] = p
    return out


def model(asset_id, res='1k', source='polyhaven', fmt='gltf'):
    """下载（或读缓存）一个模型，返回主文件路径；拿不到返回 None。桩：未实现下载，只读缓存。"""
    p = os.path.join(CACHE, source, asset_id, f'{asset_id}_{res}.{fmt}')
    return p if os.path.exists(p) else None


def append_model(asset_id, collection, loc=(0, 0, 0), rot=0.0, scale=1.0, res='1k'):
    """把模型放进场景；桩：没有缓存时返回 None（调用方用程序几何）。"""
    return None


def _author(asset_id):
    try:
        info = json.loads(_get(f'https://api.polyhaven.com/info/{asset_id}'))
        return ', '.join(f'{k} ({v})' for k, v in info.get('authors', {}).items())
    except Exception: return 'unknown'


def credit(source, asset_id, files, author, license='CC0'):
    """在 CREDITS.md 表里追加一行（同一 source/id 不重复）。格式见 CONTRACT.md §8。"""
    url = {'polyhaven': f'https://polyhaven.com/a/{asset_id}', 'ambientcg': f'https://ambientcg.com/view?id={asset_id}'}.get(source, '')
    os.makedirs(CACHE, exist_ok=True)
    if not os.path.exists(CREDITS):
        open(CREDITS, 'w', encoding='utf-8').write('# map/estate/assets · 素材来源\n\n| 文件 | 来源 | 作者 | 许可 | 用途 |\n|---|---|---|---|---|\n')
    txt = open(CREDITS, encoding='utf-8').read()
    for f in files:
        if f'`{f}`' in txt: continue
        with open(CREDITS, 'a', encoding='utf-8') as fh: fh.write(f'| `{f}` | [{source} {asset_id}]({url}) | {author} | {license} | |\n')
