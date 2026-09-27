#!/usr/bin/env python3
"""伊甸庄园风格帧（estate2）CC0 素材下载。只从 polyhaven.com / ambientcg.com 取。

用法：python3 blender/estate2/fetch_assets.py
下载到 blender/data/estate2/（gitignore），来源记在 map/estate/assets/CREDITS.md。
"""
import io, json, os, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'estate2')
UA = {'User-Agent': 'eden-estate2-style-frame'}

# (Poly Haven id, 用途)
PH_TEX = [
    ('castle_brick_02_white', '白石墙（主楼群、别墅、栏杆）'),
    ('clay_roof_tiles_02', '陶土红瓦屋面'),
    ('grey_roof_tiles_02', '灰色板岩屋面（Greystone 石屋）'),
    ('castle_wall_varriation', '灰石墙（Greystone 石屋、挡土墙）'),
    ('rock_face_03', '崖面 / 岛底岩基'),
    ('cliff_side', '崖面变化'),
    ('aerial_grass_rock', '林下与坡地草石'),
    ('forest_leaves_02', '林地落叶'),
    ('gravel_floor', '车道与步道砾石'),
    ('bark_brown_02', '树皮（阔叶树、棕榈）'),
]
PH_HDRI = [('kloofendal_48d_partly_cloudy_puresky', '2k', '天光 HDRI')]
ACG = [('Leaf001', '1K-JPG', '树叶贴图（带透明度）')]
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor_gl', 'Rough': 'rough'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def main():
    total = 0
    for aid, _ in PH_TEX:
        files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
        for m, short in MAPS.items():
            p = os.path.join(OUT, 'tex', aid, f'{aid}_{short}_1k.jpg')
            if not os.path.exists(p):
                save(p, get(files[m]['1k']['jpg']['url']))
            total += os.path.getsize(p)
    for aid, res, _ in PH_HDRI:
        p = os.path.join(OUT, 'hdri', f'{aid}_{res}.hdr')
        if not os.path.exists(p):
            files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
            save(p, get(files['hdri'][res]['hdr']['url']))
        total += os.path.getsize(p)
    for aid, attr, _ in ACG:
        d = os.path.join(OUT, 'tex', aid)
        if not os.path.isdir(d):
            z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_{attr}.zip')))
            for n in z.namelist():
                if n.endswith(('Color.jpg', 'Opacity.jpg', 'NormalGL.jpg', 'Roughness.jpg')):
                    save(os.path.join(d, n), z.read(n))
        total += sum(os.path.getsize(os.path.join(d, n)) for n in os.listdir(d))
    print(f'estate2 素材合计 {total / 1e6:.1f} MB → {OUT}')


if __name__ == '__main__':
    sys.exit(main())
