#!/usr/bin/env bash
# 云端跑一个固定的 16 spp ~2000px 草图基准，算秒数和每张图的钱，方便跟 logs/render_times.csv 里 Mac 的行比。
# 顺带从 Blender 自己打的进度行里拆「搭场景（CPU）」vs「显卡渲染」耗时——搭场景是 bpy 生成几何体/贴图/BVH，
# 纯 CPU；显卡渲染是路径追踪+降噪。草图采样少，往往搭场景才是大头（见 skills/card-map/HOW-IT-WORKS.md）。
# 加 --cache-blend 会顺带比一次「未命中」和一次「命中」的耗时（命中要脚本自己接了判断才会真的变快，见 docs/cloud-render.md）。
# 用法：bash tools/cloud/bench.sh [--price-per-hour 2.5] [--cache-blend <远端相对目录，默认 .cache/blend>]
# 环境变量：DRY_RUN=1 本地演练，不连接
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"

PRICE=$PRICE_PER_HOUR   # 元/小时，默认取 hosts/*.env 里的 PRICE_PER_HOUR；用 --price-per-hour 覆盖
CACHE_BLEND=""
while [ $# -gt 0 ]; do
  case "$1" in
    --price-per-hour) PRICE=$2; shift 2 ;;
    --cache-blend) CACHE_BLEND=$2; shift 2 ;;
    --host) shift 2 ;;
    *) echo "未知参数 $1" >&2; exit 2 ;;
  esac
done
HOST_FLAG=(--host "$HOST_NAME")

# 固定基准资产：天成中层草图（16 spp，约 2048px），跟本地 logs/render_times.csv 里同款草图行可比
ASSET=tc_mid
OUT=map/art/_bench_tc_mid.png
BENCH_LOG=/tmp/eden_cloud_bench.log

run_bench() {
  local extra=("$@")
  local t0 t1
  t0=$(date +%s)
  bash "$CLOUD_ROOT/render.sh" "${HOST_FLAG[@]}" --log "$BENCH_LOG" --asset "$ASSET" --kind draft --res 2048 --spp 16 "${extra[@]+"${extra[@]}"}" -- \
    -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tiancheng_mid.py', run_name='__main__')" -- \
    --res 2048 --samples 16 --out "$OUT"
  BENCH_RC=$?
  t1=$(date +%s)
  BENCH_SECS=$((t1 - t0))
}

# 拆分：从 Blender 自己打的进度行里找第一条「Sample」行（渲染开始，之前都是搭场景）和最后一条时间戳（渲染结束）。
# 格式随 Blender 版本可能有出入，抓不到就只报总时长，不强行瞎猜。
report_split() {
  [ "$DRY_RUN" = 1 ] && { echo "  [DRY_RUN] 跳过日志拆分"; return; }
  local raw
  raw=$(run_ssh "command cat '$BENCH_LOG' 2>/dev/null")
  local first_sample last_line
  first_sample=$(printf '%s\n' "$raw" | grep -m1 '| Sample ' | grep -oE 'Time:[0-9:.]+' | head -1 | cut -d: -f2-)
  last_line=$(printf '%s\n' "$raw" | grep -E '\| Sample |Time:[0-9:.]+' | tail -1 | grep -oE 'Time:[0-9:.]+' | tail -1 | cut -d: -f2-)
  hms_to_s() { awk -F: -v t="$1" 'BEGIN{n=split(t,a,":"); s=0; for(i=1;i<=n;i++) s=s*60+a[i]; printf "%.0f", s}'; }
  if [ -n "$first_sample" ] && [ -n "$last_line" ]; then
    local build_s render_s
    build_s=$(hms_to_s "$first_sample"); render_s=$(hms_to_s "$last_line")
    local render_only=$((render_s - build_s))
    echo "  拆分：搭场景（CPU）约 ${build_s}s，显卡渲染约 ${render_only}s（从日志 Time: 字段推算，Blender 版本不同格式可能有出入）"
  else
    echo "  没能从日志里拆出搭场景/渲染分段（Blender 输出格式变了？），只有总时长 ${BENCH_SECS}s"
  fi
}

echo "--- 基准：$ASSET 草图 16spp 2048px，云端 OPTIX/CUDA ---"
run_bench
if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] 基准演练完成（用时 ${BENCH_SECS}s 只是本地演练开销，不代表真实渲染时间）"
  exit 0
fi
if [ "$BENCH_RC" -ne 0 ]; then
  echo "基准渲染失败（退出码 ${BENCH_RC}），不记价格" >&2
  exit "$BENCH_RC"
fi
SECS=$BENCH_SECS
YUAN_PER_IMAGE=$(awk -v s="$SECS" -v p="$PRICE" 'BEGIN { printf "%.4f", s / 3600 * p }')
echo "用时 ${SECS}s，按 ${PRICE} 元/小时算，约 ${YUAN_PER_IMAGE} 元/张"
report_split

if [ -n "$CACHE_BLEND" ]; then
  echo "--- 场景缓存对比：--cache-blend ${CACHE_BLEND}（第一次多半是未命中，第二次同参数应该命中）---"
  run_bench --cache-blend "$CACHE_BLEND"
  echo "第一次（未命中）：${SECS}s"
  echo "第二次（预期命中）：${BENCH_SECS}s"
  report_split
  echo "注意：命中只是把 EDEN_CACHE_BLEND_HIT/PATH 传给场景脚本，脚本没接判断逻辑的话两次耗时不会有差别（见 docs/cloud-render.md「场景缓存」）"
fi

echo "跟本地 Mac 的对比行看 logs/render_times.csv（asset=$ASSET,kind=draft,res=2048,spp=16 的行）"
