# 挤奶厅交互测试 · 性能（2026-09-27）

`tools/browser/viewer3d_perf.mjs`（原始数据 `perf.json`，截图 `shots/*.jpg`）。本机 M 系 Mac，Chromium 用 `GPU=1`（ANGLE Metal），WebKit 为 Playwright WebKit（Apple GPU）。本地服务，所以加载时间不含网络。

| 档 | 模型 | 加载到首帧 | 外观 p50/p95 | 屋顶掀开 | 内透 | 剖切 | GPU 估算 |
|---|---|---|---|---|---|---|---|
| 桌面 Chromium 1440×900（high，DPR 1） | dairy.glb 4.8 MB | 2.0 s（冷启动含 GPU 进程） | 60 / 30 fps | 60 / 60 | 60 / 59.5 | 60 / 59.5 | 205 MB |
| 手机 Chromium 375×812，CPU 4× 降速（low，DPR 1.25） | dairy_low.glb 2.8 MB | 0.29 s | 60 / 60 | 60 / 59.5 | 60 / 60 | 60 / 60 | 77 MB |
| 桌面 WebKit | 4.8 MB | 0.55 s | 58.8 / 55.6 | 58.8 / 55.6 | 58.8 / 58.8 | 58.8 / 58.8 | 205 MB |
| iPhone WebKit 375×812（low） | 2.8 MB | 0.12 s | 58.8 / 55.6 | 58.8 / 55.6 | 58.8 / 58.8 | 58.8 / 55.6 | 77 MB |

- 27 万三角形、15 次 draw call（每个网格一次）、无灯光 / 阴影 / 后处理。
- 帧率全部顶在垂直同步，**四种显示方式在这台机器上分不出成本差**（桌面外观 p95 30 是开头一帧卡顿）。真机弱 GPU 的差别要在实机上测：内透是每像素多一次比较 + discard，剖切是多一个裁剪面 + 背面着色，理论上都是个位数百分比。
- GPU 估算 = 顶点 / 索引缓冲 + 贴图 RGBA×4/3（含 mip）。高档 8 张 2048² 占大头；低档全部 1024²。
- 开关 10 次（viewer.html 里 go('dairy') ↔ go('world')，每次强制 GC）：宿主 JS 堆 3.4 → 3.9 MB（第 1 次后 +0.5 MB，逐次 ~0.05 MB，未见 iframe 残留：frames 1）。iframe 自己在 pagehide 里 dispose + forceContextLoss。
- 无页面错误（桌面 Chromium 有一条 favicon 404）。
