# 地下医疗中心（B2）：参考板（无菌处置室、缓冲更衣间）

2026-09-28，用户设定：伊甸主楼 B2 的庄园急救 / 医疗设施，2088 年（再生医学、假肢与仿生肢适配、诊断）。
图片不下载进仓库；链接是公开的百科 / 标准 / 官方页面。内容规则：只放中性、真实的医疗设备，没有任何束缚件。

位置：B2 原「设备（卡未写）」未定用途体量的东段 16 × 11 m（x 4–20，y −3–8），不占卡房间 / 受限房间；
房间表见 `map/data/eden_estate_rooms.json`（kind=user，src=用户设定），模型 `blender/estate2/medical_b2.py`。

## ① 无菌处置室（急救 / 处置 / 小手术，约 78 ㎡）

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| M1 | 洁净室（Cleanroom） | 满布吊顶、HEPA 送风、正压、无缝表面 | https://en.wikipedia.org/wiki/Cleanroom |
| M2 | ISO 14644 洁净等级 | 手术区 ISO 5–7 的换气与压差梯度（处置室 > 缓冲间 > 走廊） | https://en.wikipedia.org/wiki/ISO_14644 |
| M3 | 手术室（Operating theater） | 中央手术台 + 双头 LED 无影灯 + 吊塔，设备沿墙收纳 | https://en.wikipedia.org/wiki/Operating_theater |
| M4 | 复合手术室（Hybrid operating room） | 墙嵌大屏 / 影像导航——2088 年版本的起点 | https://en.wikipedia.org/wiki/Hybrid_operating_room |
| M5 | NHS HBN 26《手术设施》 | 房间尺寸、层流天花约 3 × 3 m、医用气体、洁污分流 | https://www.gov.uk/government/publications/facilities-for-surgical-procedures-in-acute-general-hospitals |
| M6 | 抢救车（Crash cart） | 红色多屉车 + 顶置除颤监护仪 + 氧气瓶 + CPR 按压板 | https://en.wikipedia.org/wiki/Crash_cart |
| M7 | 除颤（Defibrillation） | 手动 / 自动除颤仪外形 | https://en.wikipedia.org/wiki/Defibrillation |
| M8 | 呼吸机（Medical ventilator） | 移动式 ICU 呼吸机：五星脚 + 主机 + 触屏 + 管路臂 | https://en.wikipedia.org/wiki/Medical_ventilator |
| M9 | 医用气体（Medical gas supply） | 墙上 / 吊塔上的气体终端与 ISO 32 色标 | https://en.wikipedia.org/wiki/Medical_gas_supply |
| M10 | 急诊科（Emergency department） | 急救间的抢救位布局、转运床动线 | https://en.wikipedia.org/wiki/Emergency_department |
| M11 | 再生医学 / 假肢 | 「增强」只作常规医疗：再生治疗、假肢 / 仿生肢适配 | https://en.wikipedia.org/wiki/Regenerative_medicine · https://en.wikipedia.org/wiki/Prosthesis |

## ② 缓冲更衣间（气闸 + 更衣 + 刷手，约 27 ㎡）

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| A1 | 气闸（Airlock） | 两道互锁气密推拉门、门禁状态灯、压差表 | https://en.wikipedia.org/wiki/Airlock |
| A2 | 洁净服（Cleanroom suit） | 洁净服 / 鞋套柜、跨越式更衣凳分脏 / 洁两侧 | https://en.wikipedia.org/wiki/Cleanroom_suit |
| A3 | 外科刷手（Surgical scrubbing / hand antisepsis） | 不锈钢刷手槽、感应 / 膝控龙头、刷手计时 | https://en.wikipedia.org/wiki/Hand_washing |
| A4 | 地面：无缝 PVC 卷材 + 圆弧上翻踢脚 | 洁净区地面做法（HTM / HBN 通用要求） | https://www.gov.uk/government/publications/specialised-ventilation-for-healthcare-premises |

**推荐组合（已按此建模）**：M3 的中央台 + 无影灯 + 双吊塔，M1/M5 的满布 LED 吊顶与中央层流天花，M4 的墙嵌大屏，
M6–M9 的抢救车、呼吸机、监护、医用气体；缓冲间按 A1/A2：南门接主人通道前室，北门进处置室，两门互锁。
流线：医护 主廊 → 主人通道前室 → 缓冲更衣间 → 无菌处置室；患者 主廊 → 医疗中心前厅 → 气密转运门；器械 前厅 → 器械洗消间 → 传递窗。
