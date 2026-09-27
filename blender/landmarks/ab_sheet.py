"""Compose A/B comparison sheets from ab_blockout.py renders.
python3 blender/landmarks/ab_sheet.py <render_dir>"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

D = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = next(f for f in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc',
                        '/System/Library/Fonts/STHeiti Medium.ttc'] if os.path.exists(f))
SHEETS = {
    'landmark_cathedral_AB.jpg': ('辉光大教堂', [
        ('cathA', 'A', '哥特双塔西立面 + 浅色石材 + 交叉处鼓座穹顶与镀金采光亭，南侧回廊庭院'),
        ('cathB', 'B', '纯哥特：交叉处尖塔取代穹顶，西立面与两翼大玫瑰窗透光')]),
    'landmark_pm_AB.jpg': ('首相府', [
        ('pmA', 'A', '唐宁街式深色砖联排：三层+阁楼、黑门扇形窗、灯笼、铁栏杆、街口铁门；背面白柱廊'),
        ('pmB', 'B', '乔治式广场联排（巴斯/梅里恩式）围合小广场，首相府为北排正中一栋')]),
}
for out, (title, items) in SHEETS.items():
    W, H, pad, top, cap = 1400, 1000, 30, 90, 110
    sheet = Image.new('RGB', (2 * W + 3 * pad, top + H + cap + pad), (245, 244, 240))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 24), title + '：方案 A / B 体块对比（Blender 简模，仅比较体量与轮廓）', font=ImageFont.truetype(FONT, 44), fill=(30, 30, 30))
    for i, (key, lab, desc) in enumerate(items):
        x = pad + i * (W + pad)
        sheet.paste(Image.open(os.path.join(D, key + '.png')).convert('RGB'), (x, top))
        d.rectangle((x + 20, top + 20, x + 120, top + 120), fill=(30, 30, 30))
        d.text((x + 70, top + 70), lab, font=ImageFont.truetype(FONT, 72), fill=(255, 255, 255), anchor='mm')
        d.text((x, top + H + 25), desc, font=ImageFont.truetype(FONT, 34), fill=(40, 40, 40))
    p = os.path.join(ROOT, 'docs', 'drafts', out)
    sheet.save(p, quality=88); print(p)
