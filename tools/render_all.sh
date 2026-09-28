#!/usr/bin/env bash
# 渲染天城各层底图并切成瓦片（本机跑，不消耗 Claude 额度）。
# 用法：bash tools/render_all.sh [层 ...] [--res 8000] [--samples 64] [--data-only] [--bpy] [-- 其他参数原样传给层脚本]
#   层：upper upper_city mid low（默认全部；脚本不存在的层自动跳过）
#       upper = 上层默认底图（岛屿下方是云海，tc_upper）；upper_city = 下方显示中层城市的版本（tc_upper_city，查看器里的「显示下方城市」开关）
#   例：bash tools/render_all.sh upper --res 2000 --samples 16   # 快速草稿
#       bash tools/render_all.sh --data-only                      # 只重新导出点位（几秒），不渲染、不切瓦片
#       bash tools/render_all.sh low -- --lamp .4 --ambient .1    # 调层参数
#   --bpy：不用 Blender 程序，改用 pip 装的 bpy 模块（python3 script.py -- ...）。找不到 Blender 时自动走这条路。
#          例：pip install bpy==4.2.0（要求 Python 3.11）；系统自带的 Blender 没有 OpenImageDenoise 时也建议用它。
# 开渲前遵守安静期锁（tools/quiet.sh；等待由 tools/quiet_wait.sh 完成）。多块局部用 tools/crops.sh。
# 最后跑 tools/check_maps.py 检查注册表、点位与瓦片是否对得上。
#
# region_patch 优先（docs/render-retro.md W1）：某层的整张 8K 底图（map/art/tc_<层>.dzi）一旦已经提交过一次，
# 第二次再对同一层跑本脚本的整图渲染（--res 8000 附近，非 --data-only）就会被拦下，除非：
#   --full-ok            明确要整图重渲（写清理由，提交信息里说明为什么不能用局部патч）
#   改动面积 < 25%        改的是接缝、灯光、屋顶这类局部问题——用 tools/region_patch.py 局部渲染 + 合成，
#                        不要整图重渲。用法见 `python3 tools/region_patch.py --help`。
# 这条规则只挡「同一层已有整图、又要整图重渲」的情况；第一次出某层、或明确 --full-ok，都不受影响。
set -euo pipefail
cd "$(dirname "$0")/.."
RES=8000; SAMPLES=64; LAYERS=(); EXTRA=(); USE_BPY=${USE_BPY:-0}; DATA_ONLY=0; FULL_OK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --res) RES=$2; shift 2 ;;
    --samples) SAMPLES=$2; shift 2 ;;
    --bpy) USE_BPY=1; shift ;;
    --data-only) DATA_ONLY=1; shift ;;
    --full-ok) FULL_OK=1; shift ;;
    --) shift; EXTRA=("$@"); break ;;
    *) LAYERS+=("$1"); shift ;;
  esac
done
[ ${#LAYERS[@]} -eq 0 ] && LAYERS=(upper upper_city mid low)
[ "$DATA_ONLY" = 1 ] || bash tools/quiet_wait.sh          # 安静期（tools/quiet.sh）内先等
BL=${BLENDER:-}
[ -z "$BL" ] && [ -x /Applications/Blender.app/Contents/MacOS/Blender ] && BL=/Applications/Blender.app/Contents/MacOS/Blender
[ -z "$BL" ] && BL=$(command -v blender || true)
PY=${PYTHON:-python3}
if [ "$USE_BPY" = 1 ] || [ -z "$BL" ]; then
  "$PY" -c "import bpy" 2>/dev/null || { echo "找不到 Blender，也没有 bpy 模块：装 Blender 后重试（或设置 BLENDER=/path/to/blender），或 pip install bpy"; exit 1; }
  USE_BPY=1; echo "使用 bpy 模块：$($PY -c 'import bpy; print(bpy.app.version_string)' 2>/dev/null | tail -1)"
fi
for L in "${LAYERS[@]}"; do
  SCRIPT="blender/tiancheng_${L}.py"; LARGS=()
  case "$L" in
    upper) LARGS=(--below clouds) ;;
    upper_city) SCRIPT="blender/tiancheng_upper.py"; LARGS=(--below city) ;;
  esac
  [ -f "$SCRIPT" ] || { echo "跳过 $L（没有 $SCRIPT）"; continue; }
  if [ "$USE_BPY" = 1 ]; then RUN=("$PY" "$SCRIPT"); else RUN=("$BL" -b -P "$SCRIPT"); fi
  T0=$SECONDS
  if [ "$DATA_ONLY" = 1 ]; then
    [ "$L" = upper_city ] && continue                      # 与 upper 共用同一份点位
    # 2026-09-27 接手 review：以前管道的 grep 把退出码吃掉、失败也 continue，层脚本崩了等于什么都没重算
    "${RUN[@]}" -- --data-only ${EXTRA[@]+"${EXTRA[@]}"} 2>&1 | grep -E "DATA-ONLY|Error|Traceback" || true
    [ "${PIPESTATUS[0]}" = 0 ] || { echo "$L --data-only 失败（看上面的 Error / Traceback）"; exit 1; }
    continue
  fi
  DZI_PREFIX="map/art/tc_${L}"
  if [ "$FULL_OK" != 1 ] && [ -f "${DZI_PREFIX}.dzi" ] && git -C "$PWD" log --oneline -1 -- "${DZI_PREFIX}.dzi" 2>/dev/null | grep -q .; then
    echo "== $L 已有整图（${DZI_PREFIX}.dzi 有提交记录）。" >&2
    echo "   改动 <25% 的接缝 / 灯光 / 屋顶类问题请用局部补丁，不要整图重渲：" >&2
    echo "   python3 tools/region_patch.py map/art/tc_${L}_full.png <局部块.png> --dzi ${DZI_PREFIX}" >&2
    echo "   （局部块先用对应层脚本的 --region 参数渲，见 tools/region_patch.py --help）" >&2
    echo "   确实需要整图重渲，加 --full-ok 并在提交信息里写明理由。" >&2
    exit 1
  fi
  OUT="$PWD/map/art/tc_${L}_full.png"
  echo "== 渲染 $L：${RES}px，${SAMPLES} 采样"
  rm -f "$OUT"
  mkdir -p logs; LOG="logs/render_${L}.log"
  echo "   完整日志：$LOG（看进度：tail -f $LOG | grep -E 'Tiles|Sample|^\\['）"
  if [ "$USE_BPY" = 1 ]; then
    "${RUN[@]}" -- --res "$RES" --samples "$SAMPLES" --out "$OUT" ${LARGS[@]+"${LARGS[@]}"} ${EXTRA[@]+"${EXTRA[@]}"} 2>&1 | tee "$LOG" | grep --line-buffered -E "^\[|WROTE|Error|Traceback" || true
  else
    # 走统一的 GPU 启动器：等 GPU 空闲、锁文件排队、ASCII TMPDIR、崩溃重试一次、记 logs/render_times.csv
    bash "$PWD/tools/blender_run.sh" --log "$LOG" --asset "tc_${L}" --kind final --res "$RES" --spp "$SAMPLES" -- \
      -b -P "$SCRIPT" -- --res "$RES" --samples "$SAMPLES" --out "$OUT" ${LARGS[@]+"${LARGS[@]}"} ${EXTRA[@]+"${EXTRA[@]}"}
  fi
  [ -f "$OUT" ] || { echo "$L 渲染失败"; exit 1; }
  python3 tools/make_dzi.py "$OUT" "map/art/tc_${L}"
  echo "   $L 用时 $((SECONDS - T0)) 秒"
done
python3 tools/check_maps.py || { echo "检查未通过（见上面的错误）：先修数据，别提交" >&2; exit 1; }   # 2026-09-27：以前这里只 echo，退出码仍是 0
[ "$DATA_ONLY" = 1 ] || echo "完成。检查 git status，确认后提交 map/art/tc_*.dzi、map/art/tc_*_files/、map/data/tc_*.json"
