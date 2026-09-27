#!/usr/bin/env python3
"""建模测试件（blender/props/*）CC0 素材下载。只从 polyhaven.com 取。

用法：python3 blender/props/fetch_assets.py
下载到 blender/data/props/（gitignore），来源记在 blender/props/CREDITS.md。
"""
import io, json, os, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'props')
UA = {'User-Agent': 'eden-props-test'}
TEX = ['concrete_wall_008', 'smooth_concrete_floor', 'hangar_concrete_floor',
       'rubber_tiles', 'concrete_floor_worn_001', 'box_profile_metal_sheet',
       'grass_ground', 'dirt_floor', 'rough_wood',
       # blender/landmarks/*（大教堂、首相府）
       'white_sandstone_blocks_02', 'dark_brick_wall', 'roof_slates_02', 'white_stucco',
       'precast_stone_paving', 'asphalt_02', 'patterned_paving']
HDRI = ['dry_field', 'rostock_laage_airport', 'farmland_overcast']
# Poly Haven 模型（glTF 1k，CC0）：挤奶厅 / 牧场可直接摆的配件
MODELS = ['garden_hose_wall_mounted_01', 'modular_industrial_pipes_01',
          'mounted_fluorescent_lights', 'utility_box_01', 'plastic_crate_01']
# ambientCG（CC0）：拉丝不锈钢、橡胶
ACG = ['Metal009', 'Rubber004']
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor_gl', 'Rough': 'rough'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def save(p, url):
    if os.path.exists(p):
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    data = get(url)
    with open(p, 'wb') as f:
        f.write(data)


def main():
    for a in TEX:
        files = json.loads(get(f'https://api.polyhaven.com/files/{a}'))
        for m, s in MAPS.items():
            save(os.path.join(OUT, 'tex', a, f'{a}_{s}_2k.jpg'), files[m]['2k']['jpg']['url'])
    for h in HDRI:
        files = json.loads(get(f'https://api.polyhaven.com/files/{h}'))
        save(os.path.join(OUT, 'hdri', f'{h}_2k.hdr'), files['hdri']['2k']['hdr']['url'])
    for aid in MODELS:
        g = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))['gltf']['1k']['gltf']
        d = os.path.join(OUT, 'models', aid)
        for rel, info in [(os.path.basename(g['url']), g)] + list(g['include'].items()):
            save(os.path.join(d, rel), info['url'])
    for aid in ACG:
        d = os.path.join(OUT, 'tex', aid)
        if not os.path.isdir(d):
            z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_2K-JPG.zip')))
            os.makedirs(d, exist_ok=True)
            for n in z.namelist():
                if n.endswith(('Color.jpg', 'NormalGL.jpg', 'Roughness.jpg', 'Metalness.jpg')):
                    with open(os.path.join(d, n), 'wb') as f:
                        f.write(z.read(n))
    print('ok', OUT)


if __name__ == '__main__':
    main()
