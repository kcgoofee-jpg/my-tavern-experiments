"""伊甸分区图：俯视渲染上叠半透明分区 + 编号 + 图例（林带 / 草甸 / 农业台地按 layout 遮罩栅格）。纯 numpy + PIL。
python3 blender/estate2/zones.py --base top.png --out docs/drafts/eden2_r4_zones.jpg
"""
import sys, math, numpy as np
import os, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout as L
ap = argparse.ArgumentParser(); ap.add_argument('--base', required=True); ap.add_argument('--out', required=True); A = ap.parse_args()
from PIL import Image, ImageDraw, ImageFont
base = Image.open(A.base).convert('RGBA')
Wp, Hp = base.size
def P(x, y): return ((x + 375) / 0.375, (281.25 - y) / 0.375)
F = '/System/Library/Fonts/Hiragino Sans GB.ttc'
f_num = ImageFont.truetype(F, 30); f_leg = ImageFont.truetype(F, 26); f_t = ImageFont.truetype(F, 34)
ov = Image.new('RGBA', base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
# raster zones: woodland / meadow
xs = np.arange(-375, 375, 3.0); ys = np.arange(281, -281, -3.0)
X, Y = np.meshgrid(xs, ys)
e = L.edge_dist(X, Y)
wm = L.wood_mask(X, Y)
H, at = L.terrain(X, Y)
isl = e > 0
def raster(mask, col):
    im = Image.fromarray((mask * 255).astype(np.uint8)).resize((Wp, Hp), Image.NEAREST)
    layer = Image.new('RGBA', base.size, col)
    a = Image.new('L', base.size, 0); a.paste(im.point(lambda v: col[3] if v > 127 else 0))
    layer.putalpha(a); return layer
Z = [  # (号, 名称, 颜色)
    (1, '到达区：停靠平台 O-03 · 大道 · 前庭花园 O-01 · 喷泉 O-02', (255, 200, 60)),
    (2, '主楼与台地：大厅 F1-01 · 观景塔 R-01 · 东侧长廊 F2-07 · 图书室 R-12', (240, 90, 80)),
    (3, '规则园林：玫瑰园 O-10 · 后庭园 O-05 / 草坪 O-07', (255, 120, 200)),
    (4, '客房楼与水疗馆（连廊相接）', (170, 110, 255)),
    (5, '林中别墅 V1 / V2 / V3 / V8（外部人物预留，共 4 栋）', (60, 200, 255)),
    (6, '服务区：仆役楼 R-02 · 悬浮载具库 R-03', (150, 150, 150)),
    (7, '湖区：人工湖 O-08 · 水榭 R-08 · 湖心亭 R-09 · 湖边俱乐部 · 缆车', (40, 120, 255)),
    (8, 'Breakers 式宾客馆（长住访客）', (255, 150, 60)),
    (9, 'Greystone 旧宅 + 台地花园 · Greystone 客舍 + 岩洞泳池 + 锦鲤池', (120, 120, 90)),
    (10, '林带（外坡 / 沟谷 / 别墅周边）', (20, 110, 40)),
    (11, '草甸与园地', (200, 220, 90)),
    (12, '崖岸与观景台 R-10 · 结界锚碑 R-11', (230, 230, 230)),
    (13, '运动：网球场 · 露天训练场 O-06', (220, 60, 30)),
    (14, '果园 · 菜园 R-06 · 温室 R-05 · 橄榄园 · 树篱迷宫 R-07', (140, 200, 60)),
    (16, '悬浮车库 R-04（前院停车，src: user）', (255, 230, 0)),
    (17, '载具停靠坪（悬浮载具库旁，src: user；区别于停靠平台 O-03）', (0, 230, 200)),
    (18, '奶牛农场（挤奶厅 + 奶罐间 + 电围栏围场）', (255, 255, 255)),
    (19, '玻璃健身亭（用户新增 src: user；卡中体能训练室仍在主楼 B1）', (255, 60, 160)),
    (15, '农业台地：葡萄园 · 薰衣草 · 干砌石墙 · 橄榄行 · 农场路', (190, 120, 230)),
]
C = {z[0]: z[2] for z in Z}
ov = Image.alpha_composite(ov, raster(isl & (wm > 0.5), (*C[10], 80)))
ov = Image.alpha_composite(ov, raster(isl & (wm <= 0.5) & (at['meadow'] > 0.5) & (at['lawn'] < 0.3), (*C[11], 60)))
ov = Image.alpha_composite(ov, raster(isl & (at['agri'] > 0.5), (*C[15], 70)))
d = ImageDraw.Draw(ov)
def ell(n, cx, cy, rx, ry, a=95):
    x0, y0 = P(cx - rx, cy + ry); x1, y1 = P(cx + rx, cy - ry)
    d.ellipse([x0, y0, x1, y1], fill=(*C[n], a), outline=(*C[n], 255), width=4)
def rect(n, x0, y0, x1, y1, a=95):
    p0, p1 = P(x0, y1), P(x1, y0)
    d.rectangle([p0, p1], fill=(*C[n], a), outline=(*C[n], 255), width=4)
labels = []
rect(1, -42, -286, 42, -148); ell(1, 0, -113, 30, 30); labels.append((1, 0, -210))
ell(2, 0, 5, 80, 45); labels.append((2, 0, 5))
rect(3, -74, -125, -42, -83); rect(3, 42, -125, 74, -83); ell(3, 0, 44, 20, 12); labels.append((3, 58, -104)); labels.append((3, -58, -104))
for b in L.GUEST: ell(4, b[1], b[2], 13, 13); labels.append((4, b[1], b[2]))
for b in L.VILLAS: ell(5, b[1], b[2], 17, 17); labels.append((5, b[1], b[2]))
ell(6, -195, 135, 36, 28); labels.append((6, -195, 135))
ell(16, -136, 132, 20, 13, 140); labels.append((16, -136, 132))
ell(17, *L.HELIPAD[:2], 13, 13, 150); labels.append((17, *L.HELIPAD[:2]))
ell(18, -275, 8, 30, 26, 110); labels.append((18, -275, 8))
ell(19, *L.GYM[:2], 14, 14, 150); labels.append((19, *L.GYM[:2]))
ell(7, -12, 142, 105, 50, 70); ell(7, 70, 132, 20, 14); labels.append((7, -12, 150))
ell(8, 236, -150, 62, 42); labels.append((8, 236, -150))
ell(9, -228, -95, 62, 55, 70); ell(9, -160, -80, 24, 16); labels.append((9, -228, -95)); labels.append((9, -160, -80))
for pid in ('view_rear', 'view_east', 'view_ne', 'look_sw', 'look_se'):
    p = [q for q in L.PADS if q['id'] == pid][0]; ell(12, *p['c'], 16, 16, 120); labels.append((12, *p['c']))
for x, y in L.BARRIER_STONES: ell(12, x * 0.97, y * 0.97, 7, 7, 200)
for cx, cy, a in L.COURTS: ell(13, cx, cy, 16, 16); labels.append((13, cx, cy))
ell(13, -62, 58, 18, 10); labels.append((13, -62, 58))
ell(14, -118, 150, 38, 26); ell(14, 205, 145, 28, 20); ell(14, 170, 5, 24, 24)
labels += [(14, -118, 150), (14, 205, 145), (14, 170, 5)]
labels += [(10, 290, -40), (10, 180, 200), (11, -60, -200), (11, 60, -200), (11, 230, 20), (12, 0, 235), (15, -230, 60), (15, -200, 20)]
img = Image.alpha_composite(base, ov)
d = ImageDraw.Draw(img)
for n, x, y in labels:
    px, py = P(x, y)
    d.ellipse([px - 21, py - 21, px + 21, py + 21], fill=(20, 20, 24, 235), outline=(*C[n], 255), width=4)
    t = str(n); w = d.textlength(t, font=f_num)
    d.text((px - w / 2, py - 19), t, font=f_num, fill=(255, 255, 255, 255))
# legend
LW = 1300
out = Image.new('RGB', (Wp + LW, Hp), (248, 248, 246)); out.paste(img.convert('RGB'), (0, 0))
d = ImageDraw.Draw(out)
d.text((Wp + 30, 30), '伊甸庄园 · 分区（r4e）', font=f_t, fill=(20, 20, 20))
y = 100
for n, name, col in sorted(Z):
    d.rectangle([Wp + 30, y, Wp + 70, y + 36], fill=col, outline=(40, 40, 40))
    d.text((Wp + 44 - (8 if n > 9 else 0), y + 2), str(n), font=f_leg, fill=(0, 0, 0))
    d.text((Wp + 85, y + 2), name, font=f_leg, fill=(20, 20, 20)); y += 42
d.text((Wp + 30, y + 20), '编号见 docs/eden-lore-space.md；比例 0.375 m/px，北向上，正面（−y）在下。', font=ImageFont.truetype(F, 20), fill=(90, 90, 90))
out = out.resize((int(out.width * 0.72), int(out.height * 0.72)), Image.LANCZOS)
out.save(A.out, quality=82)
import os; print(os.path.getsize(A.out) // 1024, out.size)
