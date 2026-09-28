#!/usr/bin/env bash
# 云渲染环境体检：本机 + 连接 + 云端，逐项打勾，出问题给出修复命令。只读，不改任何东西。
# 用法：bash tools/cloud/doctor.sh
set -u
CLOUD_ROOT=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
source "$CLOUD_ROOT/lib.sh"
cloud_parse_host "$@"; set -- "${REMAIN[@]+"${REMAIN[@]}"}"

bad=0
echo "实例：$HOST_NAME"
ok()   { echo "  [OK]   $*"; }
fail() { echo "  [缺]   $1"; echo "         修复：$2"; bad=$((bad+1)); }

echo "== 1/3 本机 =="
RS=/opt/homebrew/bin/rsync
if [ -x "$RS" ] && ! "$RS" --version 2>&1 | head -1 | grep -q openrsync; then ok "rsync：$("$RS" --version | head -1)"
else fail "Homebrew rsync（系统自带 openrsync 与云端不兼容）" "brew install rsync"; fi
[ -f "$KEY_EXPANDED" ] && ok "SSH 密钥 $KEY_EXPANDED" || fail "SSH 密钥 $KEY" "ssh-keygen -t ed25519 -N '' -f ${KEY}，并把 .pub 加到 AutoDL 账号设置"
[ -n "${HOST:-}" ] && ok "remote.env：${HOST}:${PORT}" || fail "remote.env 里 HOST 为空" "编辑 tools/cloud/remote.env"
running=$(pgrep -f 'tools/cloud/(setup|sync|render|render_split|bench)\.sh' | grep -v "^$$\$" || true)
[ -z "$running" ] && ok "没有别的云脚本在跑" || fail "已有云脚本在跑（PID ${running//$'\n'/ }）" "等它结束，或 kill 这些 PID"
LOCKF="$CLOUD_ROOT/.locks/${HOST_NAME}.lock"
if [ -f "$LOCKF" ]; then
  lpid=$(command cat "$LOCKF" 2>/dev/null | head -1)
  if [ -n "$lpid" ] && kill -0 "$lpid" 2>/dev/null; then
    fail "实例 ${HOST_NAME} 有本地锁在占用（$(sed -n 2p "$LOCKF" 2>/dev/null)，PID ${lpid}）" "等它结束"
  else
    echo "  [注意] 发现残留锁文件 ${LOCKF}（进程已不在），下次跑脚本会自动清理"
  fi
else
  ok "本地锁空闲"
fi

echo "== 2/3 连接 =="
ip=$(dscacheutil -q host -a name "$HOST" 2>/dev/null | awk '/ip_address/{print $2; exit}')
case "$ip" in
  198.18.*) echo "  [注意] 走 Clash TUN（假地址 ${ip}）：必须已加 DIRECT 规则，否则长传输会断。规则：Clash Verge 订阅 → 编辑规则 → 前置 DOMAIN-SUFFIX,seetacloud.com,DIRECT；或暂关 TUN" ;;
  "") echo "  [?]    没解析到 IP（不影响，继续）" ;;
  *) ok "$HOST → ${ip}（直连）" ;;
esac
if run_ssh "true" 2>/dev/null; then ok "SSH 登录"
else fail "SSH 登录失败" "确认实例已开机、端口与控制台一致"; echo "== 结论：$bad 项要处理 =="; exit 1; fi

echo "== 3/3 云端 =="
R=$(run_ssh "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>&1 | head -1; \
  (command -v blender >/dev/null && blender --version 2>&1 | head -1) || echo NO_BLENDER; \
  df -h ${REMOTE_DIR%/*} | awk 'NR==2{print \$4}'; du -sh ${REMOTE_DIR} 2>/dev/null | cut -f1; \
  pgrep -x blender >/dev/null && echo BUSY || echo IDLE" 2>&1)
gpu=$(sed -n 1p <<<"$R"); bl=$(sed -n 2p <<<"$R"); free=$(sed -n 3p <<<"$R"); used=$(sed -n 4p <<<"$R"); busy=$(sed -n 5p <<<"$R")
[[ "$gpu" == *NVIDIA* || "$gpu" == *RTX* ]] && ok "显卡：$gpu" || fail "没看到显卡（${gpu}）" "实例可能是无卡模式，控制台里切回有卡模式开机"
[[ "$bl" == Blender* ]] && ok "$bl" || fail "Blender 不可用：$bl" "bash tools/cloud/setup.sh"
LOCAL_BL_EXE=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
LOCAL_BL_VER=""
if [ -x "$LOCAL_BL_EXE" ] || command -v "$LOCAL_BL_EXE" >/dev/null 2>&1; then
  LOCAL_BL_VER=$("$LOCAL_BL_EXE" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
fi
REMOTE_BL_VER=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' <<<"$bl" | head -1)
if [ -n "$LOCAL_BL_VER" ] && [ -n "$REMOTE_BL_VER" ] && [ "$LOCAL_BL_VER" != "$REMOTE_BL_VER" ]; then
  echo "  [警告] 本地 Blender $LOCAL_BL_VER 与云端 $REMOTE_BL_VER 版本不一致：bash tools/cloud/setup.sh 重装对齐"
fi
ok "数据盘剩余 ${free}；已同步 ${used:-0}"
[ "$busy" = IDLE ] && ok "云端空闲" || echo "  [忙]   云端有 Blender 在跑"

echo "== 结论：$([ $bad = 0 ] && echo '全部正常，可以 sync / bench / render' || echo "$bad 项要处理") =="
exit $((bad > 0))
