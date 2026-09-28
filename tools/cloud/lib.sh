#!/usr/bin/env bash
# 云渲染脚本共用：读 remote.env、拼 ssh/rsync 参数。被 tools/cloud/*.sh 用 `source` 引入，不单独执行。
# DRY_RUN=1 时，run_ssh/run_rsync 只打印将要执行的命令，不真的连接（本地测试用，见 docs/cloud-render.md）。
set -u
CLOUD_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$CLOUD_ROOT/../.." && pwd)  # used by callers (sync.sh/render.sh) via `source`
export ROOT
ENV_FILE="$CLOUD_ROOT/remote.env"
DRY_RUN=${DRY_RUN:-0}

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
elif [ "$DRY_RUN" != 1 ]; then
  echo "缺 ${ENV_FILE}：先 cp tools/cloud/remote.env.example tools/cloud/remote.env 并填值" >&2
  exit 2
fi

HOST=${HOST:-}; PORT=${PORT:-22}; REMOTE_USER=${USER_OVERRIDE:-${USER:-root}}; KEY=${KEY:-~/.ssh/autodl_ed25519}
REMOTE_DIR=${REMOTE_DIR:-/root/autodl-tmp/eden}
KEY_EXPANDED=${KEY/#\~/$HOME}

require_host() {
  if [ -z "$HOST" ] && [ "$DRY_RUN" != 1 ]; then
    echo "remote.env 里 HOST 是空的" >&2; exit 2
  fi
}

ssh_opts() {
  echo -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -i "$KEY_EXPANDED" -p "$PORT"
}

run_ssh() {
  # run_ssh "远程命令字符串"
  local cmd=$1
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN] ssh $(ssh_opts) ${REMOTE_USER}@${HOST:-<HOST>} -- $cmd"
    return 0
  fi
  require_host
  # shellcheck disable=SC2046
  ssh $(ssh_opts) "${REMOTE_USER}@${HOST}" -- "$cmd"
}

run_rsync() {
  # run_rsync <rsync 的其余参数...>（-e ssh 已内置）
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN] rsync -e \"ssh $(ssh_opts)\" $*"
    return 0
  fi
  require_host
  local RS=rsync; [ -x /opt/homebrew/bin/rsync ] && RS=/opt/homebrew/bin/rsync
  if "$RS" --version 2>&1 | head -1 | grep -q openrsync; then echo "macOS 自带 openrsync 与云端不兼容：先运行 brew install rsync" >&2; exit 3; fi
  "$RS" -e "ssh $(ssh_opts)" "$@"
}

scp_up() {
  # scp_up <本地文件> <远程路径>
  local local=$1 remote=$2
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN] scp $(ssh_opts) $local ${REMOTE_USER}@${HOST:-<HOST>}:$remote"
    return 0
  fi
  require_host
  # shellcheck disable=SC2046
  scp $(ssh_opts | sed 's/-p /-P /') "$local" "${REMOTE_USER}@${HOST}:${remote}"
}
