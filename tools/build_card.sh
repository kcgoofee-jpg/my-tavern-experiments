#!/usr/bin/env bash
# 构建地图版角色卡：读取 VERSION → 确认标签 map-v<版本> 已存在 → 覆盖输出固定文件名
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(< VERSION); TAG="map-v$V"
SRC="$HOME/Library/Application Support/com.tauritavern.client/data/default-user/characters/母畜庄园 Yehehua二创版V1.5.png"
OUT="$HOME/Downloads/酒馆/角色卡/母畜庄园·地图版.png"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "缺少标签 $TAG：先 git tag $TAG && git push origin $TAG"; exit 1; }
URL="https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$TAG/map/tavern/eden-map.js"
python3 tools/add_script_to_card.py "$SRC" "$OUT" --name "【地图】世界地图" --import "$URL" --version "$V" \
  --info "地图 v$V · 卫星底图 + 地点标记 + MVU 当前地点高亮 · github.com/kcgoofee-jpg/my-tavern-experiments"
curl -s -o /dev/null -w "jsDelivr %{http_code}\n" "$URL"
