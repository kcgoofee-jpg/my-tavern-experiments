#!/usr/bin/env bash
# 渲染管线实时看板（只读）：本机 Blender、云端显卡、渲染队列、任务分配、最近完成。
# 用法：bash tools/pipeline_status.sh        # 每 15 秒刷新，Ctrl-C 退出
#       bash tools/pipeline_status.sh --once # 只看一次
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
INTERVAL=15
[ "${1:-}" = "--once" ] && INTERVAL=0

cloud_line() {
  [ -f "$ROOT/tools/cloud/remote.env" ] || { echo "  （未配置 remote.env）"; return; }
  (
    # shellcheck source=/dev/null
    source "$ROOT/tools/cloud/lib.sh" >/dev/null 2>&1
    run_ssh "nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader; \
      ps -eo etimes,args | grep '[b]lender -b' | awk '{t=\$1; \$1=\"\"; printf \"  跑了 %dm%02ds：%s\n\", t/60, t%60, substr(\$0,1,110)}'; \
      ps -o etimes= -p 1 | tr -d ' '" 2>/dev/null | {
      read -r gpu || { echo "  连不上（实例关机或网络问题）"; exit; }
      echo "  显卡：${gpu}"
      jobs=""; up=0
      while IFS= read -r l; do
        case "$l" in "  跑了"*) jobs="${jobs}${l}"$'\n' ;; *) up=${l%.*} ;; esac
      done
      [ -n "$jobs" ] && printf '%s' "$jobs" || echo "  空闲"
      price=${PRICE_PER_HOUR:-1.58}
      awk -v s="$up" -v p="$price" 'BEGIN{printf "  开机 %.1f 小时，约 ¥%.2f（¥%s/时）\n", s/3600, s/3600*p, p}'
    }
  )
}

draw() {
  printf '\033[H\033[2J'
  echo "==== 渲染管线看板  $(date '+%H:%M:%S') ===="
  echo
  echo "【本机 Mac】"
  if pgrep -x Blender >/dev/null 2>&1 || pgrep -f '[b]lender -b' >/dev/null 2>&1; then
    ps -Ao etime,command | grep -E '[B]lender|[b]lender -b' | grep -v grep | awk '{t=$1; $1=""; print "  跑了 " t "：" substr($0,1,110)}' | head -3
  else
    echo "  空闲"
  fi
  echo
  echo "【云端】"
  cloud_line
  echo
  echo "【渲染队列】"
  if [ -d "$ROOT/logs/queue" ]; then
    for s in running pending done; do
      n=$(find "$ROOT/logs/queue/$s" -type f 2>/dev/null | wc -l | tr -d ' ')
      echo "  $s：$n"
    done
  else
    echo "  （队列还没上线）"
  fi
  echo
  echo "【任务分配】（logs/pipeline_tasks.md）"
  if [ -f "$ROOT/logs/pipeline_tasks.md" ]; then
    grep -E '^\|' "$ROOT/logs/pipeline_tasks.md" | sed 's/^/  /'
  else
    echo "  （无）"
  fi
  echo
  echo "【最近完成】"
  tail -5 "$ROOT/logs/render_times.csv" 2>/dev/null | sed 's/^/  /'
}

while :; do
  draw
  [ "$INTERVAL" = 0 ] && break
  sleep "$INTERVAL"
done
