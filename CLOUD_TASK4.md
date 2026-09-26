# 云端任务 4：云海重做 + 事件视觉样例 + 英文 / 浅色界面（长任务，可以慢慢做）

先 `git pull`，读 `NOTES_FROM_LOCAL.md`（最后两节）、`ROADMAP.md`、`docs/event-taxonomy.md`、`docs/map-events.md`。**不要问问题，做完一项提交推送一项**，并在 `NOTES_FROM_LOCAL.md` 写一句进度。
下一个交给用户的版本是 **v0.9.1**（以后版本号在 9 后面加：0.9.1、0.9.2……）。不改 `VERSION`、不打标签、不跑 `tools/build_card.sh`。

## 文件边界（避免和本机冲突）
- 本机正在改：`blender/tc_city.py`、`tc_osm.py`、`tc_common.py`、`tiancheng_mid.py`、`tiancheng_low.py`、`tiancheng_upper.py` 里的**庄园与岛**部分、`map/events.js`、`map/tavern/*`。这些你**不要改**。
- 你可以新建 / 改：`blender/tc_clouds.py`（新）、`tiancheng_upper.py` 里**只加一行调用**、`docs/`、`map/i18n/`（新）、`map/viewer.html` 只在任务 3 的分支上改。

## 1. 上层云海重做（最重要）
用户评价：现在的云海「太烂」，岛影「很诡异」（平白一片，影子是一块块形状奇怪的深色斑）。要么做成《部落冲突》那种简洁的风格化云，要么调研后给出更好的方案。
- 先调研并写进 `docs/clouds.md`：
  - 部落冲突 / 皇室战争的云：厚实的圆团、明暗两到三阶、柔和的蓝灰阴影、边缘干净。
  - 其他俯视游戏的云海与云影：Townscaper、Islanders、Bad North、Sky 光遇、塞尔达天空岛。
  - Blender 可行的做法对比：
    - 实例化圆球团 + toon / 阶梯着色
    - metaball
    - 低分辨率体积云
    - 2D 噪声遮罩平面 + 法线假厚度
  - 岛影怎么投才合理：影子要与岛形状一致，落在云顶上，柔边，方向与上层统一的太阳方向一致。
- 选一种做成 `blender/tc_clouds.py`（函数 `build_cloud_sea(layer, islands, sun)`），`tiancheng_upper.py --below clouds` 时调用。
  - 目标：俯视下一眼读出「厚云层、岛浮在上面」。
  - 云有体积感，但不抢岛的戏；岛的轮廓清晰。
  - 伊甸庄园那座岛周围可以有一圈更亮的云边（主角岛）。
- 出 2000px 草稿到 `docs/drafts/clouds_v*.jpg`（至少两种风格对比），每轮写下自评：可读性、有没有怪影、和岛的比例。最多迭代 3 轮。选定后在 NOTES 写「可以重跑：upper」，本机渲 8K。
- 约束：只用 Blender 渲染，不用手绘 SVG / Canvas；8K 渲染时间要可控（本机 M 系列 GPU，上层目前约 8 分钟）。

## 2. 事件视觉样例（世界书，不进公开仓库）
`docs/event-taxonomy.md` 有 8 大类 45 种事件。给 8 个大类各写一个「视觉样例」世界书条目（沿用《天城视觉规范》的骨架、色板、材质配方；按发布方选色板），末尾带正确的 `data-tcmap` 标签，关键词触发。
- 例子：骑士团巡空令（银冠堡内网）、气候塔保养公告（执政厅公文）、灰票造假警示（黑市终端）、修女出巡（天城一台直播字幕条）。
- 输出 `worldbook_event_samples.json`（酒馆世界书格式），放到仓库外的产物里发给用户，不要提交。
- 同步更新 artifact《天城视觉规范》的「城市地图 · 事件联动」一节：
  - 8 大类图例（颜色 + 图标字）
  - 稀有度
  - 城市节律与连锁（引用 `docs/event-taxonomy.md`）
- 把样例里用到的示范标签原文列在 NOTES 里，本机会加进 `events.mjs` 的 `EXAMPLES`（示范原文不上图）。

## 3. 英文版 + 浅色界面（在新分支 `cloud/i18n` 上做，本机合并）
- 查看器所有界面文字抽到 `map/i18n/zh.json` / `en.json`；工具栏加「中 / EN」切换，记在 localStorage。
- 地名的英文名写进 `maps.json` 的 `name_en`：意译 + 音译混合，给一张对照表让用户审。
- 浅色主题：按《天城视觉规范》浅色变量，工具栏加切换；默认跟随系统。
- 在 Chromium 桌面与 375px 手机宽度下截图验证，放到 `docs/drafts/i18n_*.png`。

## 约束（同前）
- 不建模、不描写任何性相关或束缚类道具、场所细节；机构只画中性建筑外观。
- 提交信息结尾加：`Co-Authored-By: Claude <noreply@anthropic.com>`。
