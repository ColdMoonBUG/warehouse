#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$ROOT/apps/admin-web"
LOGDIR="$ROOT/logs"
LOCAL_URL="http://127.0.0.1:5173"
PUBLIC_URL="http://home.lyhc.top:5173"
WEB_CHECK_URL="http://127.0.0.1:5173"
WEB_LOG="$LOGDIR/admin-web.log"

mkdir -p "$LOGDIR"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

probe_web() {
  curl -fsS --max-time 2 "$WEB_CHECK_URL" >/dev/null 2>&1
}

wait_web() {
  local max_tries="$1"
  local tries=0
  while true; do
    if probe_web; then
      return 0
    fi
    tries=$((tries + 1))
    if [ "$tries" -ge "$max_tries" ]; then
      return 1
    fi
    sleep 1
  done
}

is_port_listening() {
  local port="$1"
  ss -ltn "sport = :$port" | tail -n +2 | grep -q .
}

start_admin_web() {
  if command_exists pnpm; then
    nohup bash -lc "cd \"$WEB\" && pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort" >>"$WEB_LOG" 2>&1 &
  else
    nohup bash -lc "cd \"$WEB\" && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort" >>"$WEB_LOG" 2>&1 &
  fi
}

open_browser() {
  if command_exists xdg-open; then
    xdg-open "$LOCAL_URL" >/dev/null 2>&1 || true
  fi
}

if probe_web; then
  open_browser
  exit 0
fi

if ! command_exists node; then
  echo "Node.js 未安装或未加入 PATH，请先安装 Node.js。"
  exit 1
fi

if ! command_exists curl; then
  echo "缺少 curl，请先安装。"
  exit 1
fi

if ! command_exists ss; then
  echo "缺少 ss，请先安装 iproute2。"
  exit 1
fi

if is_port_listening 5173; then
  echo "检测到 5173 端口已有监听，但 HTTP 探测失败，请检查：$WEB_LOG"
else
  echo "Start admin-web..."
  start_admin_web
fi

echo "Wait admin-web ($WEB_CHECK_URL)..."
if ! wait_web 30; then
  echo "admin-web 未在预期时间内就绪，请检查日志：$WEB_LOG"
  exit 1
fi

open_browser
echo "Local: $LOCAL_URL"
echo "Public: $PUBLIC_URL"
echo "Done."
