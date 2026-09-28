#!/usr/bin/env bash
# 云端跑一个固定的 16 spp ~2000px 草图基准，算秒数和每张图的钱，方便跟 logs/render_times.csv 里 Mac 的行比。
# 用法：bash tools/cloud/bench.sh [--price-per-hour 2.5]
# 环境变量：DRY_RUN=1 本地演练，不连接
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"

PRICE=2.5   # 元/小时，默认按常见 AutoDL 3090 价位；用 --price-per-hour 覆盖
while [ $# -gt 0 ]; do
  case "$1" in
    --price-per-hour) PRICE=$2; shift 2 ;;
    *) echo "未知参数 $1" >&2; exit 2 ;;
  esac
done

# 固定基准资产：天成中层草图（16 spp，约 2048px），跟本地 logs/render_times.csv 里同款草图行可比
ASSET=tc_mid
OUT=map/art/_bench_tc_mid.png
BENCH_LOG=/tmp/eden_cloud_bench.log

echo "--- 基准：$ASSET 草图 16spp 2048px，云端 OPTIX/CUDA ---"
t0=$(date +%s)
bash "$CLOUD_ROOT/render.sh" --log "$BENCH_LOG" --asset "$ASSET" --kind draft --res 2048 --spp 16 -- \
  -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tiancheng_mid.py', run_name='__main__')" -- \
  --res 2048 --samples 16 --out "$OUT"
rc=$?
t1=$(date +%s)
SECS=$((t1 - t0))

if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] 基准演练完成（用时 ${SECS}s 只是本地演练开销，不代表真实渲染时间）"
  exit 0
fi

if [ $rc -ne 0 ]; then
  echo "基准渲染失败（退出码 ${rc}），不记价格" >&2
  exit $rc
fi

YUAN_PER_IMAGE=$(awk -v s="$SECS" -v p="$PRICE" 'BEGIN { printf "%.4f", s / 3600 * p }')
echo "用时 ${SECS}s，按 ${PRICE} 元/小时算，约 ${YUAN_PER_IMAGE} 元/张"
echo "跟本地 Mac 的对比行看 logs/render_times.csv（asset=$ASSET,kind=draft,res=2048,spp=16 的行）"
