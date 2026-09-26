#!/usr/bin/env bash
# 渲染设备 / 参数对比：同一块局部、同样的采样，分别用「只用 GPU」和「CPU + GPU」渲一次，打印用时。
# 用法：bash tools/bench_render.sh [层=mid] [分辨率=2000] [采样=64]
# 选快的那种写进 docs/render-performance.md，并用环境变量 TC_DEVICES=gpu|hybrid 或参数 --devices 固定下来。
set -euo pipefail
cd "$(dirname "$0")/.."
L=${1:-mid}; RES=${2:-2000}; S=${3:-64}
BL=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
mkdir -p logs
for DEV in gpu hybrid; do
  T0=$(date +%s)
  "$BL" -b -P "blender/tiancheng_${L}.py" -- --res "$RES" --samples "$S" --devices "$DEV" --out "$PWD/logs/bench_${L}_${DEV}.png" > "logs/bench_${L}_${DEV}.log" 2>&1
  T1=$(date +%s)
  R=$(grep -Eo "\[ *[0-9.]+s\] render done" "logs/bench_${L}_${DEV}.log" | tail -1 || true)
  S0=$(grep -Eo "\[ *[0-9.]+s\] render start" "logs/bench_${L}_${DEV}.log" | tail -1 || true)
  echo "$DEV：总用时 $((T1 - T0)) 秒（$S0 → $R）"
done
