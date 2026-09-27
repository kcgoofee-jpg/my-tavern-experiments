#!/usr/bin/env bash
# 一条命令发布到预览：smoke → 推送当前分支 → 预热 jsDelivr（HEAD 提交）→ 生成「跟随分支」预览脚本 → 汇总。
# 用法：bash tools/ship.sh [--dry-run] [--no-warm] [--jobs 16] [--out 目录] [--release]
#   --release：发版后跑（标签已打并推送）：把 map/data/latest.json 指向 VERSION 的标签、提交、推送并清 jsDelivr 缓存——
#             正式版加载器（build_preview_script.py --tag）在 jsDelivr 标签列表取不到时读它（docs/versioning.md）
#   --dry-run：跑 smoke，git push --dry-run，只列出要预热的文件数，预览脚本写到临时目录；不改远端、不碰 ~/Downloads
#   --out：预览脚本目录（默认 ~/Downloads/酒馆/预览）
# 注意：只推送已提交的内容（工作区有改动时会提醒）；提交时不要带 map/art 以外无关的大文件。
set -euo pipefail
cd "$(dirname "$0")/.."
DRY=0; REL=0; WARM=1; JOBS=16; OUT="$HOME/Downloads/酒馆/预览"
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1; shift ;; --release) REL=1; shift ;; --no-warm) WARM=0; shift ;; --jobs) JOBS=$2; shift 2 ;; --out) OUT=$2; shift 2 ;;
  -h|--help) sed -n '2,8p' "$0"; exit 0 ;; *) echo "未知参数 $1" >&2; exit 2 ;; esac; done
BR=$(git rev-parse --abbrev-ref HEAD); SHA=$(git rev-parse HEAD); SHORT=${SHA:0:12}
[ "$BR" = HEAD ] && { echo "当前不在分支上（detached HEAD）" >&2; exit 2; }
[ "$DRY" = 1 ] && echo "== 演练（--dry-run）：$BR @ $SHORT" || echo "== 发布 $BR @ $SHORT"
[ -z "$(git status --porcelain --untracked-files=no)" ] || echo "提醒：工作区有未提交的改动，不会被推送"

echo "-- 1/4 smoke"; bash tools/smoke.sh
if [ "$REL" = 1 ]; then
  TAG=$(python3 -c "import sys; sys.path.insert(0, 'tools'); import verlib; print(verlib.tag_of(open('VERSION').read().strip()))")
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "--release：标签 $TAG 不存在，先打标签并推送" >&2; exit 2; }
  printf '{"tag": "%s", "version": "%s"}\n' "$TAG" "$(< VERSION)" > map/data/latest.json
  if ! git diff --quiet -- map/data/latest.json || ! git ls-files --error-unmatch map/data/latest.json >/dev/null 2>&1; then
    [ "$DRY" = 1 ] && echo "   演练：latest.json → $TAG（不提交）" || { git add map/data/latest.json; git commit -q -m "release pointer: $TAG" -- map/data/latest.json; echo "   latest.json → $TAG"; }
  fi
fi

echo "-- 2/4 推送"
if [ "$DRY" = 1 ]; then git push --dry-run origin "HEAD:refs/heads/$BR" 2>&1 | sed 's/^/   /'
else git push origin "HEAD:refs/heads/$BR" 2>&1 | sed 's/^/   /'; fi
PUSH=${PIPESTATUS[0]}; [ "$PUSH" = 0 ] || { echo "推送失败"; exit 1; }

[ "$REL" = 1 ] && [ "$DRY" = 0 ] && { SHA=$(git rev-parse HEAD); SHORT=${SHA:0:12}
  for h in purge.jsdelivr.net; do curl -fsS "https://$h/gh/kcgoofee-jpg/my-tavern-experiments@$BR/map/data/latest.json" >/dev/null && echo "   已清 jsDelivr 缓存：@$BR/map/data/latest.json" || echo "   清缓存失败（最长约 12 小时后自然更新；加载器先查标签列表，不受影响）"; done; }
echo "-- 3/4 预热 CDN @$SHORT"
WARMSUM="跳过"
if [ "$WARM" = 1 ]; then
  N=$(git ls-tree -r --name-only "$SHA" -- map | grep -vcE '\.(md|py)$' || true)
  if [ "$DRY" = 1 ]; then WARMSUM="演练：将预热 $N 个文件（bash tools/warm_cdn.sh $SHA $JOBS）"
  else
    W=$(bash tools/warm_cdn.sh "$SHA" "$JOBS"); echo "$W" | sed 's/^/   /'
    BAD=$(echo "$W" | awk '$2 ~ /^[0-9]+$/ && $2 != 200 {s += $1} END {print s + 0}')
    WARMSUM="$N 个文件，非 200：$BAD"
    # 2026-09-27 接手 review：以前非 200 只打印不失败，标签没生效 / 文件丢了也照样「发布成功」
    [ "$BAD" = 0 ] || { echo "预热有 $BAD 个非 200，中止（先看上面的明细；标签可能要等 jsDelivr 缓存，或文件超过 20 MB）" >&2; exit 1; }
    echo "-- 3.5/4 抽样校验 CDN @$SHORT"
    bash tools/smoke.sh --cdn "$SHORT" || exit 1
  fi
fi
echo "   $WARMSUM"

echo "-- 4/4 跟随分支预览脚本"
if [ "$DRY" = 1 ]; then PO=$(mktemp -d); else PO=$OUT; fi
P=$(python3 tools/build_preview_script.py --follow "$BR" --out "$PO"); echo "   $P"
[ "$DRY" = 1 ] && { python3 -c "import json,glob,sys; [json.load(open(f)) for f in glob.glob(sys.argv[1] + '/*.json')]" "$PO" && echo "   （演练：脚本 JSON 有效，已写到临时目录）"; rm -rf "$PO"; }

echo "== 汇总"
echo "   分支 $BR  提交 $SHORT  $( [ "$DRY" = 1 ] && echo '（演练，未推送）' || echo '已推送')"
echo "   CDN：$WARMSUM"
echo "   预览：酒馆助手导入「$OUT」里的跟随脚本（导入一次即可，之后刷新酒馆就拿到最新提交）"
echo "   直接看：https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@$SHORT/map/viewer.html"
