#!/usr/bin/env python3
"""上层预览的标注版（只给评审看，事后叠加，不进渲染）：每座岛标卡原名、海拔、纵深档、群落、一句卡依据（card-digest 行号）。
用法：python3 tools/upper_annotate.py <整图.png> --out <输出.jpg> [--islands blender/data/tc_islands.json]
海拔 / d 读纵深系统（map/data/upper_depth.json + blender/depth.py）；卡依据写在下面 NOTES（改设定稿时同步）。
"""
import argparse, json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import depth as DP

W_U, H_U = 30.0, 18.75
NOTES = {   # 岛 id: (卡原名, 群落 / 形制, 卡依据一句 + card-digest 行号)
    'eden': ('伊甸庄园', '白石新古典 · 湖', '玩家独占一座悬浮岛；前庭停靠平台、后庭人工湖（L46、L226–229）'),
    'isle10': ('凯莉的宅邸', '果园', '凯莉·露易丝的居所，开局三目的地（L85、L177）'),
    'isle6': ('首相府', '草甸', '首相阿斯特丽德办公开会，开局五（L69、L178）'),
    'isle30': ('罗斯柴尔德庄园', '水景园', '悬浮岛 R-02，伊莎贝拉家族，冬季宴会（L47、L179、L376）'),
    'isle25': ('精英学院', '草甸', '上层贵族子弟进入精英学院（L371）'),
    'isle9': ('庄园主联盟会所', '秋林', '联盟办拍卖与品鉴会；会所本身仓库推断（L151、L377）'),
    'isle4': ('维克多庄园', '秋林', '凯莉亡夫的庄园，已不属于她（L86）'),
    'isle5': ('「Y」的庄园', '针叶', '全城最大、从不露面、不入联盟（L151）'),
    'silver_crown': ('银冠堡', '要塞', '议会骑士团总部，上中层交界（L48、L152）'),
}
TOWER = ((8.5, -5.0), ('以太气候调节塔', '塔冠约 1500 m', '维持全城气候（L28、L49）'))
TIER = lambda d: '近' if d < .2 else ('中' if d < .5 else ('远' if d < .9 else '最远'))


def font(sz):
    for f in ('/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc'):
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def main():
    p = argparse.ArgumentParser(); p.add_argument('full'); p.add_argument('--out', required=True)
    p.add_argument('--islands', default=os.environ.get('TC_ISLANDS') or os.path.join(ROOT, 'blender/data/tc_islands.json')); a = p.parse_args()
    im = Image.open(a.full).convert('RGBA'); FW, FH = im.size; px = FW / W_U
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(ov)
    F1, F2 = font(max(14, FW // 110)), font(max(11, FW // 150))
    CFG = DP.load(); I = {d['id']: d for d in json.load(open(a.islands, encoding='utf-8'))['islands']}
    items = []
    for iid, d in I.items():
        if iid not in NOTES: continue
        c = DP.island(iid, CFG); alt = CFG['islands'][iid]['alt']; nm, biome, note = NOTES[iid]
        r = max(d['rx'], d['ry']) * c['scale']
        items.append((d['x'], d['y'] + r, nm, f'{alt} m · {TIER(c["d"])}（d {c["d"]:.2f}）· {biome}', note))
    (tx, ty), (nm, b, note) = TOWER
    items.append((tx, ty + .4, nm, f'{b} · 锚点', note))
    for x, y, nm, l2, l3 in items:
        cx, cy = (x / W_U + .5) * FW, (.5 - y / H_U) * FH
        lines = [(nm, F1), (l2, F2), (l3, F2)]
        w = max(dr.textlength(t, font=f) for t, f in lines) + 16; h = sum(f.size + 5 for _, f in lines) + 10
        bx = min(max(8, cx - w / 2), FW - w - 8); by = max(8, cy - h - px * .15)
        dr.line([(cx, cy), (cx, by + h)], fill=(255, 255, 255, 200), width=2)
        dr.rounded_rectangle((bx, by, bx + w, by + h), 6, fill=(15, 20, 30, 190))
        yy = by + 6
        for t, f in lines:
            dr.text((bx + 8, yy), t, font=f, fill=(255, 255, 255, 255) if f is F1 else (210, 222, 235, 255)); yy += f.size + 5
    Image.alpha_composite(im, ov).convert('RGB').save(a.out, quality=86); print('annotated', a.out)


if __name__ == '__main__':
    main()
