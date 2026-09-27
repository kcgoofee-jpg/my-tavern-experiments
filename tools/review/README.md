# tools/review：人设审阅 + 架构师门控

每个大改动或卡住时都走这一套（美术草稿、8K 局部、上层庄园、云海、伊甸庄园、面板 UI）。**所有审阅代理和架构师一律用 Opus。**

## 流程（每一轮）
1. **出材料**：草稿 / 8K 局部（`tools/crops.sh`，一次 Blender 会话出多块）、浏览器截图与实测（`node tools/browser/accept.mjs <目录>` 或自写脚本，零件在 `tools/browser/lib.mjs`）。
2. **打包简报**：
   ```bash
   python3 tools/review/pack.py --stage city --round 2 --out <scratch>/r2 \
     --images '<scratch>/r2/*.png' --since <上轮提交> --changes "本轮改了什么" [--facts 设定事实.md]
   ```
   生成 `brief.md`（图片及尺寸、提交记录、diff --stat、GOAL 未完成项、用户原话、NOTES 最后两节、门控阈值）和 `prompts/`（固定人设已填好简报路径、轮次、报告路径）。
3. **固定人设**：`prompts/` 里每个人设各派一个 Opus 代理，并行。人设模板在 `personas/`：
   - 美术（城市三层 / 上层）：`art/realistic_aerial` 写实航拍、`art/setting` 设定一致、`art/readability` 俯视可读性、`art/seams` 拼缝与重复感、`art/garden_history` 园林与建筑史（阶段 2）
   - 面板 UI：`ui/phone` 手机首用、`ui/rp` 桌面剧情、`ui/design` 视觉设计、`ui/a11y` 无障碍、`ui/weak_net` 弱网
   - 伊甸庄园：`estate/architect` 建筑师、`estate/interior` 室内、`estate/luxury_marketer` 顶奢营销、`estate/interaction_perf` 交互与性能
4. **现编人设（必做，用户要求）**：固定提示词会漏掉新问题。编排代理读 `prompts/_fresh_persona.md`（即 `fresh_persona.md`），根据本轮 diff、NOTES 最新几节、GOAL 里用户最新的话现编**一位**审阅者：每轮都不同、写明为什么选他、检查点必须落在本轮改动上。报告写 `reports/fresh_r<N>.md`，分数同等计入门控。
5. **架构师**：所有报告回来后派 `prompts/_architect.md`（`architect_synthesis.md`）：结论表、分数表（含「现编」一行）、冲突裁定、去重的修复清单（带归属与验收标准）、剩余轮次。
6. **落档**：报告和裁决复制到 `docs/reviews/<门控>/`，结果一句话写回 `docs/GOAL_v0.9.1.md` 对应条目；要云端改的写进 `NOTES_FROM_LOCAL.md` 末尾（只追加）。

## 门控阈值（摘自 `docs/GOAL_v0.9.1.md`；`pack.py` 的 `STAGES` 与此一致）
| 门控 | 审阅者 | 通过条件 | 轮数 |
|---|---|---|---|
| 阶段 1 城市中 / 下层（`city`） | 写实、设定、可读性、拼缝 + 现编 | 每人 ≥ 7，架构师通过；无硬拼缝、无穿模 / 压路楼；检查点与 7 号井平面位置不变；`check_maps.py` 通过 | 最多 3 轮，不过就取最高分一版继续并记遗留 |
| 阶段 2 上层庄园（`upper`） | 以上 + 园林与建筑史 + 现编 | 同上；伊甸默认视野一眼最显眼；每种风格 800 m 能认出；同风格 6 岛说得出区别 | 最多 3 轮 |
| 阶段 3 云海（`clouds`） | 写实、可读性 + 现编；架构师新旧并排判定 | 厚云层读得出；岛影与岛形一致、柔边、方向统一；比旧版明显更好（原文无分数门槛） | 云端 3 轮后本机兜底 |
| 阶段 4 8K（`render8k`） | 写实、拼缝 + 现编 | 四张都生成、`check_maps.py` 通过；每层 3 处 8K 局部无锯齿 / 橘皮 / 断线 / 怪影；浏览器验收全 ✓ | — |
| 伊甸庄园 C3（`estate`） | 建筑、室内、营销、交互性能 + 现编 | 每人 ≥ 8 且无 P0；马桶、毛巾「清楚有质感」；手机第一帧 ≤ 1.2 s（4× 节流 ≤ 2 s） | 云端返修 |
| 面板 UI E4 / E5（`ui`） | 五个 UI 人设 + 现编 | GOAL 未定分数门槛；惯例：同步骤复跑、逐条确认 ui-audit 编号、无新 P0 / P1 回归、`accept.mjs` 全 ✓ | — |

## 约定
- 审阅者只读：不改仓库文件、不做 git 操作；报告写到 scratchpad，裁决后再复制进 `docs/reviews/`。
- 独立打分：只看现在的绝对水平，不因「有进步」加分；不看其他审阅者的报告。
- 问题要能落地：写清位置（图名 + nx, ny 或截图名）、现象、改哪个脚本 / 参数、归属（本机 / 云端）、验收标准。
- 浏览器与渲染都遵守安静期锁（`tools/quiet.sh`）；后台有 Blender 在渲时，计时数据要注明。
