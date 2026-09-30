# 云渲染（AutoDL）操作指南

> 现行文档。配套：`docs/agent-brief.md`（代理先读这个）、`tools/cloud/*.sh`、`tools/render_queue.sh`。
> AutoDL 实例：RTX 4080 SUPER 32GB、Ubuntu 22.04、Blender 5.2.2 装在 `/opt/blender`、数据盘 `/root/autodl-tmp/eden`；
> CPU 是 Xeon 8352V（12 vCPU）——见文末「场景搭建 vs 显卡渲染」，纯 CPU 阶段不一定比 Mac 快。

## 派工常驻（launchd，2026-09-29）

派工循环是队列的心跳：它一死就没人派活，云端空转烧钱。`nohup … &` 起的进程会随宿主会话一起被收走，
所以装了 launchd 守护：`bash tools/install_renderqueue_agent.sh`（卸：`--uninstall`）。
KeepAlive 不会产生两个派工——单例锁会把多余的那个顶掉（拿不到锁就退出 0），持有者一死下一个立刻接管。

## 每次上云前都会同步（2026-09-29）

`tools/cloud/render.sh` 现在自己判断「本地有改动就 sync」。以前只有渲染队列那条路会同步，
直接调 `render.sh`（`landmark.py final --cloud` 就是）会把云端上次同步的**旧脚本**拿来渲——
2026-09-29 以太穹顶整套定稿就是这样白跑的（图跟上一版一模一样才发现）。判定与队列同一套：
已跟踪 + 未跟踪但没被忽略的文件里，有一个比 `.locks/<实例>.last_sync` 新就同步。

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

看板（`tools/pipeline_status.*`）已于 2026-09-28 按用户要求删除；查状态用 `tools/cloud/status.sh`（云端）和 `tools/render_queue.sh status`（队列），任务分配看 `logs/pipeline_tasks.md`。

## 渲染守卫（静态预检 + 自报 + 看门狗，2026-09-28）

起因：原域圣山脚本经 `landmarks/common.setup()` 写死 `METAL`，在云端抛 TypeError 被吞掉，4080 利用率 0%、显存 1 MiB，CPU 白渲 20 分钟；另一次死于 blender_run.sh 的「未知参数 --out」。不用「1 分钟 GPU 为 0 就杀」这种土办法：纯 CPU 的场景搭建本来就要几分钟，而且它抓不到卡死。

**1. 唯一的设备 helper**：`tc_common.setup_render_device(sc, hybrid=False)`（旧名 `pick_gpu` 等价；实现在 `blender/eden_guard.py`，只依赖 bpy）。
- 按 OPTIX → CUDA → METAL → HIP → ONEAPI 探测（`EDEN_CYCLES_DEVICE` 可提前某一种），打印 `EDEN_DEVICE=<OPTIX|CUDA|METAL|CPU> gpus=<名字> allow_cpu=0|1 src=setup`。
- 没有 GPU：只有 `blender_run.sh --allow-cpu`（= 环境变量 `EDEN_ALLOW_CPU=1`）才退 CPU，否则立即 `EDEN_ABORT=cpu_fallback`、退出码 86。不读脚本 argv（免得撞各脚本自己的参数解析）。
- **新渲染脚本必须调用它**；`tools/smoke.sh` 里 `render_preflight.py lint` 检查：调用 `bpy.ops.render.render(` 的文件必须同时调用 `setup_render_device(` / `pick_gpu(`，除 `eden_guard.py` 外不许写 `compute_device_type`。还没迁完的旧文件列在 `tools/render_preflight.py` 的 `PENDING`（只警告），迁完就删。

**2. 自报**：`eden_guard.install()` 注册 `bpy.app.handlers`（@persistent，按函数名去重，`read_factory_settings` 之后仍在）：
`EDEN_PHASE=build`（安装时）/`render`（render_init、render_pre）/`post`/`write`/`done`/`cancel`；`render_stats` 节流打印 `EDEN_PROGRESS stage=<sync|kernels|sample|denoise|finished> sample=a/b tile=c/d note=…`（Blender 5 的 `-b` 模式本身不再打印采样进度）。
render_pre 时按场景**真实状态**再报一次 `EDEN_DEVICE=… src=render_pre`；是 CPU 且没允许 → 立即中止。`blender_run.sh` 在任何脚本之前注入 `install()`，所以没调用 helper 的旧脚本也有阶段标记和这道 CPU 闸。

**3. 静态预检** `tools/render_preflight.py check -- <blender_run.sh 参数>`：按 blender_run.sh 的语法解析（第一个 `--` 前只能是 `--log/--asset/--kind/--res/--spp/--cache-blend/--allow-cpu`）；找到入口脚本，它或它 import 的本仓库模块必须调用 helper；脚本参数（第二个 `--` 之后）对照声明的参数表（模块级 `EDEN_ARGS`，或 `args(dict(...))` 的键，或 tc.Layer 家族里出现的 `--xxx`；都没有就跳过并提示），拼错给「是不是 --samples？」。
在 `render_queue.sh submit`（拒收）、`tools/cloud/render.sh`（上传前，拒绝时记 CSV `arg_error`/`no_device_helper`、0 元）、`blender_run.sh`（本机；云端由提交端设 `EDEN_PREFLIGHT_DONE=1` 跳过）三处跑。

**4. 看门狗** `tools/render_watchdog.py`：`blender_run.sh` 起 Blender 后自动拉起（Mac 与云端同一套；云端没有系统 python3，用 Blender 自带的 python），读日志里的 EDEN_ 行，按阶段判断：

| 阶段 | 显卡空闲 | 规则 |
|---|---|---|
| build（开始、每次 done 之后） | 正常 | 累计 > 3×预计 → 警告；> 硬上限 max(6×预计, 30 分钟)（`EDEN_BUILD_CAP_MIN` 可改）→ 杀 `build_timeout` |
| render | 不正常 | 设备行是 CPU 且没允许 → 立即杀 `cpu_fallback`；每 10 s 采 nvidia-smi，所有卡利用率 0 **且**显存 < 100 MiB（优先用本 PID 的显存）连续 60 s → 杀 `gpu_idle`。本次渲染出现 `stage=sample` 后（或进入渲染 5 分钟后）才开始判，避开首次 OptiX 编译内核 / 大场景同步 |
| render / post / write | — | 进度（stage/采样/分块）10 分钟不动 → 杀 `stall`（编内核阶段 20 分钟，post/write 15 分钟） |
| 全程 | — | 总时长 > 3×预计 → 只警告 |

预计时长来自 `logs/render_times.csv`：同资产（先同机型）→ 同类型，按 res²×spp 折算（系数夹 0.2–5）→ 默认 10 分钟，下限 3 分钟。`minutes` 是总时长，当搭建预算偏宽（宁可晚杀不误杀）。云端由 `render.sh` 用本地完整历史算好经 `EDEN_EST_MIN` 传过去。
Mac 上 nvidia-smi 不存在：`ioreg` 的利用率只记录不判死（统一内存，显存阈值无意义），Mac 靠设备行 + render_pre 闸 + 停滞判断。
输出：`<日志>.watchdog`（中文事件）、`<日志>.wdstate`（一行当前状态 + `hb=` 心跳，`tools/cloud/status.sh` 显示；心跳超过 60 s 说明看门狗没在跑）、杀之前写 `<日志>.wdkill`。

**5. 失败时**：只杀 `<日志>.pid` 里这次的 Blender PID（先 TERM 后 KILL，且进程名要含 `lender`），绝不停实例；`blender_run.sh` 释放 GPU 锁（残留锁的持有者已死会自动清），`render.sh` 退出时释放本地锁，队列继续。
结论写 `<日志>.verdict`（status / reason / minutes / wasted_min / wasted_cny / device），`logs/render_times.csv` 追加一行 `date,asset,kind,res,spp,minutes,exit,host,status,wasted_min,wasted_cny`（status：`ok`、`cpu_fallback`、`gpu_idle`、`stall`、`build_timeout`、`arg_error`、`no_device_helper`、`crash`、`cancelled`、`unknown`；浪费按 `PRICE_PER_HOUR`，默认 1.58 元/时，Mac 记 0）。云端的行由本地 `render.sh` 按远端结论写（不再写 `minutes=NA`）。
退出非零（看门狗 / 守卫 70，参数 2，取消 130，崩溃原码），打印中文原因和日志尾巴。**只有 `crash` 重试一次；不自动改用 CPU 重跑。**
旧行的列布局有 6 / 7 / 8 列三种，`render_watchdog.read_history` 都认；只在末尾追加。

**6. 测试**：`python3 tools/test_render_guard.py`（smoke 会跑）：状态机各阶段与各失败方式（假时钟）、估时（各种列布局）、预检（含「--out 放错位置」回归）、假 nvidia-smi + 假 Blender 进程的驱动测试，以及原域圣山事故回归。
手动验证：`EDEN_CYCLES_DEVICE=CPU bash tools/cloud/render.sh …` 应在渲染阶段开始时被中止（status=cpu_fallback）；再加 `EDEN_GUARD_NO_INPROC=1`（仅测试用）则由看门狗杀。



## 场景缓存（`--cache-blend`）

搭场景（`bpy` 生成几何体/贴图/BVH）是纯 CPU，8K/16K 定稿里经常比显卡渲染本身还慢（实测一次基准：搭建 59s、显卡渲染只 7s，见 `skills/card-map/HOW-IT-WORKS.md`「渲染时 token/CPU/内存/显卡各干什么」）。

`tools/blender_run.sh --cache-blend <目录>` 提供的是**基础设施**，不是开箱即用的自动加速：
- 会按（透传参数 + `git HEAD` + `git diff --stat -- blender/` + `runpy.run_path()` 指向的构建脚本内容）算一个哈希，决定这次搭建跟上次是不是同一个场景；
- 命中时把路径通过环境变量 `EDEN_CACHE_BLEND_HIT=1`、`EDEN_CACHE_BLEND_PATH=<blend 路径>` 告诉 Python 构建脚本；
- **场景脚本已接（2026-09-29）**：`tiancheng_mid/low/upper.py` 在 `tc.Layer(...)`（含 OSM 城市生成，搭建大头）之前调 `tc.blend_cache_open()`，命中则 `tc.cache_render()` + 退出，完全跳过本文件；`landmarks/*/build.py`（31 个）由 `common.setup()` 判命中（`C.CACHED`），各脚本一行 `if C.CACHED: return C.render_cached(...)` 跳过搭建。命中路径也会 `pick_gpu`——新 Blender 进程的计算设备偏好是空的，blend 里存的 `device='GPU'` 落不到实处，会回落 CPU 被 CPU 闸拦下（实测踩过）。`--data-only` / `--crop(s)` 命中按未命中走（前者不渲染、后者要渲多块局部）；`blender/world/yuanyu_holy_mount.py` 一段搭建多个机位渲染，暂未接；
- 不管命不命中，跑完都会把当前场景存一份到该哈希对应的 `.blend`（`tools/blender_run.sh` 内部在末尾追加一个 `--python-expr` 调 `bpy.ops.wm.save_mainfile`）。
- `tools/cloud/render.sh` 会原样透传 `--cache-blend` 给远端；`tools/render_queue.sh` 已经默认给 Mac 任务传 `--cache-blend .cache/blend`（相对仓库根）、给云端任务传 `--cache-blend .cache/blend`（相对 `REMOTE_DIR`）。
- 接入后已验（2026-09-29，本机 draft）：`lm_contest_corridor` 401px/8spp 未命中 0.1 min（正常出图 + 落盘 .blend）→ 同参命中 **0.0 min**（`blend cache hit` 后直接渲染，`WROTE … (cache hit)`）。小场景绝对值小，真正的收益在 8K/16K 定稿（搭建 59s 级）；上云前后各记一次 `tools/cloud/bench.sh` 的未命中/命中秒数进 `logs/render_times.csv`。

## 关机保留数据盘

AutoDL 关机（`shutdown -h now`）后按小时计费的算力费停止，**但数据盘（`/root/autodl-tmp`，含 `eden` 目录）不会被清空**，下次开机接着用，不用重新 `sync.sh` 全量。`tools/cloud/idle_guard.sh --idle-shutdown 30` 装的看门狗就是靠这个：GPU 连续空闲 30 分钟自动关机，省的是算力费，不影响下次续渲。

## 坑（都是踩过的）

| 坑 | 现象 | 修复 |
|---|---|---|
| `--out` 写成绝对路径 | 远端 blender 把图写到**那个绝对路径**（在 `$REMOTE_DIR` 之外），结论文件仍写 `status=ok`，但 rsync 回传 `link_stat … No such file` —— **白跑一次**（2026-09-29 中层夜景 8000px：3.7 min ≈ ¥0.1，产物留在云端） | `tools/cloud/render.sh` 已加门控：仓库内的绝对路径自动折成相对路径（Mac 任务不受影响），仓库外的绝对路径直接中止；经队列提交云端任务时请用**相对仓库根**的 `--out`（早期 `yuanyu_glb` 那几笔用相对路径、回传正常，可作对照） |
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

## Mac-only mode and worktree jobs (2026-09-30)

Render campaign R renders every place and base map to final on the local Mac only, from long-running sessions that each
live in their own git worktree. Two queue changes make that work.

**Shared queue, per-job tree root.**
- The queue lives in the *main working tree's* `logs/queue/` (`QROOT` = the parent of the repository's git common dir).
  `tools/render_queue.sh submit` from any worktree lands there, where the launchd dispatcher
  (`ai.edenmap.renderqueue`) is running. `status`, `list` and `dispatch` resolve the same directory from any tree.
- A job file is `tag<TAB>args<TAB>jobroot`, where `jobroot` is the absolute path of the tree that submitted it. On the
  Mac the dispatcher `cd`s into `jobroot` and runs *that tree's* `tools/blender_run.sh`, so the job uses the
  submitter's scripts and the `--out` artifact (checked relative to `jobroot` when the job finishes) lands in the
  submitter's tree. If the worktree has been deleted the job fails through the normal retry cap. Legacy two-field jobs
  mean the main tree. The blend cache stays shared at `<main>/.cache/blend`.
- Submitted arguments start with `--log <path>` (the render guard treats anything else as the legacy call form).
- The main checkout is only the dispatcher's home: nobody edits or commits there.

**Mac-only mode.** While `<main>/logs/queue/MAC_ONLY` exists, `draft`, `final` and `any` all go to the Mac when it is
idle and wait otherwise. No cloud target is ever chosen and no cloud host is probed (no ssh at all, not even for
`status`, which prints `mode: Mac-only (logs/queue/MAC_ONLY)`). Turn it on with `touch logs/queue/MAC_ONLY` in the main
checkout and off by removing the file; the dispatcher re-reads it every round.

**Why non-main trees never go to the cloud.** `tools/cloud/sync.sh` and `render.sh` only know the main tree, so a job
from a worktree would render the main tree's stale scripts on the instance. Without `MAC_ONLY`, such a job is routed to
the Mac only; if the Mac is busy it stays pending, with a one-time warning on the dispatcher's stderr
(`logs/queue/dispatch.err`).

**Orphans.** Files in `pending/` without a matching `.job` (typically a leftover `*.retry`) are ignored by dispatch;
`status` prints their count.

**Refreshing the dispatcher.** The dispatcher runs the main checkout's copy of `tools/render_queue.sh`, so after a
change to it lands on `origin/preview`:

```bash
git -C <main> status --porcelain          # must be empty
git -C <main> merge --ff-only origin/preview
bash <main>/tools/install_renderqueue_agent.sh
bash <main>/tools/render_queue.sh status  # mode line + "dispatcher: alive"
```

Dry runs (`DRY_RUN=1`) print the `cd <jobroot> && bash <jobroot>/tools/blender_run.sh …` line and finish synchronously
instead of starting Blender. Tests: `python3 tools/test_render_queue.py` (part of `tools/smoke.sh`).

## Render campaign ledger (2026-09-30)

Render campaign R is worked by long-running sessions (not necessarily Claude) that pick work from one list, record
progress and resume after a restart. All state is in the repo; `tools/render_campaign.py` never renders or submits
anything, it only prints command hints (renders still go through `tools/render_queue.sh`, Mac-only).

- `docs/plans/render-campaign.items.json`: the item list, written once by `init`, afterwards hand-edited. Order in the
  file is priority. Each item has a lane, a type (which fixes its stage list), targets, `canon` (`card` / `inferred`),
  `depends`, a render `spec` and `hints`. A failed repo lookup at `init` time left `TODO:` in the item's notes.
- `docs/plans/render-campaign-events.csv`: append-only (`ts,id,stage,event,agent,gate,note`; `.gitattributes` gives it
  `merge=union`). The tool only appends whole lines. Replay orders events by timestamp, so merged branches agree.
- `docs/plans/render-campaign.md`: generated status view (`status --md`); never edit it. After a merge conflict in it,
  regenerate it.

**Loop** (one agent name per session, e.g. `--agent std-1`; the same name after a restart resumes your own claim):

```bash
python3 tools/render_campaign.py next --lane standard --agent std-1   # claims the item, prints stage + command hint
python3 tools/render_campaign.py done  ID STAGE --agent std-1 [--gate pass|fail] [--note TEXT]
python3 tools/render_campaign.py fail  ID STAGE --agent std-1 --note "what broke"
python3 tools/render_campaign.py wait  ID STAGE --agent std-1         # job in flight, or a ship/register stage held by FREEZE
python3 tools/render_campaign.py status [--md]
```

`next` exit codes: 0 item printed, 3 nothing left for the lane, 4 only blocked / waiting / claimed / stuck items remain.
`--peek` shows the next item without claiming it; `--json` prints machine-readable output.

**Lanes.** `standard` and `hero` run in parallel from the same list; an item belongs to one lane and `depends` may cross
lanes (the item then waits, exit 4).

**Claims.** `next` records a claim for the agent. It lasts 6 h from that agent's latest event on the item and ends on
`release`, on `fail`, or when the item finishes. Another agent is never handed a live claim and cannot record events on
it. Three `fail` events on one stage make the item stuck: it is no longer offered and shows as `stuck` in `status`; a
human unsticks it with `skip` or `done` for that stage.

**Stages.** Stage lists per type are constants in the tool. `fix` and `review-r2` are skipped automatically when
`review-r1` is recorded with `--gate pass`. `review-r2` with `--gate fail` does not block: the item continues and is
flagged `below-gate` for a user spot-check.

**FREEZE.** While `docs/plans/FREEZE_MAPS` exists on `origin/preview`, `maps.json` edits must not ship. Run
`python3 tools/render_campaign.py ship-check` before a `ship` or `register` stage (exit 3 = frozen), and record `wait`
on that stage. A `wait` on `ship` / `register` parks the item and `next` re-offers it only when `ship-check` passes.
Rendering itself may continue while frozen.

**Weather variants.** `rain` and other weather variants are not campaign items: the viewer supports only the four
periods `dawn`, `day`, `dusk` and `night` (`periods` keys in `maps.json`).

Tests: `python3 tools/test_render_campaign.py` (part of `tools/smoke.sh`).
