---
name: card-map
description: 把任意一张 SillyTavern / 酒馆助手（TavernHelper）角色卡做成本仓库伊甸地图那样的外挂地图：读卡 → 设定包（层 / 地点 / 别名 / MVU 变量）→ 参考板 → Blender 建模渲染 → 交互 → 世界书附加条目 → 测试 → 跟随版交付。只交付外挂脚本和世界书附加条目，不生成、不修改角色卡。用户说「给这张卡做地图」「新卡做个地图包」「把 X 卡接进地图」时使用。
---

# card-map：角色卡 → 外挂地图

先读（一次就够，后面按需回查）：`docs/onboarding.md`、`docs/generalize/README.md`（包结构与字段）、`docs/card-reading.md`、`docs/tooling.md`、`docs/versioning.md`。
示例包 `map/packs/town`（雾港镇，虚构）就是本流程的最小成品，照着改。
安装与流程图见同目录 `HOW-IT-WORKS.md`（Claude Code 从 `.claude/skills/card-map` 软链接读到本文件）。

流程用到的路径约定：
- `<仓库>` = 你自己的 git worktree（见硬规则 1）。
- `<S>` = scratchpad 目录（卡的副本、导出文本、草稿、渲染图都放这里，**不进仓库**）。
- `<id>` = 包 id，小写字母开头，2–32 位 `a-z0-9_-`。

每一步末尾的 **【检查点】** 必须停下来问用户，拿到明确答复再往下走。没有检查点的步骤自动做完再汇报。

---

## 0. 开工前（每次）

```bash
git fetch origin
git worktree add -b <你的分支> <S>/wt origin/preview     # 一个代理一个 worktree，不碰主检出
cd <S>/wt && node --test && bash tools/smoke.sh                    # 基线必须全绿，否则先报告
```

## 0.5 用户指引（如果填了）

`guides/` 目录放用户自己的建筑 / 面板 UI / 风格 / NSFW 指引模板（`guides/README.md` 说明用法）。开工前扫一眼这四个文件：**哪个文件有实际内容（不只是标题和提示注释）就读并照着做，空文件当没有，按本文档默认流程走**。这些是用户自己的立场，skill 本身不夹带、不代为设限。

## 1. 作者授权提醒 【检查点】

地图是原卡的衍生作品。开工前问用户：
1. 原作者是否同意做衍生地图？（没同意就只做本机自用，不发帖、不推公开分支。）
2. 发布帖首帖必须写原作者名并链接原作帖——请用户给出原帖链接，记进包的 `maps.json` 各图 `credit` 和 README 的署名段。

## 2. 完整读卡（只读副本）

输入：用户给的卡（PNG 或 JSON）、卡引用的外部世界书、用户自己在用的附加世界书。输出（都在 `<S>/card/`）：导出文本、`lines.json`、读者报告、`digest.md`、`buildings.md`。

```bash
cp "<用户的卡.png>" <S>/card.png          # 先复制；之后只读副本。绝不写 SillyTavern / 酒馆助手的数据目录
python3 skills/card-map/export_card.py <S>/card.png --out <S>/card [--world <S>/外部世界书.json]
#   → ccv3.json / chara.json / book.txt（含禁用条目）/ greet.txt / ext.txt / desc.txt / world_*.txt / lines.json（每个文件总行数）
```

按 `docs/card-reading.md` 派读者（**同时最多 2 个子代理**，排队跑完 5 个）：

| 读者 | 读什么 | 产出 |
|---|---|---|
| 通读 ×1 | 全部文件逐字 | 事实摘要草稿 |
| 地点 | 每个具名地点、所在层 / 区、相对位置、尺寸 | 地点表 → 建筑清单 |
| 人物 | 身份、住处 / 常在地、名字写法变体 | 人物表（住处落到地点） |
| 变量 / MVU | `stat_data` 真实键名、枚举、更新规则、正则与脚本、存储键、是否带表格数据库插件 | 变量表 |
| 事件 | 开局时间地点、作息、节日、隐含事件 | 事件分类候选 |

每个读者报告必须写 `文件:起-止` 行号范围（例如 `book.txt:1-240`），并输出 MISSED / WRONG 两栏。然后：

```bash
python3 skills/card-map/coverage.py <S>/card <S>/card/r_*.md    # 列出没人读过的段落；退出码 1 = 有缺口
```
有缺口就派补读者读那些行，再跑到退出码 0。汇总写：
- `<S>/card/digest.md`：事实摘要（地点、层、人物、变量、开局、事件），每条带出处行号。
- `<S>/card/buildings.md`：建筑清单（名字照抄、所在层、卡里写明的外观 / 尺寸 / 功能、出处行号），并标出候选主建筑（hero）。

之后任何人说「卡里有 / 没有 X」，先查 `digest.md`。仓库里只放中性摘要和出处，不整段抄卡正文。

## 3. 起草设定包 【检查点】

```bash
python3 tools/draft_pack_from_card.py <S>/card/chara.json --layers 上层,中层,下层 --out <S>/<id>.draft.json
#   只读条目标题 / 触发词（不读正文）；层名不会被当成地点别名；认出 MVU「当前地点」键路径时写进草稿 vars
```
对照 `digest.md` 手改草稿：
- 把「未分层」挪进真正的层；每层可写 `"id"` 得到可读地图 id（否则是 `<id>_l1`…）。
- 地点名、别名**照抄卡**；从人物住处、开局里补漏掉的地点；只在卡里出现一次的叫法也进 `alias`。
- `vars`：MVU `stat_data` 路径（键见 `map/tavern/adapter.mjs` 的 `FIELDS`）；没认出就留空，用户可在地图设置「变量映射」里改。
- 表格数据库插件（shujuku）：只读兼容已内置（`map/tavern/shujuku.mjs`，见 `docs/content-compat.md`「表格数据库插件」）；只需在 `digest.md` 记下卡是否依赖它，不写包字段。

```bash
python3 tools/new_pack.py <id> --title <卡里的地名> --title-en <英文> --from-draft <S>/<id>.draft.json --extent <宽>x<高>   # 米；之后底图宽高比必须一致
python3 tools/check_pack.py <id>
python3 tools/cors_server.py <端口> map   # 并行 worktree 各用不同端口；浏览器开 http://localhost:<端口>/viewer.html?pack=<id>
```
坐标先随机；按 `docs/generalize/README.md`「取点」在查看器里点出 nx / ny，写进 `map/packs/<id>/<地图 id>.json`。
补 `events.json`（分类来自事件读者）、`maps.json` 各标记的 `src`（中性说明）、跨层 `link`。

**【检查点】** 给用户一张表：层 × 地点（名字、别名、tag、出处行号）+ `vars` + 事件分类。用户确认或改完才进第 4 步。

## 4. 主建筑参考板 【检查点】

对 `buildings.md` 里的 hero 建筑，用网页搜索找**真实世界照片**（建筑类型、材质、年代相近的实例），每栋 4–8 张，记来源链接与许可；写 `docs/<id>-references.md`（只放链接和要点，不把图片提交进仓库）。
先出参考板，不先建模。

**【检查点】** 用户认可风格方向（每栋一句话：取哪几张的什么）。没认可不开始第 5 步的正式建模。

## 5. Blender：模型、草稿、审阅、定稿、glb、底图

**GPU 规矩**：开渲前等别人的 Blender 退出（`pgrep -x Blender` 为空）、锁文件排队、安静期锁（`tools/quiet_wait.sh`）；ASCII TMPDIR；崩溃重试一次；只 kill 自己的 PID，绝不 `pkill` / `killall`。统一用启动器 `tools/blender_run.sh`（`skills/card-map/blender_run.sh` 是转发到它的旧路径，保留兼容）：
```bash
bash tools/blender_run.sh --log <S>/x.log --asset <建筑> --kind draft --res 900 --spp 24 -- \
  -b --factory-startup --python-expr \
  "import runpy; runpy.run_path('blender/landmarks/<建筑>/build.py', run_name='__main__')" -- --res 900 --samples 24 --out <S>/x_draft.jpg --blend <S>/x.blend
#   PID 写在 <S>/x.log.pid
```

1. **建模**：每栋一个 `blender/landmarks/<建筑>/build.py`，用 `blender/landmarks/common.py`（`Batch` 分组名 = glb 组名；`bg_*` 只渲不导；材质 `pbr` / `flat` / `glass` / `ashlar` / `clear_glass`…）。最小起点：`skills/card-map/templates/smoke_building.py`（纯色、单栋，能跑通整条链）；标准档照 `blender/landmarks/well7/build.py` 的写法。
2. **草稿**：900 px、低采样，存 `<S>`（不提交大图）。
3. **审阅轮**：
   ```bash
   python3 tools/review/pack.py --stage landmark --round N --out <S>/rN --images '<S>/*_draft.jpg' --facts <S>/card/buildings.md --changes "本轮改了什么"
   ```
   `prompts/` 里两位固定人设：`card_architect`（建筑可信度）、`card_fidelity`（与卡一致，对照 `buildings.md` 出处行号）；再按 `<S>/rN/prompts/_fresh_persona.md` 现编一位；全部回来后派 `<S>/rN/prompts/_architect.md` 汇总（`tools/review/README.md`）。同时最多 2 个子代理。审阅只评建筑、构图和与卡是否一致。门控：与卡一致 ≥ 7、建筑可信度 ≥ 6；每版最多 2 轮。
4. **定稿**：2400 px 成图。
5. **glb**（标准 + 低档）：
   ```bash
   bash skills/card-map/blender_run.sh <S>/e.log -b --factory-startup <S>/x.blend --python-expr \
     "import runpy; runpy.run_path('blender/landmarks/export_glb.py', run_name='__main__')" -- --out <S>/x_raw.glb --samples 32 --scale 1
   G="npx -y @gltf-transform/cli"
   $G webp <S>/x_raw.glb <S>/w.glb --quality 80 && $G meshopt <S>/w.glb map/props/<建筑>/<建筑>.glb --level medium
   #   低档：重跑 export_glb.py -- --scale 0.5 → <S>/x_low_raw.glb，再 webp --quality 75 + meshopt → <建筑>_low.glb
   #   新组名先加进 export_glb.py 的 BUDGET（不加就按默认 2 万三角 / 1024 贴图）
   ```
   写 `map/props/<建筑>/manifest.json`（照 `map/props/soup_kitchen/manifest.json`：glb / glb_low / groups / 热点 / credit）。
6. **底图**：每层一张俯视渲染 → `python3 tools/make_dzi.py <图> map/packs/<id>/art/<地图 id> --extent-m 宽 高`（宽高比与 `extent_m` 一致）。
7. **小改动**：局部重渲 + `python3 tools/region_patch.py <整图> <局部> --dzi map/packs/<id>/art/<地图 id>`，只重切受影响的瓦片。多块局部一次会话出：`tools/crops.sh`。
8. 大批量（十几栋 × 多轮）本机太慢时，可以提议用云 GPU 跑 Blender（同样的脚本、`--factory-startup`），由用户决定。

## 6. 交互

- **地点卡片**：`maps.json` 标记的 `name`、`alias`、`src`、`link`（跨层）、`link3d`（三维入口）。
- **三维查看器**：加一张 `kind: "estate"`、`src: "props/viewer3d.html"`、`viewer3d: "<建筑>"` 的地图，标记 `link3d` 指过去；热点写在 `map/props/<建筑>/manifest.json`。
- **当前地点解析**：
  ```bash
  node skills/card-map/check_here.mjs <id> --extra <S>/card/place_phrases.txt
  #   每个名字 / 别名 / 「层·地点」必须落到自己的标记；--extra 放开场白与 MVU 初值里的真实地点写法（每行一条），逐条看落点
  ```
  解析不出或落错就补 `alias`。
- **去这里 / 追问**：核心已内置（`map/tavern/compose.mjs`），只把「前往X。」「关于X，」填进输入框，**从不自动发送**。包不用写代码，只要名字对。

## 7. 世界书附加条目

`map/packs/<id>/worldbook.json` 写给模型的规则（当前地点写法、事件标签写法、频率）；地点表和事件类型表由工具从包数据生成：
```bash
python3 tools/build_worldbook_addon.py --pack <id>      # 已发布的版本自动输出 -dev，不覆盖
```
改了地点 / 分类就在**同一次提交**里重跑；eden 的地点改动还要改 `map/data/addon_places.json`，`tools/check_maps.py` 会拦不同步。

## 8. 测试与交付 【检查点】

```bash
node --test && bash tools/smoke.sh                     # 含 check_maps、check_pack
node skills/card-map/check_here.mjs <id>
node tools/browser/pack_town.mjs <S>/b                 # 通用包的浏览器验收模板；新包复制成 pack_<id>.mjs 改包 id 与断言
```
交付只有两样：**外挂脚本（加载器 / 跟随版）+ 世界书附加条目**。不生成、不修改角色卡。
```bash
python3 tools/build_worldbook_addon.py --pack <id>            # 提交前再跑一次，确认和包数据一致
git add map/packs/<id> map/props blender/landmarks docs/<id>-references.md tools/browser/pack_<id>.mjs
git -c user.email=<用户的 noreply 邮箱> commit -m "<中文说明>"
python3 tools/bump_head.py --push --branch preview   # 代替 git push：自己 fetch + rebase + 写 head.json + 推送
bash tools/warm_cdn.sh <head.json 里的 sha> 16 --purge-branch preview
python3 tools/build_preview_script.py --follow preview --pack <id>   # 跟随版预览脚本 → ~/Downloads/酒馆/脚本
```
`tools/ship.sh` 把后三步串起来，但它生成的是 eden 的脚本（不带 `--pack`），新包要单独跑最后一行。
推送需要对 `cdn.repo` 指的仓库有写权限；没有就停在提交这一步，由用户决定 fork 还是交给维护者。
推送被拒 / 冲突时停下报告，不 force push。不打标签、不发正式版，除非用户明说（见 `docs/versioning.md`）。

**【检查点】** 用户在酒馆里导入跟随版脚本 + 世界书附加条目实测（`docs/tt-test-checklist.md`）；Mac 必须能用，手机按报告修。

---

## 硬规则（踩过的坑）

1. **一个代理一个 worktree**；主检出不碰。
2. **名字照抄卡**：地名、房间、人名、变量键一字不改（包括卡里的成人向字样）；不编名、不做占位名、不做运行时名字转换 / 绑定层。在卡的设定范围内自由补充设定，不加任何来源标签。
3. **只读卡**：只读用户卡的副本；永不写 SillyTavern / 酒馆助手的数据目录、不改卡、不生成新卡。
4. **不过滤用户聊天**：地图不按关键词过滤、改写或拦截聊天内容；只解析位置并显示。写聊天只填输入框，不自动发送。
5. **世界书同步**：地点 / 分类变了，同一次提交里重建世界书附加条目（eden 还要改 `addon_places.json`）。
6. **不覆盖已发布文件**：工具对已发布版本输出 `-dev`；别用 `--force` 盖掉。
7. **shell 别名**：本机 `cat` / `ls` 可能被别名成未安装的 `bat` / `eza`，`cat > f <<EOF` 会写出空文件。写文件用 Write 工具或 `python3 - <<'E'`；查看用 `command cat`、`/bin/ls`。
8. **非 ASCII 路径**：Node 里取仓库路径一律 `fileURLToPath(new URL(..., import.meta.url))`，不要用 `.pathname`（中文会被百分号编码）。
9. **git**：先 `git fetch` 再 rebase；不 reset 到过期的 origin 引用；不 force push。
10. **不提交大图**：草稿、参考图、原始渲染留在 `<S>`；仓库只收瓦片、glb 和清单。
11. **卡内容不进公开仓库**：草稿（`draft_pack_from_card.py`）与导出（`export_card.py`）拒绝写进仓库；仓库只放中性摘要和出处行号。
12. **子代理**：同时最多 2 个；审阅代理和架构师用 Opus。

## 附：本流程的辅助脚本

| 脚本 | 用途 |
|---|---|
| `skills/card-map/export_card.py` | PNG / JSON 卡 → 可逐行读的文本 + 行数（拒绝写进仓库） |
| `skills/card-map/coverage.py` | 读者报告的行号范围求并集，列出缺口 |
| `skills/card-map/check_here.mjs` | 包的每个地点写法 → `map/app/here-v2.mjs` 落点自查 |
| `skills/card-map/blender_run.sh` | 等 GPU 空闲再起 Blender，记录自己的 PID |
| `skills/card-map/templates/smoke_building.py` | 冒烟级单栋模型（纯色），验证建模 → 渲染链 |
| `skills/card-map/HOW-IT-WORKS.md` | 流程图与读写清单（给人看） |
