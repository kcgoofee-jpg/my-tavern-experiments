# v0.9.5「自定义」面板重做 · 架构评审 r1

**结论：不通过（fail）**，评分 **6.5 / 10**。修掉 P0 和两条 P1 后可以复审。

整体结构是对的：eden_map 仍在 stat_data 之外；normCustom 新加的 `同步手动` / `源` 向后兼容（旧版读到未知键会忽略）；主题挂到根元素上，自检提示改用 CSS 变量；公开的 EdenMap API 只加不改（宿主和查看器两边都加了 flyTo）；flyTo 统一走 TCCustom.flyTo + picker.normTarget，以后接庄园视图只要实现 `estate:room` 聚焦就行，可插拔性合格。问题集中在迁移结果的保存和 flyTo 的时序上。

## 发现

### P0-1 迁移结果没写回，第二次加载会把同步变成「关」
`loadCustom` 里 `syncMigrate` 之后只调了 `customChanged(false)`，没有 `saveRoot()`。以 0.9.3 的老数据为例（`同步世界书:false`、没有 `同步手动`、世界书还不存在）：这次按新默认当作开，`syncWb` 真的建了世界书，但变量里还是 `false`。下次加载时 `wbExists` 为 true，`syncMigrate` 就判定成「用户自己关过」，把同步关掉并停用条目。这个启发式把我们自己建的世界书当成了用户的意思。
**修复**：迁移后马上保存。had 为真写 `{..., 同步手动:true}`，had 为假写 `{..., 同步世界书:true}`，然后 `await saveRoot()`（和 `migrateOld` 分支的做法一致）。补一条测试：迁移 → syncWb 建书 → 再次 loadCustom，同步应该还是开。

### P1-2 冷启动时 flyTo 会被紧跟着的 here 推送拉回去
`ready` 处理里先 `post(fly)`，再 `push()`。查看器执行 flyTo 时 `#here` 还是空的，于是 `lastJump=''`；接着 `eden-map:here` 带着真实地点到达，值和 lastJump 不同，`jumpHere` 就会执行；而且 here 值变了，`estFocus` 也被清空。结果是飞过去之后又被拉回当前地点。
**修复**：宿主在 `ready` 时先 `push()` 再发 `fly`（wake 分支同样先 push 再 fly，也可以把 fly 放进 here 消息里一起发）；或者在查看器里加一个 `flyLock`：flyTo 之后忽略下一条 here 触发的自动跳转，不再靠比较 lastJump。`estFocus` 只在 here 值变化、而且不是紧跟在 fly 后面的那一条时才清。

### P1-3 唤醒时如果 sleeping === BOOT，fly 会丢
`wake` 分支是 `if (e.data.fly && id !== BOOT) ... else if (id === BOOT) bootLater()`。如果面板在启动阶段就休眠了，之后用 flyTo 打开，只会执行 bootLater，飞行目标丢失；宿主那边 flyQ 已经清空了，无法重发。
**修复**：BOOT 时把目标存进 `pendingFly`，等 `bootLater` / 首张图就绪后再 `TCCustom.flyTo(pendingFly)`。

### P2-4 flyQ 可能残留旧目标
`flyTo` 遇到 `swappable && !line` 时进入 showPicker，`flyQ` 没有清；用户关掉面板，过很久再打开时会突然飞到旧目标。换聊天时也不清。
**修复**：在 `close()` 和 chatChanged 时 `flyQ = null`。另外，目标还没真正送到时，flyTo 应该返回 false，或者返回一个等到 ready 才完成的 Promise。

### P2-5 懒建世界书时，拿不到书名列表会漏写停用条目
`wbExists` 在 `getWorldbookNames` 不可用时一律返回 false。在这种环境里，`syncWb` 遇到「内容清空、以为书不存在」会直接 return，跳过「给已建的书写停用条目」这一步，旧内容会继续注入。`syncMigrate` 也会把这种情况当成「没建过」。
**修复**：判断不了时 `wbExists` 返回 `null`；调用方遇到 `null` 走原来的写入路径（宁可写一次空条目，也不留旧的注入）；`syncMigrate` 遇到 `null` 按「不确定」处理，保持原值并记 `同步手动`。

### P2-6 dlgKey 拦截的按键太多
只要对话框开着，`dlgKey` 就 `return true`，所有按键都被拦下（包括 Ctrl/⌘ 组合键和页面上其他输入框的按键）；焦点在对话框外时还会强制把 Tab 拉回 h2。对话框又没有 `inert` 或遮罩来保证模态，按键被拦会让人以为地图卡死了。
**修复**：给对话框以外的区域加 `inert`（或加遮罩），让对话框真正模态；dlgKey 只拦 Esc / Tab / `[ ]` 这类地图快捷键，放行带修饰键的组合键。

## 其他核对项（通过）
- normCustom 默认 `同步世界书:true`，只有带 `同步手动` 时才尊重 false；`setWorldbookSync` 会写 `同步手动:true`。语义正确（前提是修掉 P0）。
- `源` 标记：手动保存和剧情标签分别写入；旧版本读到会丢掉这个键，不会出问题。
- 主题：`#ID.em-light` 选择器和 matchMedia 监听在 cleanup 里都解除了，没问题。
- estFocus 优先于当前地点，逻辑清楚；但受 P1-2 影响。
