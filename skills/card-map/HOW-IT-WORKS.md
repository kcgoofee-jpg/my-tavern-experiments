# card-map 技能是怎么工作的

这份是给人看的说明，可以随便改。给代理看的步骤在同目录的 `SKILL.md`。

## 怎么触发

- 先装一次：Claude Code 只在 `.claude/skills/` 或 `~/.claude/skills/` 里找技能，而仓库的 `.claude/` 被 gitignore 了。在仓库根目录跑
  `mkdir -p .claude/skills && ln -s ../../skills/card-map .claude/skills/card-map`（每个 worktree 各跑一次；或者链到 `~/.claude/skills/card-map` 全局可用）。
- 在 Claude Code 里说「给这张卡做地图」「把 X 卡做成地图包」之类的话，或者直接打 `/card-map`。
- Claude Code 按 `SKILL.md` 开头的 `description` 判断要不要用这个技能。想让它更容易 / 更难被触发，就改那一段。
- 需要你提供：① 角色卡文件（PNG 或 JSON）② 卡引用的外部世界书（没有就不用给）③ 你平时挂着的附加世界书（可选）④ 原作者帖子链接，以及作者是否同意。卡只复制后读取，原文件不会被改。
- 前提：本机有 Blender、Node、Python 3，最好有 GPU；推送需要对仓库有写权限（没有就停在提交这一步，由你决定）。一张卡从读卡到交付通常要几小时到几天，大部分时间在建模渲染。

## 整体流程

```mermaid
flowchart TD
    A[用户给角色卡] --> P{1 作者同意做衍生地图?}
    P -- 否 --> P2[只做本机自用 / 停止]
    P -- 是 --> B[2 复制卡到 scratchpad<br/>export_card.py 拆成文本]
    B --> C[通读 + 4 路分角度读者<br/>地点 / 人物 / 变量 / 事件]
    C --> D[coverage.py 查行号缺口]
    D -- 有缺口 --> C2[补读] --> D
    D -- 全覆盖 --> E[digest.md + buildings.md]
    E --> F[3 draft_pack_from_card.py → 草稿<br/>new_pack.py → check_pack.py]
    F --> G{检查点: 层和地点对吗?}
    G -- 改 --> F
    G -- 对 --> H[4 真实照片参考板]
    H --> I{检查点: 风格方向 OK?}
    I -- 改 --> H
    I -- OK --> J[5 Blender 建模 + 草稿渲染<br/>blender_run.sh 等 GPU 空闲]
    J --> K[人设审阅: 建筑可信度 + 与卡一致]
    K -- 未过门控 --> J
    K -- 过 --> L[定稿 + glb 标准/低档 + 底图 DZI]
    L --> M[6 交互: 地点卡片 / 三维热点 /<br/>check_here.mjs 当前地点 / 去这里·追问]
    M --> N[7 build_worldbook_addon.py 世界书附加条目]
    N --> O[8 node --test + smoke.sh + 浏览器测试]
    O --> Q[提交 → bump_head.py 推送 → warm_cdn.sh<br/>跟随版脚本 + 世界书附加条目]
    Q --> R{检查点: 酒馆里实测通过?}
    R -- 有问题 --> M
    R -- 通过 --> S[完成]
```

## 你要拍板的地方（检查点）

| 步骤 | 问你什么 |
|---|---|
| 1 | 原作者同意了吗？原帖链接是什么？（不同意也能做，但只在本机自用，不推送、不发帖） |
| 3 | 层、地点、别名、当前地点变量路径、事件分类对不对 |
| 4 | 每栋主建筑的参考照片和风格方向行不行 |
| 8 | 在酒馆里导入跟随版脚本和世界书附加条目，按 `docs/tt-test-checklist.md` 实测是否正常 |

其余步骤代理自己做完再汇报。

## 自动 / 手动

| 自动（工具做） | 手动（代理或你做） |
|---|---|
| 拆卡、数行数（`export_card.py`） | 读卡、写摘要和建筑清单 |
| 查读卡缺口（`coverage.py`） | 补读缺口 |
| 从世界书标题起草地点、猜 MVU 地点路径（`draft_pack_from_card.py`） | 核对草稿、挪层、补漏掉的地点 |
| 生成包骨架、占位底图（`new_pack.py`）、检查（`check_pack.py`） | 在查看器里点坐标 |
| 等 GPU 空闲、记 PID（`blender_run.sh`） | 写每栋的 `build.py`、看草稿、按审阅改 |
| 审阅简报和提示词（`tools/review/pack.py --stage landmark`） | 派审阅代理、汇总 |
| glb 压缩、切瓦片（gltf-transform、`make_dzi.py`、`region_patch.py`） | 写三维清单和热点 |
| 当前地点落点自查（`check_here.mjs`） | 补别名 |
| 世界书附加条目（`build_worldbook_addon.py`） | 写 `worldbook.json` 里的规则条目 |
| 测试、推送、预热 CDN、生成脚本 | 在酒馆里实测 |

## 读什么、写什么

**只读**
- 你的角色卡：只读它在 scratchpad 里的副本，从不写酒馆（SillyTavern / 酒馆助手）的数据目录。
- 仓库文档：`docs/onboarding.md`、`docs/generalize/README.md`、`docs/card-reading.md`、`docs/tooling.md`、`docs/versioning.md`。

**写在 scratchpad（不进仓库）**
- 卡的副本和拆出的文本、读者报告、`digest.md`、`buildings.md`
- 包草稿 `<id>.draft.json`
- 草稿渲染、参考图、`.blend`、未压缩的 glb、审阅报告

**写进仓库**
- `map/packs/<id>/`：`manifest.json`、`maps.json`、各层 `<地图 id>.json`、`events.json`、`worldbook.json`、`art/` 瓦片
- `blender/landmarks/<建筑>/build.py`、`map/props/<建筑>/`（glb + 清单）
- `docs/<id>-references.md`（参考链接）
- 浏览器测试 `tools/browser/pack_<id>.mjs`（照 `pack_town.mjs` 改）
- `map/data/head.json`（`bump_head.py` 推送时写）

**交付给用户（在 `~/Downloads/酒馆/`）**
- 跟随版外挂脚本（`build_preview_script.py --follow … --pack <id>`，文件名形如 `【地图·<id>】…json`，在酒馆助手脚本库里导入）
- 世界书附加条目（`build_worldbook_addon.py --pack <id>`，一个世界书 JSON，在酒馆世界书里导入）
- 不生成、不修改角色卡。

## 词表

- 主建筑（hero）：要单独做三维模型的重要建筑。
- MVU：卡里记录「当前地点」等状态的变量（`stat_data`）。
- 设定包：一张卡的地图数据，放在 `map/packs/<id>/`。
- glb：三维模型文件；标准档 / 低档是两种精度。
- DZI：可缩放的底图瓦片。
- 跟随版：导入一次，之后每次刷新酒馆自动用分支上的最新提交。

## 辅助脚本一览

| 文件 | 做什么 |
|---|---|
| `export_card.py` | 卡 → 文本 + 行数 |
| `coverage.py` | 读者行号并集，列缺口 |
| `check_here.mjs` | 每个地点写法的落点自查 |
| `blender_run.sh` | 等别人的 Blender 退出再开渲，只记自己的 PID |
| `templates/smoke_building.py` | 最小单栋模型，用来试通建模 → 渲染 |

## 渲染时 token / CPU / 内存 / 显卡各干什么

代理（agent）跟渲染流水线之间的分工，容易把「token」和「算力」混在一起，实际是完全不同的两笔账：

- **Token**：代理构思场景、写 Python 建模脚本（`blender/xxx.py`）、事后看图评审——这些是「思考」，花的是 token，不占用 Mac 或云端机器一分钟。
- **CPU**（脚本跑起来之后，Blender 进程里 `bpy` 那部分）：
  - 生成几何体（循环摆放树木、建筑、修改器、布尔运算——这些是逐个物体跑 Python 循环，吃单核性能）；
  - 加载贴图；
  - 搭建 BVH 加速结构（渲染前必须先建好的空间索引，纯 CPU）；
  - 渲染完之后的后处理（`tools/region_patch.py` 一类的 PIL 处理）、切瓦片（`make_dzi.py`）、导出 glb——这些也在 CPU 上跑，不占显卡。
- **内存（RAM）**：搭场景那段时间要把全部网格、贴图都摆进内存，场景越大（岛屿多、建筑多）内存要求越高；内存不够会明显拖慢甚至崩。
- **GPU / 显存（VRAM）**：
  - 路径追踪（path tracing：采样数 × 像素数）和降噪，这才是显卡真正干活的部分；
  - 显存要能装下整个场景 + 全部贴图，装不下会退回 CPU 渲染或直接报错。
- **为什么草图是 CPU 瓶颈、定稿 / 8K–16K 才是显卡瓶颈**：草图采样数很低（16 spp），显卡渲染那几秒钟很快就完事，反而是搭场景的 CPU 时间占了大头；定稿采样数高（64 spp）、分辨率也大，显卡渲染时间才会明显超过搭场景的时间。实测一次基准（`tools/cloud/bench.sh`，天成中层草图 16spp）：搭建约 59s（CPU），显卡渲染只约 7s——这种量级下，换更快的显卡对草图几乎没有帮助，真正该优化的是搭建脚本本身或复用已搭好的场景（见下）。

对选择的影响：
- 场景缓存（`tools/blender_run.sh --cache-blend <目录>`）：同一场景反复渲（只改机位 / 采样）时，把搭建好的 `.blend` 存下来复用，省掉重复的 CPU 搭建时间；细节见 `docs/cloud-render.md`「场景缓存」一节。
- 摆重复物体（一排树、一片建筑）优先用实例化（instancing / linked duplicate），不要真的复制几何体——同样效果，几何体只存一份，搭建更快、内存也更省。
- 定稿 / 大分辨率走云端（有独立 4080 SUPER），草图留在 Mac 本地（不用等 sync、不占云端计费）。
- 云端这台机器的 CPU（Xeon 8352V，12 vCPU）单核未必比 Mac 快——它的强项是显卡，纯 CPU 的搭建阶段不一定比本地快，这也是为什么草图不建议无脑都丢云端。

```mermaid
flowchart LR
  A[token：代理设计 / 写建模脚本] --> B[CPU：搭场景（几何/贴图/BVH）]
  B --> C[GPU：路径追踪 + 降噪]
  C --> D[CPU：后处理（PIL）/ 切瓦片 / 导出 glb]
  D --> E[CDN：map/art 瓦片]
```
