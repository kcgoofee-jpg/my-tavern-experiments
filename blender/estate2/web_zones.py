"""庄园网页三维的室外热点（map/estate/model/zones.json）。纯 Python，读 layout.py 的落位。

python3 blender/estate2/web_zones.py
坐标：layout（x 东、y 北、米）；z = 该点地面标高（layout.ground_z）+ 标签高度。页面换算成 three：(x, z, −y)。
名字 / 别名对齐 map/data/maps.json 里 eden_estate 的 areas（查看器按这些词把「当前地点」发给庄园页）。
r4 场景里没建的（树篱迷宫、以太凝水塔、凉亭）不出热点。
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout as L   # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
Z = [  # id, 名称, 英文, 别名, (x, y), 半径 m, 标签离地高度, 优先级（大 = 首屏就显示）
    ('main', '伊甸庄园 · 主楼', 'Main House', ['主楼', '府邸'], (0, -4), 46, 24, 10),
    ('tower', '观景塔', 'Lookout Tower', ['眺望亭', '屋顶眺望亭', '塔楼'], (-17, -17), 7, 26, 4),
    ('dock', '停靠平台', 'Landing Platform', ['访客停靠平台'], (0, -266), 22, 4, 9),
    ('avenue', '中轴大道', 'Grand Avenue', ['大道', '跌水水渠'], (0, -200), 30, 3, 6),
    ('forecourt', '前庭', 'Forecourt', ['前院', '前庭花园', '花园', '庭园', '花坛', 'Gardens', 'Garden'], (0, -104), 60, 4, 8),
    ('fountain', '喷泉', 'Fountain', ['三层喷泉'], (0, -113), 11, 8, 5),
    ('rose', '玫瑰园', 'Rose Garden', ['白玫瑰园'], (58, -104), 18, 3, 5),
    ('rear', '后庭', 'Rear Court', ['后院', '后庭园', '草坪', '后庭草坪', '半圆回廊'], (0, 44), 22, 4, 6),
    ('training', '露天训练场', 'Training Ground', ['训练场'], (-62, 58), 15, 3, 4),
    ('lake', '人工湖', 'Lake', ['湖'], (-12, 142), 70, 4, 9),
    ('waterside', '水榭', 'Water Pavilion', [], (-34, 100), 9, 8, 5),
    ('islet', '湖心亭', 'Lake Pavilion', [], (-22, 150), 7, 9, 5),
    ('club', '湖边俱乐部', 'Lakeside Club', ['俱乐部', '缆车'], (72, 134), 15, 12, 5),
    ('lookout', '观景台', 'Lookout', ['岛缘观景台', '崖顶观景台'], (34, 84), 12, 4, 4),
    ('stones', '结界锚碑', 'Barrier Stones', ['锚碑'], (228, -160), 8, 5, 3),
    ('guest', '客房楼', 'Guest Houses', ['客房'], (100, -44), 14, 14, 5),
    ('spa', '水疗馆', 'Spa', [], (-104, -46), 14, 14, 4),
    ('breakers', '宾客馆', 'Guest Hall', ['Breakers', '海滨宾客馆'], (232, -148), 32, 22, 7),
    ('gym', '玻璃健身亭', 'Glass Gym Pavilion', ['健身亭', '户外健身房'], (187.4, -110.3), 14, 5, 5),
    ('villas', '林中别墅', 'Forest Villas', ['别墅'], (200, 110), 16, 12, 5),
    ('treehouse', '树屋', 'Tree Houses', [], (160, 150), 6, 14, 3),
    ('bridge', '索桥', 'Rope Bridge', ['吊桥'], (198, 21), 12, 4, 3),
    ('orchard', '果园', 'Orchard', [], (205, 145), 22, 3, 3),
    ('service', '服务院', 'Service Court', ['仆役楼', '仆人楼', '服务区', 'Staff Wing'], (-168, 112), 24, 12, 6),
    ('kitchen_garden', '菜园', 'Kitchen Garden', ['厨房花园'], (-118, 150), 24, 3, 4),
    ('greenhouse', '温室', 'Greenhouse', ['橘园', 'Orangery'], (-118, 180), 14, 8, 4),
    ('hangar', '悬浮载具库', 'Hover-vehicle Bay', [], (-214, 150), 16, 16, 5),
    ('helipad', '载具停靠坪', 'Vehicle Pad', [], (-186, 170), 12, 3, 4),
    ('garage', '悬浮车库', 'Hover Garage', ['车库'], (-140, 138), 14, 12, 4),
    ('greystone', '灰石旧宅', 'Greystone', ['旧宅', 'Old House', 'Greystone 旧宅'], (-228, -98), 42, 18, 7),
    ('cottage', '灰石客舍', 'Guest Cottage', ['客舍'], (-160, -82), 12, 12, 5),
    ('grotto', '岩洞泳池', 'Grotto Pool', [], (-145.6, -75.1), 8, 4, 4),
    ('koi', '锦鲤池', 'Koi Pond', [], (-175.8, -82.4), 6, 3, 3),
    ('dairy', '奶牛农场', 'Dairy Farm', ['奶牛场', '挤奶厅', '奶罐间', '围场', 'Milking Parlour'], (-270, 8), 28, 8, 5),
    ('farm_terraces', '农业台地', 'Farm Terraces', ['葡萄园', '薰衣草田', '橄榄园'], (-230, 50), 30, 3, 3),
    ('tennis', '网球场', 'Tennis Courts', [], (-186, -12), 16, 3, 3),
]


def main():
    out = []
    for zid, name, en, alias, (x, y), r, h, pri in Z:
        g = float(L.ground_z(x, y))
        if zid in ('dock',):
            g = 8.5
        if zid in ('lake', 'islet', 'waterside'):
            g = max(g, L.WATER_Z)
        out.append(dict(id=zid, name=name, en=en, alias=alias, x=x, y=y, r=r, z=round(g, 2), h=h, pri=pri))
    data = dict(_说明='庄园网页三维的室外热点（blender/estate2/web_zones.py 生成，不要手改）。坐标同 layout.py：x 东、y 北、米；z = 地面标高；h = 标签离地高度；pri 越大越先显示。',
                zones=out)
    p = os.path.join(ROOT, 'map', 'estate', 'model', 'zones.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('zones', len(out), p)


if __name__ == '__main__':
    main()
