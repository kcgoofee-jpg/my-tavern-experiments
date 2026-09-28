# 云端（AutoDL）渲染

租一台 AutoDL 容器当额外的 GPU 渲染机，跟本地 Mac 的 `tools/blender_run.sh` 用同一套资产脚本。脚本在 `tools/cloud/`。

## 1. AutoDL 控制台步骤

1. 账户设置 → SSH 公钥，添加：
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILyhGPZWtSg+OdXFXApEsWmf5nnqO9jHLitRIHh5gQ5s eden-render
   ```
2. 创建实例：基础镜像选纯 Ubuntu 或 Miniconda（不用预装 PyTorch 的镜像，省钱），选一个**可扩容硬盘**的主机（渲染素材 + Blender 装完有几个 G）。
3. **装机阶段选无卡模式**（no-GPU，按分钟计费但便宜很多），等 `setup.sh`、`sync.sh` 跑完再开卡渲染。
4. 记下控制台给的 SSH 连接信息（HOST、PORT）。

## 2. 本地配置

```
cp tools/cloud/remote.env.example tools/cloud/remote.env
# 编辑 remote.env：填 HOST、PORT；KEY 指向上面公钥对应的私钥；REMOTE_DIR 一般不用改
```

`remote.env` 已在 `.gitignore` 里，不会被提交。

## 3. 跑起来

```
bash tools/cloud/setup.sh     # 装 Blender + apt 依赖，幂等，重跑安全
bash tools/cloud/sync.sh      # 增量传仓库 + blender/data 素材上去
bash tools/cloud/bench.sh     # 跑一个固定草图基准，打印秒数和 元/张（默认按 2.5 元/小时估，用 --price-per-hour 改）
bash tools/cloud/render.sh --log /tmp/x.log --asset <名字> --kind draft --res 2048 --spp 16 -- \
  -b --factory-startup --python-expr "..." -- --res 2048 --samples 16 --out map/art/xxx.png
```

`render.sh` 的参数跟本地 `tools/blender_run.sh` 完全一样，照抄现有渲染命令、把 `bash tools/blender_run.sh` 换成 `bash tools/cloud/render.sh` 即可。跑完会把产出 rsync 回本地对应路径，并在 `logs/render_times.csv` 里加一行（`host=autodl-<显卡名>`），可以跟本地 Mac 的行比速度和成本。

## 4. 用完关机

**AutoDL 按时计费，不用了一定要在控制台把实例关机（或释放）**，脚本不会替你关。

## 5. 排错

- `setup.sh` 三个下载源（blender.org → aliyun 镜像 → tuna 镜像）都连不上，会提示手动把 Linux 版 Blender tar.xz 放到 `~/Downloads/`，重跑脚本走 scp 上传兜底。
- GPU 探测在 `setup.sh` 最后会打一行 `CUDA/OPTIX devices: ...`；如果装机时用的是无卡模式，这里打印 NONE 是正常的，开卡渲染时 `render.sh` 会用 `EDEN_CYCLES_DEVICE=OPTIX` 重新探测（没有 OPTIX 就退到 CUDA）。
