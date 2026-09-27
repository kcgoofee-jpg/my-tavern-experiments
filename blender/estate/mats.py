# 伊甸庄园 · 材质库。色值是 docs/eden-estate.md §6 的 sRGB（Blender 里换成线性值）。
# 所有权：INTERIOR 建造者（外墙风化、雨痕也在这里做，SHELL 只按名字取材质）。
# 接口：get(name) → bpy.types.Material（按名字缓存；未知名字返回洋红并警告一次）。纹理尺度按公制 UV（1 UV = 1 m，见 core.metric_uv_bm）。
# 桩实现：只有 Principled 纯色 + 粗糙度 / 金属度 / 光泽。正式实现把 CC0 贴图（assets.texture_set）和程序做旧叠上去，名字不变。
import bpy
from . import core

P = 'est_'   # Blender 材质名前缀

# name: (sRGB 底色, 粗糙度, 金属度, 备注)。「§6」= 设定色板原值；「推断」= 色板外、按设定文字自定的颜色。
PALETTE = {
    # ---- 6.1 石材
    'stone_portland':     ('#E4DED2', 0.75, 0.0, '§6 白石（波特兰鲕状灰岩），外墙光面；要风化、雨痕、色差（C3 评审 R4-3 建议 #E6DFD0）'),
    'stone_rustic':       ('#CFC7B8', 0.80, 0.0, '§6 粗面石：F1 基座、台基、台阶；砌缝 #A89F8F'),
    'stone_trim':         ('#F0ECE3', 0.60, 0.0, '§6 线脚白石：柱、檐口、窗套、栏杆'),
    'marble_statuario':   ('#F2F0EC', 0.20, 0.0, '§6 卡拉拉白，灰色细长主纹 #9A9A9C（不要褐色树根纹）'),
    'marble_calacatta':   ('#F1ECE2', 0.20, 0.0, '§6 卡拉卡塔金，纹 #B89B6A；浴室墙与台面（台面粗糙 0.15）'),
    'marble_nero':        ('#1E1E20', 0.15, 0.0, '§6 黑金花，纹 #E8E6E0'),
    'marble_alpi_green':  ('#2F4A3C', 0.20, 0.0, '§6 阿尔卑斯绿，纹 #9FB3A4'),
    'marble_siena':       ('#D9B66E', 0.20, 0.0, '§6 西耶纳黄，纹 #8C6A34'),
    'marble_levanto':     ('#7A2E2A', 0.20, 0.0, '§6 勒万托红，纹 #D8C8B8'),
    'scagliola_porphyry': ('#6B2E35', 0.15, 0.0, '§6 仿斑岩人造大理石，斑点 #C4A48C'),
    'lead_roof':          ('#8A8D90', 0.70, 0.3, '§6 铅皮屋面、穹顶，次色 #9A9DA0'),
    # ---- 6.2 木材
    'oak':                ('#A57A4B', 0.45, 0.0, '§6 橡木，纹 #7E5A34，蜡面'),
    'walnut':             ('#5A3A22', 0.30, 0.0, '§6 胡桃木，纹 #3A2414'),
    'mahogany':           ('#5E2A1A', 0.15, 0.0, '§6 桃花心木，纹 #3E1A10，法式抛光；加低频明暗做旧'),
    'ebony':              ('#1C1512', 0.20, 0.0, '§6 乌木'),
    'satinwood':          ('#D8B777', 0.25, 0.0, '§6 缎木，纹 #B8964E'),
    'paint_panel':        ('#EDE6D6', 0.60, 0.0, '§6 油漆护墙板'),
    # ---- 6.3 金属
    'gold_leaf':          ('#E6C36A', 0.25, 1.0, '§6 天城金（金箔）'),
    'ormolu':             ('#C9A24B', 0.30, 1.0, '§6 鎏金铜'),
    'brass':              ('#B5913F', 0.20, 1.0, '§6 抛光黄铜：龙头、冲水手柄、毛巾架、电梯'),
    'brass_aged':         ('#A88A45', 0.35, 1.0, 'C3 评审 R4-8：把手、龙头以外的五金用做旧黄铜'),
    'nickel':             ('#C7C9C8', 0.15, 1.0, '§6 镀镍'),
    'wrought_iron':       ('#26272A', 0.50, 0.8, '§6 锻铁'),
    'silver':             ('#BFC3C4', 0.25, 1.0, '§6 古银'),
    # ---- 6.4 织物、陶瓷与其他
    'damask_crimson':     ('#7B1E2B', 0.60, 0.0, '§6 深红丝缎锦，纹样 #5C1420，sheen 0.6'),
    'silk_blue':          ('#2C3E63', 0.55, 0.0, '§6 天城蓝丝'),
    'silk_green':         ('#2F5D4E', 0.55, 0.0, '§6 帝政绿丝'),
    'silk_rose':          ('#C99A93', 0.55, 0.0, '§6 玫瑰粉丝'),
    'silk_ivory':         ('#EEE7D8', 0.55, 0.0, '推断：象牙丝缎锦（主卧、客用起居室）'),
    'silk_duckegg':       ('#CFE0D6', 0.60, 0.0, '推断：浅鸭蛋绿 / 蓝（花园厅、起居室）'),
    'velvet_champagne':   ('#CDB58A', 0.80, 0.0, '§6 香槟丝绒，sheen 0.9'),
    'velvet_red':         ('#8E2130', 0.80, 0.0, '推断：红丝绒坐垫'),
    'linen_ivory':        ('#EEE7D8', 0.85, 0.0, '§6 象牙亚麻'),
    'cotton_bed':         ('#F7F4EE', 0.90, 0.0, '§6 床品白（埃及棉），sheen 0.25'),
    'towel':              ('#EFE9DF', 0.95, 0.0, '§6 毛巾（长绒棉）；C3 R4-1：不透明、绒圈法线、sheen 0.4'),
    'towel_green':        ('#2E4A3A', 0.95, 0.0, '推断：书房盥洗室深绿手巾'),
    'gold_thread':        ('#E6C36A', 0.40, 0.6, '§6 金线刺绣'),
    'satin_old_gold':     ('#B89A5A', 0.30, 0.0, 'C3 R4-14：床旗旧金缎面'),
    'rug_aubusson':       ('#E3D4B8', 0.95, 0.0, '§6 奥布松 / 萨伏纳里：底 #E3D4B8，玫瑰 #B7776B，叶 #6F7F5B'),
    'rug_heriz':          ('#7A2A22', 0.95, 0.0, '§6 赫里兹：底 #7A2A22，靛 #27304F'),
    'rug_crimson':        ('#6E1F28', 0.95, 0.0, '推断：绛红长地毯（肖像廊、餐厅）'),
    'porcelain':          ('#F6F4EF', 0.05, 0.0, '§6 卫浴白瓷：clearcoat 1.0，IOR 1.5'),
    'sevres_blue':        ('#1F3F8F', 0.05, 0.0, '§6 塞夫尔蓝'),
    'plaster_cream':      ('#E9E1CF', 0.85, 0.0, '§6 奶油灰泥（室内墙）'),
    'plaster_ceiling':    ('#F3EFE6', 0.90, 0.0, '§6 顶棚白'),
    'glass_window':       ('#2B3238', 0.05, 0.0, '§6 外窗玻璃（C3 R4-3 取 #2B3238），6+6 白窗棂'),
    'mirror':             ('#C8CCCC', 0.03, 1.0, '推断：镜面（边缘暗化做旧）'),
    'water':              ('#1E3B47', 0.05, 0.0, '§6 水面'),
    'lawn':               ('#5F7F3E', 0.90, 0.0, '§6 草坪（C3 R4-8：饱和度 −15%，偏橄榄）'),
    'lawn_dark':          ('#52703A', 0.90, 0.0, '§6 深草条纹'),
    'hedge':              ('#2F4A26', 0.90, 0.0, '§6 黄杨绿篱'),
    'gravel':             ('#CFC6B0', 0.95, 0.0, '§6 砾石'),
    'tree_crown':         ('#3E5A2E', 0.90, 0.0, '推断：树冠'),
    'rock':               ('#8C8374', 0.95, 0.0, '推断：岛体岩基'),
    'soil':               ('#6B5A44', 0.95, 0.0, '推断：花坛土、菜畦'),
    'brick':              ('#9C5B43', 0.85, 0.0, '推断：围墙花园砖墙'),
    'felt_green':         ('#1F5A3A', 0.95, 0.0, '推断：台球呢'),
    'leather_red':        ('#6A2020', 0.45, 0.0, '推断：酒红皮'),
    'leather_green':      ('#2E4A34', 0.45, 0.0, '推断：绿皮桌面'),
    'aether_glow':        ('#73E6FF', 0.30, 0.0, '推断：以太冷光芯 / 以太晶（emission）'),
    'lamp_glow':          ('#FFD9A0', 0.30, 0.0, '推断：2,700 K 灯光（emission）'),
    'overlay_master':     ('#7A5FA0', 0.60, 0.0, '§6 叠加层：主人（半透明 0.35）'),
    'overlay_staff':      ('#C98A40', 0.60, 0.0, '§6 叠加层：仆役'),
    'overlay_guest':      ('#4C8C99', 0.60, 0.0, '§6 叠加层：访客'),
    'placeholder':        ('#FF00FF', 0.50, 0.0, '未知材质名'),
}

# 饰面（plan.py 的 floor_mat / wall_mat 用这些名字）= 底材质 + 图案。桩实现直接用底材质；正式实现做图案。
FINISH = {
    # 地面
    'marble_checker_diag':  ('marble_statuario', '1.2 m 斜置棋盘格：Statuario + 黑金花（大厅）；中心 4 m 家徽圆盘另建'),
    'marble_checker_small': ('marble_statuario', '小方格：黑金花 + 卡拉卡塔金 / 黑白（访客盥洗室、早餐室、卫浴）'),
    'marble_compass':       ('marble_statuario', 'Statuario + 黑金花罗盘星形，黄铜指北针（眺望亭）'),
    'oak_herringbone':      ('oak', '橡木人字拼'),
    'oak_versailles':       ('oak', '橡木凡尔赛拼（1 m 方格）'),
    'oak_plank':            ('oak', '橡木长条地板'),
    'stone_flag':           ('stone_rustic', '石板地面（服务、门厅、楼梯）'),
    'lino':                 ('paint_panel', '油毡（仿橡木色 / 灰）'),
    'tile_white':           ('plaster_ceiling', '白瓷砖（洗衣房、盥洗、配餐）'),
    'portland_paving':      ('stone_portland', '波特兰石板屋顶平台'),
    # 墙面
    'plaster_stone':        ('plaster_cream', '石色抹灰刻假石缝'),
    'panel_paint_ivory':    ('paint_panel', '米白油漆护墙板'),
    'panel_mahogany':       ('mahogany', '桃花心木护墙 / 衣柜墙'),
    'panel_walnut':         ('walnut', '胡桃木护墙'),
    'paper_chinoiserie':    ('silk_duckegg', '手绘中国风花鸟壁纸 + 白护墙板（茶室）'),
    'plaster_yellow_mural': ('satinwood', '浅黄灰泥 + 手绘藤蔓（早餐室）'),
}


_cache, _warned = {}, set()
def get(name):
    """材质名 → Material（PALETTE 或 FINISH 的名字）。"""
    if name in _cache and _cache[name].name in bpy.data.materials: return _cache[name]
    base = FINISH[name][0] if name in FINISH else name
    if base not in PALETTE:
        if name not in _warned: print(f'[mats] unknown material {name!r} → placeholder'); _warned.add(name)
        base = 'placeholder'
    hexc, rough, metal, _ = PALETTE[base]
    m = bpy.data.materials.new(P + name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*core.hexrgb(hexc), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if base in ('aether_glow', 'lamp_glow'):
        for k in ('Emission Color', 'Emission'):
            if k in b.inputs: b.inputs[k].default_value = (*core.hexrgb(hexc), 1); break
        b.inputs['Emission Strength'].default_value = 3.0
    if base == 'glass_window': b.inputs['Roughness'].default_value = 0.05
    m.diffuse_color = (*core.hexrgb(hexc), 1)
    _cache[name] = m
    return m


def names():
    return sorted(set(PALETTE) | set(FINISH))
