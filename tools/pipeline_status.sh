#!/usr/bin/env bash
# 渲染管线实时看板：薄包装，真正逻辑在 tools/pipeline_status.py（Python 3 标准库，见 --help）。
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
exec python3 "$ROOT/tools/pipeline_status.py" "$@"
