#!/usr/bin/env bash
# 云渲染脚本共用：读 remote.env（或 --host 指定的 hosts/<名>.env）、拼 ssh/rsync 参数、本地锁。
# 被 tools/cloud/*.sh 用 `source` 引入，不单独执行。
# DRY_RUN=1 时，run_ssh/run_rsync 只打印将要执行的命令，不真的连接（本地测试用，见 docs/cloud-render.md）。
set -u
CLOUD_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$CLOUD_ROOT/../.." && pwd)  # used by callers (sync.sh/render.sh) via `source`
export ROOT
DRY_RUN=${DRY_RUN:-0}

# --- 多实例：从调用方参数里摘出 --host <名>，剩余参数放进全局数组 REMAIN[] 供调用方继续解析 ---
# 不用 `local -n`（nameref）：macOS 系统自带 bash 3.2 不支持，这里换成全局变量 REMAIN。
# 用法（调用方脚本里，在 source lib.sh 之后）：
#   cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"
HOST_NAME="${CLOUD_HOST:-default}"
REMAIN=()
cloud_parse_host() {
  HOST_NAME="${CLOUD_HOST:-default}"
  REMAIN=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --host)
        HOST_NAME=${2:-}
        [ -z "$HOST_NAME" ] && { echo "--host 后面要跟实例名（对应 tools/cloud/hosts/<名>.env）" >&2; exit 2; }
        shift 2 ;;
      --host=*)
        HOST_NAME=${1#--host=}
        shift ;;
      *) REMAIN+=("$1"); shift ;;
    esac
  done
}

# git worktree 里没有 remote.env / .locks（都被 .gitignore）：用主工作区的那份，保证所有 worktree 共用同一把本地锁。
_common=$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null)
case "$_common" in
  "") MAIN_CLOUD=$CLOUD_ROOT ;;
  /*) MAIN_CLOUD="$(dirname "$_common")/tools/cloud" ;;
  *) MAIN_CLOUD="$(cd "$ROOT/$_common/.." && pwd)/tools/cloud" ;;
esac
[ -d "$MAIN_CLOUD" ] || MAIN_CLOUD=$CLOUD_ROOT
if [ "$HOST_NAME" = default ]; then
  ENV_FILE="$CLOUD_ROOT/remote.env"
else
  ENV_FILE="$CLOUD_ROOT/hosts/${HOST_NAME}.env"
fi
[ -f "$ENV_FILE" ] || [ ! -f "$MAIN_CLOUD/${ENV_FILE#"$CLOUD_ROOT"/}" ] || ENV_FILE="$MAIN_CLOUD/${ENV_FILE#"$CLOUD_ROOT"/}"

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
elif [ "$DRY_RUN" != 1 ]; then
  if [ "$HOST_NAME" = default ]; then
    echo "缺 ${ENV_FILE}：先 cp tools/cloud/remote.env.example tools/cloud/remote.env 并填值" >&2
  else
    echo "缺 ${ENV_FILE}：先 cp tools/cloud/remote.env.example ${ENV_FILE} 并填值（多实例，--host ${HOST_NAME}）" >&2
  fi
  exit 2
fi

HOST=${HOST:-}; PORT=${PORT:-22}; REMOTE_USER=${USER_OVERRIDE:-${USER:-root}}; KEY=${KEY:-~/.ssh/autodl_ed25519}
REMOTE_DIR=${REMOTE_DIR:-/root/autodl-tmp/eden}
PRICE_PER_HOUR=${PRICE_PER_HOUR:-1.58}   # 元/小时；status.sh 算已花费用这个，可在各 hosts/*.env 里覆盖
KEY_EXPANDED=${KEY/#\~/$HOME}

require_host() {
  if [ -z "$HOST" ] && [ "$DRY_RUN" != 1 ]; then
    echo "${ENV_FILE} 里 HOST 是空的" >&2; exit 2
  fi
}

ssh_opts() {
  # ServerAlive* / TCPKeepAlive（2026-09-29）：本机走 Clash TUN（假地址 198.18.x.x）时，
  # 半死的连接不会自己报错，长传输会一直挂着。加保活后 60s 内发现断链并让上层重试。
  echo -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
       -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o TCPKeepAlive=yes \
       -i "$KEY_EXPANDED" -p "$PORT"
}

run_ssh() {
  # run_ssh "远程命令字符串"
  local cmd=$1
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN][$HOST_NAME] ssh $(ssh_opts) ${REMOTE_USER}@${HOST:-<HOST>} -- $cmd"
    return 0
  fi
  require_host
  # shellcheck disable=SC2046
  ssh $(ssh_opts) "${REMOTE_USER}@${HOST}" -- "$cmd"
}

run_rsync() {
  # run_rsync <rsync 的其余参数...>（-e ssh 已内置）
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN][$HOST_NAME] rsync -e \"ssh $(ssh_opts)\" $*"
    return 0
  fi
  require_host
  local RS=rsync; [ -x /opt/homebrew/bin/rsync ] && RS=/opt/homebrew/bin/rsync
  if "$RS" --version 2>&1 | head -1 | grep -q openrsync; then echo "macOS 自带 openrsync 与云端不兼容：先运行 brew install rsync" >&2; exit 3; fi
  # --partial --append-verify：中断后接着传，不从头上传（Clash/代理抖一下不必重来一遍）；
  # --timeout=120：半死连接 2 分钟内放弃；三次尝试后仍失败才真报错。
  local attempt
  for attempt in 1 2 3; do
    if "$RS" --partial --append-verify --timeout=120 -e "ssh $(ssh_opts)" "$@"; then return 0; fi
    [ "$attempt" = 3 ] && break
    echo "rsync 第 ${attempt} 次失败，5s 后重试（断点续传）" >&2
    sleep 5
  done
  echo "rsync 连续 3 次失败，放弃（检查网络/代理：docs/cloud-render.md「Clash TUN」）" >&2
  return 1
}

scp_up() {
  # scp_up <本地文件> <远程路径>
  local local=$1 remote=$2
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN][$HOST_NAME] scp $(ssh_opts) $local ${REMOTE_USER}@${HOST:-<HOST>}:$remote"
    return 0
  fi
  require_host
  # shellcheck disable=SC2046
  scp $(ssh_opts | sed 's/-p /-P /') "$local" "${REMOTE_USER}@${HOST}:${remote}"
}

# --- 本地锁：防止两个云脚本（同一实例）同时跑撞车 ---
# 用法：cloud_lock_acquire "sync"；脚本退出（含 Ctrl-C）时用 trap 自动释放，不需要手动调用 release。
LOCK_DIR="$MAIN_CLOUD/.locks"
_LOCK_FILE=""
cloud_lock_acquire() {
  local name=${1:-cloud}
  mkdir -p "$LOCK_DIR" 2>/dev/null || true
  _LOCK_FILE="$LOCK_DIR/${HOST_NAME}.lock"
  if [ "$DRY_RUN" = 1 ]; then
    echo "[DRY_RUN] 跳过本地锁检查（${_LOCK_FILE}）"
    return 0
  fi
  if [ -f "$_LOCK_FILE" ]; then
    local pid; pid=$(command cat "$_LOCK_FILE" 2>/dev/null | head -1)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "实例 ${HOST_NAME} 已有云脚本在跑（本地 PID ${pid}，见 ${_LOCK_FILE}）：等它结束，或确认它已死后删掉该文件" >&2
      exit 3
    fi
    echo "发现残留锁文件（进程已不存在），清理后继续"
  fi
  printf '%s\n%s\n%s\n' "$$" "$name" "$(date +%Y-%m-%dT%H:%M:%S)" > "$_LOCK_FILE"
  trap 'cloud_lock_release' EXIT INT TERM
}
cloud_lock_release() {
  [ -n "$_LOCK_FILE" ] && [ -f "$_LOCK_FILE" ] && command rm -f "$_LOCK_FILE"
}
