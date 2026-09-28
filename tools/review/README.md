# tools/review：人设审阅 + 架构师门控

每个大改动或卡住时都走这一套（美术草稿、8K 局部、上层庄园、云海、伊甸庄园、面板 UI）。**所有审阅代理和架构师一律用 Opus。**

## 用户检查点（开工前，不是评审的替代）

任何**新技术路线**（换渲染管线 / 建模方式 / 查看器实现）或**重点资产**（庄园、地标一类要花几小时以上、用户会说「顶奢」「传承」「一眼认出」的资产）开始建模 / 编码前，先出一张**风格帧**（参考板或最小 demo 截图）+ 一张 **375 px 宽手机截图**，发给用户，**等明确 OK 再往下做**；每轮草稿后同样各附一张手机截图给用户，不要只依赖评审分数或 CDN 预览。这一步在人设评审之前、且独立于评审轮次，不能用「先评审通过再给用户看」代替。依据：`docs/render-retro.md` W2（庄园 three.js 线因为没有风格帧 + 手机检查点，评审给了 9/8/8.5 分，用户手机实测却是像素化，整线作废约 8–12 agent·h）。

## 流程（每一轮）
1. **出材料**：草稿 / 8K 局部（`tools/crops.sh`，一次 Blender 会话出多块）、浏览器截图与实测（`node tools/browser/accept.mjs <目录>` 或自写脚本，零件在 `tools/browser/lib.mjs`）。
2. **打包简报**：
   ```bash
   python3 tools/review/pack.py --stage city --round 2 --out <scratch>/r2 \
     --images '<scratch>/r2/*.png' --since <上轮提交> --changes "本轮改了什么" [--facts 设定事实.md]
   ```
   生成 `brief.md`（图片及尺寸、提交记录、diff --stat、GOAL 未完成项、用户原话、NOTES 最后两节、门控阈值）和 `prompts/`（固定人设已填好简报路径、轮次、报告路径）。
3. **固定人设**：`prompts/` 里每个人设各派一个 Opus 代理，并行。人设模板在 `personas/`；**每个人设提示词开头必须先读 `docs/rejected.md`（用户已否决清单），逐条确认本轮没有复发，复发一律记 P0**：
   - 美术（城市三层 / 上层）：`art/realistic_aerial` 写实航拍、`art/setting` 设定一致、`art/readability` 俯视可读性、`art/seams` 拼缝与重复感、`art/garden_history` 园林与建筑史（阶段 2）、`art/phone` 375 px 手机检查（模糊 / 浮层 / 裁标签 / 对比度）、`art/fidelity` 与卡一致
   - 面板 UI：`ui/phone` 手机首用、`ui/rp` 桌面剧情、`ui/design` 视觉设计、`ui/a11y` 无障碍、`ui/weak_net` 弱网
   - 伊甸庄园：`estate/architect` 建筑师、`estate/interior` 室内、`estate/luxury_marketer` 顶奢营销、`estate/interaction_perf` 交互与性能、`estate/phone` 375 px 手机检查、`estate/fidelity` 与卡一致
4. **现编人设（必做，用户要求）**：固定提示词会漏掉新问题。编排代理读 `prompts/_fresh_persona.md`（即 `fresh_persona.md`），根据本轮 diff、NOTES 最新几节、GOAL 里用户最新的话现编**一位**审阅者：每轮都不同、写明为什么选他、检查点必须落在本轮改动上。报告写 `reports/fresh_r<N>.md`，分数同等计入门控。
5. **架构师**：所有报告回来后派 `prompts/_architect.md`（`architect_synthesis.md`）：结论表、分数表（含「现编」一行）、冲突裁定、去重的修复清单（带归属与验收标准）、剩余轮次。
6. **落档**：报告和裁决复制到 `docs/reviews/<门控>/`，结果一句话写回 `docs/GOAL_v0.9.1.md` 对应条目；要云端改的写进 `NOTES_FROM_LOCAL.md` 末尾（只追加）。

## 门控阈值（用户 2026-09-27 同意放宽；依据 `docs/reviews/rp_value_study/architect.md` (b)；`pack.py` 的 `GOOD_ENOUGH` / `STAGES` 与此一致）
渲染以「够用」为准，以后需要时单独开精修任务，不在发版门控里追写实度。

**严格（不达标就不过）**
- 与设定一致 ≥ 7。
- 在省流档 2000 px 和 375 px 手机屏上，一眼认出是哪一层、哪片城区（上层：伊甸一眼最显眼；英式 / 法式 800 m、苏州 / 岭南约 400 m 视野能认出）。
- 标记可读：对比度 ≥ 4.5，1080p 推流后仍可读。
- TT 内性能：省流首屏 ≤ 3 s；单层标准档 ≤ 1.5 MB；开关面板 20 次后 JS 堆不增长。
- 标准档下无明显瑕疵（只判有 / 无）；庄园：马桶、毛巾近景清楚有质感。

**参考（打分但不阻断）**：写实度（≥ 6 为宜）、园林与建筑史、拼缝与重复。8K 局部只抽查明显瑕疵，不打分。

**问题分级**：每条问题标注在哪一档可见（省流 2000 / 标准 4000 / 清晰 8000）；只在清晰档可见的自动降为 P2。

**轮次（改）**：默认 **1 轮**。只有出现 P0，或有人设打分 **< 7**，才开第 2 轮；到 2 轮为上限，按最高分版本发，遗留进 backlog，不再开新轨道。**任何 < 7 分必须附一条可复现的截图 + 具体位置（图名 + nx,ny 或截图文件名 + 区域），不许凭印象扣分**；给不出可复现证据的 < 7 分，架构师裁定时按 7 分处理并要求补证据。

**人设**：每个美术门控都加 `art/rp_glance`（RP 玩家扫一眼），他可以否决「再开一轮」；现编人设照旧必做；`art/phone`、`estate/phone`、`art/fidelity`、`estate/fidelity` 参与对应门控。

| 门控 | 审阅者 | 另加条件 |
|---|---|---|
| 城市中 / 下层（`city`） | rp_glance、设定、可读性（严格）＋写实、拼缝（参考）＋phone、fidelity ＋现编 | `check_maps.py` 通过；无穿模 / 压路楼；检查点与 7 号井位置不变 |
| 上层（`upper`） | 同上 ＋ 园林与建筑史（参考） | 不做岛影；航线不计门控 |
| 云海（`clouds`） | rp_glance、可读性、写实（参考）＋现编 | 厚云层读得出；只留白云遮挡 |
| 8K（`render8k`） | rp_glance、拼缝 ＋现编 | 四张都生成；局部只查明显瑕疵；浏览器验收全 ✓ |
| 庄园（`estate`） | rp_glance、建筑、室内、营销、交互性能、phone、fidelity ＋现编 | 不再要求每位 ≥ 8；马桶、毛巾近景严格 |
| 面板 UI（`ui`） | 五个 UI 人设 ＋现编 | 同步骤复跑、无新 P0 / P1 回归、`accept.mjs` 全 ✓ |

## 约定
- **每个人设提示词必须先读 `docs/rejected.md`**（用户已否决清单：岛影、飞艇、平铺矢量风、画廊是给用户上传用的、不编名 / 不加非卡内容等），逐条确认本轮没有复发，复发记 P0。
- 审阅者只读：不改仓库文件、不做 git 操作；报告写到 scratchpad，裁决后再复制进 `docs/reviews/`。
- 独立打分：只看现在的绝对水平，不因「有进步」加分；不看其他审阅者的报告。
- 问题要能落地：写清位置（图名 + nx, ny 或截图名）、现象、改哪个脚本 / 参数、归属（本机 / 云端）、验收标准。
- 浏览器与渲染都遵守安静期锁（`tools/quiet.sh`）；后台有 Blender 在渲时，计时数据要注明。
- 分数落盘：`tools/review/pack.py` 打包简报的同时把上一轮已定稿的分数追加到 `logs/review_scores.csv`（见 `pack.py --log-scores`）。
