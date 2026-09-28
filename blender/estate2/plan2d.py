"""estate2 标注总平面图（示意图，不是美术）：python3 blender/estate2/plan2d.py [out.png]"""
import math, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import Polygon, Ellipse, Circle, Rectangle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import layout as L

for f in ('/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc'):
    if os.path.exists(f):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break

OUT = sys.argv[1] if len(sys.argv) > 1 else 'docs/drafts/eden2_plan.png'
xs, ys = np.meshgrid(np.arange(-350, 351, 2.0), np.arange(-275, 276, 2.0))
h, att = L.terrain(xs, ys)
inside = L.edge_dist(xs, ys) > 0
th = np.linspace(-math.pi, math.pi, 720); R = L.outline_R(th)

GROUP_C = {'main': '#f4efe4', 'guest': '#e9d9c0', 'villa': '#f1e3cc', 'grey': '#b9b6ae', 'svc': '#d7cfc0', 'breakers': '#efe0c2', 'club': '#e9d9c0'}
EDGE = '#6b4a2e'

fig, ax = plt.subplots(figsize=(15, 10.2), dpi=100)
fig.subplots_adjust(0.01, 0.01, 0.70, 0.95)
ax.set_facecolor('#dfe7ee')
# 地面：林地为主，草坪 / 砾石 / 湖
gy, gx = np.gradient(h, 2.0)
slope = np.hypot(gx, gy)
shade = np.clip(1 + (-gx * 0.6 + gy * 0.6) * 0.35, .65, 1.25)[..., None]
tex = 1 + 0.06 * L.fbm(xs, ys, 9, 2, 5)[..., None]
img = np.broadcast_to(np.array([.30, .43, .27]), h.shape + (3,)) * tex          # 混交林冠（深）

def lay(mask, col):
    global img
    m = np.clip(mask, 0, 1)[..., None]; img = img * (1 - m) + np.array(col) * tex * m
lay(att['tropic'], [.20, .36, .22])            # 别墅周边热带林下
lay(att['meadow'], [.66, .70, .45])            # 外坡草甸 / 野花
lay(att['lawn'], [.60, .78, .45])              # 修剪草坪（亮）
lay(att['gravel'], [.88, .84, .74])            # 砾石林荫道 / 步道
lay(att['paved'], [.95, .93, .88])             # 白石 / 石灰华铺装
lay(att['beds'], [.80, .55, .60])              # 季节花境
lay(np.clip((slope - 0.75) / 0.4, 0, 1) * (att['padmask'] < .5), [.55, .51, .46])   # 崖面 / 裸岩
lay(att['sand'], [.90, .85, .72])              # 湖岸沙砾
img = img * shade
lk = (att['lake'] > .5)[..., None]; img = np.where(lk, np.array([.55, .72, .82]), img)
bl = (att['built'] > .5)[..., None]; img = np.where(bl, np.array([.80, .78, .74]), img)   # 挡土墙
img = np.where((att['rill'] > .5)[..., None], np.array([.45, .65, .80]), img)
img = np.where(inside[..., None], np.clip(img, 0, 1), np.array([.87, .91, .94]))
ax.imshow(img, extent=(-351, 351, -276, 276), origin='lower', interpolation='bilinear')
cs = ax.contour(xs, ys, np.where(inside, h, np.nan), levels=np.arange(-6, 44, 2), colors='#4a4a3a', linewidths=.25, alpha=.45)
cs2 = ax.contour(xs, ys, np.where(inside, h, np.nan), levels=np.arange(0, 44, 10), colors='#3a3a2a', linewidths=.7, alpha=.7)
ax.clabel(cs2, fmt='%d m', fontsize=6)
ax.plot(R * np.cos(th), R * np.sin(th), color='#5a4a3a', lw=1.4)

def rect(b, color, lw=.8, z=5):
    _, cx, cy, w, d, *_r = b; a = math.radians(b[6]); c, s = math.cos(a), math.sin(a)
    pts = [(cx + px * c - py * s, cy + px * s + py * c) for px, py in ((-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2))]
    ax.add_patch(Polygon(pts, fc=color, ec=EDGE, lw=lw, zorder=z))

for pts in L.WALKWAYS:
    p = np.array(pts); ax.plot(p[:, 0], p[:, 1], color='#a0522d', lw=2.2, zorder=4, solid_capstyle='round')
for pts in L.FOOTPATHS:
    p = np.array(pts); ax.plot(p[:, 0], p[:, 1], color='#7a5a3a', lw=.8, ls=(0, (3, 2)), zorder=4)
(a, b) = L.FUNICULAR; ax.plot([a[0], b[0]], [a[1], b[1]], color='#222', lw=1.6, ls=(0, (1, 1)), zorder=6)
(a, b) = L.ROPE_BRIDGE; ax.plot([a[0], b[0]], [a[1], b[1]], color='#8b0000', lw=2, zorder=6)
# 园林分区
for gid, name, kind, c, sz, rot in L.GARDENS:
    kw = dict(fc='none', ec='#2f6b2f', lw=1.0, ls='--', zorder=5)
    if kind == 'rect': ax.add_patch(Rectangle((c[0]-sz[0]/2, c[1]-sz[1]/2), sz[0], sz[1], angle=rot, rotation_point='center', **kw))
    else: ax.add_patch(Ellipse(c, 2*sz[0], 2*sz[1], angle=rot, **kw))
for grp, col in ((L.MAIN, 'main'), (L.GUEST, 'guest'), (L.VILLAS, 'villa'), (L.GREYSTONE, 'grey'), (L.SERVICE, 'svc')):
    for b in grp: rect(b, GROUP_C[col])
rect(L.BREAKERS, GROUP_C['breakers']); rect(L.CLUB, GROUP_C['club']); rect(L.WATERSIDE, GROUP_C['club'])
ax.add_patch(Circle(L.ARC['c'], L.ARC['R'] + 4, fc='none', ec=EDGE, lw=6, alpha=.5, zorder=5))
ax.add_patch(Circle(L.ARC['c'], L.ARC['R'] - 4, fc=GROUP_C['main'], ec='none', alpha=.0))
for x, y, _ in L.TREEHOUSES: ax.add_patch(Circle((x, y), 4, fc='#c89b6b', ec=EDGE, lw=.6, zorder=5))
x, y, r = L.ISLET; ax.add_patch(Circle((x, y), r, fc='#a9c48a', ec=EDGE, lw=.6, zorder=5)); ax.add_patch(Circle((x, y), 3.5, fc=GROUP_C['main'], ec=EDGE, lw=.6, zorder=6))
x, y, r, _ = L.WATER_TOWER; ax.add_patch(Circle((x, y), r, fc='#cfe3ee', ec=EDGE, lw=.8, zorder=5))
x, y, r = L.HELIPAD; ax.add_patch(Circle((x, y), r, fc='#cfcfcf', ec=EDGE, lw=.8, zorder=5))
for x, y in L.BARRIER_STONES: ax.plot(x, y, marker='^', color='#6a3d9a', ms=7, zorder=6)
ax.add_patch(Circle(L.FOUNTAIN, 7, fc='#9cc3d6', ec=EDGE, zorder=6))
ax.add_patch(Circle((0, -256), 17, fc='#e0d8c8', ec=EDGE, lw=1, zorder=5))

# 编号标签
LAB = [
    (1, (0, 0), '主楼：大厅·会客厅 / 书房·主卧·女仆长寝室；B1–B2 见地下层图'),
    (2, (-17, -17), '观景塔（屋顶眺望亭）'),
    (3, (-48, -2), '西翼：餐厅·备餐 / 厨房·洗衣 / F2 客房×2 / F3 新人寝室、女仆团宿舍'),
    (4, (-68, 32), '西角亭：物资仓库、清洗间、值班·监控室'),
    (5, (45, 0), '东翼：F2 东侧长廊、起居室·茶室 / F3 住客个人寝室×12、三楼浴室'),
    (6, (63, 33), '东角亭：图书室 + 观景室'),
    (7, (0, 30), '半圆回廊 + 后庭草坪（无水池）'),
    (8, (-62, 58), '露天训练场'),
    (9, (0, -113), '前庭 + 喷泉'),
    (10, (0, -256), '访客停靠平台'),
    (11, (0, -200), '长坡大道（Biltmore 尺度）'),
    (12, (58, -104), '玫瑰园（东 / 西）'),
    (13, (125, 10), '客房楼 g1–g4（有顶连廊）'),
    (14, (-104, -46), '水疗馆 + 西客房楼'),
    (15, (232, -148), 'Breakers 式宾客馆（长住访客）+ 海景泳池'),
    (16, (-232, -100), 'Greystone 式旧宅（家族收藏）+ 台地花园'),
    (17, (-62, 138), '人工湖'),
    (18, (-84, 118), '凉亭'),
    (19, (72, 134), '湖边俱乐部（缆车下崖）'),
    (20, (-168, 112), '服务区：服务院四翼 / 悬浮车库 / 温室 / 菜园'),
    (21, (-214, 150), '悬浮载具库 + 载具停靠坪'),
    (22, (-196, 88), '以太凝水塔（供喷泉）'),
    (23, (198, 21), '索桥（跨沟谷）'),
    (24, (240, 60), '林中别墅 V1–V10（预留外部人物长住）'),
    (25, (40, 222), '树屋 ×6'),
    (26, (-200, -150), '树篱迷宫'),
    (27, (205, 145), '果园'),
    (28, (300, 4), '崖边观景台 ×3'),
    (29, (235, -165), '结界锚碑 ×4（结界发生器在主楼 B2）'),
    (30, (-22, 150), '湖心亭（湖心小岛 8 柱圆亭）'),
    (31, (-34, 100), '水榭（湖岸石台敞亭）'),
]
for n, (x, y), _ in LAB:
    ax.annotate(str(n), (x, y), fontsize=8, fontweight='bold', ha='center', va='center', zorder=9, color='white',
                bbox=dict(boxstyle='circle,pad=.2', fc='#7a1f1f', ec='white', lw=.6))
for i, (x, y, _) in enumerate(L.VILLAS and [(b[1], b[2], 0) for b in L.VILLAS]):
    ax.text(x, y - 9, f'V{i+1}', fontsize=6, ha='center', zorder=8, color='#3a2a1a')
ax.set_xlim(-350, 350); ax.set_ylim(-275, 275); ax.set_aspect('equal'); ax.set_xticks([]); ax.set_yticks([])
ax.set_title('伊甸庄园 v2 · 标注总平面（岛约 670 × 500 m；下方 = 正面 -y）', fontsize=13, loc='left')
ax.plot([220, 320], [-262, -262], color='k', lw=3); ax.text(270, -257, '100 m', ha='center', fontsize=8)
ax.annotate('N', (330, 250), fontsize=12, ha='center'); ax.annotate('', (330, 245), (330, 222), arrowprops=dict(arrowstyle='->'))
# 图例
lg = fig.add_axes([0.71, 0.0, 0.285, 0.97]); lg.axis('off')
yy = 0.995
for n, _, t in LAB:
    lg.text(0, yy, f'{n:>2}  {t}', fontsize=7.2, va='top', wrap=True); yy -= .0205
yy -= .01
for c, t in (('#f2eee5', '白石 / 石灰华铺装台地'), ('#e0d6bd', '砾石林荫道 / 步道'), ('#99c773', '修剪草坪'), ('#a8b273', '外坡草甸'),
             ('#4d6e45', '混交林冠'), ('#335c38', '热带林下（别墅周边）'), ('#cc8c99', '季节花境'), ('#8c8275', '崖面 / 裸岩'),
             ('#e6d9b8', '湖岸沙砾'), ('#cdc7bd', '石挡土墙'), ('#73a6cc', '水渠 / 湖'),
             (GROUP_C['main'], '主楼群（白石 · 陶土红瓦）'), (GROUP_C['guest'], '客房 / 俱乐部'), (GROUP_C['villa'], '别墅'),
             (GROUP_C['grey'], 'Greystone 灰石'), (GROUP_C['svc'], '服务区')):
    lg.add_patch(Rectangle((0, yy - .012), .05, .014, fc=c, ec=EDGE, transform=lg.transAxes)); lg.text(.07, yy, t, fontsize=7.2, va='top'); yy -= .0158
for st, t in ((dict(color='#a0522d', lw=2.2), '有顶连廊（随地形）'), (dict(color='#7a5a3a', lw=.8, ls=(0, (3, 2))), '林间步道 / 仆从动线'),
              (dict(color='#222', lw=1.6, ls=(0, (1, 1))), '缆车'), (dict(color='#8b0000', lw=2), '索桥'), (dict(color='#2f6b2f', lw=1, ls='--'), '园林 / 场地分区'),
              (dict(color='#4a4a3a', lw=.5), '等高线 2 m（粗线 10 m）')):
    lg.plot([0, .05], [yy - .006] * 2, transform=lg.transAxes, **st); lg.text(.07, yy, t, fontsize=7.2, va='top'); yy -= .0158
lg.text(0, yy - .01, '室内按卡「地上三层 + 地下两层」分翼落位；\nkind = restricted 的房间不标注。详表见 docs/eden-lore-space.md', fontsize=7, va='top', color='#555')
lg.set_xlim(0, 1); lg.set_ylim(0, 1)
fig.savefig(OUT + '.tmp.png', dpi=100)
from PIL import Image
Image.open(OUT + '.tmp.png').convert('RGB').quantize(128).save(OUT, optimize=True); os.remove(OUT + '.tmp.png')
print(OUT, os.path.getsize(OUT) // 1024, 'KB')


# ---------------------------------------------------------------- 地下层（B1 / B2）
OUTB = OUT.replace('.png', '_basement.png')
fig, axs = plt.subplots(1, 2, figsize=(13, 4.6), dpi=100)
fig.subplots_adjust(0.02, 0.08, 0.98, 0.84, 0.06)
COL = {'主调教室': '#d9d4cc', '私人调教室': '#d9d4cc', '性技巧训练室': '#d9d4cc', '惩罚室': '#d9d4cc', '恒温酒窖': '#ead9c4', '档案室': '#dfe6ee', '储藏室': '#e8e4da', '体能训练室': '#dcead9', '医疗与改造室': '#d9e9ec'}
b = [q for q in L.MAIN if q[0] == 'hall'][0]
for i, lv in enumerate(('B1', 'B2')):
    ax = axs[i]
    for n, x0, y0, x1, y1 in L.BASEMENT['hall'][lv]:
        c = COL.get(n, '#f3f1ec')
        ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fc=c, ec='#4a3a2a', lw=1.2))
        ax.text((x0 + x1) / 2, (y0 + y1) / 2, n, ha='center', va='center', fontsize=7, wrap=True)
    ax.set_xlim(-b[3] / 2 - 1, b[3] / 2 + 1); ax.set_ylim(-b[4] / 2 - 1, b[4] / 2 + 1); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title(f'1 主楼 · {lv}（{"-4.5" if lv == "B1" else "-9.0"} m）  {b[3]}×{b[4]} m', fontsize=11, loc='left')
fig.suptitle('伊甸庄园 v2 · 地下层平面（卡：地上三层 + 地下两层）', fontsize=13, x=0.02, ha='left')
fig.text(0.02, 0.015, L.BASEMENT_LINK + '；房间取 map/data/eden_estate_rooms.json（卡 §6）。下方 = 正面。', fontsize=8.5, color='#555')
fig.savefig(OUTB + '.tmp.png', dpi=100)
Image.open(OUTB + '.tmp.png').convert('RGB').quantize(64).save(OUTB, optimize=True); os.remove(OUTB + '.tmp.png')
print(OUTB, os.path.getsize(OUTB) // 1024, 'KB')
