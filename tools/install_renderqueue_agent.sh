#!/usr/bin/env bash
# Install (or remove) the launchd agent that keeps the render-queue dispatcher alive.
#
# Why this exists (user agreed 2026-09-29): the dispatcher is the queue's heartbeat — when it dies,
# nothing dispatches, the cloud idles and burns money. A `nohup … &` process started from an agent
# session gets taken down with that session (observed repeatedly today), while a launchd-managed one
# does not and is restarted automatically if it exits.
#
# Safe because of the singleton lock in tools/render_queue.sh: if a second instance starts, the new
# one fails to take the lock and exits 0, so KeepAlive cannot produce a duplicate dispatcher — and when
# the holder dies, the next start takes over. That also makes the agent self-healing.
#
# Kept in the repo (and generated at install time) rather than committed as a plist, so a repo move
# does not leave a launchd job pointing at an old path.
#
# Usage:
#   bash tools/install_renderqueue_agent.sh              # install + load
#   bash tools/install_renderqueue_agent.sh --uninstall  # unload + remove
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
LABEL=ai.edenmap.renderqueue
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "已卸载 $LABEL"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs/queue"
command cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/tools/render_queue.sh</string>
    <string>dispatch</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/logs/queue/dispatch.out</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/queue/dispatch.err</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
# 装载是异步的：launchctl 返回时标签可能还没出现在 list 里（一开始这里误报过「装载失败」），
# 所以重试几次再下结论——顺便确认它真的拿到了派工锁。
ok=0
for _ in 1 2 3 4 5 6; do
  sleep 1
  if launchctl list 2>/dev/null | grep -q "$LABEL"; then ok=1; break; fi
done
if [ "$ok" = 1 ]; then
  echo "已装载 ${LABEL}（KeepAlive：挂了自动重拉；单例锁保证只有一个派工）"
  holder=$(command cat "$ROOT/logs/queue/.dispatch.lock/pid" 2>/dev/null || echo "")
  [ -n "$holder" ] && echo "派工锁持有者：PID $holder"
  echo "日志：logs/queue/dispatch.out / dispatch.err"
else
  echo "装载失败：看 logs/queue/dispatch.err" >&2
  exit 1
fi
