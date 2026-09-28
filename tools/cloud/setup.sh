#!/usr/bin/env bash
# 在 AutoDL 容器里装 Blender + apt 依赖，幂等（已装就跳过）。
# 用法：bash tools/cloud/setup.sh
# 环境变量：DRY_RUN=1 只打印会执行的远程命令，不连接（本地测试用）
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"

# 本地 blender 的大版本号，作为云端要装的目标版本（见 tools/blender_run.sh 里 BLENDER 的取法）
LOCAL_BL=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
if [ -x "$LOCAL_BL" ] || command -v "$LOCAL_BL" >/dev/null 2>&1; then
  LOCAL_VER=$("$LOCAL_BL" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
fi
BL_VERSION=${BL_VERSION:-${LOCAL_VER:-4.2}}
BL_MAJOR=${BL_VERSION%.*}
echo "目标 Blender 版本：$BL_VERSION（大版本 $BL_MAJOR，来自本地 $LOCAL_BL）"

REMOTE_CMD=$(cat <<EOF
set -eu
BL_VERSION='$BL_VERSION'
BL_MAJOR='$BL_MAJOR'
REMOTE_DIR='$REMOTE_DIR'
DEST=/opt/blender
mkdir -p "\$DEST" "\$REMOTE_DIR"

echo '--- apt 依赖 ---'
if ! dpkg -s libxi6 >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq libxi6 libxrender1 libxrandr2 libxfixes3 libxkbcommon0 \
    libgl1 libglu1-mesa libsm6 libice6 libxext6 libxcursor1 libxinerama1 \
    wget rsync ca-certificates > /dev/null
else
  echo 'apt 依赖已装，跳过'
fi

echo '--- Blender ---'
if [ -x "\$DEST/blender" ] && "\$DEST/blender" --version 2>/dev/null | head -1 | grep -q "\$BL_MAJOR"; then
  echo "已有 \$("\$DEST/blender" --version | head -1)，跳过下载"
else
  TARBALL="/tmp/blender-\$BL_VERSION-linux-x64.tar.xz"
  URLS=(
    "https://download.blender.org/release/Blender\$BL_MAJOR/blender-\$BL_VERSION-linux-x64.tar.xz"
    "https://mirrors.aliyun.com/blender/release/Blender\$BL_MAJOR/blender-\$BL_VERSION-linux-x64.tar.xz"
    "https://mirrors.tuna.tsinghua.edu.cn/blender/release/Blender\$BL_MAJOR/blender-\$BL_VERSION-linux-x64.tar.xz"
  )
  ok=0
  for u in "\${URLS[@]}"; do
    echo "试： \$u"
    if wget -q --timeout=30 -O "\$TARBALL" "\$u" && [ -s "\$TARBALL" ]; then ok=1; break; fi
    rm -f "\$TARBALL"
  done
  if [ "\$ok" != 1 ]; then
    echo "NEED_UPLOAD \$TARBALL"
    exit 42
  fi
  rm -rf "\$DEST"/*
  tar -xJf "\$TARBALL" -C "\$DEST" --strip-components=1
  rm -f "\$TARBALL"
fi
ln -sf "\$DEST/blender" /usr/local/bin/blender

echo '--- GPU 探测 ---'
blender -b --python-expr "
import bpy
p = bpy.context.preferences.addons['cycles'].preferences
found = []
for k in ('OPTIX', 'CUDA'):
    try:
        p.compute_device_type = k
    except TypeError:
        continue
    p.get_devices()
    devs = [d.name for d in p.devices if d.type != 'CPU']
    if devs:
        found.append((k, devs))
print('CUDA/OPTIX devices:', found or 'NONE (no-GPU 模式下装机时属正常，起 render.sh 时再确认)')
"
echo 'setup 完成'
EOF
)

if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] 会通过 ssh 执行以下脚本："
  echo "$REMOTE_CMD"
  exit 0
fi

require_host
# shellcheck disable=SC2046
ssh $(ssh_opts) "${REMOTE_USER}@${HOST}" -- bash -s <<< "$REMOTE_CMD"
rc=$?
if [ $rc -eq 42 ]; then
  echo "远程下载不了 Blender 官方/镜像源，走 scp 上传兜底："
  LOCAL_TARBALL="$HOME/Downloads/blender-$BL_VERSION-linux-x64.tar.xz"
  if [ ! -f "$LOCAL_TARBALL" ]; then
    echo "先手动下载 Linux 版 Blender $BL_VERSION 到 $LOCAL_TARBALL，再重跑本脚本" >&2
    exit 42
  fi
  scp_up "$LOCAL_TARBALL" "/tmp/blender-$BL_VERSION-linux-x64.tar.xz"
  run_ssh "set -eu; DEST=/opt/blender; mkdir -p \$DEST; rm -rf \$DEST/*; tar -xJf /tmp/blender-$BL_VERSION-linux-x64.tar.xz -C \$DEST --strip-components=1; rm -f /tmp/blender-$BL_VERSION-linux-x64.tar.xz; ln -sf \$DEST/blender /usr/local/bin/blender; blender --version"
  rc=$?
fi
exit $rc
