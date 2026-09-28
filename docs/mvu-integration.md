# 地图 × MVU 联动：一手源码结论（v0.9.9）

读的版本：SillyTavern `06bde93`（2026-09-14）、酒馆助手 JS-Slash-Runner `830ebc8`（2026-09-28）、MagVarUpdate `b13b43b`（2026-09-26）、本地 TauriTavern `a6351fec`（2026-09-26）。下文路径均相对各仓库根目录；ST = SillyTavern，TH = 酒馆助手，MVU = MagVarUpdate。

## 1. 定义

| 名词 | 存在哪 | 出处 |
|---|---|---|
| 聊天变量 | `chat_metadata.variables`，写后 `saveMetadataDebounced()` | TH `src/function/variables.ts:151-153` |
| 楼层变量 | `chat[i].variables[swipe_id]`，**每个 swipe 一份**；写后 `saveChatConditionalDebounced()` | TH `variables.ts:140-148` |
| `getVariables({type:'message', message_id:'latest'})` | 最后一条**非隐藏**楼（过滤 `is_system`）的**当前 swipe** 变量；没有就返回 `{}` | TH `variables.ts:56-70` |
| MVU 数据 | 楼层变量里的 `{stat_data, schema, display_data, delta_data, initialized_lorebooks}`；`Mvu.getMvuData` 就是 `getVariables` | MVU `src/function/global/index.ts:28-30` |
| 「有效快照」 | 当前 swipe 的变量里有 MVU 数据的最近一楼 | MVU `src/util.ts:12-32`（`getLastValidMessageId` / `getLastValidVariable`） |
| 注入 | `setExtensionPrompt(key, value, position, depth, scan, role, filter)`；position 1 = 聊天内按深度 | ST `public/script.js:8926`、`484-487`；TH `injectPrompts` 包装：`src/function/inject.ts:21-55` |

## 2. 生命周期（一次回复）

1. ST 发出 `GENERATION_STARTED(type, opts, dryRun)`（ST `script.js:4299`）；MVU 在此做初始化检查（MVU `src/function/initvar/index.ts:12`）。
2. 用户楼：`MESSAGE_SENT`（ST `script.js:5910/5917`）→ MVU `handleVariablesInMessage` 也会处理用户楼（MVU `src/function/update/index.ts:17-19`）。
3. 流式结束：`MESSAGE_RECEIVED` + `CHARACTER_MESSAGE_RENDERED`（ST `script.js:3798-3800`），之后 `saveChatConditional()`（`3812`）。
4. MVU 在 `MESSAGE_RECEIVED` 上（**节流 3 秒**，MVU `update/index.ts:15`）调用 `onMessageReceived`：少于 5 个字的消息直接跳过（`on_message_received.ts:31-35`）；「随 AI 输出」模式直接 `handleVariablesInMessage`，「额外模型解析」模式另发一次请求、渲染后把结果拼进正文再解析（`on_message_received.ts:45-139`）。
5. `handleVariablesInMessage`：以 `[0, message_id)` 最近有效快照为底（`update_variables.ts:1659-1660`），解析正文里的更新命令（`updateVariables`，其中发 `VARIABLE_UPDATE_STARTED`/`ENDED`：`update_variables.ts:845`、`1618`），再 `updateVariablesWith` 写**本楼当前 swipe**（可选同时写聊天变量）（`update_variables.ts:1714-1737`）。
6. 生成结束：`GENERATION_ENDED`（ST `script.js:3536`）；手动停止：`GENERATION_STOPPED`（`script.js:5618`）。
7. 删楼：`MESSAGE_DELETED`（ST `script.js:1611` 等）→ MVU 2 秒防抖后 `restoreVariables`：最近 N 楼缺快照就从更早快照**逐楼重演**补回（MVU `cleanup/index.ts:17-22`、`cleanup/restore_variables.ts`）。
8. 长聊天：MVU **默认开启**自动清理，每 5 楼一次，只保留最近 20 楼变量 + 每 50 楼一个快照（MVU `store.ts:300-305`，`cleanup/index.ts:24-44`）。**更早楼层的 `getMvuData` 会是空的。**

## 3. 地图应该依赖什么

- **读**：最后一条非隐藏楼的当前 swipe（= `latest`）。它空时，照 MVU 自己的规则往前找最近有效快照，并标明「未确认」。不读聊天变量里的 stat_data（MVU「更新到聊天变量」是可选兼容项，`update_variables.ts:1733`，且是全局最新，不跟 swipe 走）。
- **何时重读**：`VARIABLE_UPDATE_ENDED`（MVU 提交后）、`MESSAGE_SWIPED/EDITED/UPDATED/DELETED/RECEIVED`、`MESSAGE_SWIPE_DELETED`、`CHARACTER_MESSAGE_RENDERED`、`CHAT_CHANGED`、`GENERATION_STARTED/ENDED/STOPPED`；外加前台恢复与网络恢复。事件只是「该重读了」的提示，**数据永远从 chat 数组重新推导**，丢事件不致错，只会晚。
- **注入**：用 `injectPrompts`（TH），固定 id、覆盖式更新；`once` 时 TH 自己在 `GENERATION_ENDED/STOPPED` 撤掉（`inject.ts:44-48`），`pagehide` 也撤（`inject.ts:51`）。

## 4. 失败模式与现状

| # | 场景 | 源码事实 | 地图现状（v0.9.9 后） | 缺口 |
|---|---|---|---|---|
| F1 | 丢事件（脚本晚加载、状态栏直接改变量不发事件、iframe 被挂起） | 事件是进程内的 `eventSource`，不回放 | 面板开着每 4 s 比指纹（`eden-map.js` `pollT`）；**新增** `visibilitychange`/`pageshow`/`online` 时强制重推导 | 面板关着且无事件时，胶囊最多晚到下一次事件 |
| F2 | swipe / 重新生成：新 swipe 在 MVU 写回前没有变量 | `latest` 返回 `{}`（TH `variables.ts:70`） | **以前**：地点读成空，胶囊消失、时钟/着装清空。**现在**：`snapshot.mjs pickStat` 往前取上一份快照，胶囊变灰斜体 + 提示「等待本楼变量更新」（pending） | — |
| F3 | 左滑回旧 swipe | 每个 swipe 独立快照（TH `variables.ts:147`） | `latest` 跟 `swipe_id` 走，自然读回旧值；`MESSAGE_SWIPED` 触发重读 | — |
| F4 | 生成中被杀 / 断网 / 卡死 | 出错时 ST 仍可能发 `MESSAGE_RECEIVED`（`script.js:3824-3829`），MVU 会解析**半截**正文，可能只执行了前几条命令；被系统杀掉则什么都不发，最后一楼可能只有半截正文、没有快照 | **现在**：最后一楼是 AI 楼且没快照、又不在生成 → stale，显示上一份快照并提示「本楼没有变量快照」。生成标志 180 s 超时自动清，避免 ENDED 永远不来时一直 pending | 半截命令已写入的快照在地图看来是「ok」，无法区分（需要 MVU 标记完整性；见 interaction-modes (d)(e)） |
| F5 | 写入丢失（杀进程前没落盘） | 变量写后都是**防抖保存**（TH `variables.ts:148`、`153`） | 地图自己的 `eden_map` 写失败会退回本机 localStorage，下次成功再清（`writeVars`）；**新增**：内容相同就不写（幂等），减少重复保存 | 防抖窗口内被杀，最后一次 MVU 写回会丢；重开后 MVU `restoreVariables` 只在删楼时触发，地图显示 stale 提示而不是错数据 |
| F6 | 与 MVU 更新竞态 | MVU `MESSAGE_RECEIVED` 节流 3 s，额外模型解析还要再等一次请求 | 地图不在 `MESSAGE_RECEIVED` 立刻认定，靠 `VARIABLE_UPDATE_ENDED` 与 300 ms 合并；生成期间标 pending | 额外模型解析失败（MVU toast）时本楼一直无快照 → 表现为 stale，符合预期 |
| F7 | 超长聊天（500+ 楼） | MVU 自动清理后老楼没有变量（`store.ts:300-305`） | 地图只读最近一份，不回溯老楼 stat_data；`pickStat` 最多往前 400 楼（清理后每 50 楼必有快照）；事态扫描窗口 80 楼 | 模型注意力衰减本身不是地图能修的——见 `docs/interaction-modes.md` |
| F8 | 删楼 / 分支（branch 新聊天） | 删楼触发 MVU 重演；分支是新 chat id，`CHAT_CHANGED` | 重读 + `eden_map` 按聊天 id 取；换聊天后旧写入作废（`writeVars` 检查 chat id） | — |
| F9 | 隐藏楼 | `latest` 过滤 `is_system` | `pickStat` 同样跳过 | — |
| F10 | 数据库插件（shujuku）同在 | 它有自己的表与回调，地图只读（`docs/content-compat.md` §表格数据库插件） | MVU 读不到地点时读它的主角表；它的更新回调触发重读 | 不写它的表（边界不变） |

TT 相关：TauriTavern 只有**正常退出**会先通知前端做优雅关闭（`src-tauri/crates/tauritavern/src/app/host/shutdown.rs:34-46`）；移动端恢复只有 `Resumed` 钩子做局域网同步（同文件 `49-64`），被系统杀掉没有任何回调。所以地图必须假设「任何时刻可能中断」，重开后只靠 chat 数组重新推导——这正是 v0.9.9 的做法。

## 5. 代码位置

- `map/tavern/snapshot.mjs`：`pickStat`（选快照 + ok/pending/stale/none）。
- `map/tavern/eden-map.js`：`mvuStat`（每轮一次快照，走 `pickStat`）、`GEN`（生成状态）、`em-unsure` 指示、事件订阅块、`writeVars` 幂等。
- 测试：`tests/snapshot099.test.mjs`（swipe、regen、删楼、生成中被杀、断网、隐藏楼、600 楼 + 自动清理）。
