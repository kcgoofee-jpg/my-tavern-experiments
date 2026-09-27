#!/usr/bin/env bash
# 一次 Blender 会话渲多块局部（场景只建一次，每块单独出一张 PNG）。
# 用法：bash tools/crops.sh <层> <分辨率> <输出目录> <名字=x0,y0,x1,y1>... [-- 其他层参数]
#   层：mid / low（以及支持 Layer.finish 的 tiancheng_<层>.py）；坐标是整张图的归一化坐标，左上为原点
#   输出：<输出目录>/<层>_<名字>.png；日志 <输出目录>/<层>_crops.log
#   环境变量：SAMPLES（默认 64）、BLENDER（Blender 路径）、ALLOW_PARALLEL=1（已有 Blender 在渲时也照跑）
#   例：bash tools/crops.sh mid 8000 /tmp/c seam=0.2,0.6,0.5,0.8 core=0.55,0.1,0.8,0.3
#       SAMPLES=8 bash tools/crops.sh low 1000 /tmp/c a=0,0,0.2,0.2 b=0.6,0.8,0.8,1 -- --ambient .1
# 为什么要这个脚本：手写的 shell 函数把 --crop 参数拆坏过，结果渲了一整张 8000×5000。这里逐个校验区域，参数全部加引号，
# 并在渲完后核对每张图的像素尺寸。
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -ge 4 ] || { sed -n '2,10p' "$0"; exit 2; }
L=$1; RES=$2; OUT=$3; shift 3
[[ "$RES" =~ ^[0-9]+$ ]] || { echo "分辨率要是整数：$RES" >&2; exit 2; }
SCRIPT="blender/tiancheng_${L}.py"; [ -f "$SCRIPT" ] || { echo "没有 $SCRIPT" >&2; exit 2; }
NUM='(0(\.[0-9]+)?|1(\.0+)?|\.[0-9]+)'
SPEC=""; NAMES=(); BOXES=()
while [ $# -gt 0 ]; do
  [ "$1" = "--" ] && { shift; break; }
  R=$1; shift
  [[ "$R" =~ ^([A-Za-z0-9_.-]+)=($NUM),($NUM),($NUM),($NUM)$ ]] || { echo "区域格式不对：'$R'（要 名字=x0,y0,x1,y1，0…1）" >&2; exit 2; }
  N=${R%%=*}; B=${R#*=}
  python3 - "$B" <<'PY' || { echo "区域 $N 无效：$B（要 x0<x1、y0<y1）" >&2; exit 2; }
import sys; x0, y0, x1, y1 = map(float, sys.argv[1].split(',')); sys.exit(0 if 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1 else 1)
PY
  NAMES+=("${L}_$N"); BOXES+=("$B"); SPEC+="${SPEC:+;}$B:${L}_$N"
done
[ ${#NAMES[@]} -gt 0 ] || { echo "至少给一个区域" >&2; exit 2; }
EXTRA=("$@")
if [ "${ALLOW_PARALLEL:-0}" != 1 ] && pgrep -f "[M]acOS/Blender -b" >/dev/null; then
  echo "已有 Blender 在后台渲染（pgrep -f '[M]acOS/Blender -b'）；等它结束，或 ALLOW_PARALLEL=1 强制" >&2; exit 4
fi
bash tools/quiet_wait.sh
BL=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
[ -x "$BL" ] || BL=$(command -v blender) || { echo "找不到 Blender" >&2; exit 1; }
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd); LOG="$OUT/${L}_crops.log"
echo "== $L ${RES}px ${SAMPLES:-64} 采样，${#NAMES[@]} 块 → $OUT（日志 $LOG）"
T0=$SECONDS
"$BL" -b -P "$SCRIPT" -- --res "$RES" --samples "${SAMPLES:-64}" --crops "$SPEC" --out-dir "$OUT" ${EXTRA[@]+"${EXTRA[@]}"} > "$LOG" 2>&1 || true
grep -E "Traceback|Error:" "$LOG" | head -5 || true
H=$(python3 -c "print(round($RES * 18.75 / 30))")              # 与 tc_common 的 W / H 一致
FAIL=0
for i in "${!NAMES[@]}"; do
  F="$OUT/${NAMES[$i]}.png"
  if [ ! -f "$F" ]; then echo "  ✗ ${NAMES[$i]}：没有输出"; FAIL=1; continue; fi
  python3 - "$F" "${BOXES[$i]}" "$RES" "$H" <<'PY' || FAIL=1
import struct, sys
f, box, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
w, h = struct.unpack('>II', open(f, 'rb').read(24)[16:24])       # PNG IHDR
x0, y0, x1, y1 = map(float, box.split(','))
ew, eh = (x1 - x0) * W, (y1 - y0) * H
ok = abs(w - ew) <= 2 and abs(h - eh) <= 2
print(f"  {'✓' if ok else '✗'} {f.rsplit('/', 1)[-1]}：{w}×{h}（期望约 {ew:.0f}×{eh:.0f}）")
sys.exit(0 if ok else 1)
PY
done
echo "   用时 $((SECONDS - T0)) 秒"
exit $FAIL
