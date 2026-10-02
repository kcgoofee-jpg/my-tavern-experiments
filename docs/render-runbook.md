# 渲染线操作手册（斜视底图，批 1–9）

> 状态（2026-10-02）：批 1 的流程与外观已在 Mac 上锁定（16 spp 草图 + 64 spp 预览，四个时段）；定稿、伊甸插图、切瓦片还没做。
> 本手册写给没有上下文的执行者：照着做，不要改相机，不要改设定。设定以 `docs/tiancheng-maps.md` §0 为准，本手册只讲怎么做。

## 1. 先读什么

1. `CLAUDE.md` §3（工作流、git 规矩）与 §6（渲染线）。
2. `docs/tiancheng-maps.md` §0（D41 设定：相机、各层光照、每张图里有什么、自检规则 §0.8、批次表 §0.9）和附录 OBLIQUE-CODE B（相机文件格式）。
3. 台账：`docs/plans/render-campaign.md`（状态页，生成的）、`docs/plans/render-campaign.items.json`（条目）。

## 2. 准备

- 工作树放在 `~/eden-render/` 下，从 origin/preview 拉分支，主工作树只给派工器用，不在里面改东西：
  - `git -C /Users/davidzhao/dev1/cctest1/eden-map fetch`
  - `git -C /Users/davidzhao/dev1/cctest1/eden-map worktree add -b render-bN ~/eden-render/wt-rbN origin/preview`
- 不入库的素材用软链接从主工作树接过来（estate2 的贴图 / HDRI / Sketchfab 模型、landmarks 与 props 贴图）：
  - `cd ~/eden-render/wt-rbN/blender/data && for f in elev.f32 estate2 height.f32 landmarks owner.i16 props; do [ -e $f ] || ln -s /Users/davidzhao/dev1/cctest1/eden-map/blender/data/$f $f; done`
- 伊甸的奶牛农场要一个 .blend（不入库），先经队列生成一次：
  - `bash tools/render_queue.sh submit draft -- --log logs/campaign/rbN/dairy.log --asset dairy_blend --kind draft --res 64 --spp 1 -- -b --factory-startup --python blender/props/dairy_parlour/build.py -- --res 64 --samples 1 --blend logs/campaign/rbN/dairy.blend --out logs/campaign/rbN/dairy_probe.png`
- 只用 Mac：主工作树里 `logs/queue/MAC_ONLY` 存在时队列不派云端。不要删它。
- 所有渲染都经 `tools/render_queue.sh submit <draft|final> -- …`；不要直接调 `tools/blender_run.sh`、不要直接起 Blender。
- 状态：`bash tools/render_queue.sh status`。等任务：后台跑一个等待命令，等 `logs/queue/done/<任务名>.rc` 出现，不要在前台轮询。

## 3. 共用相机（三层一样，不许改）

| 项 | 值 |
|---|---|
| 投影 | 正交 |
| 方位 | 165°（相机在南偏东 15°） |
| 俯角 | 35° |
| 比例 | 0.44 m / px |
| right / up / fwd | (0.9659, 0.2588, 0) / (−0.1485, 0.554, 0.8192) / (−0.212, 0.7912, −0.5736) |
| 画框 | 中心柱（±1500 m × ±937.5 m）在本层高度范围内的投影 + 本层全部实体，外扩 3 %，补齐 16 : 10，整像素 |
| 太阳方位 | 西南（`project.OBLIQUE_SUN_AZ = 225`，从 +x 逆时针指向太阳），侧光，影子落向东北 |

代码：`blender/project.py`（`OBLIQUE`、`ortho_frame`、`cam_file`、`project_ortho`、`unproject_ortho`、`affine_ortho`），Blender 相机 `blender/oblique.py` 的 `ortho_camera`。单测 `python3 tools/test_project.py`（在 smoke 里）。

上层批 1 的画框：7952 × 4970 px（3498.88 × 2186.8 m），相机哈希 `21bc15c11d63dc56`。四个时段必须是这个哈希；哈希变了说明场景内容变了（画框按内容拟合），先查原因再继续。伊甸插图：同朝向、0.22 m / px、伊甸投影包围盒外扩 10 %，左上角落在主图像素网格上；当前约 4078 × 3380 px。

## 4. 批 1：上层斜视四时段 + 伊甸插图

脚本：`blender/upper_oblique.py`（伊甸 = estate2 r5 + 岛底三副锥 / 三核心 + 停靠信标；其余八岛 = `blender/islands/<id>.py` 的岛资产；调节塔；云片 c1–c3；胶片透明）。参数：

- `--tod day|dawn|dusk|night`
- `--res N`：主图像素宽；小于 7952 时是同框草图（相机文件不变）
- `--samples N`
- `--out <主图.png>`、`--eden-out <插图.png>`、`--eden-res N`（插图草图宽）
- `--exr 1`：自检用，meta 里写灯光对象位置，另出 `<out>_emit.png` 源图（只有发光面）；四个时段都加
- `--grey 1`：灰模（只查画框）

提交命令模板（`$D` = 上面生成的 dairy.blend 的绝对路径；`$T` = 时段）：

```
bash tools/render_queue.sh submit draft -- --log logs/campaign/rbN/${T}_draft.log --asset tc_upper_obl --kind draft --res 2000 --spp 16 -- \
  -b --factory-startup --python-expr "import os, runpy; os.environ['E2_DAIRY_BLEND']='$D'; runpy.run_path('blender/upper_oblique.py', run_name='__main__')" \
  -- --tod $T --res 2000 --samples 16 --exr 1 --out logs/campaign/rbN/${T}_2000.png
```

步骤：

1. 草图：四个时段各一张 2000 px / 16 spp（每张约 2–3 分钟，其中搭场景 70–110 秒）。
2. 自检（第 6 节），不过就改脚本，再出草图。
3. 64 spp 预览：同一命令改 `--samples 64`、输出名 `${T}_prev64.png`。看过、自检过 = 外观锁定。
4. 定稿：`submit final`，`--kind final --res 7952 --spp 128`，脚本参数 `--tod $T --samples 128 --exr 1 --out logs/campaign/full/tc_upper_obl_${T}_full.png --eden-out logs/campaign/full/tc_upper_obl_eden_${T}_full.png`（不给 `--res`，就是定稿像素）。一次只提交一个时段，等它完了再交下一个（队列是共用的）。
5. 自检定稿（第 6 节，命令同上，换文件名）。
6. 相机文件：`/usr/bin/python3 tools/oblique_ortho.py post logs/campaign/full/tc_upper_obl_${T}_full.png --publish map/data/cam/tc_upper_obl.json --report logs/campaign/full/${T}_report.json`；插图同理发布到 `map/data/cam/tc_upper_eden.json`。第二个时段起若哈希不同，工具会报错退出：停下来查。
7. 切瓦片（PNG，保留 alpha）：`/usr/bin/python3 tools/oblique_ortho.py tiles logs/campaign/full/tc_upper_obl_${T}_full.png map/art/tc_upper_obl_${T}`；插图 `map/art/tc_upper_eden_obl_${T}`。
8. 提交：瓦片、相机文件分开小提交（每个时段一个提交）。**不改 `maps.json`**（接线是代码步 OBLIQUE-CODE 的事）。
9. 台账：`python3 tools/render_campaign.py done <id> <stage> --agent <名> --note "<sha + 一句话>"`，day 条目的 stage 依次是 audit（已完成：正交分支 + 灰模草图）、render、tiles、verify；其余条目 render、tiles。register / ship 等 OBLIQUE-CODE，记 `wait`。
10. 联系表：`/usr/bin/python3 tools/oblique_ortho.py sheet ~/eden-map-review/render-b1/contact.jpg <8 张 png>`。

时长（M5，8 核 GPU，按草图外推，未实测定稿）：主图 128 spp 白天约 50–60 分钟，夜里约 2 小时（灯多）；插图约 20 分钟。批 1 全部约 6 小时。

## 5. 各时段的光（上层；改了要过自检）

| 时段 | 太阳高度 / 能量 | 天光 | 窗灯（比例 / 强度，2700 K，按房间随机） | 其他 |
|---|---|---|---|---|
| 昼 | 50° / 3.4 | 物理天空 0.22 | 0 | 曝光 −0.5（防白石剪白） |
| 晨 | 11° / 5.2，偏暖 | 0.16 | 12 % / 4 | 云顶镀金、云谷灰蓝 |
| 昏 | 6° / 6.0，橙红 | 0.14 | 45 % / 5 | 长影；信标常亮 |
| 夜 | 冷月光 50° / 0.06 | 近黑蓝 | 70 % / 7 | 园灯 468 盏（射线落在平地上才立）、伊甸 estate2 夜灯、核心、晶簇、信标、塔冠；瀑布自发光 × 0.05、结界 × 0.3 |

数值在 `upper_oblique.py` 的 `PERIODS`。白水瀑布、水雾是只自发光的材质，夜里必须压暗（`scale_emission`），否则就是无源亮斑。

## 6. 自检清单（§0.8；没有用户审图，过了就登记）

命令：

- `/usr/bin/python3 tools/oblique_ortho.py post <png> --report <json>`：遮挡（写回 meta）、对位、曝光、每岛暖色 / 冷色像素数
- `/usr/bin/python3 tools/oblique_emitcheck.py <png> --pad 8 --report <json>`：无源亮斑、曝光（需要 `--exr 1` 出的 `_emit.png`）

| 条 | 过 | 不过 |
|---|---|---|
| 同框 | 四个时段相机哈希都是 `21bc15c11d63dc56` | 哈希不同 |
| 对位 | `lr_dev_best_side_px` 中位数 ≤ 4 px（草图实测 0.7；isle6 46、isle30 7 是邻岛 / 帘瀑挡边，不是错位） | 中位数 > 4 |
| 无源亮斑（夜） | `sourceless_px` 只有几个像素且贴着发光体（草图 night_2000e：10 处共 44 px，都在银冠堡灯旁，pad 8 可消） | 云、雾、地面上成片亮而没有灯 |
| 曝光 | `clip_off_source_pct` < 0.5 %（草图：昼 0.20 %、夜 0.05 %）；剪白只在灯头 / 窗 / 核心上 | 白石、云顶大片剪白（昼曝光 −0.2 时 1.8 %，不过） |
| 夜有灯 | 每座岛有暖窗（`warm_px`）和冷色信标（`cool_px`）；伊甸没有结界边 | 某岛全黑 |
| 外观 | 昼干净、晨昏低暖光长影、夜暗而灯真；无平面贴图、无文字 | 夜景整体发灰、云把岛盖住 |

参考图（`~/eden-map-review/render-b1/`）：`day_prev64.jpg`、`dawn_prev64.jpg`、`dusk_prev64.jpg`、`night_prev64.jpg`（锁定的样子）；`day_2000b.jpg`（不过：云片噪声铺满全图，后改用 Generated 坐标）；`night_2000b.jpg`（不过：结界六角格太亮、帘瀑夜里白亮）。

## 7. 踩过的坑

- **队列给每个任务存一份 1.2 GB 的缓存 .blend**（`--cache-blend`，存在主工作树 `.cache/blend/tc_upper_obl_<哈希>.blend`）。`upper_oblique.py` 不读缓存，这些文件没用；每批做完删掉自己的（只删 `tc_upper_obl_*`），磁盘只剩几十 GB。
- **Blender 5.2 多层 EXR 里没有 Emit 通道**（打开 `use_pass_emit` 也只写 Combined），所以改成第二次渲染「只留发光面」的源图（`--exr 1` 的 `_emit.png`）。
- Blender 5：`image_settings.media_type` 要先设 `MULTI_LAYER_IMAGE` 才能选 `OPEN_EXR_MULTILAYER`；`Material.use_nodes` 已弃用。
- 不设 `E2_DAIRY_BLEND` 时伊甸没有奶牛农场，日志里有一行 `[dairy] Error`。
- 平移伊甸后，estate2 地形材质里按世界 z 压暗湖底的节点会错位：脚本已改用对象坐标（`position_to_object`）。
- 云片噪声要用 Generated 坐标（米制对象坐标会变成细颗粒噪声）。
- 脚本出错时队列会自动重跑一次（verdict 失败）；改完脚本再交，旧任务可能已经用旧代码重跑过。
- `numpy` / `PIL` 只在 `/usr/bin/python3` 里有（Homebrew 的 python3 没有）。
- 取消自己排队的任务：把 `logs/queue/pending/<任务>.job` 挪到 `logs/queue/attic/`；正在跑的只杀自己的 PID（`<日志>.pid` 与 `blender_run.sh` 进程），再把队列退回 pending 的同名 .job / .retry 挪走。

## 8. 批 2–9

批次与条目见 `docs/tiancheng-maps.md` §0.9 和台账。共同规则：

- 同一套相机（第 3 节）：中层 / 下层在层脚本里 `TC_OBLIQUE=1` 时用 `oblique.ortho_camera`（层脚本是 100 m 单位，传 `unit=100, z0=700` 对应其场景零点；先核对层脚本的 z 零点）与 `project.ortho_frame`，画框按本层内容拟合；本层各时段同一哈希。
- 光照规则按 §0.4（中层峡谷光、白天霓虹四成、夜里全网格亮；下层只有人造光、两班），自检按 §0.8 第 3–5 条（中层夜景 250 m 格子 80 % 有灯、中层白天比上层暗、下层暗检图）。这些检查工具还没有，写在对应批次里。
- 流程同第 4 节：草图 → 自检 → 64 spp 预览 → 定稿 → 相机文件 → 瓦片 → 小提交（不接 `maps.json`）→ 台账。

## 9. 汇报

- 每个提示词结束：RESULT 块（格式见 `CLAUDE.md` §5）追加到 `docs/plans/spatial-os-log.md` 末尾，跟最后一个提交一起推送：`bash tools/push_preview.sh --head --no-escalate`。
- 联系表和自检图复制到 `~/eden-map-review/render-bN/`（只存档，不等人看）。
- 写明：每张图的渲染分钟数（`logs/render_times.csv`）、自检数值、提交 sha、head #N。

## 10. 停下来报告

遇到下面任何一条，停下，RESULT 写 BLOCKED，附原样报错前 20 行和草图路径，不要自己换相机或改设定：

- 相机哈希在同一层的时段之间不同；
- 某条自检过不了，而且改光照参数解决不了；
- 渲染反复失败（同一错误两次）；
- 磁盘剩余小于 20 GB；
- 推送被拒（不要强推）。
