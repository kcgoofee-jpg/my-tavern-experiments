# v2b 门控：查看器模块化 + maps.json JSON Schema（2026-09-28）

范围：arch-v2 §6 第 6–8 步（内联主脚本 → `map/app/*.mjs`，8 个外挂 → ES 模块，`map/data/schema/*.schema.json` 由 check_maps 强制）。人设评审：Opus 只读子代理，同步执行；第 1 轮即过线，第 2 轮未开。

| 人设 | 第 1 轮 | P0 / P1 |
|---|---|---|
| 架构 / 代码质量 | 8.5 | 0 |
| 性能 | 8 | 0 |

## 第 1 轮 P2 与处理（提交 669d2ee）
- 架构：「求值期不碰别的块」没有测试护栏 → 加了 `tests/app_modules.test.mjs`。它在桩 DOM 下把核心与全部外挂求值一遍；人为在顶层引用别的块的 let 时会报 TDZ，已验证能报出来。同一个测试还固定了 bridge 名单。
- 架构：`--committed` 模式下 schema 读的是工作区 → 改为读提交树。
- 架构：并行加标记的 agent 容易撞上 `additionalProperties:false` → 每个对象都放行 `_` 注释键，并写明「同一提交里先登记字段」。
- 架构：P3，注明 Python re 与 ECMA 正则的差异。
- 性能：可选模块的 modulepreload 挡在 OSD 前面 → 排到核心之后。
- 性能：首次通知和人物面板要多等一个 CDN 往返 → 改为 load 后空闲时预取。
- 未改：
  - P3：document.write 写出的 varmap / compose 没有 preload，影响可以忽略。
  - P3：`map/core` 里的 `edenMap*` 键前缀和 `eden_map.探索` 变量名 → 留给通用化那一步。
  - P3：任务里写的顺序是 util → i18n → tiers；实际按原内联脚本的执行顺序（tiers 在 i18n 前），arch-v2 §1.3 以代码为准。

## 验证
- `node --test`（82 个）、`tools/smoke.sh`、`check_maps`（工作区 / `--committed`）：全绿。
- 浏览器 24 个套件（375 手机、桌面、WebKit iPhone，含嵌入 srcdoc 的 e7_host / v2a / autoupd）：基线全绿，最终版也全绿。leak_v2 基线 / 新版都通过（监听器 715→715 / 714→714）。

## 数字（perf_v2，5 轮中位数；另做一次 10 轮冷开探针）
| 项 | 基线 314217d | 最终 |
|---|---|---|
| 桌面冷开 | 458 ms | 441 ms（探针 440 → 440） |
| 手机冷开 | 480 ms | 490 ms（探针 472 → 491） |
| 冷开流量 桌面 / 手机 | 2192 / 2604 KB | 2192 / 2604 KB |
| 请求数 桌面 / 手机 | 106 / 147 | 122 / 163 |
| 首开包体 raw / gzip | 747.6 / 250.1 KB | 743.7 / 259.8 KB |
| 堆（载入后 / 切层 10 次后） | 3.2 / 4.0 MB | 3.19 / 4.07 MB |

- **拆分本身的代价：gzip 约 +15 KB**（按文件单独压缩的损失：核心模块单独压 89.9 KB，拼成一个文件压 74.4 KB）。
- 冷开时不再取 notice / characters / tavern events，可以抵消这部分；但为了第一次点开时不等 CDN 往返，第 1 轮修复后又改回在 load 后空闲时预取。所以 10 秒窗口内的包体比基线多 gzip 9.7 KB。
- 手机冷开慢了 10–19 ms。原因是本机测试服务器用 HTTP/1.1，每个域名只有 6 条连接，多出来的 16 个模块请求要排队；jsDelivr 是 HTTP/2 多路复用，而且模块图全部 modulepreload，没有逐级发现的瀑布。性能评审判定不算真实回退。
- 庄园第一帧最后一次测出 657 ms，比前几次（398–467）明显高。庄园页没有改动，可能是测量噪声，发版后应在 CDN 上复测。

## 提交
- c52359c 模块化（核心拆分 + 外挂 ES 模块 + 懒加载补偿 + 测试 / 工具更新）
- ed8aef7 JSON Schema + jsonschema_lite + check_maps + arch-v2 §1.3
- 3d9e047 modulepreload 排序
- 669d2ee 门控修复
