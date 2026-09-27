#!/usr/bin/env python3
"""挤奶厅 + 电围栏围场的标注平面图 → docs/drafts/props_dairy_plan.png"""
import math, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from layout import *  # noqa

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
plt.rcParams['font.sans-serif'] = ['PingFang SC', 'Heiti SC', 'Arial Unicode MS']
fig, ax = plt.subplots(figsize=(11, 12), dpi=120)


def rect(x0, x1, y0, y1, **kw):
    ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, **kw))


def note(x, y, t, **kw):
    kw.setdefault('fontsize', 9)
    ax.text(x, y, t, ha='center', va='center', **kw)


# 围场
px0, px1, py0, py1 = PADDOCK
rect(px0, px1, py0, py1, fc='#dfe9cf', ec='none')
xs = [px0 + i * POST_STEP for i in range(int((px1 - px0) / POST_STEP) + 1)] + [px1]
ys = [py0 + i * POST_STEP for i in range(int((py1 - py0) / POST_STEP) + 1)] + [py1]
posts = set()
for x in xs:
    posts |= {(x, py0), (x, py1)}
for y in ys:
    posts |= {(px0, y), (px1, y)}
posts |= {(GATE[0], py0), (GATE[1], py0)}
for (x, y) in posts:
    if y == py0 and GATE[0] < x < GATE[1]:
        continue
    ax.add_patch(Circle((x, y), 0.25, fc='#6b4a2b'))
ax.plot([px0, GATE[0]], [py0, py0], c='#d9a400', lw=2)
ax.plot([GATE[1], px1, px1, px0, px0], [py0, py0, py1, py1, py0], c='#d9a400', lw=2)
ax.plot(GATE, [py0, py0], c='#d9a400', lw=1, ls=':')
note(0, py0 + 1.2, '闸门（弹簧把手）')
note(0, (py0 + py1) / 2, '围场 32 × 25 m\n木桩每 5 m · 绝缘子 0.55 / 0.95 m\n上：白色聚乙烯带 40 mm   下：聚乙烯线', color='#3a5a20')
# 牛舍
x0, x1, y0, y1 = SHED
rect(x0, x1, y0, y1, fc='#eeeeee', ec='#333', lw=2)
rect(x0, x1, EXIT_Y, py0, fc='#cfcfcf', ec='none')
note(4, 7.5, '混凝土场地 / 出口通道 → 围场')
ax.plot([MILK_ROOM_X] * 2, [y0, y1], c='#333', lw=2)
rect(MILK_ROOM_X - 0.05, MILK_ROOM_X + 0.05, 1.8, 2.8, fc='white', ec='none')
note(MILK_ROOM_X + 0.6, 2.3, '门', fontsize=8)
# 坑与站台
a, b, c, d = PIT
rect(a, b, c, d, fc='#9aa7b0', ec='#333')
note((a + b) / 2, 0, f'挤奶坑 深 {PIT_DEPTH} m · 宽 {d - c:.1f} m · 防滑橡胶垫', color='white')
for s in (1, -1):
    rect(a, b, s * d, s * (d + PLATFORM_W), fc='#555', ec='#333', alpha=0.25)
    for i in range(STALLS_PER_SIDE):
        cx = STALL_X0 + i * STALL_PITCH
        t = math.radians(STALL_ANGLE)
        ax.plot([cx, cx + 1.9 * math.cos(t)], [s * d, s * (d + 1.9 * math.sin(t))], c='#777', lw=2)
        ax.add_patch(Circle((cx + 0.2, s * (d + 0.18)), 0.12, fc='#222'))
    ax.plot([a, b + 0.4], [s * (d + 0.15)] * 2, c='#1f6fb2', lw=2)
note(-1, 3.6, '牛站台 + 35° 鱼骨栏位（每侧 8 位）· 黑点 = 挤奶杯组', fontsize=8)
note(-1, -3.6, '蓝线 = 不锈钢高位奶管 Ø50 mm，离站台 1.95 m', fontsize=8)
ax.add_patch(Circle(RECEIVER, 0.3, fc='#1f6fb2'))
ax.plot([RECEIVER[0], TANK[0] - 0.8], [RECEIVER[1], TANK[1]], c='#1f6fb2', lw=2)
note(RECEIVER[0] - 0.2, RECEIVER[1] - 1.9, '集乳罐', fontsize=8)
# 奶罐
tx, ty, tl, td, _ = TANK
ax.add_patch(FancyBboxPatch((tx - td / 2, ty - tl / 2), td, tl, boxstyle='round,pad=0,rounding_size=0.7', fc='#c9d3da', ec='#333'))
note(tx, ty, '卧式\n奶罐\n6000 L', fontsize=8)
note(8.5, 4.2, '奶罐间\n冲洗水管 · 压缩机', fontsize=8)
rect(x0 - 0.05, x0 + 0.05, ENTRY[1] + 0 if False else -3.0, -1.2, fc='white', ec='none')
note(x0 - 1.6, -2.1, '牛入口 →', fontsize=8)
ex, ey, _ = ENERGISER
rect(ex - 0.3, ex + 0.3, ey, ey + 0.35, fc='#d9a400', ec='#333')
note(ex - 7.5, ey + 0.4, '电围栏控制器 + 接地桩 →', fontsize=8)
ax.plot([ex, ex, px0 + 0.1], [ey + 0.35, py0 - 0.4, py0 - 0.4], c='#d9a400', lw=1, ls='--')
# 相机
for (cx, cy, dx, dy, t) in [(-7.8, -0.5, 1, 0.1, 'C1 室内'), (1.5, 4.2, -0.2, -0.9, 'C2 杯组特写'), (-20, 3, 1, 0.6, 'C3 外景')]:
    ax.annotate('', xy=(cx + dx * 2.5, cy + dy * 2.5), xytext=(cx, cy), arrowprops=dict(arrowstyle='->', color='crimson', lw=1.5))
    ax.text(cx, cy - 0.7, t, color='crimson', fontsize=8)
ax.set_xlim(-22, 18)
ax.set_ylim(-8, 36)
ax.set_aspect('equal')
ax.grid(alpha=0.2)
ax.set_title('测试件：奶牛挤奶厅（双 8 位鱼骨式）+ 电围栏围场 · 单位 m · 无动物 · 无品牌')
out = os.path.join(REPO, 'docs', 'drafts', 'props_dairy_plan.png')
fig.savefig(out, bbox_inches='tight')
print(out)
