#!/usr/bin/env bash
# 构建地图版角色卡：读取 VERSION → 确认标签 map-v<版本> 已存在 → 输出「母畜庄园·地图版 v<版本>.png」并删掉旧版本
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(< VERSION); TAG=$(python3 -c "import sys; sys.path.insert(0, 'tools'); import verlib; print(verlib.tag_of(sys.argv[1]))" "$V")   # map-v<版本> / 新系列 map-s<n>-v<版本>（tools/verlib.py）
SRC="$HOME/Library/Application Support/com.tauritavern.client/data/default-user/characters/母畜庄园 Yehehua二创版V1.5.png"
DIR="$HOME/Downloads/酒馆/角色卡"; OUT="$DIR/母畜庄园·地图版 v$V.png"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "缺少标签 ${TAG}：先 git tag $TAG && git push origin $TAG"; exit 1; }
URL="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$TAG/map/tavern/eden-map.js"
python3 tools/add_script_to_card.py "$SRC" "$OUT" --name "【地图】世界地图" --import "${URL/cdn.jsdelivr.net/cdn.jsdmirror.com}" --import "$URL" --version "$V" \
  --info "地图 v$V · 卫星底图 + 地点标记 + MVU 当前地点高亮 · github.com/kcgoofee-jpg/my-tavern-experiments"
# 只保留当前版本：删掉旧版本生成的卡（包括早期不带版本号的）
for f in "$DIR"/母畜庄园·地图版*.png; do [ "$f" != "$OUT" ] && rm -v "$f"; done
curl -s -o /dev/null -w "jsDelivr %{http_code}\n" "$URL"
bash tools/warm_cdn.sh "$TAG"   # 发版后把全部地图文件预热进 CDN
