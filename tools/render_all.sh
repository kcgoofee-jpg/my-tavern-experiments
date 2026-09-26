#!/usr/bin/env bash
# 渲染天城各层底图并切成瓦片（本机跑，不消耗 Claude 额度）。
# 用法：bash tools/render_all.sh [层 ...] [--res 8000] [--samples 64]
#   层：upper mid low（默认全部；脚本不存在的层自动跳过）
#   例：bash tools/render_all.sh upper --res 2000 --samples 16   # 快速草稿
set -euo pipefail
cd "$(dirname "$0")/.."
RES=8000; SAMPLES=64; LAYERS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --res) RES=$2; shift 2 ;;
    --samples) SAMPLES=$2; shift 2 ;;
    *) LAYERS+=("$1"); shift ;;
  esac
done
[ ${#LAYERS[@]} -eq 0 ] && LAYERS=(upper mid low)
BL=${BLENDER:-}
[ -z "$BL" ] && [ -x /Applications/Blender.app/Contents/MacOS/Blender ] && BL=/Applications/Blender.app/Contents/MacOS/Blender
[ -z "$BL" ] && BL=$(command -v blender || true)
[ -z "$BL" ] && { echo "找不到 Blender：装好后重试，或设置 BLENDER=/path/to/blender"; exit 1; }
for L in "${LAYERS[@]}"; do
  SCRIPT="blender/tiancheng_${L}.py"
  [ -f "$SCRIPT" ] || { echo "跳过 $L（没有 $SCRIPT）"; continue; }
  OUT="$PWD/map/art/tc_${L}_full.png"
  echo "== 渲染 $L：${RES}px，${SAMPLES} 采样"
  "$BL" -b -P "$SCRIPT" -- --res "$RES" --samples "$SAMPLES" --out "$OUT" 2>&1 | grep -E "^\[|WROTE|Error|Traceback" || true
  [ -f "$OUT" ] || { echo "$L 渲染失败"; exit 1; }
  python3 tools/make_dzi.py "$OUT" "map/art/tc_${L}"
done
echo "完成。检查 git status，确认后提交 map/art/tc_*.dzi、map/art/tc_*_files/、map/data/tc_*.json"
