#!/usr/bin/env bash
# 把一张大渲染切成 N 条竖条（Blender render border，不裁剪画布，只渲那一条像素范围），
# 分给多台实例（tools/cloud/hosts/*.env）并行渲，各自 pull 回来，再用 PIL 按羽化拼回整图。
# 拼图的羽化 / 输出逻辑与 tools/region_patch.py 的 feather_mask()/patch() 同一套算法（这里内联一份，
# 因为 region_patch.py 是「整图 + 一块局部」的二元合并，这里是「N 条等宽条」的多元合并，形状不同不能直接调用）。
#
# 用法：
#   bash tools/cloud/render_split.sh --strips 3 --hosts a,b,c --out map/art/tc_upper_8k.png \
#     -- --asset tc_upper --kind final --res 8000 --spp 64 -- \
#        -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tc_upper.py', run_name='__main__')" \
#        -- --res 8000 --samples 64
#   （最后一段是 blender_run.sh 会用到的 blender CLI 参数；不要在其中写 --out，本脚本会给每条 strip 生成自己的 --out）
# 环境变量：DRY_RUN=1 本地演练；PAD_PX（条与条之间羽化重叠的像素，默认 24）
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"

STRIPS=2; HOSTS_CSV="default"; OUT=""; PAD_PX=${PAD_PX:-24}
PASS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --strips) STRIPS=$2; shift 2 ;;
    --hosts) HOSTS_CSV=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --) shift; PASS=("$@"); break ;;
    *) echo "未知参数 $1（渲染参数请放在 -- 之后）" >&2; exit 2 ;;
  esac
done
[ -n "$OUT" ] || { echo "要给 --out <最终整图路径>" >&2; exit 2; }
[ ${#PASS[@]} -ge 1 ] || { echo "-- 之后要跟 blender_run.sh 的参数（同 render.sh 的用法），且需要能解析出 --res" >&2; exit 2; }

RES=""
for ((j=0; j<${#PASS[@]}; j++)); do [ "${PASS[$j]}" = "--res" ] && RES=${PASS[$((j+1))]}; done
[ -n "$RES" ] || { echo "在渲染参数里没找到 --res <像素宽>，拼图需要知道整图宽度" >&2; exit 2; }

IFS=',' read -r -a HOSTS <<< "$HOSTS_CSV"
NH=${#HOSTS[@]}
echo "== 切 $STRIPS 条，分给 $NH 台实例（${HOSTS[*]}），整图宽 ${RES}px，羽化 ${PAD_PX}px =="

TMPDIR_STRIPS=$(mktemp -d)
PIDS=(); STRIP_FILES=(); STRIP_RANGES=()

for ((i=0; i<STRIPS; i++)); do
  host=${HOSTS[$((i % NH))]}
  x0=$(awk -v i="$i" -v n="$STRIPS" 'BEGIN{printf "%.6f", i/n}')
  x1=$(awk -v i="$i" -v n="$STRIPS" 'BEGIN{printf "%.6f", (i+1)/n}')
  px0=$(awk -v x="$x0" -v r="$RES" 'BEGIN{printf "%d", x*r}')
  px1=$(awk -v x="$x1" -v r="$RES" 'BEGIN{printf "%d", x*r}')
  STRIP_RANGES+=("$px0:$px1")
  strip_out="$TMPDIR_STRIPS/strip_${i}.png"
  STRIP_FILES+=("$strip_out")

  # 在传给 blender_run.sh 的参数里，找到第一个 --python-expr / -P 之前插一段设置 render border 的
  # --python-expr（不裁剪画布，use_border + 不 use_crop，输出仍是整图尺寸，只有这一条有像素）
  BORDER_EXPR="import bpy; s=bpy.context.scene; s.render.use_border=True; s.render.use_crop=False; s.render.border_min_x=${x0}; s.render.border_max_x=${x1}; s.render.border_min_y=0.0; s.render.border_max_y=1.0"
  # 在第一个 --python-expr（渲染脚本本体）之前插入一段设 border 的 --python-expr；找不到就整段附加在末尾。
  args=(); inserted=0
  for a in "${PASS[@]}"; do
    if [ "$inserted" = 0 ] && [ "$a" = "--python-expr" ]; then
      args+=(--python-expr "$BORDER_EXPR")
      inserted=1
    fi
    args+=("$a")
  done
  [ "$inserted" = 1 ] || args+=(--python-expr "$BORDER_EXPR")
  args+=(--out "$strip_out")

  echo "-- strip $i：x∈[${px0},${px1})px → 实例 $host --"
  (
    bash "$CLOUD_ROOT/render.sh" --host "$host" "${args[@]}" > "$TMPDIR_STRIPS/strip_${i}.log" 2>&1
    echo $? > "$TMPDIR_STRIPS/strip_${i}.rc"
  ) &
  PIDS+=($!)
done

echo "-- 等 $STRIPS 条并行渲染完 --"
fail=0
for ((i=0; i<STRIPS; i++)); do
  wait "${PIDS[$i]}" || true
  rc=$(command cat "$TMPDIR_STRIPS/strip_${i}.rc" 2>/dev/null || echo 1)
  if [ "$rc" != 0 ]; then echo "  strip $i 失败（退出码 $rc），日志见 $TMPDIR_STRIPS/strip_${i}.log"; fail=1
  else echo "  strip $i 完成"; fi
done
[ "$fail" = 0 ] || { echo "有条渲染失败，不拼图" >&2; exit 1; }

if [ "$DRY_RUN" = 1 ]; then
  echo "[DRY_RUN] 会用 PIL 把 ${#STRIP_FILES[@]} 条按 STRIP_RANGES=${STRIP_RANGES[*]} 羽化拼进 $OUT"
  exit 0
fi

echo "-- 拼图（PIL，羽化算法同 tools/region_patch.py 的 feather_mask）--"
python3 - "$OUT" "$PAD_PX" "${STRIP_FILES[@]}" -- "${STRIP_RANGES[@]}" <<'PY'
import sys
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None

argv = sys.argv[1:]
out = argv[0]; pad = int(argv[1])
sep = argv.index('--')
files = argv[2:sep]
ranges = [tuple(map(int, r.split(':'))) for r in argv[sep+1:]]

base = None
for f, (x0, x1) in zip(files, ranges):
    im = Image.open(f).convert('RGBA')
    if base is None:
        base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    band = mask.copy()
    band.paste(255, (x0 + pad, 0, max(x0 + pad + 1, x1 - pad), h))
    band = band.filter(ImageFilter.GaussianBlur(pad / 2)) if pad > 0 else band
    base = Image.alpha_composite(base, Image.composite(im, Image.new('RGBA', im.size, (0,0,0,0)), band))

base.convert('RGB' if base.mode == 'RGBA' and base.getchannel('A').getextrema() == (255, 255) else base.mode).save(out)
print(f"拼好：{out}（{base.size[0]}x{base.size[1]}）")
PY
echo "完成：$OUT"
