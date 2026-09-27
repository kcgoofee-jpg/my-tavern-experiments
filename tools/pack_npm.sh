#!/usr/bin/env bash
# 打 npm 包（只做准备和 dry-run，不发布）：把地图对外需要的文件拷到临时目录，生成 package.json，跑 `npm pack --dry-run`。
# 用法：bash tools/pack_npm.sh [--keep]      # --keep：保留临时目录并打印路径（本机要发布时进去 `npm publish`）
# 包名 tiancheng-map-assets，版本跟 VERSION；发布后国内镜像地址：
#   https://registry.npmmirror.com/tiancheng-map-assets/<版本>/files/map/viewer.html
# （map/tavern/eden-map.js 的 LINES 里已预留 npmmirror 线路，enabled: false，首次发布验证后再打开）
# 注意：不要在这里执行 npm publish——发布由本机手动做。
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP=0; [ "${1:-}" = --keep ] && KEEP=1
NAME=tiancheng-map-assets
VER=$(tr -d ' \n' < VERSION)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/${NAME}.XXXXXX")
trap '[ "$KEEP" = 1 ] || rm -rf "$TMP"' EXIT

# 白名单（v2 起按目录收，避免漏新模块）：查看器页面与全部经典 / 模块脚本（map/*.js *.mjs、app/、core/、ui/）、卡内脚本（tavern/*.js *.mjs）、
# 数据、界面语言、庄园三维（estate/ 除 NOTES 与 reviews）、通用三维查看器与道具（props/）、第三方库、底图瓦片（dzi + _files/）与首屏缩略图
mkdir -p "$TMP/map/art" "$TMP/map/data" "$TMP/map/tavern" "$TMP/map/i18n" "$TMP/map/ui" "$TMP/map/app" "$TMP/map/core"
cp map/viewer.html map/*.js map/*.mjs "$TMP/map/"
cp map/tavern/*.js map/tavern/*.mjs "$TMP/map/tavern/"
cp map/app/*.mjs "$TMP/map/app/"; cp map/core/*.mjs "$TMP/map/core/"
cp map/data/*.json "$TMP/map/data/"
cp map/i18n/*.json "$TMP/map/i18n/"
cp map/ui/*.css map/ui/*.js map/ui/*.mjs "$TMP/map/ui/"
rsync -a --exclude NOTES.md --exclude reviews map/estate "$TMP/map/"
[ -d map/props ] && rsync -a --exclude '*.blend' --exclude '*.md' map/props "$TMP/map/"
cp -R map/vendor "$TMP/map/"
[ -f map/art/world_1k.jpg ] && cp map/art/world_1k.jpg "$TMP/map/art/"
for d in map/art/*.dzi; do
  b=${d%.dzi}; cp "$d" "$TMP/map/art/"
  [ -d "${b}_files" ] && cp -R "${b}_files" "$TMP/map/art/"
done
# 自检：查看器 / 宿主里出现的相对模块与脚本路径都要在包里
for f in $(grep -ohE '(src|href)="(app|core|ui)/[^"]+"|\x27(app|core|tavern|ui)/[a-z0-9_-]+\.m?js\x27' map/viewer.html | grep -oE '(app|core|tavern|ui)/[a-z0-9_.-]+'); do
  [ -f "$TMP/map/$f" ] || { echo "pack_npm: 缺 map/$f" >&2; exit 1; }
done
cp README.md "$TMP/"
[ -f LICENSE ] && cp LICENSE "$TMP/"
LICENSE_FIELD=$([ -f LICENSE ] && echo "SEE LICENSE IN LICENSE" || echo "SEE LICENSE IN README.md")

cat > "$TMP/package.json" <<EOF
{
  "name": "$NAME",
  "version": "$VER",
  "description": "天城地图：查看器、卡内脚本与 Blender 渲染的底图瓦片（DZI）。城市骨架 © OpenStreetMap contributors (ODbL)。",
  "license": "$LICENSE_FIELD",
  "repository": { "type": "git", "url": "git+https://github.com/kcgoofee-jpg/my-tavern-experiments.git" },
  "homepage": "https://github.com/kcgoofee-jpg/my-tavern-experiments",
  "files": ["map/viewer.html", "map/events.js", "map/tavern/", "map/data/", "map/i18n/", "map/ui/", "map/estate/", "map/vendor/", "map/art/", "README.md"],
  "keywords": ["sillytavern", "map", "deepzoom", "openseadragon"]
}
EOF

echo "== $NAME@$VER（临时目录 $TMP）"
N=$(find "$TMP/map" -type f | wc -l | tr -d ' '); S=$(du -sh "$TMP/map" | cut -f1)
echo "   map/ 下 $N 个文件，共 $S"
( cd "$TMP" && npm pack --dry-run 2>&1 | grep -E "total files|package size|unpacked size|name:|version:" ) || echo "（没有 npm：只统计了文件数和大小）"
[ -f LICENSE ] || echo "提醒：仓库没有 LICENSE 文件，package.json 的 license 暂填 \"SEE LICENSE IN README.md\"；发布前请决定许可证。"
[ "$KEEP" = 1 ] && echo "保留临时目录：$TMP（发布：cd 进去后 npm publish，务必先确认版本号）"
echo "未发布（这个脚本不会执行 npm publish）。"
