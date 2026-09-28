#!/usr/bin/env bash
# 已提升为全仓库共用的 tools/blender_run.sh；这里保留旧路径做兼容转发（旧调用方式：blender_run.sh <日志> <blender 参数...>）。
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
exec bash "$HERE/../../tools/blender_run.sh" "$@"
