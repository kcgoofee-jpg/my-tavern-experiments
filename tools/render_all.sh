#!/usr/bin/env bash
# 渲染天城各层底图并切成瓦片（本机跑，不消耗 Claude 额度）。
# 用法：bash tools/render_all.sh [层 ...] [--res 8000] [--samples 64] [--data-only] [--bpy] [-- 其他参数原样传给层脚本]
#   层：upper mid low（默认全部；脚本不存在的层自动跳过）
#   例：bash tools/render_all.sh upper --res 2000 --samples 16   # 快速草稿
#       bash tools/render_all.sh --data-only                      # 只重新导出点位（几秒），不渲染、不切瓦片
#       bash tools/render_all.sh low -- --lamp .4 --ambient .1    # 调层参数
#   --bpy：不用 Blender 程序，改用 pip 装的 bpy 模块（python3 script.py -- ...）。找不到 Blender 时自动走这条路。
#          例：pip install bpy==4.2.0（要求 Python 3.11）；系统自带的 Blender 没有 OpenImageDenoise 时也建议用它。
# 最后跑 tools/check_maps.py 检查注册表、点位与瓦片是否对得上。
set -euo pipefail
cd "$(dirname "$0")/.."
RES=8000; SAMPLES=64; LAYERS=(); EXTRA=(); USE_BPY=${USE_BPY:-0}; DATA_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --res) RES=$2; shift 2 ;;
    --samples) SAMPLES=$2; shift 2 ;;
    --bpy) USE_BPY=1; shift ;;
    --data-only) DATA_ONLY=1; shift ;;
    --) shift; EXTRA=("$@"); break ;;
    *) LAYERS+=("$1"); shift ;;
  esac
done
[ ${#LAYERS[@]} -eq 0 ] && LAYERS=(upper mid low)
BL=${BLENDER:-}
[ -z "$BL" ] && [ -x /Applications/Blender.app/Contents/MacOS/Blender ] && BL=/Applications/Blender.app/Contents/MacOS/Blender
[ -z "$BL" ] && BL=$(command -v blender || true)
PY=${PYTHON:-python3}
if [ "$USE_BPY" = 1 ] || [ -z "$BL" ]; then
  "$PY" -c "import bpy" 2>/dev/null || { echo "找不到 Blender，也没有 bpy 模块：装 Blender 后重试（或设置 BLENDER=/path/to/blender），或 pip install bpy"; exit 1; }
  USE_BPY=1; echo "使用 bpy 模块：$($PY -c 'import bpy; print(bpy.app.version_string)' 2>/dev/null | tail -1)"
fi
for L in "${LAYERS[@]}"; do
  SCRIPT="blender/tiancheng_${L}.py"
  [ -f "$SCRIPT" ] || { echo "跳过 $L（没有 $SCRIPT）"; continue; }
  if [ "$USE_BPY" = 1 ]; then RUN=("$PY" "$SCRIPT"); else RUN=("$BL" -b -P "$SCRIPT"); fi
  T0=$SECONDS
  if [ "$DATA_ONLY" = 1 ]; then
    "${RUN[@]}" -- --data-only ${EXTRA[@]+"${EXTRA[@]}"} 2>&1 | grep -E "DATA-ONLY|Error|Traceback" || true
    continue
  fi
  OUT="$PWD/map/art/tc_${L}_full.png"
  echo "== 渲染 $L：${RES}px，${SAMPLES} 采样"
  rm -f "$OUT"
  "${RUN[@]}" -- --res "$RES" --samples "$SAMPLES" --out "$OUT" ${EXTRA[@]+"${EXTRA[@]}"} 2>&1 | grep -E "^\[|WROTE|Error|Traceback" || true
  [ -f "$OUT" ] || { echo "$L 渲染失败"; exit 1; }
  python3 tools/make_dzi.py "$OUT" "map/art/tc_${L}"
  echo "   $L 用时 $((SECONDS - T0)) 秒"
done
python3 tools/check_maps.py || echo "（检查未通过：见上面的错误）"
[ "$DATA_ONLY" = 1 ] || echo "完成。检查 git status，确认后提交 map/art/tc_*.dzi、map/art/tc_*_files/、map/data/tc_*.json"
