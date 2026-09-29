# 第 1 轮 · 现编审阅者（v0.9.5「自定义」面板）

**身份**：用英文界面、在平板和台式机之间来回切的双语玩家；人物名多是英文，地名中英混用；白天浅色主题，晚上系统自动切深色，面板常开着。
**为什么选他**：本轮 diff 同时改了 `map/i18n/en.json` / `zh.json`、主题同步（宿主根节点 em-light、自检 toast 跟主题）和 `EdenMap.flyTo` 的人物 / 房间目标；两位固定人设都是中文界面、单一设备，覆盖不到英文文案、运行中切主题、英文人物名匹配和外部脚本调用 flyTo。
**只看**：英文与旧文案一致性、宏替换、运行中切主题、人物名匹配、flyTo 目标校验。
**不看**：单手可达、长列表管理（另外两位已覆盖）。

**分数：7/10**

## 问题
1. **P1 选择器副标题里 `{{user}}` 宏原样外露（中英文都会）**
   证据：`shots/cu_phone_picker.jpg`「伊甸庄园 / {{user}} 的庄园」；`map/tavern/picker.mjs` buildGroups 取 `v.sub_en || v.sub` 不替换。
   修法：生成分组时做宏替换（沿用查看器函数），补单测。
2. **P1 人物飞行按名字全等匹配，大小写 / 空格 / 自定义名都不认**
   证据：`map/custom.js` flyTo：`TCChars.items.some(c => c.name === t.character)`；`normTarget` 只 trim。聊天里「Lina」「lina」或用户给人物起的显示名都会失败，面板只说不在地图上。
   修法：比较前做 NFKC + 小写 + 去空白，并先经 `findKey` 把自定义名 / 别名换回标准名。
3. **P2 旧文案键仍写「默认关」，与新默认相反**
   证据：`map/i18n/zh.json` `cu.sync_hint`「…；默认关…」、en.json 同键 “off by default”；本轮已改用 `cu.sync_hint2`，旧键代码里已无引用。以后有人误用或翻译工具回填会给出错误说明。另外 shots 里没有任何英文界面截图。
   修法：删掉 `cu.sync_hint` / `cu.empty` 等已不引用的键；加测试：i18n 里不许有代码未引用的 `cu.*` 键；补一组英文截图。
4. **P2 主题只测了「加载时」，没测对话框开着时切换**
   证据：summary light / dark 两项是分别加载后测对比度；`cu_desk_theme_light.jpg` / `_dark.jpg` 是两次独立截图。
   修法：浏览器测试里在对话框打开状态下切 `prefers-color-scheme` 与宿主 em-light，再测 `color-scheme` 和对比度。
5. **P2 flyTo 的 room / area 目标不校验 map**
   证据：`picker.mjs` normTarget 对 room / area 不要求 map；`custom.js` 在 map 不是 estate 时退回第一个庄园。外部脚本传 `{map:'tc_mid', room:'书房'}` 不报错却飞进庄园。
   修法：map 存在但不是 estate 时返回 false（或返回 `{ok:false, reason}`），在文档里写明目标形状。

## 结论
主题修复与对比度数据扎实，英文文案也基本齐；宏外露和人物名匹配是双语玩家第一眼会撞上的问题，修完可过。
