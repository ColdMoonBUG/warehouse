#!/usr/bin/env bash
set -u

# 初始化路径和配置
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$ROOT/logs"
BACKEND_LOG="$LOGDIR/backend.log"
WEB_LOG="$LOGDIR/admin-web.log"
LOCAL_WEB_URL="http://127.0.0.1:5173"
PUBLIC_WEB_URL="http://home.lyhc.top:5173"
WEB_CHECK_URL="http://127.0.0.1:5173"
BACKEND_BASE_URL="http://127.0.0.1:8888"
BACKEND_HEALTH_URL="$BACKEND_BASE_URL/api/static/health"
BACKEND_PRODUCT_URL="$BACKEND_BASE_URL/api/product/list"
BACKEND_STORE_URL="$BACKEND_BASE_URL/api/store/list"
BACKEND_WAREHOUSE_URL="$BACKEND_BASE_URL/api/warehouse/list"
BACKEND_SALE_STATS_URL="$BACKEND_BASE_URL/api/sale/storeSaleQty?days=30"
MIGRATION_SQL="$ROOT/sql/20260401_normalize_bag_unit_and_box_qty.sql"
SCHEMA_SQL="$ROOT/sql/warehouse_schema.sql"
SEED_SQL="$ROOT/sql/seed_from_mock.sql"
BACKEND_STATUS=""
BACKEND_REASON=""

mkdir -p "$LOGDIR"

# 检查命令是否存在
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# 探测 url 是否连通
probe_url() {
  local url="$1"
  curl -fsS --max-time 2 "$url" >/dev/null 2>&1
}

# 获取 http 状态码
http_code() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || true
}

# 检查端口是否在监听
is_port_listening() {
  local port="$1"
  ss -ltn "sport = :$port" | tail -n +2 | grep -q .
}

# 打印日志末尾内容辅助调试
show_last_log_lines() {
  local log_file="$1"
  if [ -f "$log_file" ]; then
    echo "[debug] last 20 lines of $log_file"
    tail -n 20 "$log_file"
  else
    echo "[debug] log not found: $log_file"
  fi
}

# 校验 java 版本
check_java8() {
  if ! command_exists java; then
    echo "Java 未安装或未加入 PATH，请先安装 JDK 8。"
    exit 1
  fi
  local version_output
  version_output="$(java -version 2>&1 | head -n 1)"
  echo "$version_output"
  if [[ "$version_output" != *'"1.8'* && "$version_output" != *'"8'* ]]; then
    echo "当前不是 JDK 8，请切换到 JDK 8 后再运行。"
    exit 1
  fi
}

# 打印后端日志查看方式
follow_backend_log() {
  echo "[log] Backend log: $BACKEND_LOG"
  if [ ! -f "$BACKEND_LOG" ]; then
    echo "[log] backend log not found yet."
    return 0
  fi
  echo "[log] 可使用: tail -f $BACKEND_LOG"
}

# 启动后端服务
start_backend() {
  nohup bash -lc "cd \"$ROOT\" && ./mvnw spring-boot:run" >>"$BACKEND_LOG" 2>&1 &
}

# 启动前端页面
start_admin_web() {
  if command_exists pnpm; then
    nohup bash -lc "cd \"$ROOT/apps/admin-web\" && pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort" >>"$WEB_LOG" 2>&1 &
  else
    nohup bash -lc "cd \"$ROOT/apps/admin-web\" && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort" >>"$WEB_LOG" 2>&1 &
  fi
}

# 检查后端健康状态
probe_backend() {
  BACKEND_STATUS=""
  BACKEND_REASON=""
  local code
  code="$(http_code "$BACKEND_HEALTH_URL")"
  case "$code" in
    200)
      BACKEND_STATUS="ready"
      return 0
      ;;
    500)
      BACKEND_STATUS="db_error"
      BACKEND_REASON="health endpoint returned HTTP 500"
      return 3
      ;;
    000|'')
      BACKEND_STATUS="connect_error"
      BACKEND_REASON="backend health endpoint unreachable"
      return 1
      ;;
    *)
      BACKEND_STATUS="http_error"
      BACKEND_REASON="health endpoint returned HTTP $code"
      return 2
      ;;
  esac
}

# 根据日志分析后端失败原因
diagnose_backend_log() {
  BACKEND_REASON=""
  if [ ! -f "$BACKEND_LOG" ]; then
    BACKEND_REASON="backend log not found yet"
    return 0
  fi
  if grep -q "doesn't exist" "$BACKEND_LOG"; then
    BACKEND_REASON="缺少数据表"
    return 0
  fi
  if grep -q "Unknown column '" "$BACKEND_LOG"; then
    BACKEND_REASON="缺少数据列"
    return 0
  fi
  if grep -q "Port 8888 was already in use" "$BACKEND_LOG"; then
    BACKEND_REASON="8888 端口已被占用"
    return 0
  fi
  if grep -q "Communications link failure" "$BACKEND_LOG"; then
    BACKEND_REASON="数据库连接失败"
    return 0
  fi
  if grep -q "Access denied for user" "$BACKEND_LOG"; then
    BACKEND_REASON="数据库账号或密码错误"
    return 0
  fi
  if grep -q "Unknown database '" "$BACKEND_LOG"; then
    BACKEND_REASON="数据库不存在"
    return 0
  fi
}

# 等待前端 ready
wait_web() {
  local max_tries="$1"
  local tries=0
  while true; do
    if probe_url "$WEB_CHECK_URL"; then
      return 0
    fi
    tries=$((tries + 1))
    echo "[debug] admin-web probe attempt $tries/$max_tries"
    echo "[debug] ss 5173:"
    ss -ltn "sport = :5173" || true
    show_last_log_lines "$WEB_LOG"
    if [ "$tries" -ge "$max_tries" ]; then
      return 1
    fi
    sleep 1
  done
}

# 等待后端 ready
wait_backend() {
  local max_tries="$1"
  local tries=0
  while true; do
    if probe_backend; then
      BACKEND_STATUS="ready"
      return 0
    fi
    local rc=$?
    if [ "$rc" -eq 3 ]; then
      BACKEND_STATUS="db_error"
      diagnose_backend_log
      return 0
    fi
    if [ "$rc" -eq 2 ]; then
      BACKEND_STATUS="http_error"
      diagnose_backend_log
      return 0
    fi
    tries=$((tries + 1))
    if [ "$tries" -ge "$max_tries" ]; then
      diagnose_backend_log
      if [ "$BACKEND_REASON" = "8888 端口已被占用" ]; then
        BACKEND_STATUS="port_conflict"
      fi
      return 1
    fi
    sleep 2
  done
}

# 业务 api 连通性测试
test_api_url() {
  local url="$1"
  local name="$2"
  local code
  code="$(http_code "$url")"
  if [ "$code" = "200" ]; then
    return 0
  fi
  if [ "$code" = "500" ]; then
    diagnose_backend_log
    BACKEND_REASON="$name 返回 500"
    return 2
  fi
  BACKEND_REASON="$name 请求失败"
  return 1
}

# 批量执行 api 测试
test_api() {
  echo "Test APIs ($BACKEND_BASE_URL)..."

  test_api_url "$BACKEND_PRODUCT_URL" "/api/product/list"
  case $? in
    0) ;;
    *) backend_api_err; return 7 ;;
  esac

  test_api_url "$BACKEND_STORE_URL" "/api/store/list"
  case $? in
    0) ;;
    *) backend_api_err; return 7 ;;
  esac

  test_api_url "$BACKEND_WAREHOUSE_URL" "/api/warehouse/list"
  case $? in
    0) ;;
    *) backend_api_err; return 7 ;;
  esac

  test_api_url "$BACKEND_SALE_STATS_URL" "/api/sale/storeSaleQty"
  case $? in
    0) return 0 ;;
    2)
      BACKEND_REASON="/api/sale/storeSaleQty 返回 500，通常表示数据库结构落后于当前后端代码"
      backend_sale_warn
      return 0
      ;;
    *)
      backend_api_err
      return 7
      ;;
  esac
}

# 错误处理函数
web_stale() {
  echo "Existing 5173 listener is not serving HTTP."
  echo "Please stop that process and rerun this script."
  exit 3
}

web_err() {
  echo "Admin-web did not become ready. Check log: $WEB_LOG"
  exit 1
}

backend_err() {
  echo "Admin-web is ready, but backend service is not ready yet."
  if [ -n "$BACKEND_REASON" ]; then
    echo "Reason: $BACKEND_REASON"
  fi
  echo "Check log: $BACKEND_LOG"
  exit 2
}

backend_db_err() {
  echo "Backend started, but database is not ready."
  if [ -n "$BACKEND_REASON" ]; then
    echo "Reason: $BACKEND_REASON"
  fi
  [ -f "$SCHEMA_SQL" ] && echo "Init schema: $SCHEMA_SQL"
  [ -f "$SEED_SQL" ] && echo "Init seed: $SEED_SQL"
  [ -f "$MIGRATION_SQL" ] && echo "Migration hint: $MIGRATION_SQL"
  echo "Check log: $BACKEND_LOG"
  exit 4
}

backend_http_err() {
  echo "Backend started, but API returned an unexpected HTTP error."
  if [ -n "$BACKEND_REASON" ]; then
    echo "Reason: $BACKEND_REASON"
  fi
  echo "Check log: $BACKEND_LOG"
  exit 5
}

backend_port_conflict() {
  echo "Port 8888 is occupied by another process, and the backend health endpoint is unavailable."
  if [ -n "$BACKEND_REASON" ]; then
    echo "Reason: $BACKEND_REASON"
  fi
  echo "Check log: $BACKEND_LOG"
  exit 6
}

backend_api_err() {
  echo "Backend health check passed, but business API verification failed."
  if [ -n "$BACKEND_REASON" ]; then
    echo "Reason: $BACKEND_REASON"
  fi
  [ -f "$SCHEMA_SQL" ] && echo "Init schema: $SCHEMA_SQL"
  [ -f "$SEED_SQL" ] && echo "Init seed: $SEED_SQL"
  [ -f "$MIGRATION_SQL" ] && echo "Migration hint: $MIGRATION_SQL"
  echo "Check log: $BACKEND_LOG"
}

backend_sale_warn() {
  echo "[warn] /api/sale/storeSaleQty returned 500."
  if [ -n "$BACKEND_REASON" ]; then
    echo "[warn] $BACKEND_REASON"
  fi
  if [ -f "$MIGRATION_SQL" ]; then
    echo "[warn] Run migration: $MIGRATION_SQL"
  else
    echo "[warn] Missing migration file: $MIGRATION_SQL"
  fi
}

# 环境检查
echo "[1/6] Use JDK 8..."
check_java8

if [ ! -x "$ROOT/mvnw" ]; then
  echo "mvnw 没有执行权限，请先运行: chmod +x $ROOT/mvnw"
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

# 检查后端
BACKEND_RUNNING=""
if is_port_listening 8888; then
  BACKEND_RUNNING=1
fi

if [ -z "$BACKEND_RUNNING" ]; then
  echo "[2/6] Start backend..."
  start_backend
else
  echo "[2/6] Backend already running."
  follow_backend_log
fi

# 检查前端
WEB_RUNNING=""
WEB_LISTENING=""
if probe_url "$WEB_CHECK_URL"; then
  WEB_RUNNING=1
fi
if is_port_listening 5173; then
  WEB_LISTENING=1
fi

if [ -n "$WEB_RUNNING" ]; then
  echo "[3/6] Admin-web already running."
elif [ -n "$WEB_LISTENING" ]; then
  echo "[3/6] Found existing 5173 listener, but HTTP probe failed."
  web_stale
else
  echo "[3/6] Start admin-web..."
  start_admin_web
fi

# 等待服务就绪
echo "[4/6] Wait admin-web ($WEB_CHECK_URL)..."
wait_web 30 || web_err

echo "[5/6] Wait backend API ($BACKEND_HEALTH_URL)..."
wait_backend 30
wait_backend_rc=$?
if [ "$wait_backend_rc" -ne 0 ] && [ -z "$BACKEND_STATUS" ]; then
  backend_err
fi

case "$BACKEND_STATUS" in
  db_error)
    backend_db_err
    ;;
  http_error)
    backend_http_err
    ;;
  port_conflict)
    backend_port_conflict
    ;;
  ready)
    test_api || exit $?
    ;;
  *)
    backend_err
    ;;
esac

# 打印访问链接
echo "[6/6] Services are ready."
echo "Local: $LOCAL_WEB_URL"
echo "Public: $PUBLIC_WEB_URL"
echo "Done."
