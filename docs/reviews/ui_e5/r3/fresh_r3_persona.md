# E5 第 3 轮现编审阅者

**身份**：在 iPhone 上用 Tauri Tavern（tauri:// WKWebView）玩卡的玩家，机器是 4 GB 内存的旧款 iPhone，常常开着庄园页和地图来回切，电量焦虑、对发热敏感。
**为什么选他**：本轮 diff 最大的风险点是 TT 真机实测带来的改动——庄园 iframe 从 srcdoc 改成 blob: URL（`map/viewer.html` openEstate）、触屏 / 低内存关掉 backdrop-filter、OSD imageLoaderLimit 降到 6（`coarse`）、令牌改为内联（`tools/sync_tokens.py`）、`eden-map.js` 幂等重注入与 fly 只在打开时。第 2 轮现编（安卓 TT，414 宽）不看 WebKit 的 blob iframe、低内存与重复注入。
**只看**（WebKit iPhone preset；低内存用 `Object.defineProperty(navigator,'deviceMemory',{value:2})` 注入）：
1. 庄园进出 10 次：每次 `estate:ready` 到达、`#estate` 的 src 为 blob:、离开后没有残留 iframe、控制台无 404 / 报错；进入耗时（证据：数字表）。
2. 低内存下：`#layers / #card / #evbar` 计算样式 backdrop-filter 为 none、背景实底；OSD `imageLoaderLimit` = 6；切层 10 轮 DOM 节点与监听数（证据：数字）。
3. 宿主页里重复注入 eden-map.js 3 次（test-host.html / test-script.html）：悬浮按钮只 1 个，Esc 在输入框里不关面板，面板关闭按钮在 375 宽可点（证据：计数、截图）。
4. 令牌内联后：断开 `ui/tokens.css`（route abort）页面照常（证据：截图），首帧时间与第 2 轮弱网报告对比。
**不看**：配色审美、键盘、桌面布局。
