# 性能评估 · 重度桌面 RP 玩家（heavy_desktop）

## 1. 测量 / 检查了什么
- 通读 map/tavern/eden-map.js（582 行）的事件订阅、recompute、inject、cleanup；events.mjs / characters.mjs 解析路径；viewer.html 的定时器、云层动画、sleep/wake。
- Node 微基准（scratchpad/b.mjs）：81 楼 × 每楼 11.5k 字符（200 个状态栏 div + 正文 + 1 条事件标签 + 1 条人物标签），跑完整 recompute 纯计算部分（去 EJS、collect、collectChars、summarize）：**约 4.1–4.5 ms/次**（M 系 Mac，Node）。不含 getChatMessages 本身的开销（酒馆侧复制 81 楼，未测）。
- 未测：真实 ST 中的 getChatMessages 耗时、面板常开时的空闲 CPU（云层 WAAPI 动画）、Playwright 长会话内存。这些数字没有，下面不编。

## 2. 发现
### P0：无
### P1：无（代码层面未发现泄漏或每 token 触发的重活）
- 解析按楼层范围固定 81 楼（SCAN=80, eden-map.js:344,366），与聊天总长 3000 楼无关；防抖 250 ms（:411）；MESSAGE_* 在流式期间不逐 token 触发。

### P2
- **P2-1 面板常开时云层动画一直跑**：viewer.html:1591 只在 document.hidden 时暂停；面板开着但玩家在聊天框打字/看别的扩展时，WAAPI 云层持续合成，桌面 GPU 常驻占用。修：宿主在面板失焦/聊天输入获焦或生成中时 post `eden-map:quiet`，iframe 暂停 anims；或 IntersectionObserver + 60 s 无交互自动暂停。约 0.5 天。（需先实测空闲 CPU 确认量级）
- **P2-2 一次 VARIABLE_UPDATE_ENDED/SWIPED 触发重复工作**：:566 同时 pushSoon+recomputeSoon，:568 与 :570 都监听 SWIPED，:567/:569 两个 CHAT_CHANGED；每次 recompute 调 getHere()（getMvuData）+ mvuStat()（又一次 getMvuData），push 再调一次 → 同一轮 3 次 getMvuData + 深读。MVU 大变量表（数百 KB）时有感。修：合并为单一 `refreshSoon()`，一轮只取一次 stat_data 传入 push/recompute。约 1–2 小时。
- **P2-3 每次 recompute 都对 81 楼全文重新正则**：即使只新增 1 楼。4 ms 可接受，但加上 getChatMessages 复制 81×大楼层（状态栏/CG 卡片 HTML 可达 50–100 KB/楼）可能到数十 ms，在生成前同步路径（:571 GENERATION_AFTER_COMMANDS 同步调用 recompute）会直接加到发送延迟。修：按 floor+文本长度/hash 缓存 parseMarks 结果（Map，限 120 条），只解析变化楼层。约 2–3 小时。
- **P2-4 每开一次聊天都后台预加载 + slowWarmAlt**：:572 空闲时 preload 整个 viewer（ghost），sleep 后 3 s viewer.html:1517 起 slowWarmAlt 拉另一版底图各层图块（:679），桌面 leanBg() 为假会全拉。频繁切聊天的重度玩家会反复触发网络和解码。修：同一会话只预热一次（sessionStorage 标记），或 alive/killT 存活时跳过。约 1 小时。

### P3
- **P3-1 cleanup 未 eventOff**：:577 清了 DOM/message/keydown，但 eventOn 的 8 个监听依赖 TavernHelper 卸载脚本时自动清理；若脚本以非 iframe 方式热重载（__edenMapCleanup 路径）会叠加监听。修：保存返回的 stop 句柄或用 eventRemoveListener 在 cleanup 中逐个解绑。0.5 小时。
- **P3-2 inject 每次先 uninject 再 inject**（:383-384）：有文本比较守卫，只在变化时发生，影响小；可改为 injectPrompts 同 id 覆盖（若 TH 支持）。
- **P3-3 push() 每次重建 hereEl DOM**（:328-333）即使地点未变；加 `if (full === lastFull) return` 早退。10 分钟。
- **P3-4 viewer 1 s 轮询**（viewer.html:1007、eden-map.js:254）：前者空闲时只做 getItemCount 循环，开销可忽略；后者 endProg 会清。无泄漏，记录备查。
- 与其他脚本交互：只挂 window.parent.EdenMap、一个 message 监听（校验 e.source，:307）和 keydown（排除输入框），未发现冲突；注入 should_scan:false 不会触发其他世界书。

## 3. 价值/成本前 5
1. 合并事件 → 单次 refresh + 单次 getMvuData（P2-2，1–2 h）
2. parseMarks 按楼缓存，生成前同步路径变快（P2-3，2–3 h）
3. 预热每会话一次（P2-4，1 h）
4. 实测后按需暂停常开面板的云层（P2-1，先测 0.5 h，改 0.5 天）
5. cleanup 解绑 eventOn + push 早退（P3-1/P3-3，<1 h）
