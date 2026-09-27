# 工具链与测试审阅 · 2026-09-27 接手

范围：`tools/*.sh`、`tools/*.py`、`tools/browser/*.mjs`、`tests/*.test.mjs`、`.gitignore`、版本与标签管理。
只读审阅（跑了 `smoke.sh`、`check_maps.py`、`node --test`；没跑 `ship.sh`、没渲图、没连 jsDelivr）。
结论：单测是真的（11 个文件导入生产模块、有边界与错误路径）；当前提交的 6 个 DZI 金字塔经重算**完全完整**
（各层瓦片数一致、5 张城市图 1.600 比例与 `extent_m` 相符）。**弱点集中在发版链路**。

| # | 级别 | 结论 | 位置 | 状态 |
|---|---|---|---|---|
| 1 | P1 | 校验的是工作区、发布的是提交内容：`check_maps` 用 `os.path.isdir` 看本地目录，`ship.sh` 的脏检查带 `--untracked-files=no` → 新切的瓦片忘了 `git add` 也能过门控 | `check_maps.py:52`、`ship.sh:16,22` | ⏳ 未修（门控语义问题；`smoke.sh --cdn` 能兜住，但发版路径没接） |
| 2 | P1 | 五处版本号无人核对，错了用户面板会永久报警：脚本版本取自 URL（`@map-vX.Y.Z`）与 `map/data/build.json` 比；`VERSION` 谁都不读 | `VERSION`、`map/data/build.json`、`selfcheck.mjs:96` | ✅ 已修（新增 `tools/check_version.py`，接进 smoke；含标签与构建号反查） |
| 3 | P1 | `events.mjs` 加载失败被降级成警告、退出码 0：node 缺失与模块加载失败混为一谈 | `check_maps.py:139-147` | ✅ 已修（node 在但加载失败 = 错误） |
| 4 | P1 | `ship.sh` 被文档写成发版命令，其实只发「分支预览」：不打标签、不发钉标签脚本，预热的是 HEAD | `ship.sh`、`README.md:87`、`docs/tooling.md` | ✅ 文档已澄清；发版顺序写进 `docs/tooling.md` §8 |
| 5 | P1 | CDN 失败不致命：`ship.sh` 只打印非 200 个数，`warm_cdn.sh` 退出码恒 0，`smoke.sh --cdn` 是可选步骤 | `ship.sh:31-34`、`warm_cdn.sh:9-13` | ✅ 已修（非 200 即中止 + 补一步抽样校验） |
| 6 | P1 | `--tag` 发版脚本在标签缺失时只提醒、仍 exit 0，且不与 `VERSION` 对照 → 交付物里的地址会 404 | `build_preview_script.py:93-101` | ✅ 已修（退出码 2） |
| 7 | P2 | `render_all.sh` 吞掉自己的校验：`check_maps \|\| echo`、`--data-only` 管道里的 `\|\| true` + `continue` | `render_all.sh:47,60` | ✅ 已修 |
| 8 | P2 | `make_dzi.py` 非原子（先 rmtree、`.dzi` 最后写），且没人校验层数 / 瓦片数 / `extent_m` 与 DZI 尺寸比例；`world.dzi` 8000×4923（1.625）与 `extent_m` 1.600 已经不一致，而 `kind=world` 跳过了该检查 | `make_dzi.py:23-42`、`check_maps.py:52,107` | ⏳ 未修 |
| 9 | P2 | 构建号按「提交数 + 1」算，顺序错了就再也反查不回来，且无人验证 | `version_code.py:17` | ✅ 已加校验（标签存在时 `构建号 == rev-list --count <tag>`） |
| 10 | P2 | 语法门控有洞：`map/estate/*.js`（约 5,700 行庄园 three.js）、`map/data/world.js`、各 HTML 内联脚本都不查 | `smoke.sh:34` | ✅ 已修（estate + world.js 纳入，ES 模块回退） |
| 11 | P2 | 仓库卫生：提交内容 118.9 MB / 1,976 文件，其中 `docs/drafts` 43.9 MB、`docs/reviews` 10.7 MB、`map/shots` 5.6 MB、`map/_proto` 2.2 MB；`warm_cdn.sh` 把 1,346 个文件 / 48 MB 全预热，含产品从不加载的 `map/shots`、`map/_proto` 与 4 个死原型页 | `.gitignore`、`warm_cdn.sh` | ⏳ 未修 |
| 12 | P2 | `blender/data/landmarks/`（27 MB、17 个 Poly Haven 命名文件）无人引用、无 CREDITS；`.gitignore` 还提到并不存在的 `tools/fetch_textures.sh` | `.gitignore:17-18` | ✅ 已 ignore（文件保留在本机） |
| 13 | P2 | 世界图渲染输入不可复现：`elev.f32` / `height.f32` / `owner.i16` 被 ignore，且没有任何提交过的生成脚本写它们 | `world_render.py:16`、`overlays.py:13` | ⏳ 未修 |
| 14 | P2 | 文档与实际不符：README 写 0.6.1 / 0.9.1；`docs/tooling.md` 发版示例钉在 0.9.1 且说附加条目「3 个常驻」；TT 清单是 0.9.1 版 | README、tooling、tt-test-checklist | ✅ 已修 |
| 15 | P2 | `ship.sh --dry-run` 的洞：只数预热文件数、预览 JSON 校验依赖 glob 命中、`--no-warm` 无警告 | `ship.sh:29,39-41` | ⏳ 未修 |
| 16 | P2 | `crops.sh` 吞 Blender 退出码、只看文件存在与像素尺寸 → 上一轮的同名图会被当成本轮结果 | `crops.sh:40,44-56` | ✅ 已修（先删旧图 + 检查退出码） |

**发版顺序（已写进 `docs/tooling.md` §8）**：内容冻结 → 一起改 `VERSION` / `CHANGELOG` / `README` / `ROADMAP` /
`python3 tools/version_code.py R` → `smoke.sh` → `git tag map-vX.Y.Z` 并推 → `smoke.sh --cdn <标签>` →
`warm_cdn.sh <标签>` → `build_preview_script.py --tag` + `build_worldbook_addon.py --version` → 用户按 TT 清单实测。

**测试缺口**：发版不变量（版本一致、构建号反查、瓦片金字塔完整、DZI 比例 vs `extent_m`）以前完全没测（前两项本次补上）；
浏览器套件不是门控（无 CI、无 hooks、playwright 浮动版本、lockfile 被 ignore、浏览器要手装）；
`openings.mjs` / `viewer3d_perf.mjs` 无条件 exit 0，`proto_clouds.mjs` 用 macOS 专有的 `sips`；
固定 sleep 与「本机 localhost 首屏 ≤ 3 s」的计时在同时跑 Blender 时会飘。
