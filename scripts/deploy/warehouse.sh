#!/usr/bin/env bash
# 仓储系统 上线 / 回退 工具（在生产 Linux 机器上运行，使用说明见同目录 README.md）
#
#   build [git版本]        在独立目录构建发布包（后端 jar + 管理端静态文件），不影响正在运行的服务
#   deploy [发布包] [-y]   备份数据库 → 停止当前服务 → 启动新版本 → 自检；自检失败自动恢复原来的版本
#   rollback [目标] [-y]   回到上一个版本；目标可写 legacy（主目录代码 + run-check.sh 的老方式）或发布包名
#   status                 查看正在运行的版本和健康状态
#   backup                 只备份数据库
#   logs [天数]            把最近几天的日志打成一个包，方便发回排查（默认 3 天）
#   list                   列出已构建的发布包
#   start | stop           启动 / 停止当前版本
#
# 可用环境变量覆盖默认值：APP_DIR DEPLOY_HOME BACKEND_PORT WEB_PORT JAVA_BIN NODE_BIN JAVA_OPTS
#   DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD  SKIP_DB_BACKUP=1  ALLOW_ANY_JAVA=1
#
# 整个脚本包在 main 函数里：bash 会先读完再执行，执行过程中文件被 git 改动也不受影响。

set -uo pipefail

main() {
  SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
  SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
  SRC_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
  SELF="bash $SCRIPT_PATH"
  APP_DIR="${APP_DIR:-$(detect_app_dir)}"
  [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ] || die "无法确定应用目录（原来运行 run-check.sh 的目录），请设置 APP_DIR"
  APP_DIR="$(cd "$APP_DIR" && pwd)"
  DEPLOY_HOME="${DEPLOY_HOME:-$HOME/warehouse-deploy}"
  RELEASES="$DEPLOY_HOME/releases"
  STATE="$DEPLOY_HOME/state"
  RUN_DIR="$DEPLOY_HOME/run"
  DB_BACKUPS="$DEPLOY_HOME/db-backups"
  BUILD_SRC="$DEPLOY_HOME/build-src"
  OVERRIDE_DIR="$DEPLOY_HOME/config"
  LOG_DIR="$APP_DIR/logs"
  BACKEND_PORT="${BACKEND_PORT:-8888}"
  WEB_PORT="${WEB_PORT:-5173}"
  JAVA_BIN="${JAVA_BIN:-java}"
  NODE_BIN="${NODE_BIN:-node}"
  JAVA_OPTS="${JAVA_OPTS:--Dfile.encoding=UTF-8}"
  SAFE_MIGRATIONS=(sql/20261007_query_indexes.sql)
  ASSUME_YES=0
  mkdir -p "$DEPLOY_HOME" "$RELEASES" "$STATE" "$RUN_DIR" "$LOG_DIR"

  local cmd="${1:-help}"
  [ $# -gt 0 ] && shift
  case "$cmd" in
    build) with_log with_lock cmd_build "$@" ;;
    deploy) with_log with_lock cmd_deploy "$@" ;;
    rollback) with_log with_lock cmd_rollback "$@" ;;
    start) with_log with_lock cmd_start "$@" ;;
    stop) with_log with_lock cmd_stop "$@" ;;
    backup) with_log with_lock backup_db ;;
    status) cmd_status ;;
    list) cmd_list ;;
    logs) cmd_logs "$@" ;;
    help | -h | --help) sed -n '2,15p' "$SCRIPT_PATH" | sed 's/^# \{0,1\}//' ;;
    *) die "未知命令：$cmd（可用：build deploy rollback status backup logs list start stop）" ;;
  esac
}

# ---------- 通用 ----------

info() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [警告] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
die() {
  printf '[%s] [失败] %s\n' "$(date '+%H:%M:%S')" "$*" >&2
  exit 1
}
need() { command -v "$1" >/dev/null 2>&1 || die "缺少命令 $1，$2"; }

detect_app_dir() {
  local common
  common="$(git -C "$SRC_DIR" rev-parse --git-common-dir 2>/dev/null)" || return 0
  case "$common" in /*) ;; *) common="$SRC_DIR/$common" ;; esac
  (cd "$common/.." 2>/dev/null && pwd)
}

with_log() {
  # 操作过程同时记到 deploy.log，出问题时可以一起发回来
  printf '\n===== %s  warehouse.sh %s =====\n' "$(date '+%F %T')" "${*:2}" >>"$DEPLOY_HOME/deploy.log"
  exec > >(tee -a "$DEPLOY_HOME/deploy.log") 2>&1
  "$@"
}

with_lock() {
  need flock "请安装 util-linux"
  exec 9>"$DEPLOY_HOME/.lock"
  flock -n 9 || die "另一个 warehouse.sh 操作正在进行，请等它结束"
  "$@"
}

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  local answer=""
  [ -r /dev/tty ] || die "需要确认才能继续，非交互环境请加 -y"
  read -r -p "$1 [y/N] " answer </dev/tty || true
  case "$answer" in y | Y | yes | YES) return 0 ;; esac
  info "已取消"
  exit 1
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time "${2:-5}" "$1" 2>/dev/null || true; }

# wait_http <url> <秒数> [进程号]：等到返回 200；进程提前退出则立即失败
wait_http() {
  local url="$1" limit="$2" pid="${3:-}" waited=0
  while [ "$waited" -lt "$limit" ]; do
    [ "$(http_code "$url")" = 200 ] && return 0
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then return 2; fi
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

rotate_log() {
  local file="$1"
  [ -f "$file" ] || return 0
  if [ "$(stat -c%s "$file" 2>/dev/null || echo 0)" -gt $((200 * 1024 * 1024)) ]; then
    mv -f "$file" "$file.1"
  fi
}

release_info() {
  local file="$RELEASES/$1/RELEASE"
  [ -f "$file" ] || return 0
  sed -n "s/^$2=//p" "$file" | head -n 1
}

describe_target() {
  case "$1" in
    legacy) printf 'legacy（老方式：%s 的代码 %s + run-check.sh）' "$APP_DIR" "$(git -C "$APP_DIR" log -1 --format='%h %s' 2>/dev/null)" ;;
    none) printf '没有在运行' ;;
    *) printf '%s（提交 %s %s）' "$1" "$(release_info "$1" commit | cut -c1-7)" "$(release_info "$1" subject)" ;;
  esac
}

state_get() { cat "$STATE/$1" 2>/dev/null || true; }
state_set() {
  printf '%s\n' "$2" >"$STATE/$1.tmp" && mv -f "$STATE/$1.tmp" "$STATE/$1"
}

latest_release() {
  local dir
  dir="$(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' 2>/dev/null | sort | tail -n 1)"
  printf '%s' "$dir"
}

check_release() {
  local dir="$RELEASES/$1"
  [ -n "$1" ] && [ -f "$dir/warehouse.jar" ] && [ -f "$dir/web/index.html" ] && [ -f "$dir/web-server.mjs" ] ||
    die "发布包 $1 不存在或不完整（用 $SELF list 查看已有的发布包）"
}

check_runtime() {
  need curl "请先安装 curl"
  need ss "请先安装 iproute2"
  need "$NODE_BIN" "请先安装 Node.js"
  command -v "$JAVA_BIN" >/dev/null 2>&1 || die "找不到 java（JAVA_BIN=$JAVA_BIN）"
  local version
  version="$("$JAVA_BIN" -version 2>&1 | head -n 1)"
  case "$version" in
    *'"1.8'* | *'"8'*) ;;
    *) [ "${ALLOW_ANY_JAVA:-0}" = 1 ] || die "当前 java 不是 JDK 8（$version）。和原来的 run-check.sh 一样需要 JDK 8，可设置 JAVA_BIN=/JDK8路径/bin/java" ;;
  esac
}

# ---------- 进程 ----------

port_pids() {
  ss -ltnp "sport = :$1" 2>/dev/null | tail -n +2 | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u
}

port_listening() {
  [ -n "$(ss -ltn "sport = :$1" 2>/dev/null | tail -n +2)" ]
}

pid_cmdline() { tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null || true; }

# 输出后端当前的运行方式：发布包名 / legacy / none / unknown
backend_mode() {
  local pid cmdline
  pid="$(port_pids "$BACKEND_PORT" | head -n 1)"
  if [ -z "$pid" ]; then
    if port_listening "$BACKEND_PORT"; then echo unknown; else echo none; fi
    return 0
  fi
  cmdline="$(pid_cmdline "$pid")"
  case "$cmdline" in
    *"$RELEASES/"*"/warehouse.jar"*) printf '%s\n' "$cmdline" | sed -n "s#.*$RELEASES/\([^/ ]*\)/warehouse.jar.*#\1#p" ;;
    *) echo legacy ;;
  esac
}

web_desc() {
  local pid cmdline
  pid="$(port_pids "$WEB_PORT" | head -n 1)"
  if [ -z "$pid" ]; then
    if port_listening "$WEB_PORT"; then echo "端口被占用（看不到进程，可能是其他用户启动的）"; else echo "没有在运行"; fi
    return 0
  fi
  cmdline="$(pid_cmdline "$pid")"
  case "$cmdline" in
    *web-server.mjs*) printf '发布包静态服务（进程 %s，%s）\n' "$pid" "$(printf '%s' "$cmdline" | grep -o -- '--release=[^ ]*' | cut -d= -f2)" ;;
    *vite*) printf 'vite 开发服务器（老方式，进程 %s）\n' "$pid" ;;
    *) printf '其他进程 %s：%s\n' "$pid" "$(printf '%s' "$cmdline" | cut -c1-80)" ;;
  esac
}

stop_port() {
  local port="$1" name="$2" pids waited=0
  pids="$(port_pids "$port" | tr '\n' ' ')"
  if [ -z "${pids// /}" ]; then
    port_listening "$port" && die "端口 $port 被占用但看不到进程号（可能是其他用户或 root 启动的），请手动停止后重试"
    return 0
  fi
  info "停止$name（端口 $port，进程 $pids）"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  while port_listening "$port"; do
    if [ "$waited" -ge 40 ]; then
      warn "$name 40 秒内没有退出，强制结束"
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 2
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  port_listening "$port" && die "端口 $port 仍被占用，无法继续"
  return 0
}

stop_all() {
  stop_port "$WEB_PORT" "管理端"
  stop_port "$BACKEND_PORT" "后端"
  rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/web.pid"
}

# ---------- 数据库 ----------

yml_value() {
  tr -d '\r' <"$1" | sed -n "s/^[[:space:]]*$2:[[:space:]]*//p" | head -n 1 |
    sed "s/[[:space:]]#.*$//; s/[[:space:]]*$//; s/^['\"]//; s/['\"]$//"
}

# 数据库连接：环境变量 > 生产机配置文件（主目录 config/、主目录、主目录源码）> 本次代码里的配置
load_db_config() {
  local yml="" candidate url rest
  for candidate in "$APP_DIR/config/application.yml" "$APP_DIR/application.yml" \
    "$APP_DIR/src/main/resources/application.yml" "$SRC_DIR/src/main/resources/application.yml"; do
    if [ -f "$candidate" ] && grep -q 'jdbc:mysql://' "$candidate"; then
      yml="$candidate"
      break
    fi
  done
  url="${SPRING_DATASOURCE_DRUID_URL:-}"
  [ -z "$url" ] && [ -n "$yml" ] && url="$(yml_value "$yml" url)"
  rest="${url#jdbc:mysql://}"
  local hostport="${rest%%/*}" db="${rest#*/}"
  db="${db%%\?*}"
  DB_HOST="${DB_HOST:-${hostport%%:*}}"
  if [ "$hostport" != "${hostport#*:}" ]; then DB_PORT="${DB_PORT:-${hostport#*:}}"; else DB_PORT="${DB_PORT:-3306}"; fi
  DB_NAME="${DB_NAME:-$db}"
  DB_USER="${DB_USER:-${SPRING_DATASOURCE_DRUID_USERNAME:-$( [ -n "$yml" ] && yml_value "$yml" username)}}"
  DB_PASSWORD="${DB_PASSWORD:-${SPRING_DATASOURCE_DRUID_PASSWORD:-$( [ -n "$yml" ] && yml_value "$yml" password)}}"
  [ -n "$DB_HOST" ] && [ -n "$DB_NAME" ] && [ -n "$DB_USER" ] || die "读不到数据库连接配置，请设置 DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD"
}

mysql_cnf() {
  local file
  file="$(mktemp)"
  chmod 600 "$file"
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword="%s"\ndefault-character-set=utf8mb4\n' \
    "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" >"$file"
  printf '%s' "$file"
}

backup_db() {
  if [ "${SKIP_DB_BACKUP:-0}" = 1 ]; then
    warn "已按 SKIP_DB_BACKUP=1 跳过数据库备份"
    return 0
  fi
  need mysqldump "部署前必须先备份数据库。安装：sudo apt install mysql-client（不建议，但可设置 SKIP_DB_BACKUP=1 跳过）"
  need gzip "请先安装 gzip"
  load_db_config
  mkdir -p "$DB_BACKUPS"
  chmod 700 "$DB_BACKUPS"
  local file cnf status
  file="$DB_BACKUPS/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"
  cnf="$(mysql_cnf)"
  info "备份数据库 $DB_NAME（$DB_HOST:$DB_PORT）→ $file"
  mysqldump --defaults-extra-file="$cnf" --single-transaction --quick --no-tablespaces "$DB_NAME" | gzip >"$file.part"
  status="${PIPESTATUS[0]}${PIPESTATUS[1]}"
  rm -f "$cnf"
  if [ "$status" != 00 ] || ! gzip -cd "$file.part" | tail -n 1 | grep -q 'Dump completed'; then
    rm -f "$file.part"
    die "数据库备份失败，已停止，没有改动任何东西"
  fi
  mv -f "$file.part" "$file"
  info "数据库备份完成（$(du -h "$file" | cut -f1)）"
  find "$DB_BACKUPS" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' | sort -rn | tail -n +21 | cut -d' ' -f2- | xargs -r rm -f
  return 0
}

apply_migrations() {
  local dir="$RELEASES/$1/migrations" file cnf
  [ -d "$dir" ] || return 0
  if ! command -v mysql >/dev/null 2>&1; then
    warn "没有 mysql 客户端，跳过可选的索引优化（不影响使用）"
    return 0
  fi
  load_db_config
  cnf="$(mysql_cnf)"
  for file in "$dir"/*.sql; do
    [ -f "$file" ] || continue
    info "执行数据库索引优化 $(basename "$file")（只加索引，可重复执行，老版本同样兼容）"
    if mysql --defaults-extra-file="$cnf" "$DB_NAME" <"$file"; then
      info "索引优化完成"
    else
      warn "索引优化没有执行成功，不影响新版本运行，只是部分查询会慢一些"
    fi
  done
  rm -f "$cnf"
  return 0
}

# 生产机上如果改过数据库连接（和代码仓库里的不同），生成一个外部配置让发布包沿用生产机的设置
sync_db_override() {
  local live="$APP_DIR/src/main/resources/application.yml" packaged="$RELEASES/$1/application.yml.packaged"
  local override="$OVERRIDE_DIR/application.yml" key same=1
  [ -f "$override" ] && return 0
  [ -f "$live" ] && [ -f "$packaged" ] || return 0
  for key in url username password; do
    [ "$(yml_value "$live" "$key")" = "$(yml_value "$packaged" "$key")" ] || same=0
  done
  [ "$same" = 1 ] && return 0
  mkdir -p "$OVERRIDE_DIR"
  (
    umask 077
    {
      echo "# 由 warehouse.sh 生成：发布包沿用生产机 $live 里的数据库连接"
      echo "spring:"
      echo "  datasource:"
      echo "    druid:"
      for key in url username password; do
        printf "      %s: '%s'\n" "$key" "$(yml_value "$live" "$key" | sed "s/'/''/g")"
      done
    } >"$override"
  )
  warn "生产机的数据库连接配置和代码里的不一样，已生成 $override，新版本会沿用生产机的配置"
}

# ---------- 启动 ----------

start_release() {
  local name="$1" dir="$RELEASES/$1" pid
  check_release "$name"
  sync_db_override "$name"
  mkdir -p "$DEPLOY_HOME/sessions"
  local args=(-jar "$dir/warehouse.jar" "--server.servlet.session.store-dir=$DEPLOY_HOME/sessions")
  [ -f "$OVERRIDE_DIR/application.yml" ] && args+=("--spring.config.additional-location=file:$OVERRIDE_DIR/")

  rotate_log "$LOG_DIR/backend.log"
  printf '\n===== %s 启动发布包 %s =====\n' "$(date '+%F %T')" "$name" >>"$LOG_DIR/backend.log"
  info "启动后端 $name"
  # shellcheck disable=SC2086
  (cd "$APP_DIR" && exec nohup setsid "$JAVA_BIN" $JAVA_OPTS "${args[@]}" >>"$LOG_DIR/backend.log" 2>&1 </dev/null 9>&-) &
  pid=$!
  echo "$pid" >"$RUN_DIR/backend.pid"
  info "等待后端就绪（最多 180 秒）…"
  wait_http "http://127.0.0.1:$BACKEND_PORT/api/static/health" 180 "$pid"
  case $? in
    0) info "后端已就绪（进程 $pid）" ;;
    2) warn "后端进程启动后退出了" && return 1 ;;
    *) warn "后端 180 秒内没有就绪" && return 1 ;;
  esac

  rotate_log "$LOG_DIR/admin-web.log"
  info "启动管理端（端口 $WEB_PORT）"
  (cd "$dir" && exec nohup setsid "$NODE_BIN" "$dir/web-server.mjs" --root="$dir/web" --port="$WEB_PORT" \
    --api="http://127.0.0.1:$BACKEND_PORT" --release="$name" >>"$LOG_DIR/admin-web.log" 2>&1 </dev/null 9>&-) &
  pid=$!
  echo "$pid" >"$RUN_DIR/web.pid"
  wait_http "http://127.0.0.1:$WEB_PORT/__web/health" 30 "$pid" || { warn "管理端没有启动成功" && return 1; }
  verify_services
}

start_legacy() {
  [ -x "$APP_DIR/run-check.sh" ] || die "找不到 $APP_DIR/run-check.sh"
  info "用老方式启动：$(describe_target legacy)"
  # setsid：脱离当前终端，关掉 SSH 窗口后 vite 也不会被 SIGHUP 带走（Node 会重置 nohup 设置的信号忽略）
  (cd "$APP_DIR" && setsid -w ./run-check.sh) 9>&-
}

start_target() {
  case "$1" in
    legacy) start_legacy ;;
    none | "") return 0 ;;
    *) start_release "$1" ;;
  esac
}

verify_services() {
  local api="http://127.0.0.1:$BACKEND_PORT" web="http://127.0.0.1:$WEB_PORT" failed=0 path code meta
  info "自检："
  for path in /api/static/health /api/product/list /api/store/list /api/warehouse/list; do
    code="$(http_code "$api$path" 30)"
    if [ "$code" = 200 ]; then echo "    通过  后端 $path"; else echo "    失败  后端 $path 返回 $code" && failed=1; fi
  done
  if curl -s --max-time 10 "$web/" | grep -q 'id="app"'; then echo "    通过  管理端首页"; else echo "    失败  管理端首页打不开" && failed=1; fi
  code="$(http_code "$web/api/static/health" 10)"
  if [ "$code" = 200 ]; then echo "    通过  管理端 → 后端转发"; else echo "    失败  管理端 → 后端转发返回 $code" && failed=1; fi
  meta="$(curl -s --max-time 5 "$api/api/meta/info" 2>/dev/null | grep -o '"appVersion":"[^"]*"' | cut -d'"' -f4)"
  [ -n "$meta" ] && echo "    后端版本 $meta"
  return "$failed"
}

show_failure_logs() {
  echo "----- 后端日志最后 40 行（$LOG_DIR/backend.log）-----"
  tail -n 40 "$LOG_DIR/backend.log" 2>/dev/null || true
  echo "----- 管理端日志最后 10 行（$LOG_DIR/admin-web.log）-----"
  tail -n 10 "$LOG_DIR/admin-web.log" 2>/dev/null || true
  echo "-----"
}

# ---------- 命令 ----------

cmd_build() {
  local ref="HEAD"
  while [ $# -gt 0 ]; do
    case "$1" in -y) ASSUME_YES=1 ;; *) ref="$1" ;; esac
    shift
  done
  need git "请先安装 git"
  need "$NODE_BIN" "请先安装 Node.js"
  local sha short subject name tmp jar web_dir build_log
  sha="$(git -C "$SRC_DIR" rev-parse --verify --quiet "$ref^{commit}")" || die "找不到 git 版本 $ref"
  short="$(printf '%s' "$sha" | cut -c1-7)"
  subject="$(git -C "$SRC_DIR" log -1 --format=%s "$sha")"
  name="$(date +%Y%m%d-%H%M%S)-$short"
  mkdir -p "$DEPLOY_HOME/build-logs"
  build_log="$DEPLOY_HOME/build-logs/$name.log"
  info "构建发布包 $name（提交 $short $subject），过程日志：$build_log"

  # 在单独的 worktree 里构建：不碰正在运行的老版本目录（老方式带热重载，改动那里的文件会让线上进程跟着变）
  git -C "$SRC_DIR" worktree prune
  if [ -e "$BUILD_SRC/.git" ]; then
    git -C "$BUILD_SRC" checkout --quiet --detach --force "$sha" || die "切换构建目录失败"
    git -C "$BUILD_SRC" clean -fdq
  else
    rm -rf "$BUILD_SRC"
    git -C "$SRC_DIR" worktree add --detach "$BUILD_SRC" "$sha" >>"$build_log" 2>&1 || die "创建构建目录失败，详见 $build_log"
  fi
  rm -rf "$BUILD_SRC/target" "$BUILD_SRC/apps/admin-web/dist"

  info "构建后端（mvnw package，首次可能需要几分钟）…"
  if ! (cd "$BUILD_SRC" && chmod +x mvnw && ./mvnw -B -DskipTests package) >>"$build_log" 2>&1; then
    tail -n 40 "$build_log"
    die "后端构建失败，详见 $build_log"
  fi
  jar="$(find "$BUILD_SRC/target" -maxdepth 1 -name '*.jar' ! -name '*-sources.jar' ! -name '*-javadoc.jar' | head -n 1)"
  [ -n "$jar" ] && [ -f "$jar" ] || die "没有找到构建出的 jar，详见 $build_log"

  info "构建管理端…"
  web_dir="$BUILD_SRC/apps/admin-web"
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$web_dir" && HUSKY=0 CI=true pnpm install --frozen-lockfile --prefer-offline --config.confirmModulesPurge=false &&
      pnpm exec vite build) >>"$build_log" 2>&1
  else
    (cd "$web_dir" && HUSKY=0 npm install --no-audit --no-fund && npx --no-install vite build) >>"$build_log" 2>&1
  fi || {
    tail -n 40 "$build_log"
    die "管理端构建失败，详见 $build_log"
  }
  [ -f "$web_dir/dist/index.html" ] || die "管理端构建产物缺少 index.html，详见 $build_log"

  tmp="$RELEASES/.building-$name"
  rm -rf "$tmp"
  mkdir -p "$tmp/web"
  cp "$jar" "$tmp/warehouse.jar"
  cp -R "$web_dir/dist/." "$tmp/web/"
  if [ -f "$BUILD_SRC/scripts/deploy/web-server.mjs" ]; then
    cp "$BUILD_SRC/scripts/deploy/web-server.mjs" "$tmp/"
  else
    cp "$SCRIPT_DIR/web-server.mjs" "$tmp/"
  fi
  cp "$BUILD_SRC/src/main/resources/application.yml" "$tmp/application.yml.packaged" 2>/dev/null || true
  local migration
  for migration in "${SAFE_MIGRATIONS[@]}"; do
    if [ -f "$BUILD_SRC/$migration" ]; then
      mkdir -p "$tmp/migrations"
      cp "$BUILD_SRC/$migration" "$tmp/migrations/"
    fi
  done
  {
    echo "name=$name"
    echo "commit=$sha"
    echo "ref=$ref"
    echo "subject=$subject"
    echo "built_at=$(date '+%F %T')"
    echo "java=$("$JAVA_BIN" -version 2>&1 | head -n 1)"
    echo "node=$("$NODE_BIN" -v)"
  } >"$tmp/RELEASE"
  mv "$tmp" "$RELEASES/$name"
  prune_releases
  info "构建完成：$name"
  info "下一步：$SELF deploy $name"
}

prune_releases() {
  local keep_current keep_previous dir
  keep_current="$(state_get current)"
  keep_previous="$(state_get previous)"
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | sort -r | tail -n +6 |
    while read -r dir; do
      [ "$dir" = "$keep_current" ] || [ "$dir" = "$keep_previous" ] || rm -rf "${RELEASES:?}/$dir"
    done
}

cmd_deploy() {
  local target=""
  while [ $# -gt 0 ]; do
    case "$1" in -y) ASSUME_YES=1 ;; *) target="$1" ;; esac
    shift
  done
  [ -n "$target" ] || target="$(latest_release)"
  [ -n "$target" ] || die "还没有发布包，请先运行：$SELF build"
  check_release "$target"
  check_runtime

  local from fallback
  from="$(backend_mode)"
  [ "$from" = unknown ] && die "端口 $BACKEND_PORT 被占用但看不到进程（可能是其他用户启动的），请先手动停止"
  [ "$from" = "$target" ] && die "$target 已经在运行了"
  fallback="$from"
  [ "$fallback" = none ] && fallback="$(state_get previous)"
  [ -n "$fallback" ] && [ "$fallback" != none ] || fallback=legacy

  local built_commit src_commit
  built_commit="$(release_info "$target" commit)"
  src_commit="$(git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || true)"
  [ -n "$src_commit" ] && [ "$built_commit" != "$src_commit" ] &&
    warn "要部署的发布包不是 $SRC_DIR 当前的代码版本（发布包 ${built_commit:0:7}，源码 ${src_commit:0:7}）"
  [ "$fallback" = legacy ] && [ "$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null)" = "$built_commit" ] &&
    warn "主目录 $APP_DIR 已经是新版本的代码，失败时用老方式启动的也会是新代码。主目录应保持原来的版本，新代码放在 git worktree 里（见 README.md）"

  echo
  echo "  当前运行：$(describe_target "$from")"
  echo "  将要部署：$(describe_target "$target")"
  echo "  失败时自动恢复到：$(describe_target "$fallback")"
  echo "  部署前会先备份数据库到 $DB_BACKUPS；服务会中断大约 1 分钟"
  echo
  confirm "确认部署？"

  backup_db
  apply_migrations "$target"
  stop_all
  if start_release "$target"; then
    [ "$from" != none ] && state_set previous "$from"
    [ -z "$(state_get previous)" ] && state_set previous legacy
    state_set current "$target"
    prune_releases
    info "部署成功：$(describe_target "$target")"
    info "如需回退：$SELF rollback   （回到 $(describe_target "$(state_get previous)")）"
    return 0
  fi

  warn "新版本自检没通过，开始自动恢复到 $fallback"
  show_failure_logs
  local failed_logs
  failed_logs="$(cmd_logs 1 2>/dev/null | tail -n 1)"
  stop_all
  if start_target "$fallback"; then
    state_set current "$fallback"
    die "部署失败，已恢复到 $(describe_target "$fallback")。$failed_logs"
  fi
  die "部署失败，自动恢复也没有成功，请手动运行 cd $APP_DIR && ./run-check.sh。$failed_logs"
}

cmd_rollback() {
  local target=""
  while [ $# -gt 0 ]; do
    case "$1" in -y) ASSUME_YES=1 ;; *) target="$1" ;; esac
    shift
  done
  [ -n "$target" ] || target="$(state_get previous)"
  [ -n "$target" ] || target=legacy
  need curl "请先安装 curl"
  need ss "请先安装 iproute2"
  if [ "$target" != legacy ]; then
    check_release "$target"
    check_runtime
  fi

  local from
  from="$(backend_mode)"
  [ "$from" = unknown ] && die "端口 $BACKEND_PORT 被占用但看不到进程（可能是其他用户启动的），请先手动停止"
  [ "$from" = "$target" ] && die "$(describe_target "$target") 已经在运行了"
  echo
  echo "  当前运行：$(describe_target "$from")"
  echo "  回退到：  $(describe_target "$target")"
  echo "  数据库不用恢复：新版本只加了索引，老版本可以直接使用现在的数据"
  echo
  confirm "确认回退？"

  stop_all
  if start_target "$target"; then
    [ "$from" != none ] && state_set previous "$from"
    state_set current "$target"
    info "已切换到：$(describe_target "$target")"
    info "再切回去：$SELF rollback"
    return 0
  fi
  show_failure_logs
  if [ "$target" != legacy ]; then
    warn "回退到 $target 没有成功，改用老方式启动"
    stop_all
    start_legacy && state_set current legacy && die "已用老方式启动，请把 $SELF logs 生成的日志包发回排查"
  fi
  die "回退没有成功，请把 $SELF logs 生成的日志包发回排查"
}

cmd_start() {
  local target
  target="$(state_get current)"
  [ -n "$target" ] || target=legacy
  [ "$(backend_mode)" = none ] || die "后端已经在运行（$(describe_target "$(backend_mode)")），如需重启先运行 $SELF stop"
  [ "$target" = legacy ] || check_runtime
  start_target "$target" || {
    show_failure_logs
    die "启动失败"
  }
  info "已启动：$(describe_target "$target")"
}

cmd_stop() {
  need ss "请先安装 iproute2"
  stop_all
  info "已停止"
}

cmd_status() {
  local mode code
  mode="$(backend_mode)"
  echo "应用目录：$APP_DIR"
  echo "部署目录：$DEPLOY_HOME"
  echo "后端（端口 $BACKEND_PORT）：$(describe_target "$mode")"
  if [ "$mode" != none ]; then
    code="$(http_code "http://127.0.0.1:$BACKEND_PORT/api/static/health")"
    echo "  健康检查：$([ "$code" = 200 ] && echo 正常 || echo "异常（HTTP $code）")"
    curl -s --max-time 5 "http://127.0.0.1:$BACKEND_PORT/api/meta/info" 2>/dev/null | grep -o '"appVersion":"[^"]*"\|"startedAt":"[^"]*"' | sed 's/^/  /'
  fi
  echo "管理端（端口 $WEB_PORT）：$(web_desc)"
  echo "记录的当前版本：$(state_get current)    上一个版本（rollback 会回到它）：$(state_get previous)"
  local last_backup
  last_backup="$(find "$DB_BACKUPS" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2-)"
  echo "最近一次部署前数据库备份：${last_backup:-无}"
}

cmd_list() {
  local current previous dir mark
  current="$(state_get current)"
  previous="$(state_get previous)"
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | sort | while read -r dir; do
    mark="      "
    [ "$dir" = "$previous" ] && mark="上一个"
    [ "$dir" = "$current" ] && mark="当前  "
    printf '%s  %s\n' "$mark" "$(describe_target "$dir")"
  done
}

cmd_logs() {
  local days="${1:-3}" stamp work out file
  case "$days" in '' | *[!0-9]*) days=3 ;; esac
  stamp="$(date +%Y%m%d_%H%M%S)"
  work="$(mktemp -d)/warehouse-logs-$stamp"
  out="$HOME/warehouse-logs-$stamp.tar.gz"
  mkdir -p "$work"
  cmd_status >"$work/status.txt" 2>&1
  find "$LOG_DIR" -maxdepth 1 -name 'warehouse.log*' -mtime -"$days" -exec cp {} "$work/" \; 2>/dev/null
  for file in backend.log admin-web.log; do
    [ -f "$LOG_DIR/$file" ] && tail -n 20000 "$LOG_DIR/$file" >"$work/$file"
  done
  [ -f "$DEPLOY_HOME/deploy.log" ] && tail -n 3000 "$DEPLOY_HOME/deploy.log" >"$work/deploy.log"
  for file in "$work"/warehouse.log* "$work/backend.log"; do
    [ -f "$file" ] || continue
    case "$file" in
      *.gz) gzip -cd "$file" ;;
      *) cat "$file" ;;
    esac
  done 2>/dev/null | grep -E 'ERROR|错误编号|api\.slow|Exception' | tail -n 500 >"$work/errors-summary.txt"
  tar -czf "$out" -C "$(dirname "$work")" "$(basename "$work")"
  rm -rf "$(dirname "$work")"
  echo "日志已打包：$out（$(du -h "$out" | cut -f1)），把这个文件发回来即可"
}

main "$@"
exit $?
