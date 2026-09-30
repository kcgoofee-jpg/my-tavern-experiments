#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
annotate_board.py —— 生成带编号标注的审查看板（review board）

用途：
  拿一张（或多张）渲染图 + Blender 导出的锚点 JSON（3D 点经渲染相机投影后的
  像素坐标）+ 条目 JSON（每个地点/要素的文字说明、来源、状态），
  合成一张左侧渲染图（带编号圆圈引线标注）+ 右侧图例列表的整体看板 JPEG，
  用于人工核对"地图上的点位是否对应卡面描述"。

用法：
  python3 tools/annotate_board.py \\
      --render hero.jpg --anchors hero_anchors.json \\
      --extra underside.jpg --extra-anchors underside_anchors.json \\
      --items items.json \\
      --out board.jpg \\
      [--title "看板标题"]

  也可以用重复的 --render/--anchors 代替 --extra/--extra-anchors，两种写法等价：
      --render hero.jpg --anchors hero_anchors.json \\
      --render underside.jpg --anchors underside_anchors.json

锚点 JSON 格式：
  {
    "res": [W, H],
    "points": {
      "<item_key>": [[px, py], [px, py], ...],   // 该 key 在这张渲染图里的所有投影点
      ...
    }
  }
  - px, py 是像素坐标，原点在左上角。
  - 越界或 Blender 标记为不可见的点应在写出 JSON 前被 Blender 端过滤掉
    （本工具只会再做一次越界检查，超出 res 范围的点会被丢弃）。

条目 JSON 格式：
  {
    "title": "看板标题（可选，--title 优先）",
    "items": [
      {"key": "bay", "text": "新月深湾……", "source": "L109 · §4（可选：出处 / 引用）",
       "status": "✓" | "弱"},
      ...
    ]
  }
  - key 用于和锚点 JSON 里的 points 对应；在任意一张渲染图里都找不到锚点的条目，
    图例里会强制显示为红色「缺」状态，不管 JSON 里写的 status 是什么。

输出：
  JPEG，quality=90，总宽度约 2400–3200px。多张渲染图在左侧纵向堆叠对齐到统一
  宽度，右侧是贯穿全高的图例列（约占总宽 34%）。
"""

import argparse
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("错误：未安装 Pillow（PIL）。请先安装，不要用本脚本自动 pip install。", file=sys.stderr)
    sys.exit(1)


CJK_FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]

COLOR_BG = (250, 248, 244)
COLOR_PANEL_BG = (20, 20, 20)
COLOR_TITLE_BG = (30, 34, 40)
COLOR_TITLE_TEXT = (255, 255, 255)
COLOR_LEGEND_BG = (255, 255, 255)
COLOR_LEGEND_BORDER = (210, 205, 195)
COLOR_TEXT = (30, 30, 30)
COLOR_SUBTEXT = (110, 110, 110)
COLOR_BADGE_OK = (40, 110, 200)
COLOR_BADGE_MISSING = (200, 40, 40)
COLOR_SOURCE = (90, 60, 160)          # 出处 / 引用文字
COLOR_STATUS_OK = (30, 140, 60)       # ✓
COLOR_STATUS_WEAK = (200, 140, 0)     # 弱
COLOR_STATUS_MISSING = (200, 40, 40)  # 缺
COLOR_LEADER = (255, 255, 255)
COLOR_LEADER_OUTLINE = (10, 10, 10)
COLOR_DOT = (255, 220, 60)


def find_cjk_font():
    for p in CJK_FONT_CANDIDATES:
        if Path(p).exists():
            return p
    print(
        "错误：找不到可用的中日韩字体，已尝试：\n  " + "\n  ".join(CJK_FONT_CANDIDATES),
        file=sys.stderr,
    )
    sys.exit(1)


def load_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size=size, index=index)
    except Exception:
        return ImageFont.truetype(path, size=size)


def wrap_cjk(text, font, max_width, draw):
    """按字符换行（适合 CJK），西文单词尽量不拆。"""
    lines = []
    cur = ""
    for ch in text:
        trial = cur + ch
        w = draw.textlength(trial, font=font)
        if w > max_width and cur:
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def draw_status_glyph(draw, xy, status, font, color):
    """状态符号用手绘图形代替字体字形（✓ 在部分中文字体里缺字形会变成方块）。"""
    x, y = xy
    size = font.size
    if status == "✓":
        # 手绘对勾
        x0, y0 = x + 2, y + size * 0.55
        x1, y1 = x + size * 0.4, y + size * 0.85
        x2, y2 = x + size * 0.9, y + size * 0.15
        draw.line([(x0, y0), (x1, y1)], fill=color, width=4)
        draw.line([(x1, y1), (x2, y2)], fill=color, width=4)
        return size + 8
    elif status == "弱":
        draw.text((x, y), "弱", font=font, fill=color)
        return draw.textlength("弱", font=font) + 8
    elif status == "缺":
        draw.text((x, y), "缺", font=font, fill=color)
        return draw.textlength("缺", font=font) + 8
    else:
        draw.text((x, y), status, font=font, fill=color)
        return draw.textlength(status, font=font) + 8


def draw_text_outlined(draw, xy, text, font, fill, outline, ow=2):
    x, y = xy
    for dx in range(-ow, ow + 1):
        for dy in range(-ow, ow + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


class Panel:
    def __init__(self, render_path, anchors_path):
        self.img = Image.open(render_path).convert("RGB")
        with open(anchors_path, "r", encoding="utf-8") as f:
            self.anchors = json.load(f)
        res = self.anchors.get("res")
        self.src_w, self.src_h = (res[0], res[1]) if res else self.img.size

    def points_for_key(self, key):
        pts = self.anchors.get("points", {}).get(key, [])
        out = []
        for p in pts:
            if p is None:
                continue
            if not isinstance(p, (list, tuple)) or len(p) < 2:
                continue
            px, py = p[0], p[1]
            if px is None or py is None:
                continue
            if px < 0 or py < 0 or px > self.src_w or py > self.src_h:
                continue
            out.append((float(px), float(py)))
        return out


def build_board(renders, items_data, title_override, out_path):
    font_path = find_cjk_font()

    title = title_override or items_data.get("title") or "审查看板"
    items = items_data.get("items", [])
    for i, it in enumerate(items):
        it["_num"] = i + 1

    # ---- 总体布局参数 ----
    TOTAL_W = 2800
    LEGEND_W = int(TOTAL_W * 0.34)
    LEFT_W = TOTAL_W - LEGEND_W
    TITLE_H = 110
    PANEL_GAP = 6

    # 左侧各面板按统一宽度等比缩放
    scaled_panels = []
    total_left_h = 0
    for p in renders:
        scale = LEFT_W / p.img.width
        new_w = LEFT_W
        new_h = int(round(p.img.height * scale))
        resized = p.img.resize((new_w, new_h), Image.LANCZOS)
        scaled_panels.append({"panel": p, "img": resized, "scale": scale, "h": new_h})
        total_left_h += new_h
    total_left_h += PANEL_GAP * max(0, len(scaled_panels) - 1)

    BODY_H = total_left_h
    TOTAL_H = TITLE_H + BODY_H

    board = Image.new("RGB", (TOTAL_W, TOTAL_H), COLOR_BG)
    draw = ImageDraw.Draw(board)

    # ---- 标题栏 ----
    draw.rectangle([0, 0, TOTAL_W, TITLE_H], fill=COLOR_TITLE_BG)
    title_font = load_font(font_path, 46)
    draw.text((36, TITLE_H // 2 - 26), title, font=title_font, fill=COLOR_TITLE_TEXT)

    # ---- 粘贴各面板 + 记录全局坐标偏移 ----
    y_cursor = TITLE_H
    panel_offsets = []  # (panel_dict, x0, y0)
    for sp in scaled_panels:
        board.paste(sp["img"], (0, y_cursor))
        panel_offsets.append((sp, 0, y_cursor))
        y_cursor += sp["h"] + PANEL_GAP

    # ---- 图例区域背景 ----
    legend_x0 = LEFT_W
    draw.rectangle([legend_x0, 0, TOTAL_W, TOTAL_H], fill=COLOR_LEGEND_BG)
    draw.line([legend_x0, 0, legend_x0, TOTAL_H], fill=COLOR_LEGEND_BORDER, width=3)

    # ---- 为每个条目收集在各面板上的全局锚点像素坐标 ----
    item_global_points = {it["_num"]: [] for it in items}
    for it in items:
        key = it.get("key")
        for sp, ox, oy in panel_offsets:
            pts = sp["panel"].points_for_key(key)
            for (px, py) in pts:
                gx = ox + px * sp["scale"]
                gy = oy + py * sp["scale"]
                item_global_points[it["_num"]].append((gx, gy, sp, ox, oy))

    for it in items:
        it["_has_anchor"] = len(item_global_points[it["_num"]]) > 0
        if not it["_has_anchor"]:
            it["_status_eff"] = "缺"
        else:
            it["_status_eff"] = it.get("status", "✓")

    # ---- 画callout（编号圆圈 + 引线），避免互相重叠：简单贪心nudge ----
    badge_r = 20
    callout_font = load_font(font_path, 26)
    placed_boxes = []  # list of (x0,y0,x1,y1) already used, for collision avoidance

    def boxes_overlap(a, b):
        return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])

    def find_free_pos(anchor_x, anchor_y, panel_cx, panel_cy, panel_bounds):
        # 从锚点向外（远离面板中心）方向推出，若碰撞则沿环形角度偏移再尝试
        dx = anchor_x - panel_cx
        dy = anchor_y - panel_cy
        dist = math.hypot(dx, dy)
        if dist < 1e-3:
            dx, dy = 0, -1
            dist = 1
        ux, uy = dx / dist, dy / dist
        base_offset = 55
        for attempt in range(24):
            offset = base_offset + (attempt // 8) * 32
            angle_jitter = (attempt % 8) * (math.pi / 8)
            # 旋转方向向量做角度扰动
            ca, sa = math.cos(angle_jitter), math.sin(angle_jitter)
            rux = ux * ca - uy * sa
            ruy = ux * sa + uy * ca
            cx = anchor_x + rux * offset
            cy = anchor_y + ruy * offset
            x0, y0, x1, y1 = panel_bounds
            cx = min(max(cx, x0 + badge_r + 4), x1 - badge_r - 4)
            cy = min(max(cy, y0 + badge_r + 4), y1 - badge_r - 4)
            box = (cx - badge_r, cy - badge_r, cx + badge_r, cy + badge_r)
            if not any(boxes_overlap(box, b) for b in placed_boxes):
                placed_boxes.append(box)
                return cx, cy
        placed_boxes.append((cx - badge_r, cy - badge_r, cx + badge_r, cy + badge_r))
        return cx, cy

    for it in items:
        num = it["_num"]
        pts = item_global_points[num]
        color = COLOR_BADGE_MISSING if it["_status_eff"] == "缺" else COLOR_BADGE_OK
        for (gx, gy, sp, ox, oy) in pts:
            panel_bounds = (ox, oy, ox + sp["img"].width, oy + sp["h"])
            panel_cx = ox + sp["img"].width / 2
            panel_cy = oy + sp["h"] / 2
            cx, cy = find_free_pos(gx, gy, panel_cx, panel_cy, panel_bounds)

            # 引线：白线+深色描边
            for w, col in ((5, COLOR_LEADER_OUTLINE), (2, COLOR_LEADER)):
                draw.line([(cx, cy), (gx, gy)], fill=col, width=w)
            # 锚点小圆点
            r = 6
            draw.ellipse([gx - r, gy - r, gx + r, gy + r], fill=COLOR_DOT, outline=COLOR_LEADER_OUTLINE, width=2)
            # 编号圆圈
            draw.ellipse(
                [cx - badge_r, cy - badge_r, cx + badge_r, cy + badge_r],
                fill=color, outline=(255, 255, 255), width=3,
            )
            txt = str(num)
            tw = draw.textlength(txt, font=callout_font)
            th = callout_font.size
            draw.text((cx - tw / 2, cy - th / 2 - 2), txt, font=callout_font, fill=(255, 255, 255))

    # ---- 图例列 ----
    pad = 26
    lx = legend_x0 + pad
    lw = LEGEND_W - pad * 2
    ly = pad
    num_font = load_font(font_path, 24)
    text_font = load_font(font_path, 30)
    small_font = load_font(font_path, 24)

    for it in items:
        num = it["_num"]
        badge_color = COLOR_BADGE_MISSING if it["_status_eff"] == "缺" else COLOR_BADGE_OK
        r = 18
        badge_cy = ly + r
        draw.ellipse([lx, ly, lx + 2 * r, ly + 2 * r], fill=badge_color)
        txt = str(num)
        tw = draw.textlength(txt, font=num_font)
        draw.text((lx + r - tw / 2, badge_cy - num_font.size / 2 - 2), txt, font=num_font, fill=(255, 255, 255))

        text_x = lx + 2 * r + 14
        text_w = lw - (2 * r + 14)
        lines = wrap_cjk(it.get("text", ""), text_font, text_w, draw)
        ty = ly
        for line in lines:
            draw.text((text_x, ty), line, font=text_font, fill=COLOR_TEXT)
            ty += text_font.size + 8

        block_bottom = max(ly + 2 * r, ty)

        # 来源 + 状态 一行
        source = it.get("source", "")
        status_eff = it["_status_eff"]
        status_color = {"✓": COLOR_STATUS_OK, "弱": COLOR_STATUS_WEAK, "缺": COLOR_STATUS_MISSING}.get(
            status_eff, COLOR_SUBTEXT
        )
        sy = block_bottom + 4
        sx = text_x
        if source:
            draw.text((sx, sy), source, font=small_font, fill=COLOR_SOURCE)
            sx += draw.textlength(source, font=small_font) + 18
        draw_status_glyph(draw, (sx, sy), status_eff, small_font, status_color)

        ly = sy + small_font.size + 22
        draw.line([lx, ly - 10, lx + lw, ly - 10], fill=(235, 232, 225), width=1)

    board.save(out_path, "JPEG", quality=90)
    return out_path


def main():
    ap = argparse.ArgumentParser(description="生成带编号标注的地图审查看板")
    ap.add_argument("--render", action="append", default=[], help="渲染图路径（可重复，与 --anchors 按顺序配对）")
    ap.add_argument("--anchors", action="append", default=[], help="锚点 JSON 路径（可重复，与 --render 按顺序配对）")
    ap.add_argument("--extra", action="append", default=[], help="额外渲染图路径（等价于再传一组 --render）")
    ap.add_argument("--extra-anchors", action="append", default=[], help="额外锚点 JSON（与 --extra 配对）")
    ap.add_argument("--items", required=True, help="条目 JSON 路径")
    ap.add_argument("--out", required=True, help="输出 JPEG 路径")
    ap.add_argument("--title", default=None, help="看板标题（覆盖 items JSON 里的 title）")
    args = ap.parse_args()

    renders_paths = list(args.render) + list(args.extra)
    anchors_paths = list(args.anchors) + list(args.extra_anchors)

    if not renders_paths or len(renders_paths) != len(anchors_paths):
        print(
            f"错误：--render/--extra 数量（{len(renders_paths)}）必须和 --anchors/--extra-anchors 数量（{len(anchors_paths)}）一致，且不能为 0。",
            file=sys.stderr,
        )
        sys.exit(1)

    for rp in renders_paths:
        if not Path(rp).exists():
            print(f"错误：渲染图不存在：{rp}", file=sys.stderr)
            sys.exit(1)
    for ap_ in anchors_paths:
        if not Path(ap_).exists():
            print(f"错误：锚点 JSON 不存在：{ap_}", file=sys.stderr)
            sys.exit(1)
    if not Path(args.items).exists():
        print(f"错误：条目 JSON 不存在：{args.items}", file=sys.stderr)
        sys.exit(1)

    panels = [Panel(r, a) for r, a in zip(renders_paths, anchors_paths)]

    with open(args.items, "r", encoding="utf-8") as f:
        items_data = json.load(f)

    out = build_board(panels, items_data, args.title, args.out)
    print(f"已生成：{out}")


if __name__ == "__main__":
    main()
