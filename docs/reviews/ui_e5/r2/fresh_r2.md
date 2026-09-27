# E5 第 2 轮 · 现编审阅：安卓中端机 TT WebView 老玩家

## 人设与为什么选他（照录 `fresh_r2_persona.md`）
**身份**：安卓中端机（6.1 寸、414 宽、系统字体 115%、系统深色模式）上用 TT 酒馆 WebView 的老玩家，单手握持，在聊天和地图之间来回切；4G 偶尔掉到 3G。
**为什么选他**：用户说「TT 手机实测是主要目标（375–414 px、WebView）」；本轮 diff 把窄屏顶栏换成「⋯」底部抽屉、缩放组搬到左上角、署名进页脚条并在手机上置顶（`map/viewer.html` 的 `#foot`、`#zoom`、`#setPop`），花屏提示移到右侧，宿主栏（`map/tavern/eden-map.js`）跟随地图主题 / 语言，嵌入时首图先等当前地点 0.6 s（R10）。固定人设不看 414 宽、系统字体放大、宿主栏与地图的衔接。
**只看**：414×896 / 375×667 重叠；115% 字体；宿主栏跟随主题 / 语言与关闭 44；嵌入首开世界图瓦片数；「⋯」抽屉开关。

## 环境
- 仓库 `cloud/tc-mid-low` 工作区（HEAD 9b15d4e，viewer / eden-map 与简报的 3f9ba38 相同），本地 `http://localhost:5178/`，省流档。
- Playwright Chromium：414×896、375×667，DPR 2.625，isMobile + 触屏，安卓 UA；中 / EN；字体放大近似为 `html{zoom:1.15}`。WebKit：`iphone` 预设（375×812）。宿主：`map/tavern/test-host.html`（路由改写 test-script 的初始地点为「主卧」「7号井」），并测 `deviceMemory=4`（省流预加载）。
- 脚本与产物：`scratchpad/e5/rev2/work/fresh/`（`a_layout.mjs` → `out/`，`b_drawer.mjs`、`b2_ios.mjs` → `outb/`，`c_host.mjs` → `outc/`）。全部经 `lockrun.sh` 单浏览器运行，无页面报错。

## 检查点结果
1. **重叠**（`out/a.json`，40 个状态）：顶栏 scrollWidth = clientWidth，全部一行、44 高；缩放组 / 署名 / 花屏提示 / 层切换器 / 事态横条互不相交。仅有的交叠：卡片抽屉盖住层切换器与横条（设计如此，但见问题 2）；375 + EN + 115% 展开事态列表时列表左上角压住缩放组「复位」键 18×18 px、盖住花屏提示（列表是临时态，可接受）。
2. **115% 字体**：按钮、层切换器、抽屉无截断；只有卡片字段名「Severity / status」折成两行，横条摘要「3 active · 3 in…」省略。
3. **宿主栏**：切浅色 → `em-light` 同步；切 EN → 标题「NC 2088 · Eden Manor」、「Location:」「Route: not set」、关闭按钮 aria-label「Close」；关闭按钮 44×44，点击可关。✅
4. **嵌入首开（R10）**：当前地点 = 主卧 → 直接开 `eden_estate`；= 7号井 → 直接开 `tc_low`；两例预加载 + 打开全程**世界图瓦片 0 张 / 0 KB**（R10 原 22 张 / 387 KB），也没拉 `world_1k.jpg`。内存 4 GB 时预加载只拿 5 个请求 158 KB。✅
5. **「⋯」抽屉**：开关行 44 高；Esc 关闭 ✅；底部内边距含 `env(safe-area-inset-bottom)`，iPhone 截图底边不被裁。但遮罩行为有问题（见问题 1）。

## 分数：8.0 / 10（无 P0、无 P1）

## 问题（≤ 5）
1. **P2 「⋯」抽屉的遮罩不是实体元素：安卓上点遮罩会穿透，iPhone 上点遮罩关不掉**
   - 位置：`map/viewer.html` 约 298–299 行（`#setPop` 的 `box-shadow: … 0 0 0 100vmax rgba(0,0,0,.35)` 充当遮罩）、1185 行（`document` 上的 click 监听负责关闭）。
   - 现象：Chromium 414 宽下，抽屉开着时点变暗区域里的缩放「+」，抽屉关闭，地图也同时放大了；点暗区里的标记，抽屉关闭，同时弹出「货运站」卡片。WebKit iPhone 上点暗区的地图（OSD 画布）4 次都没有产生 click，抽屉一直不关，只能再点「⋯」。单手用户最常用的「点外面关掉」这个手势，在两个平台上表现不一样，而且都不对。
   - 改法：窄屏时加一个真实的遮罩层 `#setMask`（`position:fixed; inset:0`，z-index 在抽屉下、固定 UI 上），`pointerdown` 时关闭抽屉并 `preventDefault` / `stopPropagation`；关闭逻辑不要再依赖 document 的 click。卡片抽屉如果以后加遮罩，也照这个做。
   - 证据：`outb/` 下 `b_drawer.mjs`（p414：`afterMaskTapZoomIn.zoomChanged=true`、`afterMaskTapMarker.cardOpen=true`，截图 `p414_after_mask_marker.png`），`b2_ios.mjs` 输出（iphone：`closed:false`、`clicks:[]`；phone：`closed:true`）。
2. **P3 卡片抽屉打开时，层切换器从卡片顶边露出一截**
   - 位置：手机下 `#layers` 在左下，`#card` 是底部抽屉（`viewer.html` 约 282、294 行）。
   - 现象：卡片盖住了层切换器的下半截，「伊甸庄园」按钮的顶部从卡片上沿露出来，像是 UI 叠错了（`outb/p414_after_mask_marker.png`、`out/p414_zh_mid_card.png`）。事态横条也被整条盖住（这一条可以接受）。
   - 改法：窄屏开卡时给 `#layers` / `#evbar` 加 `visibility:hidden`，或者把它们整体上移到卡片上方。
3. **P3 手机上的署名被截断成「© OpenStreetMap contribut…」，EN 下是「© OpenStreetM…」**
   - 位置：`#credit`（`white-space:nowrap; text-overflow:ellipsis`），手机上从 150 px 开始排。
   - 现象：OSM 要求署名可读，375 宽 + EN 时连「OpenStreetMap」都没显示全，全文只能看 title，而触屏上看不到 title。
   - 改法：窄屏换成短署名（「© OSM 贡献者」/「© OSM contributors」），点一下展开全文。
   - 证据：`out/a.json` 里每个状态的 `trunc`。
4. **P3 复位视野下，地名标签被屏幕边缘裁掉**
   - 位置：`tc_low` 在 414 宽下的 home 视野。
   - 现象：左侧「货运站 · 旧地面轨道枢纽」「防卫军前沿哨所」、右侧「资产管理委员会下层设施」都被切掉一部分。
   - 改法：标签避让时加上视口边界约束，贴边的标签向内翻转。
   - 证据：`outb/p414_after_mask_marker.png`。
5. **P3 EN 下还有中文残留，115% 字体时有折行**
   - 位置 1：宿主悬浮按钮的 aria-label / title「打开世界地图」不跟随语言（`eden-map.js` 133 行）。
   - 位置 2：事态标记的图标字「盗」没有英文替代。
   - 位置 3：卡片字段名「Severity / status」在 115% 字体下折成两行，可以缩短成「Status」。
   - 庄园卡片「Era 初代」没翻译，属于 `map/estate/*`（冻结，归云端，本轮不计）。
   - 证据：`outc/c_host.mjs` 的输出里 `fabTitle`；`out/p375_en_z115_mid_card.png`。

## 一句话结论
手机布局、宿主栏联动和嵌入首开（世界图 0 瓦片）都达标，8.0 分过门控；最该修的是「⋯」抽屉的假遮罩：安卓上点外面会穿透到地图，iPhone 上点外面关不掉。
