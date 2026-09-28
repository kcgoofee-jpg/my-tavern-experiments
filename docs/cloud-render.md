# 云渲染（AutoDL）操作指南

> 现行文档。配套：`docs/agent-brief.md`（代理先读这个）、`tools/cloud/*.sh`、`tools/render_queue.sh`。
> AutoDL 实例：RTX 4080 SUPER 32GB、Ubuntu 22.04、Blender 5.2.2 装在 `/opt/blender`、数据盘 `/root/autodl-tmp/eden`；
> CPU 是 Xeon 8352V（12 vCPU）——见文末「场景搭建 vs 显卡渲染」，纯 CPU 阶段不一定比 Mac 快。

## 0. AutoDL 控制台步骤（开新实例才用得到）

1. 账户设置 → SSH 公钥，添加：
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILyhGPZWtSg+OdXFXApEsWmf5nnqO9jHLitRIHh5gQ5s eden-render
   ```
2. 创建实例：基础镜像选纯 Ubuntu 或 Miniconda（不用预装 PyTorch 的镜像，省钱），选一个**可扩容硬盘**的主机（渲染素材 + Blender 装完有几个 G）。
3. **装机阶段选无卡模式**（no-GPU，按分钟计费但便宜很多），等 `setup.sh`、`sync.sh` 跑完再开卡渲染。GPU 探测在 `setup.sh` 最后会打一行 `CUDA/OPTIX devices: ...`；装机时用无卡模式，这里打印 `NONE` 是正常的，开卡渲染时 `render.sh` 会用 `EDEN_CYCLES_DEVICE=OPTIX` 重新探测（没有 OPTIX 就退到 CUDA）。
4. 记下控制台给的 SSH 连接信息（HOST、PORT），填进下面第 1 步的 `remote.env`。
5. **用完一定要在控制台把实例关机（或释放）**——`tools/cloud/idle_guard.sh` 能自动关机（见下），但脚本不会替你「释放」实例，长期不用建议手动释放。

## 第一次跑，按这个顺序

1. `cp tools/cloud/remote.env.example tools/cloud/remote.env`，填 AutoDL 控制台「容器实例」页的 HOST/PORT（USER 固定 root；`remote.env` 已在 `.gitignore` 里，不会被提交）。
2. `bash tools/cloud/doctor.sh`——只读体检，本机 / 连接 / 云端逐项打勾。**全绿才继续**，红字后面跟着修复命令。
   - 看到「已有云脚本在跑」或本地锁被占用：说明有别的代理正在用这台实例，等它结束，不要并发 sync/render。
3. `bash tools/cloud/setup.sh`——装 Blender + apt 依赖 + CJK 字体 + Blender 自带 python 的 Pillow/numpy，幂等（已装会跳过）；末尾会核对本地/远端 Blender 版本，不一致会警告。
4. `bash tools/cloud/sync.sh`——把仓库 + 素材传过去（第一次约 3GB @ ~8MB/s，约 3.5 分钟；之后只传改动）。非 TTY（比如 Claude 桌面终端）下不会逐文件刷屏，改成每 ~5 秒或 25/50/75/100% 打一条总结。
5. `bash tools/cloud/bench.sh`——跑一个固定的 16spp 草图基准，报时长和折算的元/张，方便跟 `logs/render_times.csv` 里 Mac 的行对比。
6. 正式渲染：**不要直接手改 `tools/cloud/render.sh` 的调用**，走 `tools/render_queue.sh submit`（见下面「渲染队列」），由它决定派给 Mac 还是云端，避免两台设备撞车或云端锁被绕过。

全程可以先加 `DRY_RUN=1` 演练（只打印会执行的 ssh/rsync 命令，不真的连接），比如 `DRY_RUN=1 bash tools/cloud/sync.sh`。

## 日常命令速查

| 命令 | 做什么 | 只读？ |
|---|---|---|
| `tools/cloud/doctor.sh [--host <名>]` | 体检，出问题给修复命令 | 是 |
| `tools/cloud/status.sh [--host <名>]` | 远端任务 / GPU 占用 / 磁盘 / 开机时长 / 按元每小时估算已花的钱 | 是 |
| `tools/cloud/sync.sh [--host <名>]` | 增量传仓库到云端 | 会写云端 |
| `tools/cloud/render.sh [--host <名>] <blender_run.sh 参数>` | 起一次渲染，轮询，结果 rsync 回来，追加 `logs/render_times.csv` | 会写云端+本地 |
| `tools/cloud/render_split.sh --strips N --hosts a,b,c --out <整图> -- <参数>` | 切 N 条竖条分给多台实例并行渲，拼回整图 | 会写云端+本地 |
| `tools/cloud/bench.sh [--price-per-hour 2.5]` | 固定草图基准，算元/张 | 会写云端+本地 |
| `tools/cloud/stop.sh [--host <名>] [--yes]` | 只杀「我们自己」的远端 blender 任务（不碰同机其它进程） | 会写云端 |
| `tools/cloud/idle_guard.sh --idle-shutdown 30 [--host <名>]` | 装可选看门狗：GPU 连续空闲 N 分钟自动 shutdown | 会写云端 |
| `tools/cloud/idle_guard.sh --off [--host <名>]` | 卸看门狗 | 会写云端 |
| `tools/render_queue.sh submit <draft｜final｜any> -- <参数>` | 提交渲染任务到队列 | 写本地队列 |
| `tools/render_queue.sh status` | Mac + 各云实例状态、当前任务、pending 数 | 是 |
| `tools/render_queue.sh dispatch [--once]` | 派工（默认常驻循环，`--once` 只跑一轮） | 会写云端/本地 |

**不开渲的规矩**：`doctor.sh` 显示已有云脚本在跑（本地锁占用）时，不要跑 `sync.sh` / `render.sh` / `render_split.sh`；`tools/cloud/lib.sh` 里的 `cloud_lock_acquire` 已经会在两个脚本真的撞车时直接报错退出，但排队等待比硬撞省事。

## 多实例（`--host`）

默认用 `tools/cloud/remote.env`（相当于不传 `--host`，即 `--host default`）。要接第二台实例：

```bash
cp tools/cloud/remote.env.example tools/cloud/hosts/gpu2.env   # 文件名任取，例如 gpu2
# 编辑 hosts/gpu2.env：HOST/PORT/KEY/REMOTE_DIR，可选 PRICE_PER_HOUR（元/小时，status.sh 算花费用）
bash tools/cloud/doctor.sh --host gpu2
```

`tools/cloud/hosts/*.env` 已在 `.gitignore` 里（跟 `remote.env` 一样，装真实连接信息，不进仓库），只有 `hosts/example.env.example` 是模板会提交。

## 切条并行渲（`render_split.sh`）

大图（上层斜视 8K/16K 这类）可以切成 N 条竖条，分给 N 台配置好的实例并行渲，再拼回整图：

```bash
bash tools/cloud/render_split.sh --strips 3 --hosts default,gpu2,gpu2 --out map/art/tc_upper_8k.png -- \
  --asset tc_upper --kind final --res 8000 --spp 64 -- \
  -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tc_upper.py', run_name='__main__')" -- \
  --res 8000 --samples 64
```

原理：每条竖条用 Blender 的 `render.use_border`（不裁剪画布，只渲那一条像素范围，其余留空），这样每条产出的仍是整图尺寸的 PNG，拼图时按已知的像素范围直接 `alpha_composite`，接缝处按 `PAD_PX`（默认 24px）做羽化——跟 `tools/region_patch.py` 的 `feather_mask()` 是同一套羽化算法（因为 `region_patch.py` 是「整图 + 一块局部」的二元合并，这里是「N 条等宽条」的多元合并，没法直接调它的函数，重新写了一份同逻辑的）。`--out` 之外不要自己传 `--out`，也不要在参数里指定分辨率之外的东西冲突。

## 渲染队列（`tools/render_queue.sh`）

**代理提交渲染任务走这个队列，不要直接调 `tools/blender_run.sh` 或 `tools/cloud/render.sh`**——两台设备（Mac / 云端多实例）的忙闲、显卡锁、云端本地锁都是队列在维护，绕过去容易撞车。

```bash
tools/render_queue.sh submit draft -- --asset tc_mid --kind draft --res 2048 --spp 16 -- \
  -b --factory-startup --python-expr "..." -- --res 2048 --samples 16 --out map/art/_x.png
tools/render_queue.sh status      # 看两台设备状态 + 队列
tools/render_queue.sh dispatch --once   # 派一轮；不加 --once 是常驻循环（Ctrl-C 退出）
```

派工规则：`draft` 优先 Mac，Mac 忙时借云端；`final` 优先云端（多实例挑先空的那台），云端全忙时借 Mac；`any` 谁先空派谁。派云端任务前会检查本地文件有没有比上次 `sync.sh` 新（`tools/cloud/.locks/<实例>.last_sync` 的 mtime 戳），有新改动会先自动 `sync.sh` 再渲。队列文件在 `logs/queue/{pending,running,done}/`（`logs/` 整体已 gitignore）。队列空了会提醒「记得关云端省钱」，除非该实例已经开了 `idle_guard.sh`。

## 场景缓存（`--cache-blend`）

搭场景（`bpy` 生成几何体/贴图/BVH）是纯 CPU，8K/16K 定稿里经常比显卡渲染本身还慢（实测一次基准：搭建 59s、显卡渲染只 7s，见 `skills/card-map/HOW-IT-WORKS.md`「渲染时 token/CPU/内存/显卡各干什么」）。

`tools/blender_run.sh --cache-blend <目录>` 提供的是**基础设施**，不是开箱即用的自动加速：
- 会按（透传参数 + `git HEAD` + `git diff --stat -- blender/` + `runpy.run_path()` 指向的构建脚本内容）算一个哈希，决定这次搭建跟上次是不是同一个场景；
- 命中时把路径通过环境变量 `EDEN_CACHE_BLEND_HIT=1`、`EDEN_CACHE_BLEND_PATH=<blend 路径>` 告诉 Python 构建脚本；
- **场景脚本要自己检查这两个环境变量**，命中时用 `bpy.ops.wm.open_mainfile(filepath=os.environ['EDEN_CACHE_BLEND_PATH'])` 跳过搭建直接渲染——本仓库目前的 `tiancheng_*.py` / `landmarks/*/build.py` 都还没接这段判断，所以现在加这个参数本身不会自动提速，只是把哈希/环境变量/保存这套管子先接好；
- 不管命不命中，跑完都会把当前场景存一份到该哈希对应的 `.blend`（`tools/blender_run.sh` 内部在末尾追加一个 `--python-expr` 调 `bpy.ops.wm.save_mainfile`）。
- `tools/cloud/render.sh` 会原样透传 `--cache-blend` 给远端；`tools/render_queue.sh` 已经默认给 Mac 任务传 `--cache-blend .cache/blend`（相对仓库根）、给云端任务传 `--cache-blend .cache/blend`（相对 `REMOTE_DIR`）。
- 接入某个场景脚本后，要在 `tools/cloud/bench.sh` 跑一次「缓存未命中」和一次「缓存命中」，把两次的秒数都记进 `logs/render_times.csv`（`kind` 列区分 `draft`/`draft-cached` 之类），才能验证真的省了时间。

## 关机保留数据盘

AutoDL 关机（`shutdown -h now`）后按小时计费的算力费停止，**但数据盘（`/root/autodl-tmp`，含 `eden` 目录）不会被清空**，下次开机接着用，不用重新 `sync.sh` 全量。`tools/cloud/idle_guard.sh --idle-shutdown 30` 装的看门狗就是靠这个：GPU 连续空闲 30 分钟自动关机，省的是算力费，不影响下次续渲。

## 坑（都是踩过的）

| 坑 | 现象 | 修复 |
|---|---|---|
| macOS bash 3.2：`$var` 后紧跟中文 | 变量名被吞进中文字符，报 `unbound variable` | 一律写成 `${var}`；`tools/smoke.sh` 的 shell lint 步骤会挡住这种写法（`$name` 后直接跟非 ASCII） |
| macOS 自带 `openrsync` | 传输报不兼容 / 直接失败 | `brew install rsync`；`tools/cloud/lib.sh` 的 `run_rsync` 已经优先找 `/opt/homebrew/bin/rsync`，检测到 openrsync 会直接报错退出 |
| Clash TUN 假地址 `198.18.x.x` 导致长传输中途断 | `sync.sh` 传到一半卡住/断连 | 订阅规则里前置一条 `DOMAIN-SUFFIX,seetacloud.com,DIRECT`（或临时关 TUN）；`doctor.sh` 检测到假地址段会提示 |
| Blender 下载 URL 版本号不全 | `setup.sh` 下载 404 | 要用完整 `x.y.z`（如 `5.2.2`），脚本从本地 Blender `--version` 自动取，取不到才退回 `4.2` |
| apt 依赖漏了 `libSM6` | Blender 启动崩在 `libSM.so.6: cannot open shared object` | `setup.sh` 的 apt 清单已加 `libsm6`；如果还报别的 `.so` 缺失，把包名加进 `setup.sh` 的 `apt-get install` 列表 |
| 卡死的 bench 占住单命令终端 | 终端一直等一个已经挂死的远程进程 | `tools/cloud/stop.sh` 只杀我们自己的远端 blender 任务，不碰同机其它进程；这次順手把 `render.sh`/`doctor.sh`/`status.sh` 的 `pgrep -f` 自匹配 bug 也修了（见下一条） |
| `pgrep -f` 通过 ssh 执行时匹配到自己 | `render.sh` 轮询「渲染还在跑吗」永远为真，卡死轮询；`doctor.sh`/`status.sh` 误判「忙」 | ssh 执行的整条命令字符串本身就在远端那个 wrapper shell 的命令行里，含被找的关键字；改用括号技巧 `pgrep -f '[t]ools/blender_run.sh'`（`status.sh --busy-check`、`render.sh` 轮询、`stop.sh` 都已改） |
| 用户 shell 的 `cat`/`ls` 坏别名（指向没装的 `bat`/`eza`） | 脚本里直接 `cat`/`ls` 报 `command not found` | 脚本一律用 `command cat` / `command ls`；`tools/smoke.sh` 的 lint 步骤会挡住裸 `cat`/`ls`（heredoc 写文件同理，见 `docs/agent-brief.md`） |
| `sync.sh` 的 `--info=progress2` 在非 TTY 刷屏 | Claude 桌面终端这类非 TTY 环境下几千行进度全部打出来 | TTY 下保留单行滚动；非 TTY 下改成每 ~5 秒或 25/50/75/100% 打一条总结（`sync.sh` 内部判断 `[ -t 1 ]`） |
| `awk` 里用 `systime()` 在 macOS 自带 `awk`（非 gawk）上报错 | `sync.sh` 进度节流报 `calling undefined function systime` | 改成 bash 里 `date +%s` 做节流判断，只用 `awk` 算字节数除法（跨平台都有） |
| bash 3.2 没有 `local -n`（nameref）/ `declare -A`（关联数组） | `tools/cloud/lib.sh` 的多实例参数解析、`render_queue.sh` 的设备状态表在 macOS 系统 bash 下直接报错 | `lib.sh` 改用全局数组 `REMAIN[]` 而不是 nameref；`render_queue.sh` 改用一个「host\tstatus」的临时文件代替关联数组 |
| `set -u` 下 `"${arr[@]}"` 在空数组上算 unbound（macOS 系统 bash 3.2 的已知行为） | `cloud_parse_host` 之后 `set -- "${REMAIN[@]}"` 报 unbound variable | 写成 `"${REMAIN[@]+"${REMAIN[@]}"}"` |
| macOS 自带 `grep` 没有 `-P`（PCRE） | `tools/smoke.sh` 的 shell lint 用 `grep -P` 直接报 `invalid option` | 改用 `python3` 写这段 lint（`re` 模块），不依赖 grep 的方言 |

## 常见错误对照

- `缺 tools/cloud/remote.env`：先 `cp tools/cloud/remote.env.example tools/cloud/remote.env` 并填值（多实例见上面 `--host`）。
- `remote.env 里 HOST 是空的`：填 AutoDL 控制台的连接信息。
- `已有云脚本在跑`：本地锁被占用（`tools/cloud/.locks/<实例>.lock`），等它结束；如果确认对应 PID 已经不在了，锁文件会在下次运行自动清理。
- `云端还没有项目文件`：`render.sh` 检测到远端没有 `tools/blender_run.sh`，先跑一次 `sync.sh`。
- `NEED_UPLOAD`（`setup.sh` 退出码 42）：远端连不上官方/镜像源下载 Blender，按提示把 Linux 版 tarball 放到 `~/Downloads/` 后重跑，会走 `scp` 兜底上传。
